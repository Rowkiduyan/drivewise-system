import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Box,
  Check,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  Package,
  Ruler,
  Search,
  Thermometer,
  X,
} from "lucide-react";
import CustomerLayout from "../layout/CustomerLayout.jsx";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  useMapEvents,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import {
  truckTypes,
  itemTypes,
  getTruckAvailability,
  getRecommendedTruckValue,
  MIN_SCHEDULING_DAYS,
  getMinDeliveryDate,
  getScheduleErrors,
  getPickupWindowError,
  getDropoffWindowError,
  getBudgetError,
  getStopTimeError,
} from "../lib/deliveryOptions.js";
import { photonGeocode, useResolvedStopCoords } from "../lib/forwardGeocode.js";
import { computeSuggestedRoute } from "../lib/suggestedRoute.js";
import SuggestedRouteMap from "../components/SuggestedRouteMap.jsx";
import {
  simulateSchedule,
  MAX_TOTAL_DELIVERY_HOURS,
} from "../lib/scheduleSimulator.js";
import {
  LUZON_SERVICE_AREA,
  SERVICE_AREA_MAX_BOUNDS,
  SERVICE_AREA_MESSAGE,
  isInsideLuzon,
  snapToLuzon,
} from "../lib/serviceArea.js";
import { weekdayOfDate } from "../lib/workingDays.js";
import { supabase } from "../lib/supabaseClient.js";

// Fix default marker icon for Leaflet in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const background = null;

// Intermediate stops between Pick Up and Drop Off — capped to keep the form
// and the driver navigation's waypoints request simple (02B_MULTI_STOP_DELIVERIES.md).
const MAX_STOPS = 5;

// Estimated drive time (seconds) for each leg of the ordered chain
// [pickup, dropoff, ...stops] -- one DirectionsService request with
// waypoints for the whole chain, same traffic-aware shape every other route
// computation in the app already uses (11_ROUTE_COMPARISON.md's
// "Traffic-Aware Suggested Routes", DriverDeliveries.jsx's computeRoute).
// optimizeWaypoints is deliberately NOT set (defaults false) -- the
// schedule must reflect the customer-entered stop order, not a
// re-optimized shortest path, since each returned leg maps 1:1 to an
// unload event in scheduleSimulator.js's walk.
function estimateLegDurations(waypointCoords) {
  return new Promise((resolve, reject) => {
    const [origin, ...rest] = waypointCoords;
    const destination = rest[rest.length - 1];
    const middleWaypoints = rest
      .slice(0, -1)
      .map((location) => ({ location, stopover: true }));
    new window.google.maps.DirectionsService().route(
      {
        origin,
        destination,
        waypoints: middleWaypoints.length > 0 ? middleWaypoints : undefined,
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: "bestguess",
        },
      },
      (result, status) => {
        if (status !== "OK" || !result?.routes?.[0]?.legs?.length) {
          reject(new Error(status));
          return;
        }
        resolve(
          result.routes[0].legs.map(
            (leg) => (leg.duration_in_traffic || leg.duration).value,
          ),
        );
      },
    );
  });
}

// Photon (Komoot) geocoding — free, no API key, CORS-enabled, and not rate
// limited like the public Nominatim endpoint. Search is scoped to the
// Philippines bounding box to match the app's service area.

const PH_BBOX = "116.9,4.6,126.6,21.1";

// Build a human-readable address from a Photon feature's properties.
function photonAddress(feature) {
  const p = feature?.properties || {};
  const street = p.housenumber
    ? `${p.housenumber} ${p.street || ""}`.trim()
    : p.street || "";
  return [
    street || p.name || "",
    p.locality || p.district || "",
    p.city || p.county || "",
    p.state || "",
    p.country || "",
  ]
    .filter(Boolean)
    .join(", ");
}

