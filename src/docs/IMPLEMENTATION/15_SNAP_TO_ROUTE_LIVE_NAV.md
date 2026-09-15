# Phase 15 - Snap-to-Route for Live Navigation

## Status: implemented 2026-09-15

## Goal

User-reported live, during an on-foot test walk of the driver flow: walking
beside a road (not on it) showed the Live Navigation arrow on the sidewalk,
not the road. Asked what's recommended before any code was written (see
"Scope decisions" below — all three options were decided together, then
implemented).

## Root cause

`LiveNavigationMap` and `ReturnTripNavigationMap` (`DriverDeliveries.jsx`)
both rendered the direction-of-travel arrow marker, and centered the
camera, at the literal raw `livePosition` coordinate — no snapping
anywhere. Ordinary phone GPS accuracy (commonly 5-15m, sometimes more
under tree cover/near tall buildings) is easily enough to place the raw
reading off the actual road centerline, onto an adjacent sidewalk, shoulder,
or parking lot.

## Scope decisions (explicit, asked before implementing)

- **Display-only.** The snapped position is used *only* for the marker's
  rendered position and the camera's follow-center. `gps_logs` writes,
  distance/mileage accumulation (`closeReturnTripSession`,
  `end-trip`/`pause-trip`'s mileage sum), the step-advance check
  (`NAV_STEP_ADVANCE_METERS`), and the reroute-on-deviation check
  (`isLocationOnEdge`/`NAV_REROUTE_TOLERANCE_DEGREES`) all keep comparing
  against the real, raw `livePosition` — unaffected by this feature. A
  genuine deviation (a real wrong turn, a real detour) is therefore still
  genuinely detected and still genuinely triggers a real reroute; snapping
  the *display* alone would otherwise quietly mask that the driver has
  actually left the route.
- **Thresholded, not unconditional.** Only snaps when the closest point on
  the currently-drawn route polyline is within `NAV_SNAP_TO_ROUTE_METERS`
  (40m) of the raw position. Farther than that, the raw position is shown
  instead — a driver who has genuinely left the route shouldn't have the
  arrow incorrectly glued to a line they're not really on. Deliberately
  kept well under `NAV_REROUTE_TOLERANCE_DEGREES`'s own ~100m
  reroute-trigger threshold, so there's a clean handoff: close enough to
  snap, or far enough to trigger a real reroute (which then redraws the
  line to match, and the new line becomes what future ticks snap to).
- **Both live-nav maps.** `LiveNavigationMap` (heading to
  pickup/dropoff/stops) and `ReturnTripNavigationMap` (driving back to the
  warehouse) shared the identical unsnapped-marker pattern, so both got
  the fix.

## Approach

New `snapToPolyline(point, path, maxMeters)` helper (`DriverDeliveries.jsx`,
module scope, next to `NAV_SNAP_TO_ROUTE_METERS`): projects the raw point
onto the nearest point of a given polyline using a local flat-earth
projection (meters-per-degree at the point's latitude) — accurate to
centimeters over the sub-kilometer span a single route leg covers, which is
all this needs; real haversine math per segment would be needless overhead
for no real gain at this scale. Handles both plain `{lat, lng}` points and
`google.maps.LatLng` instances (`.lat()`/`.lng()` as methods, not
properties) — the live route's own `step.path` entries are the latter, from
`DirectionsService`'s real response shape. Returns `null` ("show the raw
position instead") when the closest point exceeds `maxMeters`.

Each nav component computes:

```js
const displayPosition = livePosition
  ? snapToPolyline(livePosition, currentLegPoints, NAV_SNAP_TO_ROUTE_METERS) || livePosition
  : livePosition;
```

— where `currentLegPoints` is the *same* already-trimmed point set the
route's own drawn polyline uses (the current leg's steps sliced from
`currentStepIndex` onward, see the Phase 14/route-line-trimming fix this
builds on), computed once early in the component (before the camera-follow
effect, which needs it) and reused for both the `<Polyline>`'s `path` prop
and the snap calculation — no duplicate derivation.

`displayPosition` replaces `livePosition` in exactly two places per
component: the `<Marker>`'s `position` prop, and the camera-follow
effect's/`handleRecenter`'s `moveCamera({ center: ... })` call — so the map
visually centers on wherever the arrow is actually drawn, not the raw
point. Heading derivation (the direction-of-travel angle that drives the
camera's rotation) deliberately still compares consecutive *raw*
`livePosition` ticks, not the snapped ones — real movement is what a
direction arrow should reflect.

## Files touched

- `src/pages/DriverDeliveries.jsx` — new `NAV_SNAP_TO_ROUTE_METERS`
  constant, new `snapToPolyline()` helper, `displayPosition`
  derivation + `<Marker>`/camera-follow/`handleRecenter` wiring in both
  `LiveNavigationMap` and `ReturnTripNavigationMap`.

## Verification

Build/lint clean (`npm run build`, `eslint`). Live-verified via a fully
isolated, disposable repro — an idle driver (no active session, so nothing
of the reporting user's own real in-progress trip was touched), a fresh
throwaway `delivery_requests` row, a real `start-trip` through the actual
UI flow, cleaned up afterward (delivery, sessions, `gps_logs`,
`reroute_events`):

- Fetched the delivery's real computed route directly (Directions REST API,
  same origin/destination) to get its true first-step coordinates.
- Computed a test point ~15m perpendicular off that true route segment
  (simulating the sidewalk-offset scenario reported), landing inside an
  adjacent building lot rather than on the road.
- Fed that offset point as the delivery's `gps_logs` reading and loaded the
  Driver portal's Live Navigation view.
- Confirmed the rendered arrow sat exactly on the road at the correct
  point along "G. Plana" (screenshot-verified), not off in the building lot
  the raw coordinate would have placed it in.

Not yet tested: the >40m "show raw position instead" fallback path, or a
real on-foot/on-road walk test (this verification used a single simulated
`gps_logs` tick, not a continuous real GPS stream).
