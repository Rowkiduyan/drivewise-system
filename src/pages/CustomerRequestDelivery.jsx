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
  Search,
  Thermometer,
  Trash2,
  X,
} from "lucide-react";
import CustomerLayout from "../layout/CustomerLayout.jsx";
import {
  GoogleMap,
  Marker as GoogleMapMarker,
  Polygon as GoogleMapPolygon,
  useJsApiLoader,
} from "@react-google-maps/api";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import {
  truckTypes,
  itemTypes,
  getTruckAvailability,
  getRecommendedTruckValue,
  MIN_SCHEDULING_DAYS,
  getMinDeliveryDate,
  getDropoffDateError,
  getBudgetError,
  MIN_BUDGET_AMOUNT,
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

const background = null;

// Intermediate stops between Pick Up and Drop Off. Raised from the original
// 5 (2026-09-22, explicit user request: "more than 5 dropoffs, still inside
// 13 hours") -- the real limit on how many stops a delivery can hold was
// never actually a UX/business rule, it's the MAX_TOTAL_DELIVERY_HOURS check
// in scheduleSimulator.js, which already applies to the whole leg chain
// regardless of stop count (both the live schedule preview and handleSubmit
// recompute legTravelSeconds for every leg and reject via exceedsLimit --
// see the travelTimeModalSchedule state below). MAX_STOPS now exists purely
// as a technical ceiling on the single DirectionsService request this form
// makes ([pickup, dropoff, ...stops] as one waypoints call,
// 02B_MULTI_STOP_DELIVERIES.md) -- Google's Directions API caps the
// `waypoints` field at 25 entries, and this form's request shape sends one
// dropoff plus all but the last stop as `waypoints` entries (the last stop
// becomes the `destination` instead, see estimateLegDurations below) -- so
// for N stops exactly N waypoints get sent, meaning 20 stops stays safely
// under that ceiling with room to spare. In practice the 13-hour cap will
// almost always bind first, since each stop also costs a 30-min unload.
const MAX_STOPS = 20;

// Estimated drive time (seconds) for each leg of the ordered chain
// [pickup, dropoff, ...stops] -- one DirectionsService request with
// waypoints for the whole chain, same traffic-aware shape every other route
// computation in the app already uses (11_ROUTE_COMPARISON.md's
// "Traffic-Aware Suggested Routes", DriverDeliveries.jsx's computeRoute).
// optimizeWaypoints is deliberately NOT set (defaults false) -- the
// schedule must reflect the customer-entered stop order, not a
// re-optimized shortest path, since each returned leg maps 1:1 to an
// unload event in scheduleSimulator.js's walk.
// Statuses worth retrying with the raw address text instead of the
// Photon-resolved coordinate for that leg -- same reasoning as
// suggestedRoute.js's RETRYABLE_DIRECTIONS_STATUSES: a coordinate from a
// different geocoder than the one routing it can land on a point Google's
// road graph can't reach (e.g. an interior subdivision street), even though
// the address itself is real. Anything else is a genuine failure.
const RETRYABLE_DIRECTIONS_STATUSES = new Set(["ZERO_RESULTS", "NOT_FOUND"]);

// Shown when a location field was only typed/searched but never actually
// picked (a search suggestion clicked, or a point placed/dragged on the map
// picker) -- neither of those two interactions ever leaves lat/lng null (see
// LocationInput's onChange handlers), so a null coordinate here always means
// "typed text only." Explicit user decision, 2026-09-17: typing alone isn't
// enough to confirm an exact point, so this blocks submission and points the
// customer back at the map instead of silently forward-geocoding the text
// (the previous behavior, which could land outside Luzon with only the vague
// bottom-of-page SERVICE_AREA_MESSAGE to explain why).
const MAP_SELECTION_REQUIRED_MESSAGE =
  "This location was only typed, not selected. Please tap \"Map\" (or choose a suggestion from the dropdown) to confirm the exact spot before submitting.";

// `waypointAddresses`, same length/order as `waypointCoords`, is the raw
// address text for each leg -- used as a retry (in place of the
// coordinate) for whichever legs still fail after the first, coordinate-
// based attempt.
function estimateLegDurations(waypointCoords, waypointAddresses) {
  return new Promise((resolve, reject) => {
    const attempt = (waypoints) => {
      const [origin, ...rest] = waypoints;
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
            if (
              waypoints === waypointCoords &&
              waypointAddresses &&
              RETRYABLE_DIRECTIONS_STATUSES.has(status)
            ) {
              attempt(waypointAddresses);
              return;
            }
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
    };
    attempt(waypointCoords);
  });
}

// Google Places (New) autocomplete search + Maps JavaScript API Geocoder
// reverse-geocoding for the map picker -- replaces the previous Leaflet/
// Photon combination. Both already covered by this app's shared Google Maps
// API key (Places API (New) is already enabled on it, see
// 02_BOOKING_AND_TRIP_CREATION.md's "Google Maps Platform Setup" -- that doc
// also flagged the booking form as still using Leaflet/Photon in practice
// despite that setup, which this change resolves).

// Google's {south,west,north,east} shape, derived from the same
// [[south,west],[north,east]] pair serviceArea.js exports (single source of
// truth for the service-area bbox).
const PH_BOUNDS = {
  south: SERVICE_AREA_MAX_BOUNDS[0][0],
  west: SERVICE_AREA_MAX_BOUNDS[0][1],
  north: SERVICE_AREA_MAX_BOUNDS[1][0],
  east: SERVICE_AREA_MAX_BOUNDS[1][1],
};

// One AutocompleteSessionToken per distinct search "session" (typing through
// to picking a suggestion) -- required so a single address search is billed
// once per session rather than once per keystroke, per the setup doc above.
function newSessionToken() {
  return new window.google.maps.places.AutocompleteSessionToken();
}

// `locationBias` (not a hard restriction) keeps results centered on the
// service area while still letting a query for something just outside it
// return a real result -- `isInsideLuzon` is what actually enforces the
// service-area boundary, same as before.
async function placesSearch(query, sessionToken) {
  const { suggestions } =
    await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
      {
        input: query,
        sessionToken,
        includedRegionCodes: ["ph"],
        locationBias: PH_BOUNDS,
      },
    );
  return (suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((prediction) => ({
      prediction,
      // Short place/street name for the dropdown row -- the point of
      // switching off Photon was to search real places by name rather than
      // only match on a long formatted address.
      mainText: prediction.mainText?.text || prediction.text.text,
      secondaryText: prediction.secondaryText?.text || "",
    }));
}

// Resolves a clicked suggestion into real coordinates and a full formatted
// address -- the address is what actually gets stored as pickup/dropoff
// location text, same shape every other consumer (Directions requests,
// driver navigation) already expects.
async function resolvePlacePrediction(prediction) {
  const place = prediction.toPlace();
  await place.fetchFields({ fields: ["location", "formattedAddress"] });
  return {
    display: place.formattedAddress || prediction.text.text,
    lat: place.location.lat(),
    lon: place.location.lng(),
  };
}

// Reverse-geocode a coordinate to an address via the Maps JavaScript API's
// Geocoder class -- same technique lib/reverseGeocode.js already uses
// elsewhere in the app (browser-safe with this app's referrer-restricted
// key, unlike the raw Geocoding REST endpoint).
function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    new window.google.maps.Geocoder().geocode(
      { location: { lat, lng } },
      (results, status) => {
        resolve(
          status === "OK" && results?.[0]?.formatted_address
            ? results[0].formatted_address
            : "",
        );
      },
    );
  });
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
  const { isLoaded: mapsApiLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const mapRef = useRef(null);
  // One session token per picker session (reset whenever the modal reopens
  // or a suggestion is picked) -- see placesSearch's comment above.
  const sessionTokenRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 14.5995, lng: 120.9842 });
  const [mapZoom, setMapZoom] = useState(13);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [showServiceAreaNotice, setShowServiceAreaNotice] = useState(false);

  // Re-centers/re-zooms the live map imperatively whenever mapCenter/mapZoom
  // change (a search pick, a suggestion click, or the initial-value effect
  // below) -- GoogleMap's center/zoom props only apply on mount, same
  // pattern SuggestedRouteMap.jsx already uses for its own fitBounds call.
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo(mapCenter);
      mapRef.current.setZoom(mapZoom);
    }
  }, [mapCenter, mapZoom]);

  // Every point (click, drag, search pick) is validated against the Luzon
  // service-area polygons first: an invalid placement never sticks -- the
  // pin snaps back to the nearest valid spot inside Luzon and the UI flags
  // the attempt. Clicking/dragging always resolves the point to a real
  // address via reverse geocoding; the coordinates are shown as an instant
  // fallback only.
  const handlePoint = (lat, lng) => {
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
      setMapCenter({ lat: finalLat, lng: finalLng });
    }
    setShowServiceAreaNotice(!inside);

    setSelectedLocation({
      display: `${finalLat.toFixed(6)}, ${finalLng.toFixed(6)}`,
      lat: finalLat,
      lon: finalLng,
    });
    setResolvingAddress(true);
    reverseGeocode(finalLat, finalLng)
      .then((display) => {
        if (display) {
          setSelectedLocation({ display, lat: finalLat, lon: finalLng });
        }
      })
      .catch(() => {})
      .finally(() => setResolvingAddress(false));
  };

  // When the modal opens, always resync local state to the field's last
  // *confirmed* value (initialValue/initialLat/initialLng, only ever updated
  // by a Confirm click via onSelect) rather than trusting whatever's left
  // over in `selectedLocation` from a previous visit -- the modal stays
  // mounted between opens (LocationInput always renders it, `isOpen` only
  // gates its own output), so a pin dragged/clicked/searched and then
  // abandoned via Cancel/X must not linger and get treated as "selected"
  // the next time the picker opens, or worse, get saved if Confirm is
  // clicked on a later, unrelated visit. Explicit user decision, 2026-09-18.
  //
  // Prefers the exact previously-picked coordinate (initialLat/initialLng)
  // over re-geocoding the address text. Real bug found live 2026-09-06:
  // re-forward-geocoding the text via Photon on every reopen silently
  // discarded a manual drag adjustment, since reverse-geocoding is coarse
  // enough that a dragged point and its surrounding street often share the
  // exact same display address — Photon then returns its own canonical
  // point for that text, not the dragged one, making a careful adjustment
  // appear to "revert" the moment the picker was reopened (e.g. to double-
  // check the pin before submitting). Only fall back to forward-geocoding
  // the text when no precise coordinate exists yet — a manually-typed
  // address that was never picked/dragged.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    // Deferred via a microtask -- avoids calling setState synchronously in
    // the effect body, matching this file's other geocode-effect below.
    Promise.resolve().then(() => {
      if (!cancelled) {
        setSearchQuery("");
        setSuggestions([]);
      }
    });

    const query = initialValue?.trim();
    if (!query) {
      // No confirmed value yet -- discard any unconfirmed pin left over
      // from a cancelled visit instead of leaving it selectable again.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setShowServiceAreaNotice(false);
        setSelectedLocation(null);
        setMapCenter({ lat: 14.5995, lng: 120.9842 });
        setMapZoom(13);
      });
      return () => {
        cancelled = true;
      };
    }

    if (initialLat != null && initialLng != null) {
      // Deferred via a microtask, matching this file's other geocode-effect
      // below -- avoids calling setState synchronously in the effect body.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setShowServiceAreaNotice(false);
        setSelectedLocation({ display: query, lat: initialLat, lon: initialLng });
        setMapCenter({ lat: initialLat, lng: initialLng });
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
        setMapCenter({ lat: coords.lat, lng: coords.lng });
        setMapZoom(16);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialValue, initialLat, initialLng]);

  // Fresh session token each time the modal opens -- see placesSearch's
  // comment above on why a token must span the whole search-to-pick flow.
  useEffect(() => {
    if (isOpen && mapsApiLoaded && window.google) {
      sessionTokenRef.current = newSessionToken();
    }
  }, [isOpen, mapsApiLoaded]);

  useEffect(() => {
    if (searchQuery.length <= 2 || !mapsApiLoaded || !window.google) return;
    const timer = setTimeout(() => {
      placesSearch(searchQuery, sessionTokenRef.current)
        .then((data) => setSuggestions(data))
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, mapsApiLoaded]);
  // Clear suggestions once the query gets too short to search, adjusted
  // during render instead of in the effect above -- `suggestions.length >
  // 0` doubles as its own guard (no extra tracking state needed), since
  // once cleared, further renders with a still-short query are no-ops.
  if (searchQuery.length <= 2 && suggestions.length > 0) {
    setSuggestions([]);
  }

  const handleSuggestionClick = (suggestion) => {
    resolvePlacePrediction(suggestion.prediction)
      .then(({ display, lat, lon }) => {
        if (!isInsideLuzon(lat, lon)) {
          setShowServiceAreaNotice(true);
          return;
        }
        setShowServiceAreaNotice(false);
        setSelectedLocation({ display, lat, lon });
        setMapCenter({ lat, lng: lon });
        setMapZoom(16);
        // A place was just resolved to a real point (billable), so the
        // session is over -- the next search starts a new one.
        sessionTokenRef.current = newSessionToken();
      })
      .catch(() => {});
    setSuggestions([]);
    setSearchQuery("");
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
              placeholder="Search by place name or address within Luzon..."
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
                    <span className="block font-medium text-slate-900">
                      {suggestion.mainText}
                    </span>
                    {suggestion.secondaryText && (
                      <span className="block text-xs text-slate-500">
                        {suggestion.secondaryText}
                      </span>
                    )}
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
            {!mapsApiLoaded ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Loading map…
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ height: "100%", width: "100%" }}
                center={mapCenter}
                zoom={mapZoom}
                onLoad={(map) => {
                  mapRef.current = map;
                }}
                onClick={(e) => handlePoint(e.latLng.lat(), e.latLng.lng())}
                options={{
                  zoomControl: true,
                  streetViewControl: false,
                  mapTypeControl: false,
                  fullscreenControl: false,
                  // Soft-restricts panning/zooming to the service area --
                  // strictBounds false keeps this elastic (can drift out
                  // slightly, snaps back) rather than a hard wall, matching
                  // the Leaflet maxBoundsViscosity(0.7) behavior it replaces.
                  restriction: { latLngBounds: PH_BOUNDS, strictBounds: false },
                }}
              >
                {/* Service-area boundary so users can see where selection is allowed */}
                {LUZON_SERVICE_AREA.map((ring, index) => (
                  <GoogleMapPolygon
                    key={index}
                    paths={ring.map(([lat, lng]) => ({ lat, lng }))}
                    options={{
                      strokeColor: "#059669",
                      strokeWeight: 2,
                      fillColor: "#10b981",
                      fillOpacity: 0.08,
                      clickable: false,
                    }}
                  />
                ))}
                {selectedLocation && (
                  <GoogleMapMarker
                    position={{ lat: selectedLocation.lat, lng: selectedLocation.lon }}
                    draggable
                    onDragEnd={(e) => handlePoint(e.latLng.lat(), e.latLng.lng())}
                  />
                )}
              </GoogleMap>
            )}
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

