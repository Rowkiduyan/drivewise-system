// Shared route-computation logic, extracted 2026-09-06 (Supervisor Route
// Review & Approval feature) from what used to live only inline inside
// DriverDeliveries.jsx's PlannedRouteMap. Needed in two places:
// CustomerRequestDelivery.jsx (route generated at request-creation time)
// and DriverDeliveries.jsx's PlannedRouteMap (fallback recompute for a
// request whose route never landed at creation time -- see suggestedRoute's
// presence check there). The Supervisor's own viewing/editing use of this
// (SupDeliveries.jsx) was removed 2026-09-08 -- it now only views the
// already-computed route via SuggestedRouteMap, read-only, no recompute.
// Extracted rather than duplicated per-portal (the way RouteDeviationMap
// is) because this is a nontrivial multi-step DirectionsService request
// builder with a nearest-neighbor ordering algorithm, not a simple
// read-only renderer -- duplicating it would multiply the bug surface for
// a future stop-ordering fix.

import { supabase } from "./supabaseClient.js";

// Fixed depot/warehouse address every Trip starts from, per user
// instruction -- every whole-trip route leads with this Warehouse -> Pickup
// leg, matching the real GPS trace a Trip actually produces. Kept as a plain
// address string (not lat/lng) -- passed straight to DirectionsService.
export const WAREHOUSE_ADDRESS =
  "140 M. Suarez Avenue, Brgy. San Miguel, Pasig, Metro Manila";

// WAREHOUSE_ADDRESS's own real geocoded position (captured from a live
// DirectionsService response). Anywhere that needs actual coordinates (not
// a DirectionsService-geocodable string) should use this instead of a
// second magic-number literal.
export const WAREHOUSE_COORDS = { lat: 14.57147, lng: 121.08762 };

// Flattens one DirectionsResult leg's per-step paths into [[lat,lng],...] --
// denser than `overview_path`. Shared by computeSuggestedRoute (per-leg,
// below) and LiveNavigationMap's reroute logging (DriverDeliveries.jsx,
// concatenated across all legs of a fresh reroute) -- both need the exact
// same Google Maps JS API step-path unwrapping.
export function flattenLegPath(leg) {
  return leg.steps.flatMap((step) => step.path.map((p) => [p.lat(), p.lng()]));
}

// Plain-JS haversine, no google.maps dependency -- mirrors SupDashboard.jsx's
// own distanceMeters helper (kept as a separate small copy there, same
// established pattern this codebase already uses for this tiny pure
// function), reused here so ordering/distance math works regardless of
// whether the Maps JS API has finished loading yet.
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Rule-based route-deviation classifier (11_ROUTE_COMPARISON.md Part D),
// shared by SupDeliveries.jsx and DriverDeliveries.jsx -- both build an
// identical `routeDeviation` shape from the same suggested_route/gps_logs
// inputs, so this lives here rather than being duplicated per-portal, same
// reasoning as computeSuggestedRoute above. Deliberately not an LLM call:
// the inputs are pure geometry (planned polyline vs. actual GPS trace), and
// a review report needs a reproducible, explainable verdict, not a
// paraphrased one that can vary between runs.

// Perpendicular distance from `point` to the segment [segStart, segEnd],
// all as [lat, lng] pairs. Projects into a local equirectangular meters
// plane (flat-earth approximation centered on segStart) rather than true
// great-circle projection -- accurate enough at city-block segment lengths,
// consistent with distanceMeters' own haversine approximation.
export function pointToSegmentMeters(point, segStart, segEnd) {
  const latRef = segStart[0];
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((latRef * Math.PI) / 180);
  const toXY = ([lat, lon]) => [
    (lon - segStart[1]) * mPerDegLon,
    (lat - segStart[0]) * mPerDegLat,
  ];
  const p = toXY(point);
  const b = toXY(segEnd);
  const lenSq = b[0] * b[0] + b[1] * b[1];
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (p[0] * b[0] + p[1] * b[1]) / lenSq)) : 0;
  const dx = p[0] - t * b[0];
  const dy = p[1] - t * b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Consecutive points within this distance of the run's first point still
// count as "stayed in the same spot" (GPS jitter, idling at a light).
const DWELL_RADIUS_METERS = 50;
// A point must be at least this far off the planned polyline to count as
// "off-route" at all -- normal adjacent-street lane/route choice in a dense
// grid is usually under this.
const DWELL_OFFROUTE_THRESHOLD_METERS = 200;
// A real stop (lunch, personal errand), not just a red light.
const DWELL_MIN_MINUTES = 5;
// Separates "took a nearby alternate street" from "went somewhere
// genuinely different," when the actual distance is longer than planned.
const REASONABLE_MAX_OFFSET_METERS = 300;

