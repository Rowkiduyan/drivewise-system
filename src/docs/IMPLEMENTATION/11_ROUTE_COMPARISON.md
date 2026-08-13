# Phase 11 - Route Comparison (Suggested vs. Actual)

## Goal

Wire up "suggested route vs. actual route driven" for a completed Trip: the route generated before the Trip started, overlaid against the real path reconstructed from GPS, so a Supervisor can see how far the driver deviated. Per `00_IMPLEMENTATION_RULES.md`'s Existing UI rule, this connects real data into UI that already exists (see "What's already built" below) rather than designing a new screen.

Requested alongside two adjacent questions, both addressed here: whether the comparison should render as two differently-colored trails (yes — see "Rendering"), and whether traffic/roadwork data can inform the suggested route (see "Traffic-Aware Suggested Routes").

## What's already built

- **`01_SYSTEM_ARCHITECTURE.md`'s "Route Comparison" section** already defines the concept: "The suggested route belongs to the Trip. The actual route is reconstructed by combining the GPS logs from all Sessions belonging to that Trip, in chronological order." `05_GPS_PIPELINE.md` and `DATABASE.md`'s `gps_logs` entry both already build toward this — the `(session_id, timestamp)` index exists specifically to support it.
- **`SupDeliveries.jsx` already has the comparison UI**, fully built, currently mock-only: `RouteDeviationMap` (`:1057`) renders a Leaflet map with two `Polyline`s — planned route as a green dashed line (`#059669`, `dashArray: '8 6'`), actual route as a blue solid line at 70% opacity (`#2563eb`) — plus start/end markers. This is the "opposite color trail" already implemented; it just needs real data instead of `completed_delivery_reports`' mock `planned`/`actual` arrays (`:1730`). It's shown as the "Route Deviation Report" tab (`REPORT_TABS`, `:994`) inside a Completed Delivery's report view — but only for the handful of mock delivery ids that happen to have a matching `completed_delivery_reports` entry (`02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md`'s Supervisor section already flagged this: "Real DB-backed deliveries fall back to just Details + Quotation").
- **The actual route's data source already works**: `gps_logs` (`delivery_request_id`, `session_id`, `latitude`, `longitude`, `timestamp`) is populated live by Phase 5, and is already `authenticated`-readable (grant added 2026-08-12 for `LiveNavigationMap`).

## What's missing

