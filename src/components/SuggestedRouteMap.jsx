import { useEffect, useMemo, useRef } from "react";
import {
  GoogleMap,
  Marker as GoogleMapMarker,
  Polyline as GoogleMapPolyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import { useResolvedStopCoords } from "../lib/forwardGeocode.js";
import { matchStopLegsToIndexes } from "../lib/suggestedRoute.js";

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
// Index 0 was red until 2026-09-09 -- changed to teal per explicit user
// request (red reserved for real alerts, not routine navigation), kept in
// sync with the same palette in DriverDeliveries.jsx/HelperDeliveries.jsx/
// SupDeliveries.jsx.
const LEG_COLORS = ["#0D9488", "#2563EB", "#059669", "#7C3AED", "#EA580C", "#DB2777"];

// Whole-trip route viewer, read-only -- shared between the Supervisor's
// PENDING_REQUEST review and the Customer's quotation review. Replaces
// EditableRouteMap.jsx (2026-09-06's Supervisor Route Review & Approval
// feature, removed 2026-09-08 per explicit decision: the Supervisor no
// longer drags pins or approves a route, only views what the customer's
// booking form generated). Renders whatever suggested_route already holds
// as-is -- no recomputation, no drag handlers, no Approve button.
//
// Callers should give this a stable `key` per delivery request (e.g.
// key={request.id}) so switching between requests remounts it fresh.
export default function SuggestedRouteMap({
  suggestedRoute,
  stops,
  title = "Planned Route",
  // Optional [lat, lng] pair -- when set, the map pans/zooms to this point
  // instead of fitting the whole route in view (e.g. Supervisor's Pickup/
  // Drop-off toggle buttons focusing on one leg's endpoint). Kept in sync
  // via the effect below so switching points re-focuses an already-mounted
  // map rather than remounting it.
  focusPos,
  focusZoom = 17,
}) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const mapRef = useRef(null);
  const legs = useMemo(() => suggestedRoute || [], [suggestedRoute]);

  const warehousePos = legs[0]?.path?.[0];
  const pickupPos = legEndpoint(legs, "pickup");
  const dropoffPos = legEndpoint(legs, "dropoff");

  // Additional dropoffs (stops) never get a lat/lng persisted at booking
  // time -- resolved here via Photon, same fallback every other portal's
  // map uses for a real street-address stop.
  const stopLocations = (stops || []).map((s) => s.location);
  const { coordsByLocation: resolvedStopCoords } =
    useResolvedStopCoords(stopLocations);

  // "Drop-off 1" (per explicit user decision) is literally the first
  // drop-off, not a conceptually separate "main" one -- so every drop-off
  // (main + stops) gets ONE consistent numbering, matching the Schedule
  // panel's "Drop-off 1/2/3..." labels (booking order), not the driving
  // visit order Dynamic Nearest-Dropoff Ordering actually routes in.
  const stopLegByIndex = useMemo(
    () => matchStopLegsToIndexes(legs, stops, resolvedStopCoords),
    [legs, stops, resolvedStopCoords],
  );

  const stopMarkers = stopLegByIndex
    .map((leg, i) =>
      leg
        ? {
            pos: leg.path[leg.path.length - 1],
            // +2: index 0 is "Drop-off 2" (index 0 in stops[] follows the
            // main Drop-off, which is "Drop-off 1").
            number: i + 2,
          }
        : null,
    )
    .filter(Boolean);

  const bounds = useMemo(() => {
    if (!isLoaded || !window.google || !legs.length) return null;
    const b = new window.google.maps.LatLngBounds();
    legs.forEach((leg) => leg.path.forEach(([lat, lng]) => b.extend({ lat, lng })));
    return b;
  }, [isLoaded, legs]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (focusPos) {
      mapRef.current.panTo({ lat: focusPos[0], lng: focusPos[1] });
      mapRef.current.setZoom(focusZoom);
    } else if (bounds) {
      mapRef.current.fitBounds(bounds, 16);
    }
  }, [bounds, focusPos, focusZoom]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-bold text-slate-900">{title}</h3>
      </div>
      <div className="h-56 w-full sm:h-64">
        {!isLoaded ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Loading map…
          </div>
        ) : !legs.length ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-400">
            No route available yet.
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            onLoad={(map) => {
              mapRef.current = map;
              if (focusPos) {
                map.panTo({ lat: focusPos[0], lng: focusPos[1] });
                map.setZoom(focusZoom);
              } else if (bounds) {
                map.fitBounds(bounds, 16);
              }
            }}
            options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" }}
          >
            {legs.map((leg, i) => (
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
                position={{ lat: pickupPos[0], lng: pickupPos[1] }}
                label={{ text: "P", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                icon={circleIcon("#0284c7")}
              />
            )}
            {dropoffPos && (
              <GoogleMapMarker
                position={{ lat: dropoffPos[0], lng: dropoffPos[1] }}
                label={{ text: "1", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                icon={circleIcon("#059669")}
              />
            )}
            {stopMarkers.map(
              ({ pos, number }, i) =>
                pos && (
                  <GoogleMapMarker
                    key={i}
                    position={{ lat: pos[0], lng: pos[1] }}
                    label={{
                      text: String(number),
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: "700",
                    }}
                    icon={circleIcon("#d97706")}
                  />
                ),
            )}
          </GoogleMap>
        )}
      </div>
    </section>
  );
}

// Marker positions are derived from a route's own real (geocoded) path
// points, same technique PlannedRouteMap (DriverDeliveries.jsx) already
// uses -- works regardless of whether pickup/dropoff/stops were coordinate
// pairs or real addresses to begin with.
function legEndpoint(legs, toKey) {
  const leg = (legs || []).find((l) => l.to === toKey);
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