async function photonSearch(query) {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=${PH_BBOX}`,
  );
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = await res.json();
  return (data?.features || []).map((feature) => ({
    display: photonAddress(feature),
    lat: feature.geometry.coordinates[1],
    lon: feature.geometry.coordinates[0],
  }));
}

// Reverse-geocode a coordinate to an address, with a small backoff retry in
// case the endpoint ever rate-limits us.
async function reverseGeocode(lat, lng, attempt = 0) {
  const res = await fetch(
    `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`,
  );
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    return reverseGeocode(lat, lng, attempt + 1);
  }
  if (!res.ok) return "";
  const data = await res.json();
  const feature = data?.features?.[0];
  return feature ? photonAddress(feature) : "";
}

// Map controller — handles view changes, map clicks, and draggable marker.
// Clicking/dragging always resolves the point to a real address via reverse
// geocoding; the coordinates are shown as an instant fallback only.
// Every point is validated against the Luzon service-area polygons first:
// an invalid placement never sticks — the pin snaps back to the nearest
// valid spot inside Luzon and the UI flags the attempt.
function MapController({
  center,
  zoom,
  selectedLocation,
  onLocationChange,
  onResolvingChange,
  onServiceAreaResult,
}) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom(), { animate: true });
    }
  }, [center, zoom, map]);

  const handlePoint = (lat, lng) => {
    // Validate against the Luzon polygons; an outside placement never sticks.
    const inside = isInsideLuzon(lat, lng);
    let finalLat = lat;
    let finalLng = lng;

    if (!inside) {
      // Redirect the pin to the nearest valid location inside Luzon instead
      // of accepting the placement. The notice is driven by the raw attempt,
      // not by re-checking the snapped point (which sits on the boundary and
      // can flip the ray-cast check at exact coastline vertices).
      const snapped = snapToLuzon(lat, lng);
      finalLat = snapped.lat;
      finalLng = snapped.lng;
      map.panTo([finalLat, finalLng], { animate: true });
    }
    onServiceAreaResult(inside);

    onLocationChange(
      `${finalLat.toFixed(6)}, ${finalLng.toFixed(6)}`,
      finalLat,
      finalLng,
    );
    onResolvingChange(true);
    reverseGeocode(finalLat, finalLng)
      .then((display) => {
        if (display) onLocationChange(display, finalLat, finalLng);
      })
      .catch(() => {})
      .finally(() => onResolvingChange(false));
  };

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      handlePoint(lat, lng);
    },
  });

  return (
    <>
      {/* Service-area boundary so users can see where selection is allowed */}
      {LUZON_SERVICE_AREA.map((ring, index) => (
        <Polygon
          key={index}
          positions={ring}
          pathOptions={{
            color: "#059669",
            weight: 2,
            fillColor: "#10b981",
            fillOpacity: 0.08,
          }}
        />
      ))}
      {selectedLocation && (
        <Marker
          position={[selectedLocation.lat, selectedLocation.lon]}
          draggable={true}
          eventHandlers={{
            dragend(e) {
              const { lat, lng } = e.target.getLatLng();
              handlePoint(lat, lng);
            },
          }}
        />
      )}
    </>
  );
}

// Location Picker Modal Component
function LocationPickerModal({
  isOpen,
  onClose,
  onSelect,
  initialValue,
  initialLat,
  initialLng,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState([14.5995, 120.9842]);
  const [mapZoom, setMapZoom] = useState(13);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [showServiceAreaNotice, setShowServiceAreaNotice] = useState(false);

  // When the modal opens, prefer the exact previously-picked coordinate
  // (initialLat/initialLng, already captured from an earlier search
  // selection or a drag on this same field) over re-geocoding the address
  // text. Real bug found live 2026-09-06: re-forward-geocoding the text via
  // Photon on every reopen silently discarded a manual drag adjustment,
  // since reverse-geocoding is coarse enough that a dragged point and its
  // surrounding street often share the exact same display address — Photon
  // then returns its own canonical point for that text, not the dragged
  // one, making a careful adjustment appear to "revert" the moment the
  // picker was reopened (e.g. to double-check the pin before submitting).
  // Only fall back to forward-geocoding the text when no precise coordinate
  // exists yet — a manually-typed address that was never picked/dragged.
  useEffect(() => {
    if (!isOpen) return;

    const query = initialValue?.trim();
    if (!query) return;

    let cancelled = false;

    if (initialLat != null && initialLng != null) {
      // Deferred via a microtask, matching this file's other geocode-effect
      // below -- avoids calling setState synchronously in the effect body.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setShowServiceAreaNotice(false);
        setSelectedLocation({ display: query, lat: initialLat, lon: initialLng });
        setMapCenter([initialLat, initialLng]);
        setMapZoom(16);
      });
      return () => {
        cancelled = true;
      };
    }

    photonGeocode(query)
      .then((coords) => {
        if (cancelled || !coords) return;
        if (!isInsideLuzon(coords.lat, coords.lng)) {
          setShowServiceAreaNotice(true);
          return;
        }
        setShowServiceAreaNotice(false);
        setSelectedLocation({
          display: query,
          lat: coords.lat,
          lon: coords.lng,
        });
        setMapCenter([coords.lat, coords.lng]);
        setMapZoom(16);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialValue, initialLat, initialLng]);

  useEffect(() => {
    if (searchQuery.length <= 2) return;
    const timer = setTimeout(() => {
      photonSearch(searchQuery)
        .then((data) =>
          setSuggestions(data.filter((s) => isInsideLuzon(s.lat, s.lon))),
        )
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  // Clear suggestions once the query gets too short to search, adjusted
  // during render instead of in the effect above -- `suggestions.length >
  // 0` doubles as its own guard (no extra tracking state needed), since
  // once cleared, further renders with a still-short query are no-ops.
  if (searchQuery.length <= 2 && suggestions.length > 0) {
    setSuggestions([]);
  }

  const handleSuggestionClick = (suggestion) => {
    if (!isInsideLuzon(suggestion.lat, suggestion.lon)) {
      setShowServiceAreaNotice(true);
      return;
    }
    setShowServiceAreaNotice(false);
    setSelectedLocation({
      display: suggestion.display,
      lat: suggestion.lat,
      lon: suggestion.lon,
    });
    setMapCenter([suggestion.lat, suggestion.lon]);
    setMapZoom(16);
    setSuggestions([]);
    setSearchQuery("");
  };

  const handleLocationChange = (display, lat, lng) => {
    setSelectedLocation({ display, lat, lon: lng });
  };

  const handleConfirm = () => {
    if (selectedLocation) {
      onSelect(
        selectedLocation.display,
        selectedLocation.lat,
        selectedLocation.lon,
      );
      onClose();
    }
  };
  // Lock background scroll while the modal is open. This also keeps the blurred
  // backdrop cheap — the page behind it stays still instead of recomputing on scroll.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Rendered into document.body so this overlay is a true top-level sibling of everything
  // else on the page (including CustomerLayout's fixed mobile navbar) — otherwise browsers can
  // fail to blur other `position: fixed` elements that live deeper inside a nested layout.
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-3xl border border-emerald-200/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between rounded-t-3xl border-b border-emerald-200/70 bg-white p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Location Picker
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              Pick Location on Map
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a location within Luzon..."
              className="w-full rounded-xl border border-emerald-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-emerald-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-[9999]">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 border-b border-slate-100 last:border-b-0"
                  >
                    {suggestion.display}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showServiceAreaNotice && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3">
              <MapPin className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">
                {SERVICE_AREA_MESSAGE}
              </p>
            </div>
          )}

          {/* Map */}
          <div className="h-72 rounded-xl overflow-hidden border border-emerald-200">
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: "100%", width: "100%" }}
              zoomControl={true}
              maxBounds={SERVICE_AREA_MAX_BOUNDS}
              maxBoundsViscosity={0.7}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapController
                center={mapCenter}
                zoom={mapZoom}
                selectedLocation={selectedLocation}
                onLocationChange={handleLocationChange}
                onResolvingChange={setResolvingAddress}
                onServiceAreaResult={(inside) =>
                  setShowServiceAreaNotice(!inside)
                }
              />
            </MapContainer>
          </div>

          {/* Selected Location Display */}
          {selectedLocation && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <MapPin className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-emerald-700">
                  Selected Location
                </p>
                <p className="text-sm text-emerald-900 mt-0.5 break-words">
                  {selectedLocation.display}
                </p>
                {resolvingAddress && (
                  <p className="text-xs text-emerald-500 mt-0.5 italic">
                    Getting address…
                  </p>
                )}
                <p className="text-xs text-emerald-600 mt-0.5 font-mono">
                  {selectedLocation.lat?.toFixed(6)},{" "}
                  {selectedLocation.lon?.toFixed(6)}
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center">
            Click on the map, drag the marker, or search above to pin a location
            within Luzon
          </p>
        </div>

        <div className="flex justify-end gap-3 rounded-b-3xl border-t border-emerald-200/70 bg-white p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-emerald-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-emerald-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedLocation}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Location Input with Autocomplete and Map Picker
function LocationInput({ id, label, value, lat, lng, onChange, required }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const inputRef = useRef(null);
  // Debounce + sequence guard so both pickup AND dropoff autocomplete stay
  // reliable: rapid keystrokes fire at most one geocoding request, and stale
  // responses (from a previous keystroke) are ignored.
  const searchTimer = useRef(null);
  const searchSeq = useRef(0);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const handleInputChange = (e) => {
    const query = e.target.value;
    onChange(e);

    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (query.trim().length > 2) {
      const seq = ++searchSeq.current;
      searchTimer.current = setTimeout(() => {
        photonSearch(query)
          .then((data) => {
            if (seq !== searchSeq.current) return;
            setSuggestions(data.filter((s) => isInsideLuzon(s.lat, s.lon)));
            setShowSuggestions(true);
          })
          .catch(() => {
            if (seq !== searchSeq.current) return;
            setSuggestions([]);
            setShowSuggestions(false);
          });
      }, 300);
    } else {
      searchSeq.current++;
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    // Belt-and-suspenders: suggestions are already filtered to Luzon, but a
    // stale list rendered before this guard existed can't slip through.
    if (!isInsideLuzon(suggestion.lat, suggestion.lon)) return;
    onChange({
      target: {
        name: id,
        value: suggestion.display,
        lat: suggestion.lat,
        lng: suggestion.lon,
      },
    });
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleLocationSelect = (address, lat, lng) => {
    onChange({ target: { name: id, value: address, lat, lng } });
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            id={id}
            name={id}
            value={value}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length > 0) {
                e.preventDefault();
                handleSuggestionClick(suggestions[0]);
              }
            }}
            placeholder="Enter address or search..."
            required={required}
            className="flex-1 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="button"
            onClick={() => setShowMapPicker(true)}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            title="Pick from map"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="hidden sm:inline">Map</span>
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-emerald-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 border-b border-slate-100 last:border-b-0"
              >
                {suggestion.display}
              </button>
            ))}
          </div>
        )}
      </div>

      <LocationPickerModal
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={handleLocationSelect}
        initialValue={value}
        initialLat={lat}
        initialLng={lng}
      />
    </div>
  );
}