**The suggested route is never persisted.** `02_BOOKING_AND_TRIP_CREATION.md` (gap #1, still open) planned a stored route column on `delivery_requests`, generated once at trip-creation time via the Routes API. That never got built. What actually shipped instead (`DriverDeliveries.jsx`'s `LiveNavigationMap`, `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section, 2026-08-12) is a client-side `DirectionsService` call, recomputed live every time the driving stage renders, and — critically — its pickup-leg `origin` is `livePosition || origin` (`DriverDeliveries.jsx:497`), i.e. it starts from wherever the driver currently is, not a fixed pre-trip point. That's correct for turn-by-turn navigation (re-route around the driver's real position) but means there is currently no single, fixed "the route we suggested for this Trip" artifact to compare against after the fact — it was different on every recompute.

## Required Schema

Per `00_IMPLEMENTATION_RULES.md`, this needs a new column before any of this can be built — reported here, not assumed:

- `delivery_requests.suggested_route` (jsonb, nullable) — the frozen suggested route for the whole Pickup → Dropoff → Stops chain, generated once and never recomputed. Shape: an array of per-leg entries mirroring the existing `stops` jsonb convention, e.g. `[{"from": "pickup", "to": "dropoff", "path": [[lat,lng], ...]}, {"from": "dropoff", "to": "stop_1", "path": [...]}, ...]` — one entry per `DirectionsService` leg, each `path` taken from that leg's own points (Google's `overview_path`, or the denser per-step `lat_lngs` if finer resolution is wanted — see `scripts/fixtures/DR-0020-legs.json`, already captured this way for `02C`'s test tooling, as a working precedent for "every point along the actual road-following path, not just each turn's end point").

No other schema is missing — `gps_logs` already carries everything needed to reconstruct the actual route.

## Decision: when is the suggested route generated (decided 2026-08-13)

**At trip creation/assignment** — matches `02_BOOKING_AND_TRIP_CREATION.md`'s original, never-built plan: one fixed route from `pickup_location` to `dropoff_location` (through `stops`), generated the moment the Supervisor assigns driver/truck/plate. Chosen specifically so drivers and other users can see the planned route *before* the trip starts, not only after the fact — this was the deciding factor over the Start Trip alternative.

Known trade-off, accepted: the driver may not actually start from the depot — `LiveNavigationMap`'s pickup leg starts from wherever the driver's live position is when driving begins (`DriverDeliveries.jsx:497`), which this fixed route won't capture. `suggested_route`'s pickup leg will originate from `pickup_location`, not the driver's real starting point, so a driver who begins far from the depot will show deviation on the first leg by construction. Acceptable per this decision — flagging here so it isn't mistaken for a bug later.

Either way: reuse `DirectionsService`, not the Routes API — `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section already corrected `02_BOOKING_AND_TRIP_CREATION.md`'s Routes-API assumption once (`02B_MULTI_STOP_DELIVERIES.md`'s "Real contradiction found and corrected"); building fresh code against the Routes API here would reintroduce the same already-resolved contradiction.

## Design

### Capturing the suggested route

Whichever trigger point is chosen above, call `DirectionsService` once with the chain's waypoints (same shape as `DriverDeliveries.jsx:456`'s `computeRoute`), and persist each leg's path into `suggested_route` — a one-time write, not a subscription. If Start Trip is chosen as the trigger, this most naturally happens in the Driver app at the moment `start-trip` succeeds (the browser already has `window.google.maps.DirectionsService` loaded there), writing the result back via a small addition to the `driver-trip` Edge Function or a direct `delivery_requests` update.

### Reconstructing the actual route

Exactly as `01_SYSTEM_ARCHITECTURE.md` already specifies: query `gps_logs` for the Trip's `delivery_request_id`, ordered by `timestamp`, and concatenate — a Trip spanning multiple Sessions (Pause/Resume) combines all of them in order, per `05_GPS_PIPELINE.md`. Only `session_id`-attributed readings count (Active-Session rows) — Paused-Trip readings (`session_id is null`) are for the Supervisor's live-position/anomaly view (`08_REALTIME_DASHBOARD.md`'s Paused-movement banner), not route reconstruction, matching the distinction that doc already draws.

### Rendering

Reuse `RouteDeviationMap` as-is (`SupDeliveries.jsx:1057`) — it already takes `plannedRoute`/`actualRoute`/`pickupCoords`/`dropoffCoords` as plain `[lat, lng]` arrays and already draws them as two distinguishable trails (green dashed vs. blue solid). The only change needed is what feeds it: replace the `completed_delivery_reports[delivery.id]`-only lookup (`:1730`) with a real query — `suggested_route` flattened from `delivery_requests`, `actual` from the `gps_logs` reconstruction above — falling back to "no telemetry" (matching this file's existing `ProofOfDeliverySection`/DriveWise Alerts precedent of "real data if present, otherwise say so") rather than mock, for any delivery that predates this feature and has no stored `suggested_route`.

Stops (Dropoff 2, 3, ...) mean the chain can have more than one pickup→dropoff leg — `RouteDeviationMap` currently only takes one planned/actual pair and one pickup/dropoff marker pair. Extending it to render every leg's marker (reusing `02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md`'s existing per-leg color convention, `NAV_LEG_COLORS`, so a multi-stop Trip's comparison view uses the same color language the driver's own nav view already does) is in scope for wiring this up for real, not a redesign — the shape just needs to grow from a single leg to `suggested_route`'s per-leg array.

## Traffic-Aware Suggested Routes

Separate question, same area: yes, this is available, at two different levels —

- **Departure-time traffic prediction** (cheapest, no separate API): `DirectionsService`'s request already supports `drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' | 'pessimistic' | 'optimistic' }` — this shifts the *suggested* route's timing/routing decision based on predicted traffic at departure time, and the response's `duration_in_traffic` field gives a traffic-aware ETA. This directly makes "the suggested route makes sense" — no new API needs enabling, since `DirectionsService` is already in use; just add `drivingOptions` to the existing `computeRoute` call (`DriverDeliveries.jsx:456`) and to whichever call ends up generating `suggested_route` above.
- **Live traffic/incident overlay** (visual only, no routing effect): Google Maps JS API's `TrafficLayer` renders live congestion coloring directly on a `google.maps.Map` instance — addable to `LiveNavigationMap` (which already renders via `@react-google-maps/api`) as `<TrafficLayer />`, so the driver can see congestion, not just get routed around it. This does **not** cover closures/roadwork/accidents as discrete labeled incidents — Google doesn't expose an incidents API to third parties; `TrafficLayer` only shows speed-based congestion coloring. Actual road closures are already handled indirectly: `DirectionsService`'s normal routing already avoids a road it knows is closed, and the existing rerouting-on-deviation logic (`DriverDeliveries.jsx`, `isLocationOnEdge`) already reacts if the driver has to detour around one live.

Both are additive to the existing `DirectionsService`/`@react-google-maps/api` stack already paid for and enabled (`02_BOOKING_AND_TRIP_CREATION.md`'s Google Maps Platform Setup) — no new billing category, just request parameters and one more rendered layer.

## Deliverable

Not implemented yet — this document is the plan. Trigger-point decision is now locked (trip creation/assignment, above). Still needed before code: add the `suggested_route` migration (schema gap, requires explicit approval per `00_IMPLEMENTATION_RULES.md`), generate it via `DirectionsService` at assignment time, then wire `RouteDeviationMap` to real `delivery_requests.suggested_route` + reconstructed `gps_logs` data per delivery, extending it for multi-leg chains. Traffic-aware `drivingOptions` and `TrafficLayer` are small, independent additions that can land separately from the persistence work above.