// Location Input, map-picker-only -- no typing allowed outside the modal.
// Explicit user decision, 2026-09-18: a manually-typed address (even via
// this field's old inline autocomplete) was never distinguishable from one
// actually confirmed on the map until submit time (see
// MAP_SELECTION_REQUIRED_MESSAGE above), which only surfaced the problem
// after the customer had already filled out the rest of the form. Removing
// the ability to type here at all closes that gap at the source: the only
// way to set a value is LocationPickerModal's own search/map/drag flow,
// every path of which already resolves a real lat/lng before calling
// onSelect. The field itself is now `readOnly` and opens the picker on
// focus/click, purely so the resolved address can still be displayed and
// re-opened for adjustment.
function LocationInput({ id, label, value, lat, lng, onChange, required, error }) {
  const [showMapPicker, setShowMapPicker] = useState(false);

  const handleLocationSelect = (address, lat, lng) => {
    onChange({ target: { name: id, value: address, lat, lng } });
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          id={id}
          name={id}
          value={value}
          // Deliberately NOT `readOnly` -- per the HTML spec, a readonly
          // field is excluded from `required` validation entirely, which was
          // a real bug: the browser silently stopped blocking submission of
          // an empty address, so pressing Enter (which runs the browser's
          // native validation before our own JS checks even run) sailed
          // straight through. Found 2026-09-18. Typing is blocked manually
          // instead (keydown/paste/drop all prevented, onChange is a no-op
          // since the value can now only ever change via the map picker),
          // which keeps `required` fully working the same native way every
          // other field on this form already relies on.
          onChange={() => {}}
          onKeyDown={(e) => e.preventDefault()}
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onFocus={(e) => {
            e.target.blur();
            setShowMapPicker(true);
          }}
          onClick={() => setShowMapPicker(true)}
          placeholder="Tap “Map” to choose a location"
          required={required}
          className={`flex-1 cursor-pointer rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 caret-transparent placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
              : "border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20"
          }`}
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

      {error && <p className="text-xs text-red-600">{error}</p>}

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
  const [dropoffDateError, setDropoffDateError] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [truckSelectionError, setTruckSelectionError] = useState("");
  const [submitError, setSubmitError] = useState("");
  // Per-field highlighting for the two failure modes surfaced at submit time
  // -- "typed but never selected from the map/suggestions" (see
  // MAP_SELECTION_REQUIRED_MESSAGE) and "resolved outside the Luzon service
  // area" -- so the customer can see exactly which field caused the
  // rejection instead of only the generic banner near Submit.
  const [pickupLocationError, setPickupLocationError] = useState("");
  const [dropoffLocationError, setDropoffLocationError] = useState("");
  const [stopLocationErrors, setStopLocationErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
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
  // dropoffTimeEnd is only rendered/editable in SAME_DAY mode, but its state
  // doesn't reset itself just because the field got hidden -- a customer who
  // fills a same-day window, then picks a later Drop Off Date (auto-
  // switching to TWO_DAY), would be left with a stale dropoffTimeEnd sitting
  // in state. Matters for persistence: dropoff_time_end's `|| null` fallback
  // in newRequest only catches an EMPTY string, not a stale non-empty one,
  // so without this it could silently write a meaningless leftover value to
  // the DB. Clearing it the moment mode flips to TWO_DAY prevents that.
  useEffect(() => {
    if (deliveryMode === "TWO_DAY") {
      Promise.resolve().then(() => {
        setFormData((prev) =>
          prev.dropoffTimeEnd ? { ...prev, dropoffTimeEnd: "" } : prev,
        );
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
      const waypointAddresses = [
        formData.pickupLocation,
        formData.dropoffLocation,
        ...formData.stops
          .filter((stop) => stop.location.trim())
          .map((stop) => stop.location),
      ];
      estimateLegDurations(waypoints, waypointAddresses)
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
        .catch((err) => {
          if (cancelled) return;
          // Logged (not shown) so a real cause -- e.g. ZERO_RESULTS
          // surviving the address-text retry -- is diagnosable without
          // exposing raw Directions API status text to the customer.
          console.warn("Schedule preview failed:", err?.message || err);
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
        .catch((err) => {
          if (cancelled) return;
          console.warn("Route preview failed:", err?.message || err);
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
    // LocationInput passes lat/lng alongside the address text when the
    // value came from a search suggestion or the map picker (both already
    // resolve real coordinates via Photon); a manually-typed address has
    // none, so clear any stale coordinate from a previously picked value.
    if (name === "pickupLocation" || name === "dropoffLocation") {
      const prefix = name === "pickupLocation" ? "pickup" : "dropoff";
      next[`${prefix}Lat`] = lat ?? null;
      next[`${prefix}Lng`] = lng ?? null;
      if (name === "pickupLocation") setPickupLocationError("");
      else setDropoffLocationError("");
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

    if (["pickupDate", "dropoffDate"].includes(name)) {
      setDropoffDateError(getDropoffDateError(next));
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
  // reference-only (no per-stop status), capped at MAX_STOPS (a technical
  // waypoints-request ceiling, see the constant's own comment above) --
  // the real per-delivery bound is the 13-hour cap enforced by
  // simulateSchedule() at both live preview and submit time, independent of
  // how many stops there are.
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
    // Re-key remaining errors down by one so they still line up with the
    // shifted stop indexes after the removal.
    setStopLocationErrors((prev) => {
      const next = {};
      Object.entries(prev).forEach(([key, message]) => {
        const i = Number(key);
        if (i < index) next[i] = message;
        else if (i > index) next[i - 1] = message;
      });
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
    setStopLocationErrors((prev) => {
      if (!prev[index]) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleStopTimeChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, i) =>
        i === index ? { ...stop, [field]: value } : stop,
      ),
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

    const dropoffDateErrorMessage = getDropoffDateError(formData);
    if (dropoffDateErrorMessage) {
      setDropoffDateError(dropoffDateErrorMessage);
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

    // A customer who typed the address and submitted without ever clicking a
    // suggestion or using the map picker never had lat/lng captured (see
    // LocationInput's onChange handlers, which only pass lat/lng along from
    // those two interactions, never from a raw keystroke). Explicit user
    // decision, 2026-09-17: don't silently forward-geocode typed text
    // (the previous behavior) -- require an actual map/suggestion pick and
    // point the customer back at the specific field(s) that need it.
    const pickupNeedsSelection = formData.pickupLat == null;
    const dropoffNeedsSelection = formData.dropoffLat == null;
    const stopIndexesNeedingSelection = formData.stops
      .map((stop, i) => (stop.location.trim() && stop.lat == null ? i : -1))
      .filter((i) => i !== -1);

    if (
      pickupNeedsSelection ||
      dropoffNeedsSelection ||
      stopIndexesNeedingSelection.length > 0
    ) {
      setPickupLocationError(
        pickupNeedsSelection ? MAP_SELECTION_REQUIRED_MESSAGE : "",
      );
      setDropoffLocationError(
        dropoffNeedsSelection ? MAP_SELECTION_REQUIRED_MESSAGE : "",
      );
      setStopLocationErrors(
        Object.fromEntries(
          stopIndexesNeedingSelection.map((i) => [
            i,
            MAP_SELECTION_REQUIRED_MESSAGE,
          ]),
        ),
      );
      setSubmitError(
        "One or more locations were only typed, not selected — please fix the field(s) highlighted in red above.",
      );
      return;
    }

    setSubmitting(true);

    const pickupLat = formData.pickupLat;
    const pickupLng = formData.pickupLng;
    const dropoffLat = formData.dropoffLat;
    const dropoffLng = formData.dropoffLng;

    // Last line of defense: an actual map/suggestion pick should already be
    // inside Luzon (both filter/snap to the service area at selection time),
    // but never save an out-of-service-area location if one somehow slips
    // through -- and highlight exactly which field it was, per explicit user
    // request, instead of only the generic banner near Submit.
    const pickupOutsideArea =
      pickupLat != null && !isInsideLuzon(pickupLat, pickupLng);
    const dropoffOutsideArea =
      dropoffLat != null && !isInsideLuzon(dropoffLat, dropoffLng);
    if (pickupOutsideArea || dropoffOutsideArea) {
      setSubmitting(false);
      setPickupLocationError(pickupOutsideArea ? SERVICE_AREA_MESSAGE : "");
      setDropoffLocationError(dropoffOutsideArea ? SERVICE_AREA_MESSAGE : "");
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
    // Warehouse -> Pickup -> Drop-off -> Stops route, generated up front so
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

      // Every active stop already has a live-captured lat/lng -- guaranteed
      // by the map/suggestion-selection gate above, which rejects submission
      // for any stop still missing one.
      const resolvedStopCoords = activeStops.map((stop) => ({
        lat: stop.lat,
        lng: stop.lng,
      }));
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
        legTravelSeconds = await estimateLegDurations(
          [
            { lat: pickupLat, lng: pickupLng },
            { lat: dropoffLat, lng: dropoffLng },
            ...resolvedStopCoords,
          ],
          [
            formData.pickupLocation,
            formData.dropoffLocation,
            ...activeStops.map((stop) => stop.location),
          ],
        );
      } catch (err) {
        console.warn("Schedule calculation failed:", err?.message || err);
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
                      className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                      className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
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
                  error={pickupLocationError}
                />
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-[3]">
                    <LocationInput
                      id="dropoffLocation"
                      label="Drop-off 1"
                      value={formData.dropoffLocation}
                      lat={formData.dropoffLat}
                      lng={formData.dropoffLng}
                      onChange={handleChange}
                      required
                      error={dropoffLocationError}
                    />
                  </div>
                  <div className="min-w-[220px] flex-[2]">
                    {deliveryMode === "TWO_DAY" ? (
                      <div className="space-y-2">
                        <label
                          htmlFor="dropoffTime"
                          className="text-sm font-medium text-slate-700"
                        >
                          Day 2 Start Time
                        </label>
                        <input
                          type="time"
                          id="dropoffTime"
                          name="dropoffTime"
                          aria-label="Day 2 Start Time"
                          value={formData.dropoffTime}
                          onChange={handleChange}
                          required
                          className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          <label
                            htmlFor="dropoffTime"
                            className="text-sm font-medium text-slate-700"
                          >
                            From:
                          </label>
                          <input
                            type="time"
                            id="dropoffTime"
                            name="dropoffTime"
                            aria-label="Drop-off Window Start"
                            value={formData.dropoffTime}
                            onChange={handleChange}
                            required
                            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <label
                            htmlFor="dropoffTimeEnd"
                            className="text-sm font-medium text-slate-700"
                          >
                            To:
                          </label>
                          <input
                            type="time"
                            id="dropoffTimeEnd"
                            name="dropoffTimeEnd"
                            aria-label="Drop-off Window End"
                            value={formData.dropoffTimeEnd}
                            onChange={handleChange}
                            required
                            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>
                    )}
                  </div>
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
                    <div
                      key={index}
                      className="relative rounded-xl border border-slate-200 p-4"
                    >
                      <button
                        type="button"
                        onClick={() => removeStop(index)}
                        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Remove drop-off"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <div className="flex flex-wrap items-end gap-3 pr-8">
                        <div className="min-w-[220px] flex-[3]">
                          <LocationInput
                            id={`stop-${index}`}
                            label={`Drop-off ${index + 2}`}
                            value={stop.location}
                            lat={stop.lat}
                            lng={stop.lng}
                            onChange={(e) => handleStopChange(index, e)}
                            error={stopLocationErrors[index]}
                          />
                        </div>
                        <div className="min-w-[220px] flex-[2]">
                          <div className="flex items-end gap-2">
                            <div className="min-w-0 flex-1 space-y-2">
                              <label
                                htmlFor={`stop-time-${index}`}
                                className="text-sm font-medium text-slate-700"
                              >
                                From:
                              </label>
                              <input
                                type="time"
                                id={`stop-time-${index}`}
                                aria-label={`Drop-off ${index + 2} Window Start`}
                                value={stop.dropoffTime}
                                onChange={(e) =>
                                  handleStopTimeChange(
                                    index,
                                    "dropoffTime",
                                    e.target.value,
                                  )
                                }
                                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <label
                                htmlFor={`stop-time-end-${index}`}
                                className="text-sm font-medium text-slate-700"
                              >
                                To:
                              </label>
                              <input
                                type="time"
                                id={`stop-time-end-${index}`}
                                aria-label={`Drop-off ${index + 2} Window End`}
                                value={stop.dropoffTimeEnd}
                                onChange={(e) =>
                                  handleStopTimeChange(
                                    index,
                                    "dropoffTimeEnd",
                                    e.target.value,
                                  )
                                }
                                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
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
                  stops={formData.stops.filter((stop) => stop.location.trim())}
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
                    step="1"
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
                                    {reason}
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
                Enter your preferred budget range (minimum ₱
                {MIN_BUDGET_AMOUNT.toLocaleString()}). The final quotation
                will be discussed with the supervisor.
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
                    min={MIN_BUDGET_AMOUNT}
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
                    min={MIN_BUDGET_AMOUNT}
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