// Minimum distance (meters) from `pt` ([lat,lng]) to any segment of
// `polyline` ([[lat,lng],...]) -- single-point polylines fall back to a
// direct point-to-point distance, same special case classifyRouteDeviation
// always had for `plannedPoints`.
function minOffsetToPolyline(pt, polyline) {
  if (!polyline || polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return distanceMeters(pt[0], pt[1], polyline[0][0], polyline[0][1]);
  }
  let min = Infinity;
  for (let i = 1; i < polyline.length; i += 1) {
    const d = pointToSegmentMeters(pt, polyline[i - 1], polyline[i]);
    if (d < min) min = d;
  }
  return min;
}

// `plannedPoints`: flattened [[lat,lng],...] planned polyline (all legs
// concatenated). `actualPoints`: chronological [{latitude,longitude,
// timestamp}] GPS trace. `plannedMeters`/`totalMeters`: already-computed
// trip distances (meters). `rerouteSegments`: optional array of
// `{ path: [[lat,lng],...], occurredAt }` -- polylines the app itself
// auto-computed and sent the driver on mid-trip (LiveNavigationMap's
// reroute-on-deviation). A point close to one of these is just as
// legitimately "on plan" as one close to the original `plannedPoints`, so
// it isn't held against the driver as unexplained deviation -- but only for
// points recorded at or after that reroute's own `occurredAt`: a reroute
// can't retroactively excuse an excursion the driver made before the app
// had even computed that path yet (a real, unrelated deviation that happens
// to pass near a *later* reroute's route shouldn't get laundered as
// legitimate just because the two polylines are geometrically close).
// Returns null when there's nothing to classify.
export function classifyRouteDeviation({
  plannedPoints,
  actualPoints,
  plannedMeters,
  totalMeters,
  rerouteSegments = [],
}) {
  if (!plannedPoints.length || !actualPoints.length) return null;

  let maxOffset = 0;
  let maxOffsetPoint = null;
  const offsets = actualPoints.map((pt) => {
    const ptTime = new Date(pt.timestamp).getTime();
    const applicablePolylines = [
      plannedPoints,
      ...rerouteSegments
        .filter((r) => !r.occurredAt || new Date(r.occurredAt).getTime() <= ptTime)
        .map((r) => r.path),
    ];
    let min = Infinity;
    for (const polyline of applicablePolylines) {
      const d = minOffsetToPolyline([pt.latitude, pt.longitude], polyline);
      if (d < min) min = d;
    }
    if (min > maxOffset) {
      maxOffset = min;
      maxOffsetPoint = pt;
    }
    return min;
  });

  // Off-route dwell detection: a run of consecutive points that are all
  // off-route AND stay near each other AND span enough time to be a real
  // stop, not a red light.
  const dwells = [];
  const closeRun = (startIdx, endIdx) => {
    if (endIdx <= startIdx) return;
    const startPt = actualPoints[startIdx];
    const endPt = actualPoints[endIdx];
    const durationMinutes =
      (new Date(endPt.timestamp).getTime() -
        new Date(startPt.timestamp).getTime()) /
      60000;
    if (durationMinutes < DWELL_MIN_MINUTES) return;
    let sumLat = 0;
    let sumLng = 0;
    let n = 0;
    for (let j = startIdx; j <= endIdx; j += 1) {
      sumLat += actualPoints[j].latitude;
      sumLng += actualPoints[j].longitude;
      n += 1;
    }
    dwells.push({
      lat: sumLat / n,
      lng: sumLng / n,
      startedAt: startPt.timestamp,
      resumedAt: endPt.timestamp,
      durationMinutes: Math.round(durationMinutes),
    });
  };

  let runStart = null;
  for (let i = 0; i < actualPoints.length; i += 1) {
    const offRoute = offsets[i] > DWELL_OFFROUTE_THRESHOLD_METERS;
    if (offRoute && runStart === null) {
      runStart = i;
    } else if (offRoute && runStart !== null) {
      const first = actualPoints[runStart];
      const cur = actualPoints[i];
      const strayed =
        distanceMeters(
          first.latitude,
          first.longitude,
          cur.latitude,
          cur.longitude,
        ) > DWELL_RADIUS_METERS;
      if (strayed) {
        closeRun(runStart, i - 1);
        runStart = i;
      }
    } else if (!offRoute && runStart !== null) {
      closeRun(runStart, i - 1);
      runStart = null;
    }
  }
  if (runStart !== null) closeRun(runStart, actualPoints.length - 1);

  let verdict;
  let tone;
  if (totalMeters <= plannedMeters) {
    verdict = "Beneficial";
    tone = "green";
  } else if (maxOffset < REASONABLE_MAX_OFFSET_METERS && dwells.length === 0) {
    verdict = "Reasonable";
    tone = "amber";
  } else {
    verdict = "Potentially Problematic";
    tone = "red";
  }

  return {
    verdict,
    tone,
    maxOffsetMeters: maxOffset,
    maxOffsetPoint: maxOffsetPoint
      ? {
          lat: maxOffsetPoint.latitude,
          lng: maxOffsetPoint.longitude,
          timestamp: maxOffsetPoint.timestamp,
        }
      : null,
    dwells,
  };
}

