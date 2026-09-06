import { useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  Marker as GoogleMapMarker,
  Polyline as GoogleMapPolyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import { RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import { useResolvedStopCoords } from "../lib/forwardGeocode.js";
import { computeSuggestedRoute } from "../lib/suggestedRoute.js";

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
const LEG_COLORS = ["#DC2626", "#2563EB", "#059669", "#7C3AED", "#EA580C", "#DB2777"];

// Whole-trip route review/edit map, shared between the Supervisor's
// PENDING_REQUEST review (editable={true}) and the Customer's quotation
// review (editable={false}) -- 2026-09-06, Supervisor Route Review &
// Approval feature. Google Maps JS API to match PlannedRouteMap
// (DriverDeliveries.jsx), reusing the app's one shared loader-options
// singleton. Renders the same [{from, to, path}] leg shape as
// delivery_requests.suggested_route.
//
// Callers should give this component a stable `key` per delivery request
// (e.g. key={request.id}) so switching between requests remounts it with
// fresh local state, rather than trying to sync draft edits via effects.
export default function EditableRouteMap({
  pickupAddress,
  pickupCoords,
  dropoffAddress,
  dropoffCoords,
  stops,
  suggestedRoute,
  editable,
  approvedAt,
  onApprove,
}) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const mapRef = useRef(null);
  const [draftLegs, setDraftLegs] = useState(suggestedRoute || null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const stopLocations = (stops || []).map((s) => s.location);
  const { coordsByLocation: geocodedStopCoords, isReady: stopCoordsReady } =
    useResolvedStopCoords(stopLocations);

  // Current best-known coordinate for every waypoint, used as the starting
  // point for the next (re)computation -- a drag only changes the one
  // waypoint's entry here, keeping every other waypoint at its last known
  // position, same as computeSuggestedRoute's own per-candidate `coords`.
  const [waypointCoords, setWaypointCoords] = useState(() => ({
    // legEndpoint/stopLegEndpoint return a raw [lat, lng] path point (the
    // DB's stored shape) -- normalized to {lat, lng} here since every other
    // coordinate in this component (props, drag events, computeSuggestedRoute
    // itself) uses that object shape. Passing an unconverted array through
    // to DirectionsService as a `destination`/waypoint `location` is exactly
    // what threw "in property lat: not a number; and unknown property 0"
    // (real bug, found live 2026-09-06 while dragging the dropoff pin).
    pickup: pickupCoords || toLatLng(legEndpoint(suggestedRoute, "pickup")),
    dropoff: dropoffCoords || toLatLng(legEndpoint(suggestedRoute, "dropoff")),
    stops: (stops || []).map((s, i) => ({
      location: s.location,
      coords: toLatLng(stopLegEndpoint(suggestedRoute, i)) || null,
    })),
  }));

  const runCompute = async (coords) => {
    setIsComputing(true);
    setError(false);
    try {
      const { legs } = await computeSuggestedRoute({
        pickupCoords: coords.pickup,
        pickupAddress,
        dropoffCoords: coords.dropoff,
        dropoffAddress,
        stops: coords.stops.map((s) => ({
          location: s.location,
          coords: s.coords || geocodedStopCoords[s.location] || null,
        })),
      });
      setDraftLegs(legs);
    } catch {
      setError(true);
    } finally {
      setIsComputing(false);
    }
  };

  const handleGenerate = () => runCompute(waypointCoords);

  const handleRegenerate = () => {
    // Discards any drag edits, going back to the original addresses --
    // coords intentionally reset to null so DirectionsService re-geocodes
    // pickup/dropoff/stops fresh, rather than reusing a dragged position.
    const reset = {
      pickup: pickupCoords || null,
      dropoff: dropoffCoords || null,
      stops: (stops || []).map((s) => ({ location: s.location, coords: null })),
    };
    setWaypointCoords(reset);
    runCompute(reset);
  };

  const handleDragEnd = (kind, index, e) => {
    const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setWaypointCoords((prev) => {
      const next =
        kind === "pickup"
          ? { ...prev, pickup: coords }
          : kind === "dropoff"
            ? { ...prev, dropoff: coords }
            : {
                ...prev,
                stops: prev.stops.map((s, i) => (i === index ? { ...s, coords } : s)),
              };
      runCompute(next);
      return next;
    });
  };

  const handleApprove = async () => {
    if (!draftLegs) return;
    setIsApproving(true);
    try {
      await onApprove?.(draftLegs);
    } finally {
      setIsApproving(false);
    }
  };

  const warehousePos = draftLegs?.[0]?.path?.[0];
  const pickupPos = legEndpoint(draftLegs, "pickup") || waypointCoords.pickup;
  const dropoffPos = legEndpoint(draftLegs, "dropoff") || waypointCoords.dropoff;
  const stopPositions = (stops || []).map(
    (_, i) => stopLegEndpoint(draftLegs, i) || waypointCoords.stops[i]?.coords || null,
  );

  const bounds = useMemo(() => {
    if (!isLoaded || !window.google || !draftLegs?.length) return null;
    const b = new window.google.maps.LatLngBounds();
    draftLegs.forEach((leg) => leg.path.forEach(([lat, lng]) => b.extend({ lat, lng })));
    return b;
  }, [isLoaded, draftLegs]);

  // The map mounts once (editable mode starts with no route at all, so
  // `onLoad` alone can't fit to anything yet) -- re-fit whenever `bounds`
  // later becomes available or changes, e.g. after Generate/Regenerate/a
  // drag-triggered recompute. Without this, the camera stays parked on
  // Google's default view and the map reads as a blank/empty box even
  // though the route did compute successfully.
  useEffect(() => {
    if (mapRef.current && bounds) mapRef.current.fitBounds(bounds, 16);
  }, [bounds]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-bold text-slate-900">
          {editable ? "Planned Route (drag a pin to adjust)" : "Planned Route"}
        </h3>
        {approvedAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Route Approved
          </span>
        ) : null}
      </div>
      <div className="h-56 w-full sm:h-64">
        {!isLoaded || !stopCoordsReady ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Loading map…
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            onLoad={(map) => {
              mapRef.current = map;
              if (bounds) map.fitBounds(bounds, 16);
            }}
            options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" }}
          >
            {(draftLegs || []).map((leg, i) => (
              <GoogleMapPolyline
                key={i}
                path={leg.path.map(([lat, lng]) => ({ lat, lng }))}
                options={{
                  strokeColor: LEG_COLORS[i % LEG_COLORS.length],
                  strokeOpacity: 0.9,
                  strokeWeight: 5,
                }}
              />
            ))}
            {warehousePos && (
              <GoogleMapMarker
                position={{ lat: warehousePos[0], lng: warehousePos[1] }}
                label={{ text: "W", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                icon={circleIcon("#475569")}
              />
            )}
            {pickupPos && (
              <GoogleMapMarker
                position={toLatLng(pickupPos)}
                label={{ text: "P", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                icon={circleIcon("#0284c7")}
                draggable={editable}
                onDragEnd={(e) => handleDragEnd("pickup", null, e)}
              />
            )}
            {dropoffPos && (
              <GoogleMapMarker
                position={toLatLng(dropoffPos)}
                label={{ text: "D", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                icon={circleIcon("#059669")}
                draggable={editable}
                onDragEnd={(e) => handleDragEnd("dropoff", null, e)}
              />
            )}
            {stopPositions.map(
              (pos, i) =>
                pos && (
                  <GoogleMapMarker
                    key={i}
                    position={toLatLng(pos)}
                    label={{
                      text: String(i + 1),
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: "700",
                    }}
                    icon={circleIcon("#d97706")}
                    draggable={editable}
                    onDragEnd={(e) => handleDragEnd("stop", i, e)}
                  />
                ),
            )}
          </GoogleMap>
        )}
      </div>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2">
          <div className="flex items-center gap-2">
            {!draftLegs ? (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isComputing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {isComputing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Generate Route
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isComputing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {isComputing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Regenerate Route
              </button>
            )}
            {error && (
              <span className="text-[11px] text-rose-600">
                Couldn't compute a route -- try again.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleApprove}
            disabled={!draftLegs || isComputing || isApproving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isApproving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Approve Route
          </button>
        </div>
      )}
    </section>
  );
}

function toLatLng(pos) {
  return Array.isArray(pos) ? { lat: pos[0], lng: pos[1] } : pos;
}

// Marker positions are derived from a route's own real (geocoded) path
// points, same technique PlannedRouteMap (DriverDeliveries.jsx) already
// uses -- works regardless of whether pickup/dropoff/stops were coordinate
// pairs or real addresses to begin with.
function legEndpoint(legs, toKey) {
  const leg = (legs || []).find((l) => l.to === toKey);
  return leg ? leg.path[leg.path.length - 1] : null;
}

function stopLegEndpoint(legs, stopIndex) {
  const stopLegs = (legs || []).filter((l) => l.to === "stop");
  const leg = stopLegs[stopIndex];
  return leg ? leg.path[leg.path.length - 1] : null;
}

function circleIcon(fillColor) {
  if (!window.google) return undefined;
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor,
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
    scale: 10,
  };
}