// "Xh Ym" -- shared by the modal below and the live Schedule Summary card.
function formatDuration(totalSeconds) {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

// Shown instead of the inline submitError banner when the simulated
// schedule (scheduleSimulator.js) exceeds MAX_TOTAL_DELIVERY_HOURS -- this
// rejection means "restructure into a separate delivery," not "fix a typo
// and resubmit," so it's an interrupting modal rather than an easy-to-skim
// text line. Same createPortal/scroll-lock pattern LocationPickerModal
// already uses.
function TravelTimeExceededModal({ schedule, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-red-200/70 bg-white shadow-2xl">
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <Clock className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Travel time exceeds our {MAX_TOTAL_DELIVERY_HOURS}-hour limit
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                This delivery's estimated schedule
                {schedule.day2TotalSeconds != null ? (
                  <>
                    {" "}
                    is Day 1: {formatDuration(schedule.day1TotalSeconds)},
                    Day 2: {formatDuration(schedule.day2TotalSeconds)},
                  </>
                ) : (
                  <> takes about {formatDuration(schedule.day1TotalSeconds)}</>
                )}{" "}
                for a combined total of{" "}
                {formatDuration(schedule.totalSeconds)}, which is beyond
                what we support in a single trip. Try splitting this into
                separate delivery requests instead.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 rounded-b-3xl border-t border-red-200/70 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CustomerRequestDelivery() {
  const navigate = useNavigate();
  const { isLoaded: mapsApiLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const [dateError, setDateError] = useState("");
  const [pickupWindowError, setPickupWindowError] = useState("");
  const [dropoffDateError, setDropoffDateError] = useState("");
  const [dropoffTimeError, setDropoffTimeError] = useState("");
  const [dropoffWindowError, setDropoffWindowError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [truckSelectionError, setTruckSelectionError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Keyed by stop index -- each additional dropoff's own time error, kept
  // separate from dropoffTimeError (the main dropoff's error) since stops
  // are a variable-length list, not a fixed field.
  const [stopTimeErrors, setStopTimeErrors] = useState({});
  // null = hidden; a simulateSchedule() result = the 13-hour-cap rejection
  // modal is shown, holding the Day1/Day2/Total breakdown for its message.
  // A dedicated modal rather than the inline submitError banner, per
  // explicit user request -- this rejection means "restructure into a
  // separate delivery," not "fix a typo and resubmit," so it reads better
  // as an interrupting dialog than a small text line easy to skim past.
  const [travelTimeModalSchedule, setTravelTimeModalSchedule] =
    useState(null);
  // Live preview of the simulated schedule (scheduleSimulator.js), shown in
  // the Schedule Summary card as the customer fills out the form -- not
  // trusted at submit time, where handleSubmit always recomputes fresh.
  const [scheduleResult, setScheduleResult] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  // Live preview of the planned route (suggestedRoute.js), shown as a
  // read-only map beneath the Schedule Summary card -- same "not trusted at
  // submit time" relationship as scheduleResult above: handleSubmit always
  // recomputes its own suggestedRoute fresh (see computeSuggestedRoute call
  // there) rather than reusing this preview.
  const [routePreview, setRoutePreview] = useState(null);
  const [routePreviewLoading, setRoutePreviewLoading] = useState(false);
  const [routePreviewError, setRoutePreviewError] = useState("");
  // Weekdays covered by at least one of this customer's specialized crew
  // members (crew_client_specialties -> crew_availability, via the
  // specialized_crew_available_days() RPC). null = still loading; empty =
  // no specialized crew coverage, so booking stays unrestricted.
  const [specializedAvailableDays, setSpecializedAvailableDays] =
    useState(null);
  const minDeliveryDate = getMinDeliveryDate();

  useEffect(() => {
    let isCurrent = true;

    supabase.rpc("specialized_crew_available_days").then(({ data, error }) => {
      if (!isCurrent) return;
      if (error) {
        // Fail open -- a broken lookup shouldn't block booking entirely.
        setSpecializedAvailableDays(null);
        return;
      }
      setSpecializedAvailableDays(data || []);
    });

    return () => {
      isCurrent = false;
    };
  }, []);
  const [formData, setFormData] = useState({
    pickupDate: "",
    pickupTime: "",
    pickupTimeEnd: "",
    dropoffDate: "",
    dropoffTime: "",
    dropoffTimeEnd: "",
    pickupLocation: "",
    pickupLat: null,
    pickupLng: null,
    dropoffLocation: "",
    dropoffLat: null,
    dropoffLng: null,
    stops: [],
    truckType: "",
    itemType: "",
    cargoWeight: "",
    budgetMin: "",
    budgetMax: "",
    notes: "",
  });
  // Drop Off Date auto-fills to match Pick Up Date as a same-day-delivery
  // convenience default, but stays fully editable -- once the customer picks
  // a dropoff date themselves, further pickup date edits stop overwriting it.
  const dropoffDateTouched = useRef(false);
  // "SAME_DAY" | "TWO_DAY" -- fully automatic, per explicit user decision
  // (2026-08-30 follow-up): not a customer-clicked toggle, derived purely
  // from whether Drop Off Date is later than Pick Up Date. Same-day is the
  // default whenever dropoffDate isn't set yet (matches the auto-fill
  // above, which keeps dropoffDate === pickupDate until the customer picks
  // a later date themselves).
  const deliveryMode =
    formData.pickupDate &&
    formData.dropoffDate &&
    formData.dropoffDate > formData.pickupDate
      ? "TWO_DAY"
      : "SAME_DAY";
  // Real bug found on review: dropoffTimeEnd is only rendered/editable in
  // SAME_DAY mode, but its state doesn't reset itself just because the
  // field got hidden -- a customer who fills a same-day window, then picks
  // a later Drop Off Date (auto-switching to TWO_DAY), would be left with a
  // stale dropoffTimeEnd sitting in state. getDropoffWindowError would then
  // compare it against the repurposed "Day 2 Start Time" value and could
  // easily fail ("window end must be later than start"), permanently
  // blocking submission with an error pointing at a field that no longer
  // exists in the UI -- a genuine dead end, not just a cosmetic issue. Also
  // matters for persistence: dropoff_time_end's `|| null` fallback in
  // newRequest only catches an EMPTY string, not a stale non-empty one, so
  // without this it could silently write a meaningless leftover value to
  // the DB. Clearing it the moment mode flips to TWO_DAY prevents both.
  useEffect(() => {
    if (deliveryMode === "TWO_DAY") {
      Promise.resolve().then(() => {
        setFormData((prev) =>
          prev.dropoffTimeEnd ? { ...prev, dropoffTimeEnd: "" } : prev,
        );
        setDropoffWindowError("");
      });
    }
  }, [deliveryMode]);
  // Fallback coordinates for any stop whose LocationInput selection never
  // captured lat/lng (a manually-typed address) -- same Photon-by-text
  // lookup DriverDeliveries.jsx/HelperDeliveries.jsx already use for stops.
  const stopLocationsKey = formData.stops.map((s) => s.location).join("|");
  const { coordsByLocation: resolvedStopCoords, isReady: stopCoordsReady } =
    useResolvedStopCoords(formData.stops.map((s) => s.location));
  // Live-captured coordinates win over the Photon-by-text fallback (exact
  // map-picker/autocomplete result beats a re-derived guess) -- same
  // "captured beats re-derived" precedent handleSubmit already applies to
  // pickup/dropoff. null entries mean "not resolved yet" (still loading, or
  // an empty stop location the customer hasn't filled in).
  const stopCoordsList = formData.stops
    .filter((stop) => stop.location.trim())
    .map((stop) =>
      stop.lat != null && stop.lng != null
        ? { lat: stop.lat, lng: stop.lng }
        : resolvedStopCoords[stop.location] || null,
    );
  const recommendedTruckValue = getRecommendedTruckValue(
    formData.itemType,
    formData.cargoWeight,
  );

  // Recommended truck first, then other compatible trucks, then unavailable ones last
  const sortedTruckTypes = [...truckTypes].sort((a, b) => {
    const rank = (truck) => {
      if (truck.value === recommendedTruckValue) return 0;
      return getTruckAvailability(
        truck,
        formData.itemType,
        formData.cargoWeight,
      ).available
        ? 1
        : 2;
    };
    return rank(a) - rank(b);
  });

  // Live-preview schedule simulation -- debounced since (unlike the pure
  // validators handleChange recomputes on every keystroke) this triggers a
  // real Directions API call. Recomputes whenever mode/times/coordinates
  // change; handleSubmit always recomputes fresh rather than trusting this.
  useEffect(() => {
    let cancelled = false;

    const preconditionsMet =
      mapsApiLoaded &&
      window.google &&
      formData.pickupLat != null &&
      formData.pickupLng != null &&
      formData.dropoffLat != null &&
      formData.dropoffLng != null &&
      formData.pickupTime &&
      (deliveryMode !== "TWO_DAY" || formData.dropoffTime) &&
      stopCoordsReady &&
      stopCoordsList.every((c) => c != null);

    if (!preconditionsMet) {
      // Deferred via a microtask, matching useResolvedStopCoords's own
      // "never call setState synchronously in the effect body" pattern.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setScheduleResult(null);
        setScheduleError("");
        setScheduleLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      setScheduleLoading(true);
      setScheduleError("");
      const waypoints = [
        { lat: formData.pickupLat, lng: formData.pickupLng },
        { lat: formData.dropoffLat, lng: formData.dropoffLng },
        ...stopCoordsList,
      ];
      estimateLegDurations(waypoints)
        .then((legTravelSeconds) => {
          if (cancelled) return;
          setScheduleResult(
            simulateSchedule({
              mode: deliveryMode,
              day1StartTime: formData.pickupTime,
              day2StartTime: formData.dropoffTime,
              legTravelSeconds,
            }),
          );
          setScheduleLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setScheduleResult(null);
          setScheduleError(
            "We couldn't estimate the schedule for these locations.",
          );
          setScheduleLoading(false);
        });
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapsApiLoaded,
    deliveryMode,
    formData.pickupTime,
    formData.dropoffTime,
    formData.pickupLat,
    formData.pickupLng,
    formData.dropoffLat,
    formData.dropoffLng,
    stopLocationsKey,
    stopCoordsReady,
  ]);

  // Live-preview route map -- same debounce/preconditions as the schedule
  // preview above (kept as a separate effect/call per explicit user
  // decision: two independent DirectionsService requests rather than one
  // merged call, so a failure in one preview never affects the other).
  useEffect(() => {
    let cancelled = false;

    const preconditionsMet =
      mapsApiLoaded &&
      window.google &&
      formData.pickupLat != null &&
      formData.pickupLng != null &&
      formData.dropoffLat != null &&
      formData.dropoffLng != null &&
      stopCoordsReady &&
      stopCoordsList.every((c) => c != null);

    if (!preconditionsMet) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setRoutePreview(null);
        setRoutePreviewError("");
        setRoutePreviewLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const activeStops = formData.stops.filter((stop) => stop.location.trim());

    const timer = setTimeout(() => {
      setRoutePreviewLoading(true);
      setRoutePreviewError("");
      computeSuggestedRoute({
        pickupCoords: { lat: formData.pickupLat, lng: formData.pickupLng },
        pickupAddress: formData.pickupLocation,
        dropoffCoords: { lat: formData.dropoffLat, lng: formData.dropoffLng },
        dropoffAddress: formData.dropoffLocation,
        stops: activeStops.map((stop, i) => ({
          location: stop.location,
          coords: stopCoordsList[i],
        })),
      })
        .then(({ legs }) => {
          if (cancelled) return;
          setRoutePreview(legs);
          setRoutePreviewLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setRoutePreview(null);
          setRoutePreviewError("We couldn't preview the route for these locations.");
          setRoutePreviewLoading(false);
        });
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapsApiLoaded,
    formData.pickupLat,
    formData.pickupLng,
    formData.dropoffLat,
    formData.dropoffLng,
    stopLocationsKey,
    stopCoordsReady,
  ]);

  const goBackToDeliveries = () =>
    navigate("/customer/deliveries", {
      state: { defaultTab: "PENDING_REQUEST" },
    });

  // Returns an error string when the chosen Pick Up Date falls on a weekday
  // none of the customer's specialized crew members work — suggesting the
  // next few bookable dates their crew IS available. No-op while the lookup
  // is loading or when there's no specialized crew coverage.
  const pickupDateAvailabilityError = (dateStr) => {
    if (
      !dateStr ||
      !specializedAvailableDays ||
      specializedAvailableDays.length === 0
    )
      return "";
    if (specializedAvailableDays.includes(weekdayOfDate(dateStr))) return "";

    const covered = new Set(specializedAvailableDays);
    const chosenDate = new Date(`${dateStr}T00:00:00`);

    // Suggest up to 3 upcoming dates (starting from the earliest bookable
    // date) that fall on a day the specialized crew works. Hard cap on scan
    // length so a sparse schedule can never loop forever.
    const suggestions = [];
    const cursor = new Date(`${minDeliveryDate}T00:00:00`);
    for (let scanned = 0; scanned < 90 && suggestions.length < 3; scanned++) {
      if (
        covered.has(cursor.getDay()) &&
        cursor.getTime() !== chosenDate.getTime()
      ) {
        suggestions.push(
          cursor.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            weekday: "short",
          }),
        );
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const chosenLabel = chosenDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    const suggestionText =
      suggestions.length > 0
        ? ` Available dates: ${suggestions.join(", ")}.`
        : "";
    return `Your assigned delivery crew is not available on ${chosenLabel}. Please consider changing your pick up date.${suggestionText}`;
  };

  const handleChange = (e) => {
    const { name, value, lat, lng } = e.target;
    const next = { ...formData, [name]: value };
    // Recomputed per-change rather than reading the component-level
    // deliveryMode, since `next` may already reflect a date edit this same
    // call hasn't been committed to state yet (e.g. editing dropoffDate
    // itself) -- must match what deliveryMode will become on the next
    // render, not what it still is on this one.
    const nextIsTwoDay = Boolean(
      next.pickupDate && next.dropoffDate && next.dropoffDate > next.pickupDate,
    );

    // LocationInput passes lat/lng alongside the address text when the
    // value came from a search suggestion or the map picker (both already
    // resolve real coordinates via Photon); a manually-typed address has
    // none, so clear any stale coordinate from a previously picked value.
    if (name === "pickupLocation" || name === "dropoffLocation") {
      const prefix = name === "pickupLocation" ? "pickup" : "dropoff";
      next[`${prefix}Lat`] = lat ?? null;
      next[`${prefix}Lng`] = lng ?? null;
    }

    if (name === "pickupDate") {
      const minDateError =
        value && value < minDeliveryDate
          ? `Delivery date must be on or after ${minDeliveryDate}.`
          : "";
      setDateError(minDateError || pickupDateAvailabilityError(value));
      if (!dropoffDateTouched.current) {
        next.dropoffDate = value;
      }
    }

    if (name === "dropoffDate") {
      dropoffDateTouched.current = true;
    }

    if (name === "pickupTime" || name === "pickupTimeEnd") {
      setPickupWindowError(getPickupWindowError(next));
    }

    if (
      [
        "pickupDate",
        "pickupTime",
        "pickupTimeEnd",
        "dropoffDate",
        "dropoffTime",
      ].includes(name)
    ) {
      const { dropoffDateError, dropoffTimeError } = getScheduleErrors(next);
      setDropoffDateError(dropoffDateError);
      setDropoffTimeError(dropoffTimeError);
      // Recomputed on every date/time field that can flip Same-Day<->Two-Day
      // or move the pickup window, not just pickupTime/pickupTimeEnd --
      // crossing that mode boundary changes whether each stop's window
      // should even be compared against the pickup window at all (see
      // getStopTimeError's isTwoDay param and its own comment).
      setStopTimeErrors(
        Object.fromEntries(
          next.stops.map((stop, i) => [
            i,
            getStopTimeError(stop, next, nextIsTwoDay),
          ]),
        ),
      );
    }

    if (name === "dropoffTime" || name === "dropoffTimeEnd") {
      // Window-end doesn't apply once dropoffDate is later than pickupDate
      // (Two-Day mode) -- dropoffTime becomes the Day 2 start instant, not
      // a window start, so a stale dropoffTimeEnd must never be validated
      // against it here (see the auto-clear effect's comment above for the
      // stuck-submission bug this guards against).
      setDropoffWindowError(nextIsTwoDay ? "" : getDropoffWindowError(next));
    }

    if (name === "budgetMin" || name === "budgetMax") {
      setBudgetError(getBudgetError(next));
    }

    setFormData(next);
  };

  // No availability gate here -- any truck stays selectable regardless of
  // fit for the chosen item type/weight, same "recommended first, nothing
  // fully hidden" pattern SupDeliveries.jsx's assignment picker already
  // uses; the Supervisor makes the final call on truck suitability when
  // assigning, so the customer isn't blocked from picking their preference.
  const handleTruckSelect = (truck) => {
    setFormData((prev) => ({ ...prev, truckType: truck.value }));
    setTruckSelectionError("");
  };

  // Stops are intermediate locations visited between Pick Up and Drop Off —
  // reference-only (no per-stop status), capped at MAX_STOPS to keep the
  // form and the route/waypoints request simple (02B_MULTI_STOP_DELIVERIES.md).
  const addStop = () => {
    if (formData.stops.length >= MAX_STOPS) return;
    setFormData((prev) => ({
      ...prev,
      stops: [
        ...prev.stops,
        { location: "", dropoffTime: "", dropoffTimeEnd: "", lat: null, lng: null },
      ],
    }));
  };

  const removeStop = (index) => {
    setFormData((prev) => ({
      ...prev,
      stops: prev.stops.filter((_, i) => i !== index),
    }));
    setStopTimeErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleStopChange = (index, e) => {
    // Mirrors handleChange's pickup/dropoff lat/lng capture -- LocationInput
    // already emits lat/lng when the value came from a suggestion or the
    // map picker; a manually-typed address has none, so any stale
    // previously-picked coordinate is cleared (schedule simulation falls
    // back to useResolvedStopCoords's Photon lookup for a null coordinate).
    const { value, lat, lng } = e.target;
    setFormData((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, i) =>
        i === index
          ? { ...stop, location: value, lat: lat ?? null, lng: lng ?? null }
          : stop,
      ),
    }));
  };

  const handleStopTimeChange = (index, field, value) => {
    // Computed directly from the current formData.stops[index] (this
    // handler closes over the latest formData every render) rather than
    // relying on a side-effect variable set inside the setFormData updater
    // below -- that updater isn't guaranteed to run before this line does,
    // and when it hadn't yet, `updatedStop` stayed undefined, crashing
    // getStopTimeError's destructuring (real bug, found live 2026-09-06 with
    // multiple stops).
    const updatedStop = { ...formData.stops[index], [field]: value };
    setFormData((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, i) => (i === index ? updatedStop : stop)),
    }));
    setStopTimeErrors((prev) => ({
      ...prev,
      [index]: getStopTimeError(updatedStop, formData, deliveryMode === "TWO_DAY"),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (formData.pickupDate < minDeliveryDate) {
      setDateError(`Delivery date must be on or after ${minDeliveryDate}.`);
      return;
    }

    const availabilityErrorMessage = pickupDateAvailabilityError(
      formData.pickupDate,
    );
    if (availabilityErrorMessage) {
      setDateError(availabilityErrorMessage);
      return;
    }

    const pickupWindowErrorMessage = getPickupWindowError(formData);
    if (pickupWindowErrorMessage) {
      setPickupWindowError(pickupWindowErrorMessage);
      return;
    }

    const { dropoffDateError, dropoffTimeError } =
      getScheduleErrors(formData);
    if (dropoffDateError || dropoffTimeError) {
      setDropoffDateError(dropoffDateError);
      setDropoffTimeError(dropoffTimeError);
      return;
    }

    // Window-end doesn't apply in Two-Day mode (dropoffTime is the Day 2
    // start instant, not a window start) -- never validate a stale
    // dropoffTimeEnd against it here. See the auto-clear effect's comment.
    const dropoffWindowErrorMessage =
      deliveryMode === "TWO_DAY" ? "" : getDropoffWindowError(formData);
    if (dropoffWindowErrorMessage) {
      setDropoffWindowError(dropoffWindowErrorMessage);
      return;
    }

    const nextStopTimeErrors = Object.fromEntries(
      formData.stops.map((stop, i) => [
        i,
        getStopTimeError(stop, formData, deliveryMode === "TWO_DAY"),
      ]),
    );
    if (Object.values(nextStopTimeErrors).some(Boolean)) {
      setStopTimeErrors(nextStopTimeErrors);
      return;
    }

    const budgetErrorMessage = getBudgetError(formData);
    if (budgetErrorMessage) {
      setBudgetError(budgetErrorMessage);
      return;
    }

    if (!formData.truckType) {
      setTruckSelectionError("Please select a truck for this delivery.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setSubmitError("You must be signed in to submit a delivery request.");
      return;
    }

    setSubmitting(true);

    // A customer who typed the address and submitted without ever clicking a
    // suggestion or using the map picker never had lat/lng captured (see
    // LocationInput's onChange handlers, which only pass lat/lng along from
    // those two interactions, never from a raw keystroke) -- fall back to
    // resolving the typed text via the same Photon geocoder those
    // interactions already use, so the Supervisor/Driver maps aren't left
    // showing "no parseable coordinates" for what's likely the common case.
    let pickupLat = formData.pickupLat;
    let pickupLng = formData.pickupLng;
    if (pickupLat == null && formData.pickupLocation) {
      const coords = await photonGeocode(formData.pickupLocation);
      if (coords) {
        pickupLat = coords.lat;
        pickupLng = coords.lng;
      }
    }
    let dropoffLat = formData.dropoffLat;
    let dropoffLng = formData.dropoffLng;
    if (dropoffLat == null && formData.dropoffLocation) {
      const coords = await photonGeocode(formData.dropoffLocation);
      if (coords) {
        dropoffLat = coords.lat;
        dropoffLng = coords.lng;
      }
    }

    // Last line of defense: even if a coordinate slipped past the picker,
    // autocomplete, or a geocoder resolved typed text outside Luzon, never
    // save an out-of-service-area location.
    if (
      (pickupLat != null && !isInsideLuzon(pickupLat, pickupLng)) ||
      (dropoffLat != null && !isInsideLuzon(dropoffLat, dropoffLng))
    ) {
      setSubmitting(false);
      setSubmitError(SERVICE_AREA_MESSAGE);
      return;
    }

    // Reject deliveries whose simulated schedule (scheduleSimulator.js --
    // pickup/loading, every travel leg in entered order, unloading, rest
    // breaks, meal breaks) would exceed MAX_TOTAL_DELIVERY_HOURS combined
    // across Day 1 + Day 2. Always recomputed fresh here rather than
    // trusting the live-preview state, same "never trust stale client
    // state at the final gate" pattern this check already used before.
    const activeStops = formData.stops.filter((stop) => stop.location.trim());
    // Warehouse -> Pickup -> Dropoff -> Stops route, generated up front so
    // the Supervisor and Customer have something to view during
    // PENDING_REQUEST/quotation review (2026-09-06, since simplified
    // 2026-09-08 to a read-only view only -- see SuggestedRouteMap). Non-
    // fatal on failure: unlike estimateLegDurations below (which blocks
    // submission because a wrong schedule is a correctness problem), a
    // missing route here is just a display convenience -- the Driver's own
    // pre-trip screen (PlannedRouteMap, DriverDeliveries.jsx) still computes
    // and saves one fresh if this one never landed.
    let suggestedRoute = null;
    if (pickupLat != null && dropoffLat != null) {
      if (!mapsApiLoaded || !window.google) {
        setSubmitting(false);
        setSubmitError(
          "Still loading map services — please try again in a moment.",
        );
        return;
      }

      // Stops are never geocoded on entry (see LocationInput) -- resolve
      // any without a live-captured lat/lng via Photon, same fallback
      // pickup/dropoff already use above.
      const resolvedStopCoords = await Promise.all(
        activeStops.map(async (stop) => {
          if (stop.lat != null && stop.lng != null) {
            return { lat: stop.lat, lng: stop.lng };
          }
          return photonGeocode(stop.location);
        }),
      );
      if (resolvedStopCoords.some((coords) => !coords)) {
        setSubmitting(false);
        setSubmitError(
          "We couldn't locate one of the additional drop-off addresses. Please double-check them.",
        );
        return;
      }
      if (
        resolvedStopCoords.some(
          (coords) => !isInsideLuzon(coords.lat, coords.lng),
        )
      ) {
        setSubmitting(false);
        setSubmitError(SERVICE_AREA_MESSAGE);
        return;
      }

      try {
        const { legs } = await computeSuggestedRoute({
          pickupCoords: { lat: pickupLat, lng: pickupLng },
          pickupAddress: formData.pickupLocation,
          dropoffCoords: { lat: dropoffLat, lng: dropoffLng },
          dropoffAddress: formData.dropoffLocation,
          stops: activeStops.map((stop, i) => ({
            location: stop.location,
            coords: resolvedStopCoords[i],
          })),
        });
        suggestedRoute = legs;
      } catch {
        // Non-fatal -- see the comment above activeStops.
      }

      let legTravelSeconds;
      try {
        legTravelSeconds = await estimateLegDurations([
          { lat: pickupLat, lng: pickupLng },
          { lat: dropoffLat, lng: dropoffLng },
          ...resolvedStopCoords,
        ]);
      } catch {
        setSubmitting(false);
        setSubmitError(
          "We couldn't calculate a route between these locations. Please double-check the pickup and dropoff addresses.",
        );
        return;
      }

      const schedule = simulateSchedule({
        mode: deliveryMode,
        day1StartTime: formData.pickupTime,
        day2StartTime: formData.dropoffTime,
        legTravelSeconds,
      });
      if (schedule.exceedsLimit) {
        setSubmitting(false);
        setTravelTimeModalSchedule(schedule);
        return;
      }
    }

    const newRequest = {
      customer_auth_id: user.id,
      pickup_date: formData.pickupDate,
      pickup_time: formData.pickupTime,
      pickup_time_end: formData.pickupTimeEnd,
      dropoff_date: formData.dropoffDate,
      dropoff_time: formData.dropoffTime,
      // In Two-Day mode this field is hidden (dropoffTime is the Day 2
      // start instant, not a window) -- send null, not an empty string,
      // since the DB column is `time`.
      dropoff_time_end: formData.dropoffTimeEnd || null,
      delivery_mode: deliveryMode,
      pickup_location: formData.pickupLocation,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      dropoff_location: formData.dropoffLocation,
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
      stops: formData.stops
        .filter((stop) => stop.location.trim())
        .map((stop) => ({
          location: stop.location,
          ...(stop.dropoffTime && stop.dropoffTimeEnd
            ? {
                dropoffTime: stop.dropoffTime,
                dropoffTimeEnd: stop.dropoffTimeEnd,
              }
            : {}),
        })),
      truck_type: formData.truckType,
      item_type: formData.itemType,
      cargo_weight: formData.cargoWeight,
      budget_min: formData.budgetMin || null,
      budget_max: formData.budgetMax || null,
      notes: formData.notes || null,
      status: "PENDING_REQUEST",
      suggested_route: suggestedRoute,
    };

    const { error: insertError } = await supabase
      .from("delivery_requests")
      .insert(newRequest);
    setSubmitting(false);

    if (insertError) {
      setSubmitError(
        "Something went wrong while submitting your request. Please try again.",
      );
      return;
    }

    navigate("/customer/deliveries", {
      state: {
        defaultTab: "PENDING_REQUEST",
        toastMessage: "Delivery request submitted successfully.",
      },
    });
  };

  return (
    <CustomerLayout
      title="Request Delivery"
      background={background}
      bg="bg-white md:bg-[#F6F7FB]"
    >
      <div className="flex flex-col gap-6 mb-2">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <Link
            to="/customer/deliveries"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Deliveries
          </Link>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Request Delivery
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Fill out the details below to submit a new delivery request for
            review.
          </p>
        </header>

        <div className="rounded-2xl border border-emerald-200/70 bg-white p-5 shadow-sm sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Schedule Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">
                Schedule
              </h3>

              <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <Clock className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Deliveries must be scheduled at least{" "}
                  <span className="font-semibold">
                    {MIN_SCHEDULING_DAYS} days in advance
                  </span>
                  . The earliest available date is{" "}
                  <span className="font-semibold">{minDeliveryDate}</span>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">
                  Delivery Mode:
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  {deliveryMode === "SAME_DAY" ? "Same-Day" : "Two-Day"}
                </span>
                <span className="text-xs text-slate-500">
                  {deliveryMode === "SAME_DAY"
                    ? "— pick a later Drop Off Date to switch to Two-Day"
                    : "— pickup on Day 1, all drop-offs on Day 2"}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="relative space-y-2">
                  <label
                    htmlFor="pickupDate"
                    className="text-sm font-medium text-slate-700"
                  >
                    Pick Up Date
                  </label>
                  <input
                    type="date"
                    id="pickupDate"
                    name="pickupDate"
                    value={formData.pickupDate}
                    onChange={handleChange}
                    min={minDeliveryDate}
                    required
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                      dateError
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                        : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                    }`}
                  />
                  {dateError && (
                    <p className="text-xs text-red-600">{dateError}</p>
                  )}
                </div>
                <div className="relative space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Pick Up Window
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      id="pickupTime"
                      name="pickupTime"
                      aria-label="Pick Up Window Start"
                      value={formData.pickupTime}
                      onChange={handleChange}
                      required
                      className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                        pickupWindowError
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                          : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                      }`}
                    />
                    <span className="shrink-0 text-sm text-slate-400">to</span>
                    <input
                      type="time"
                      id="pickupTimeEnd"
                      name="pickupTimeEnd"
                      aria-label="Pick Up Window End"
                      value={formData.pickupTimeEnd}
                      onChange={handleChange}
                      required
                      className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                        pickupWindowError
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                          : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                      }`}
                    />
                  </div>
                  {pickupWindowError && (
                    <p className="absolute left-0 top-full mt-1 text-xs text-red-600">
                      {pickupWindowError}
                    </p>
                  )}
                </div>
                <div className="relative space-y-2">
                  <label
                    htmlFor="dropoffDate"
                    className="text-sm font-medium text-slate-700"
                  >
                    Drop Off Date
                  </label>
                  <input
                    type="date"
                    id="dropoffDate"
                    name="dropoffDate"
                    value={formData.dropoffDate}
                    onChange={handleChange}
                    min={formData.pickupDate || minDeliveryDate}
                    required
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                      dropoffDateError
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                        : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                    }`}
                  />
                  {dropoffDateError && (
                    <p className="absolute left-0 top-full mt-1 text-xs text-red-600">
                      {dropoffDateError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Location Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">
                Location
              </h3>
              <div className="grid gap-4 grid-cols-1">
                <LocationInput
                  id="pickupLocation"
                  label="Pick Up Location"
                  value={formData.pickupLocation}
                  lat={formData.pickupLat}
                  lng={formData.pickupLng}
                  onChange={handleChange}
                  required
                />
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[220px] flex-1">
                      <LocationInput
                        id="dropoffLocation"
                        label="Drop Off Location"
                        value={formData.dropoffLocation}
                        lat={formData.dropoffLat}
                        lng={formData.dropoffLng}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="w-full space-y-2 sm:w-auto sm:shrink-0">
                      <label
                        htmlFor="dropoffTime"
                        className="text-sm font-medium text-slate-700"
                      >
                        {deliveryMode === "TWO_DAY"
                          ? "Day 2 Start Time"
                          : "Open From – To"}
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          type="time"
                          id="dropoffTime"
                          name="dropoffTime"
                          aria-label={
                            deliveryMode === "TWO_DAY"
                              ? "Day 2 Start Time"
                              : "Drop Off Window Start"
                          }
                          value={formData.dropoffTime}
                          onChange={handleChange}
                          min={
                            deliveryMode === "SAME_DAY" &&
                            formData.dropoffDate === formData.pickupDate
                              ? formData.pickupTimeEnd || formData.pickupTime
                              : undefined
                          }
                          required
                          className={`w-full rounded-xl border bg-white px-2.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 sm:w-[8.5rem] ${
                            dropoffTimeError || dropoffWindowError
                              ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                              : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                          }`}
                        />
                        {deliveryMode === "SAME_DAY" && (
                          <>
                            <span className="shrink-0 text-xs text-slate-400">
                              to
                            </span>
                            <input
                              type="time"
                              id="dropoffTimeEnd"
                              name="dropoffTimeEnd"
                              aria-label="Drop Off Window End"
                              value={formData.dropoffTimeEnd}
                              onChange={handleChange}
                              required
                              className={`w-full rounded-xl border bg-white px-2.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 sm:w-[8.5rem] ${
                                dropoffWindowError
                                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                                  : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                              }`}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {(dropoffTimeError || dropoffWindowError) && (
                    <p className="text-xs text-red-600">
                      {dropoffTimeError || dropoffWindowError}
                    </p>
                  )}
                </div>
              </div>

              {formData.stops.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    These are additional drop-off destinations, not necessarily
                    visited in this order — the driver is routed to whichever is
                    nearest at each point along the trip.
                  </p>
                  {formData.stops.map((stop, index) => (
                    <div key={index} className="space-y-1.5">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[220px] flex-1">
                          <LocationInput
                            id={`stop-${index}`}
                            label={`Dropoff ${index + 2}`}
                            value={stop.location}
                            lat={stop.lat}
                            lng={stop.lng}
                            onChange={(e) => handleStopChange(index, e)}
                          />
                        </div>
                        <div className="w-full space-y-2 sm:w-auto sm:shrink-0">
                          <label
                            htmlFor={`stop-time-${index}`}
                            className="text-sm font-medium text-slate-700"
                          >
                            Open From – To
                          </label>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input
                              type="time"
                              id={`stop-time-${index}`}
                              aria-label={`Dropoff ${index + 2} Window Start`}
                              value={stop.dropoffTime}
                              onChange={(e) =>
                                handleStopTimeChange(
                                  index,
                                  "dropoffTime",
                                  e.target.value,
                                )
                              }
                              className={`w-full rounded-xl border bg-white px-2.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 sm:w-[8.5rem] ${
                                stopTimeErrors[index]
                                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                                  : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                              }`}
                            />
                            <span className="shrink-0 text-xs text-slate-400">
                              to
                            </span>
                            <input
                              type="time"
                              id={`stop-time-end-${index}`}
                              aria-label={`Dropoff ${index + 2} Window End`}
                              value={stop.dropoffTimeEnd}
                              onChange={(e) =>
                                handleStopTimeChange(
                                  index,
                                  "dropoffTimeEnd",
                                  e.target.value,
                                )
                              }
                              className={`w-full rounded-xl border bg-white px-2.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 sm:w-[8.5rem] ${
                                stopTimeErrors[index]
                                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                                  : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                              }`}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStop(index)}
                          className="mb-0.5 flex h-[42px] w-[42px] shrink-0 items-center justify-center self-end rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                          title="Remove dropoff"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {stopTimeErrors[index] && (
                        <p className="text-xs text-red-600">
                          {stopTimeErrors[index]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {formData.stops.length < MAX_STOPS && (
                <button
                  type="button"
                  onClick={addStop}
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  + Add another dropoff destination
                </button>
              )}

              {/* Schedule Summary -- Day 1 / Day 2 / Total only, no
                  itemized break-by-break listing (explicit user scope). */}
              {scheduleLoading && (
                <p className="text-xs text-slate-500">
                  Estimating delivery schedule…
                </p>
              )}
              {scheduleError && (
                <p className="text-xs text-red-600">{scheduleError}</p>
              )}
              {scheduleResult && !scheduleLoading && (
                <div
                  className={`rounded-xl border p-3 ${
                    scheduleResult.exceedsLimit
                      ? "border-red-200 bg-red-50"
                      : "border-emerald-200 bg-emerald-50"
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Estimated Schedule
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span className="text-slate-700">
                      Day 1:{" "}
                      <span className="font-semibold">
                        {formatDuration(scheduleResult.day1TotalSeconds)}
                      </span>
                    </span>
                    {scheduleResult.day2TotalSeconds != null && (
                      <span className="text-slate-700">
                        Day 2:{" "}
                        <span className="font-semibold">
                          {formatDuration(scheduleResult.day2TotalSeconds)}
                        </span>
                      </span>
                    )}
                    <span className="text-slate-700">
                      Total:{" "}
                      <span className="font-semibold">
                        {formatDuration(scheduleResult.totalSeconds)}
                      </span>
                    </span>
                  </div>
                  {scheduleResult.exceedsLimit && (
                    <p className="mt-1.5 text-xs text-red-700">
                      This exceeds our {MAX_TOTAL_DELIVERY_HOURS}-hour limit
                      — you'll need to book this as a separate trip.
                    </p>
                  )}
                </div>
              )}

              {/* Route Plan Viewing -- live preview so the customer can see
                  the planned route before submitting, purely informational
                  (never blocks Submit, same as the Schedule Summary above). */}
              {routePreviewLoading && (
                <p className="text-xs text-slate-500">
                  Loading route preview…
                </p>
              )}
              {routePreviewError && (
                <p className="text-xs text-red-600">{routePreviewError}</p>
              )}
              {routePreview && !routePreviewLoading && (
                <SuggestedRouteMap
                  suggestedRoute={routePreview}
                  title="Planned Route Preview"
                />
              )}
            </div>

            {/* Cargo Details Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">
                Cargo Details
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="itemType"
                    className="text-sm font-medium text-slate-700"
                  >
                    Type of Item
                  </label>
                  <select
                    id="itemType"
                    name="itemType"
                    value={formData.itemType}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Select item type</option>
                    {itemTypes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="cargoWeight"
                    className="text-sm font-medium text-slate-700"
                  >
                    Estimated Cargo Weight (kg)
                  </label>
                  <input
                    type="number"
                    id="cargoWeight"
                    name="cargoWeight"
                    min="1"
                    value={formData.cargoWeight}
                    onChange={handleChange}
                    placeholder="e.g. 800"
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </div>

            {/* Truck Selection Section */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">
                  Truck Selection
                </h3>
                {recommendedTruckValue && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    We recommend the highlighted truck below
                  </span>
                )}
              </div>

              {!formData.itemType ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Select an item type and estimated cargo weight above to see
                  compatible trucks.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-emerald-200/70">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-emerald-200/70 bg-emerald-50/60 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3 font-medium">Truck</th>
                          <th className="px-4 py-3 font-medium">Type</th>
                          <th className="px-4 py-3 font-medium">Max Payload</th>
                          <th className="px-4 py-3 font-medium">Dimensions</th>
                          <th className="px-4 py-3 font-medium">Select</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedTruckTypes.map((truck) => {
                          const { available, reason } = getTruckAvailability(
                            truck,
                            formData.itemType,
                            formData.cargoWeight,
                          );
                          const isSelected = formData.truckType === truck.value;
                          const isRecommended =
                            recommendedTruckValue === truck.value;

                          return (
                            <tr
                              key={truck.value}
                              onClick={() => handleTruckSelect(truck)}
                              className={`cursor-pointer transition ${
                                isSelected
                                  ? "bg-emerald-50"
                                  : isRecommended
                                    ? "bg-emerald-50/40 hover:bg-emerald-50"
                                    : "bg-white hover:bg-emerald-50/50"
                              }`}
                            >
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">
                                    {truck.label}
                                  </span>
                                  {isRecommended && (
                                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                      Recommended
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 max-w-xs text-xs text-slate-500 leading-relaxed">
                                  {truck.description}
                                </p>
                                {!available && (
                                  <p className="mt-1 text-[11px] font-medium text-amber-600">
                                    {reason} — the Supervisor can still confirm
                                    this truck when assigning.
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <span
                                  className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                                    truck.category === "reefer"
                                      ? "bg-sky-100 text-sky-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {truck.category === "reefer" ? (
                                    <Thermometer className="h-3 w-3" />
                                  ) : (
                                    <Box className="h-3 w-3" />
                                  )}
                                  {truck.category === "reefer"
                                    ? "Refrigerated"
                                    : "Dry"}
                                </span>
                              </td>
                              <td className="px-4 py-3 align-top text-slate-700">
                                <div className="flex items-center gap-1.5">
                                  <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  {truck.payloadKg.toLocaleString()} kg
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top text-slate-700">
                                <div className="flex items-center gap-1.5">
                                  <Ruler className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  {truck.dimensions}
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <span
                                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                                    isSelected
                                      ? "border-emerald-600 bg-emerald-600"
                                      : "border-slate-300"
                                  }`}
                                >
                                  {isSelected && (
                                    <Check className="h-3 w-3 text-white" />
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {truckSelectionError && (
                    <p className="text-xs text-red-600">
                      {truckSelectionError}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Budget Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">
                Budget Range
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your preferred budget range. The final quotation will be
                discussed with the supervisor.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="budgetMin"
                    className="text-sm font-medium text-slate-700"
                  >
                    Minimum Budget (₱)
                  </label>
                  <input
                    type="number"
                    id="budgetMin"
                    name="budgetMin"
                    min="0"
                    value={formData.budgetMin}
                    onChange={handleChange}
                    placeholder="e.g. 5000"
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                      budgetError
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                        : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                    }`}
                  />
                </div>
                <div className="relative space-y-2">
                  <label
                    htmlFor="budgetMax"
                    className="text-sm font-medium text-slate-700"
                  >
                    Maximum Budget (₱)
                  </label>
                  <input
                    type="number"
                    id="budgetMax"
                    name="budgetMax"
                    min="0"
                    value={formData.budgetMax}
                    onChange={handleChange}
                    placeholder="e.g. 10000"
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                      budgetError
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                        : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                    }`}
                  />
                  {budgetError && (
                    <p className="absolute left-0 top-full mt-1 text-xs text-red-600">
                      {budgetError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  The budget you entered is only an estimate to give the
                  Supervisor an idea of your expected budget. The final
                  quotation may be higher than your indicated budget.
                  <br />
                  You may negotiate the quotation with the Supervisor after
                  submitting your request.
                </p>
              </div>
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
              <label
                htmlFor="notes"
                className="text-sm font-medium text-emerald-700 uppercase tracking-wider"
              >
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Add any special instructions or notes for the delivery..."
                rows={4}
                className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 border-t border-emerald-200/70 pt-4">
              {submitError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  {submitError}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={goBackToDeliveries}
                  disabled={submitting}
                  className="rounded-xl border border-emerald-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-emerald-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      {travelTimeModalSchedule != null && (
        <TravelTimeExceededModal
          schedule={travelTimeModalSchedule}
          onClose={() => setTravelTimeModalSchedule(null)}
        />
      )}
    </CustomerLayout>
  );
}

export default CustomerRequestDelivery;
