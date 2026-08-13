# Phase 12 - Rest Stop Recommendations

## Goal

Trigger a rest-stop recommendation for a driver once either threshold is crossed since the current Trip began: **200 miles (~321.9 km) traveled**, or **2 hours of continuous driving time** — whichever comes first. Requested 2026-08-13, design only, not built.

## Current state

A "Recommended Rest Stop" UI slot already exists in two places, both currently mock-only, with no real computation behind either:

- `delivery_alert_monitoring` mock rows (`mockDeliveriesData.js`) carry `driving_hours`, `driving_distance_km`, `recommended_rest_stop`, `rest_stop_distance_km` — surfaced by `SupDeliveries.jsx`'s DriveWise Alerts card (Transit tab) until this session, when the real-alerts wiring (see `STATUS.md`'s DriveWise Alerts entry, 2026-08-13) deliberately **dropped** that section for deliveries with real DB alerts, specifically because nothing in the schema backs "recommended rest stop" or "distance driven" for a real Trip — this doc is what fills that gap.
- The same four fields also exist in `completed_delivery_reports`' mock shape, feeding `RouteDeviationMap`'s Route Deviation Report tab.

Two pieces of the underlying math already exist elsewhere in the codebase, just for different purposes — this feature is mostly recombining them, not inventing new computation:

- **Elapsed driving time**: `sessions.start_time` — already used for this session's own "Driving Hours" real-data stat (`SupDeliveries.jsx`'s `buildRealAlertSummary`, added 2026-08-13): `(Date.now() - session.start_time) / 3_600_000`.
- **Distance traveled**: point-to-point haversine summation over `gps_logs`, already implemented twice for other purposes — Session-close mileage added to `trucks.current_mileage` (`03B_PAUSE_AND_RESUME_TRIP.md`/`07_END_TRIP.md`), and `SupDashboard.jsx`'s own `distanceMeters` helper (used for the Paused-movement anomaly banner). Nothing new needs to be computed, just run continuously against the current Trip's `gps_logs` instead of only at Session-close or only for Paused-window anomaly detection.

## Design

### Threshold rule

Recommend a rest stop once **either** of the following is true, since the later of Trip start or the last recommendation:

- Distance traveled ≥ 200 miles (321.9 km)
- Elapsed driving time ≥ 2 hours

"Since the last recommendation" (reset the counters after each rest-stop suggestion, so a long multi-leg Trip can recommend more than once) vs. "since Trip start only" (simpler, one-shot) is an open decision — flagging rather than assuming, since it changes whether this needs its own small piece of state (a `last_rest_stop_at`-style marker) or can be purely derived from `sessions.start_time` + `gps_logs` with no new column.

Driving *time* should track actual driving, not wall-clock Trip duration — a Paused Trip (`03B_PAUSE_AND_RESUME_TRIP.md`) closes its Session, so `sessions.start_time` naturally excludes Paused time already (a new Session starts fresh on Resume); a multi-Session Trip should sum each Session's own active duration rather than using the first Session's `start_time` against "now," the same reasoning `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section already applies to combining multiple Sessions' GPS logs into one Trip.

### Where it's computed

Recommend computing this **client-side in the Driver app**, not a new backend job:

- The Driver app already holds a live GPS/position stream (`LiveNavigationMap`'s Realtime subscription on `gps_logs`) and already knows its own Session's `start_time` — no new data source needed.
- Unlike `08B_ANALYTICS_AND_REPORTING.md`'s aggregation rule ("computed by the backend/database... not recomputed client-side"), that guidance is about cross-driver historical rollups; this is a live, single-Trip, single-driver derived value with no aggregation across rows — the same category of client-derived state `LiveNavigationMap` already computes locally (heading from consecutive GPS ticks, deviation distance via `isLocationOnEdge`), not a new pattern.

### Finding an actual rest stop location

Threshold detection ("time to recommend a break") is separate from "recommend *where*" — the second half needs a live nearby-place lookup (e.g. Google Places API "gas_station"/"rest_area" search around the driver's current position), which is its own scope decision (search radius, place-type filtering, which Places API tier — `02_BOOKING_AND_TRIP_CREATION.md`'s Google Maps Platform Setup already has Places API (New) enabled for booking-form autocomplete, but a nearby-search call is a different API method/billing line than autocomplete, and hasn't been confirmed enabled). Not resolved here — report before assuming a specific Places call is already covered by existing setup.

### Whether this becomes a stored alert

Open decision, not assumed: `06_DROWSINESS_ALERT_PIPELINE.md`'s `alerts` table is schema-locked to the four drowsiness `event_type` values (`00_IMPLEMENTATION_RULES.md`'s "never rename/repurpose existing columns" spirit extends to not silently overloading `event_type` with an unrelated fatigue-break concern). Two options:

- **Ephemeral, client-side only** (recommended for a first version) — the Driver app computes the threshold locally and shows a banner/toast; nothing persisted, no audit trail. Matches that nothing today needs to answer "was this driver ever told to rest on this Trip" historically.
- **Persisted** — if an audit trail is wanted (e.g. a Supervisor should see *whether* a recommendation fired, not just whether the driver was speeding/drowsy), that needs a new table or column, reported as a schema gap before building, not added silently.

## Deliverable

Not implemented — this document is the plan. Building it means: (1) decide the reset-on-recommendation vs. Trip-start-only question, (2) add the client-side distance/time accumulator to the Driver app (reusing existing GPS-subscription and Session `start_time` data, no new backend), (3) decide and confirm the Places lookup for an actual nearby location, (4) decide whether a recommendation is ephemeral or persisted. Once real numbers exist, the already-built "Recommended Rest Stop" UI slot in `SupDeliveries.jsx`'s DriveWise Alerts card and Route Deviation Report tab can be restored for real Trips (currently intentionally hidden for real-alert deliveries, mock-only for report entries), rather than building new UI.
