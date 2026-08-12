# Phase 5 - GPS Pipeline

## Goal

Implement GPS uploads.

## Required Schema

Resolved 2026-08-08, updated 2026-08-10: `gps_logs` now exists (id, `session_id` text FK to `sessions.session_id` — nullable, `delivery_request_id` text FK to `delivery_requests.id` — not null, latitude, longitude, timestamp, created_at — see `DATABASE.md`). Locked to `service_role` only for now; a Supervisor-dashboard read path is a decision for `08_REALTIME_DASHBOARD.md`, not this phase.

## Rules

GPS uploads occur whenever the device's Trip is in progress — Active *or* Paused (see "GPS-during-Pause" below), not only while a Session happens to be open.

Every 1 second:

Read GPS.

If GPS is unavailable:

Skip upload.

Continue heartbeat.

Send:

- device_id
- device_secret
- latitude
- longitude
- timestamp

The backend:

- authenticates the device
- resolves the device's truck (`devices.plate_number`)
- finds the most recent `sessions` row for that `device_id` (there is at most one Trip in progress per device at a time)
- takes that session's `delivery_request_id` — this is always set on `gps_logs`, whether or not a Session is currently open (see "GPS-during-Pause" below)
- if that session is still open (`status = Active`), also sets `session_id`; if it's closed (Paused) but its `delivery_request_id`'s Trip hasn't been ended (`delivery_requests.status` is not yet `DELIVERED` — End Trip is the only Trip action that touches `status`, per `07_END_TRIP.md`), leaves `session_id` null and still inserts
- if the most recent session's Trip has already ended (`status = DELIVERED`/`COMPLETED`/`CANCELLED`), rejects the upload — there is no Trip in progress for this device
- inserts a gps_logs record

The Raspberry Pi never knows session_id or delivery_request_id.

The backend performs the lookup.

Stored GPS logs must remain attributable to their Session (and, through the Session, their Trip) in chronological order — this is what lets a Trip's actual route be reconstructed for Route Comparison against its suggested route (see `01_SYSTEM_ARCHITECTURE.md`). A Trip that spans multiple Sessions (e.g. after a Pause/Resume) reconstructs its route by combining GPS logs from all of its Sessions, in order.

The same per-Session GPS log also drives truck mileage tracking (see `03B_PAUSE_AND_RESUME_TRIP.md`/`07_END_TRIP.md`): distance driven is the sum of the point-to-point distances between consecutive `gps_logs` rows within that Session, added to `trucks.current_mileage` when the Session closes (Pause or End Trip). Computing it per-Session, not per-Trip, means it stays correct even if the assigned truck ever changes between Sessions of the same Trip (see the truck-swap decision in `02_BOOKING_AND_TRIP_CREATION.md`) — each Session's mileage always goes to whichever truck it actually used.

**GPS-during-Pause (decided 2026-08-08, mechanism resolved 2026-08-10):** GPS tracking continues while a Trip is Paused, for anti-theft/asset-visibility reasons — a Supervisor should be able to see where the truck actually is even if the driver paused (see `03B_PAUSE_AND_RESUME_TRIP.md`). `pause-trip` (`driver-trip` Edge Function, built 2026-08-08) closes the Session outright (`end_time` set, `status = Completed`), so a GPS point captured during a Pause has no open Session to attach to.

Resolved: `gps_logs.session_id` is now nullable, and a `delivery_request_id` column (not null, see `DATABASE.md`) attributes every reading to its Trip directly, independent of Session state — GPS keeps flowing whenever a Trip is in progress, i.e. from Start Trip until End Trip, Paused or not (see the backend lookup logic above). `session_id` is still set whenever a Session happens to be open, so per-Session route reconstruction and mileage calculation (which only ever look at Active-Session readings) are unaffected — this only adds attribution for the gap where a Session is closed but the Trip isn't over.

The alternative considered and rejected: not closing the Session on Pause at all, reintroducing a real "Paused" status on `sessions` instead of ending it. Rejected because it would reverse `03B_PAUSE_AND_RESUME_TRIP.md`'s "Paused isn't a stored value anywhere" decision and require reworking the already-implemented/tested `pause-trip` mileage-on-close behavior, for no benefit over the chosen approach.

Downstream of this: whether a truck observed moving while its Trip is Paused should be flagged to a Supervisor as an anomaly is a separate, still-undecided question — see `03B_PAUSE_AND_RESUME_TRIP.md`'s note (deferred to Phase 8, `08_REALTIME_DASHBOARD.md` scope).

## Deliverable

Implement GPS upload only.