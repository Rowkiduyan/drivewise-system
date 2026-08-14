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

Recommend a rest stop once **either** of the following is true, since Trip start:

- Distance traveled ≥ 200 miles (321.9 km)
- Elapsed driving time ≥ 2 hours

**Decided 2026-08-13: Trip-start only, one-shot** — no reset-after-recommendation behavior. This is purely derived from `sessions.start_time` + `gps_logs`, no new column or state needed. A given Trip recommends at most once (per the multi-session summation rule below, not per-Session).

Driving *time* should track actual driving, not wall-clock Trip duration — a Paused Trip (`03B_PAUSE_AND_RESUME_TRIP.md`) closes its Session, so `sessions.start_time` naturally excludes Paused time already (a new Session starts fresh on Resume); a multi-Session Trip should sum each Session's own active duration rather than using the first Session's `start_time` against "now," the same reasoning `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section already applies to combining multiple Sessions' GPS logs into one Trip.

### Where it's computed

Recommend computing this **client-side in the Driver app**, not a new backend job:

- The Driver app already holds a live GPS/position stream (`LiveNavigationMap`'s Realtime subscription on `gps_logs`) and already knows its own Session's `start_time` — no new data source needed.
- Unlike `08B_ANALYTICS_AND_REPORTING.md`'s aggregation rule ("computed by the backend/database... not recomputed client-side"), that guidance is about cross-driver historical rollups; this is a live, single-Trip, single-driver derived value with no aggregation across rows — the same category of client-derived state `LiveNavigationMap` already computes locally (heading from consecutive GPS ticks, deviation distance via `isLocationOnEdge`), not a new pattern.

### Finding an actual rest stop location

**Decided 2026-08-13: out of scope.** This feature is a pure threshold recommendation — "you've been driving 200mi / 2hr, consider a rest stop" — with no suggested location attached. No Places API call, no nearby-search, no place-type filtering. This removes the only open question that would have required confirming additional Google Maps Platform billing/API enablement. If a "where" component is wanted later, it's a separate follow-up phase, not part of this one.

### Whether this becomes a stored alert

**Decided 2026-08-13: Ephemeral, client-side only.** The Driver app computes the threshold locally and shows a banner/toast; nothing persisted, no audit trail, no new table/column, no use of the schema-locked `alerts` table (`06_DROWSINESS_ALERT_PIPELINE.md`'s four drowsiness `event_type` values are untouched).

## Deliverable

**Built and live-verified 2026-08-13/14** — see `STATUS.md`'s Phase 12 entry for the full implementation/verification writeup. `DriverDeliveries.jsx` now computes the distance/time accumulator client-side (piggybacked on the existing `gps_logs` Realtime subscription, plus a 60s backup timer for the time half when GPS is unavailable) and shows a dismissible banner once either threshold is crossed, summed across all of the Trip's Sessions, one-shot, no persistence — matching every decision above.

**Not yet done, a real follow-up, not part of this phase's original scope**: the already-built "Recommended Rest Stop" UI slot in `SupDeliveries.jsx`'s DriveWise Alerts card and Route Deviation Report tab is still mock-only — this phase only built the Driver-side recommendation itself, not a Supervisor-visible record of it (this phase deliberately produces nothing persisted for a Supervisor view to read). If Supervisor visibility into rest-stop recommendations is wanted later, that's a new decision (would need *some* persistence, contradicting this phase's "ephemeral" choice) — not a gap in what was actually asked for here. `rest_stop_distance_km`'s mock field remains irrelevant either way, since this phase still produces no location.
