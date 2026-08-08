# Phase 5 - GPS Pipeline

## Goal

Implement GPS uploads.

## Required Schema

Resolved 2026-08-08: `gps_logs` now exists (id, `session_id` text FK to `sessions.session_id`, latitude, longitude, timestamp, created_at — see `DATABASE.md`). Locked to `service_role` only for now; a Supervisor-dashboard read path is a decision for `08_REALTIME_DASHBOARD.md`, not this phase.

## Rules

GPS uploads only occur when:

An active session exists for the device.

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
- finds the active session
- inserts a gps_logs record

The Raspberry Pi never knows session_id.

The backend performs the lookup.

Stored GPS logs must remain attributable to their Session (and, through the Session, their Trip) in chronological order — this is what lets a Trip's actual route be reconstructed for Route Comparison against its suggested route (see `01_SYSTEM_ARCHITECTURE.md`). A Trip that spans multiple Sessions (e.g. after a Pause/Resume) reconstructs its route by combining GPS logs from all of its Sessions, in order.

The same per-Session GPS log also drives truck mileage tracking (see `03B_PAUSE_AND_RESUME_TRIP.md`/`07_END_TRIP.md`): distance driven is the sum of the point-to-point distances between consecutive `gps_logs` rows within that Session, added to `trucks.current_mileage` when the Session closes (Pause or End Trip). Computing it per-Session, not per-Trip, means it stays correct even if the assigned truck ever changes between Sessions of the same Trip (see the truck-swap decision in `02_BOOKING_AND_TRIP_CREATION.md`) — each Session's mileage always goes to whichever truck it actually used.

**Decided 2026-08-08, mechanism not yet designed:** GPS tracking should continue while a Trip is Paused, for anti-theft/asset-visibility reasons — a Supervisor should be able to see where the truck actually is even if the driver paused (see `03B_PAUSE_AND_RESUME_TRIP.md`). This conflicts with the rule above ("GPS uploads only occur when an active session exists") as currently implemented: `pause-trip` (`driver-trip` Edge Function, built 2026-08-08) closes the Session outright (`end_time` set, `status = Completed`), and `gps_logs.session_id` is a not-null FK to a session — so there is no session row left for a GPS point to attach to during a pause under the current schema. Closing this gap needs its own design decision before it can be built, e.g.:

- A separate truck-position tracking path keyed to the Trip (`delivery_request_id`) instead of `session_id`, running independently of Session state — GPS keeps flowing whenever a Trip is in progress (`OUT_FOR_PICKUP` through `DELIVERED`), while drowsiness detection still stops on Pause via `session_active` (`04_DEVICE_BOOT_AND_HEARTBEAT.md`).
- Or, not closing the Session on Pause at all — reintroducing a real "Paused" status on `sessions` instead of ending it, which directly reverses `03B_PAUSE_AND_RESUME_TRIP.md`'s "Paused isn't a stored value anywhere" decision and the already-implemented/tested `pause-trip` mileage-on-close behavior.

Not resolved here — do not build either without picking one first.

## Deliverable

Implement GPS upload only.