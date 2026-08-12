# Phase 8 - Dashboard

## Goal

Implement real-time monitoring.

Display:

- Trip Status
- Device Status
- Last Heartbeat
- Current GPS
- Latest Alerts

## Monitoring Status

The dashboard must distinguish between:

- Waiting for Device
- Online
- Offline
- Monitoring Unavailable

Monitoring Unavailable means the Trip has started, but the Raspberry Pi has never connected. Supervisors should clearly understand that the driver is on an active Trip but telemetry is unavailable — not that the driver is idle or the Trip has stalled.

Monitoring Unavailable reuses `DEVICE_OFFLINE_TIMEOUT` (30 seconds, see `PROJECT_CONSTRAINTS.md`) — no separate threshold. If `Current Server Time - Session.start_time > 30 seconds` and the device has never sent a heartbeat for this Session, show Monitoring Unavailable instead of Waiting for Device. Before that 30 seconds elapses, show Waiting for Device. Once at least one heartbeat has been received for the Session, the state is governed by Online/Offline (`devices.last_ping`) instead, never Monitoring Unavailable again for that Session.

The dashboard determines online status using `devices.last_ping`.

No online boolean should exist.

## Map Display

Current GPS is rendered on a Google Maps view — the truck's live position as a marker, updated as new `gps_logs` rows come in. This is the Supervisor-facing tracking view; the Driver's own navigation view (showing the suggested route while driving) is separate — see `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section, which as of 2026-08-12 has the Driver-navigation half of this decided and implemented (Google Maps JavaScript API via `@react-google-maps/api`, driven by a capstone documentation requirement).

**Decided 2026-08-12: this Supervisor Dashboard map reuses the same Google Maps JS API stack (`@react-google-maps/api`), not a separate library.** All the infrastructure is already provisioned and paid for from the Driver-navigation work — API key, vector Map ID, Directions/Routes API enabled, referrer allowlist — and this view's needs are much simpler than Driver navigation's (a live marker per truck, no tilt/rotation/turn-by-turn/route rendering), so it's the low-effort reuse rather than standing up a second mapping stack (e.g. Leaflet, already used elsewhere in the app — see `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section for that existing contradiction, which this deliberately avoids adding a third pattern to). The one tradeoff is Google Maps JS is a paid/metered API vs. free Leaflet+OSM tiles, but since the app already bills for it on the Driver side, this is marginal added usage, not a new cost category.

## Important Rules

The Trip must NOT automatically end because monitoring is unavailable or the device is offline. Trips only end when the driver presses End Trip (see `07_END_TRIP.md` and `09_EDGE_CASES.md`).

Trip Status must also distinguish Paused from Active — not just Online/Offline/Monitoring Unavailable above, which are Device states, not Trip states. Per `03B_PAUSE_AND_RESUME_TRIP.md`, "Paused" isn't a stored value anywhere: compute it the same way the Driver UI does (`hasOpenSession` in `admin-users`' `get-driver-deliveries`, added 2026-08-08) — a delivery whose milestone status is past `ASSIGNED` but has no `sessions` row with `status = Active` is Paused, not Offline. This dashboard is the first Supervisor/Admin-facing surface for Trip/Session state at all; nothing built through Phase 3B exposes it outside the Driver's own view.

**Deferred here from `03B_PAUSE_AND_RESUME_TRIP.md` (decided 2026-08-08):** flagging a truck observed moving while its Trip is Paused as an anomaly is in scope for this phase. As of this writing, GPS-during-Pause is schema/mechanism-resolved but not implemented (`05_GPS_PIPELINE.md`'s "GPS-during-Pause" note) — once it is, a paused-but-moving truck becomes real, visible data for the first time, which is exactly what this note is flagging ahead of time so the gap isn't rediscovered from scratch when this phase starts.

**Decided 2026-08-12:** trigger and surfacing both resolved. Trigger — reuse the same Haversine distance math Pause Trip already runs for mileage (`03B_PAUSE_AND_RESUME_TRIP.md`) against the Paused-but-still-uploading `gps_logs` rows (attributed via `delivery_request_id` per the GPS-during-Pause design, since there's no open Session to key off of): sum cumulative movement since the Pause began, and flag anomalous once it exceeds a threshold comfortably above ordinary GPS drift noise (~100m — exact figure not yet tuned against real drift data, revisit once implemented). Surfacing — a distinct banner state on the truck's/trip's own card, not folded into the Latest Alerts feed: that feed is specifically drowsiness events (a driver-attention concern), while paused-but-moving is a different category entirely (security/theft) that a Supervisor should be able to tell apart from a drowsiness alert at a glance, not by reading alert text.

## Deliverable

Implement real-time dashboard status display only.