// Fetches every auto-reroute LiveNavigationMap logged for a delivery
// (DriverDeliveries.jsx's log-reroute), shaped for classifyRouteDeviation's
// `rerouteSegments` (via `.map((r) => r.new_path)`) and for display
// (`occurred_at`/`reason`). Shared by all three portals that build a
// completed-trip report from real data (DriverDeliveries.jsx,
// HelperDeliveries.jsx via its shared buildRealDriverTripReport/
// CompletedDeliveryReport, and SupDeliveries.jsx) so the query -- and any
// future fix to it -- lives in one place rather than three copies that could
// silently drift and produce a different verdict per portal for the same
// trip.
export async function fetchRerouteEvents(deliveryRequestId) {
  const { data } = await supabase
    .from("reroute_events")
    .select("id, occurred_at, reason, new_path")
    .eq("delivery_request_id", deliveryRequestId)
    .order("occurred_at", { ascending: true });
  return data || [];
}

// Greedy nearest-neighbor ordering for dropoff-type candidates (02B_MULTI_
// STOP_DELIVERIES.md's "Dynamic Nearest-Dropoff Ordering"). Each candidate is
// `{ location, coords }`; `coords` may be null for a candidate whose address
// doesn't resolve to a coordinate pair -- such a candidate can't be ranked by
// distance, so it's kept in its original relative position among the other
// un-rankable candidates and only ever picked once no coordinate-bearing
// candidate remains closer. Chains from each picked candidate's own coords
// for the next pick (simulating "having arrived there"), since only the very
// first pick is ever actually driven to before the caller re-derives this
// list from a real position again.
export function nearestDropoffOrder(referencePos, candidates) {
  const remaining = [...candidates];
  const ordered = [];
  let fromPos = referencePos;
  while (remaining.length > 0) {
    let pickIndex = 0;
    let pickDistance = Infinity;
    remaining.forEach((candidate, i) => {
      if (!candidate.coords || !fromPos) return;
      const d = distanceMeters(
        fromPos.lat,
        fromPos.lng,
        candidate.coords.lat,
        candidate.coords.lng,
      );
      if (d < pickDistance) {
        pickDistance = d;
        pickIndex = i;
      }
    });
    const [next] = remaining.splice(pickIndex, 1);
    ordered.push(next);
    if (next.coords) fromPos = next.coords;
  }
  return ordered;
}

// Computes the full Warehouse -> Pickup -> Dropoff/Stops (nearest-order)
// route via one DirectionsService request, resolving to the same
// `[{from, to, path}]` shape persisted as delivery_requests.suggested_route
// (see DATABASE.md). Requires window.google.maps.DirectionsService to
// already be loaded (via GOOGLE_MAPS_LOADER_OPTIONS) -- callers are
// responsible for that. `stops` is `[{ location, coords }]`, `coords`
// nullable per candidate (see nearestDropoffOrder above).
export function computeSuggestedRoute({
  pickupCoords,
  pickupAddress,
  dropoffCoords,
  dropoffAddress,
  stops,
}) {
  return new Promise((resolve, reject) => {
    if (!window.google?.maps || !pickupAddress || !dropoffAddress) {
      reject(new Error("Missing pickup/dropoff address or Maps API"));
      return;
    }

    const orderedStops = nearestDropoffOrder(pickupCoords, [
      { location: dropoffAddress, coords: dropoffCoords || null, key: "dropoff" },
      ...(stops || []).map((s) => ({
        location: s.location,
        coords: s.coords || null,
        key: "stop",
      })),
    ]);
    if (orderedStops.length === 0) {
      reject(new Error("No dropoff/stop candidates"));
      return;
    }

    const destination = orderedStops[orderedStops.length - 1];
    // Pickup itself is a waypoint (Warehouse is the origin), followed by
    // every ordered dropoff/stop except the last, which becomes the route's
    // own destination.
    const waypointStops = [
      { location: pickupAddress, coords: pickupCoords || null, key: "pickup" },
      ...orderedStops.slice(0, -1),
    ];

    new window.google.maps.DirectionsService().route(
      {
        origin: WAREHOUSE_ADDRESS,
        destination: destination.coords || destination.location,
        waypoints: waypointStops.map((s) => ({
          location: s.coords || s.location,
          stopover: true,
        })),
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: "bestguess",
        },
      },
      (result, status) => {
        if (status !== "OK" || !result) {
          reject(new Error(`DirectionsService failed: ${status}`));
          return;
        }
        const fromKeys = ["warehouse", ...waypointStops.map((s) => s.key)];
        const toKeys = [...waypointStops.map((s) => s.key), destination.key];
        const payload = result.routes[0].legs.map((leg, i) => ({
          from: fromKeys[i],
          to: toKeys[i],
          path: flattenLegPath(leg),
        }));
        resolve({ legs: payload, bounds: result.routes[0].bounds });
      },
    );
  });
}
