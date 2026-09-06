// Shared route-computation logic, extracted 2026-09-06 (Supervisor Route
// Review & Approval feature) from what used to live only inline inside
// DriverDeliveries.jsx's PlannedRouteMap. Now needed identically in three
// places: CustomerRequestDelivery.jsx (route generated at request-creation
// time), SupDeliveries.jsx (Supervisor viewing/editing during PENDING_
// REQUEST review), and DriverDeliveries.jsx's PlannedRouteMap (still the
// fallback recompute for a request whose route was never Supervisor-
// approved -- see route_approved_at in DATABASE.md). Extracted rather than
// duplicated per-portal (the way RouteDeviationMap is) because this is a
// nontrivial multi-step DirectionsService request builder with a
// nearest-neighbor ordering algorithm, not a simple read-only renderer --
// tripling it would triple the bug surface for a future stop-ordering fix.

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
          path: leg.steps.flatMap((step) =>
            step.path.map((p) => [p.lat(), p.lng()]),
          ),
        }));
        resolve({ legs: payload, bounds: result.routes[0].bounds });
      },
    );
  });
}
