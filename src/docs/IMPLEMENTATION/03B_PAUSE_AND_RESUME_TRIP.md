# Phase 3B - Pause and Resume Trip

## Goal

Implement temporary suspension of a Trip.

## Pause Trip

Driver presses Pause Trip.

The backend:

- records end_time for the active Session
- calculates session_duration
- computes the distance driven this Session, from its GPS route (see `05_GPS_PIPELINE.md`), and adds it to `trucks.current_mileage` for the truck used in this Session
- marks the Session as Completed

Pause Trip does **not** change `delivery_requests.status` — same two-axis rule as Start Trip (see `03_START_TRIP_AND_SESSION.md` and `DATABASE.md`'s `delivery_requests` notes). "Paused" isn't a stored value anywhere; it's simply the state of having a Trip with no currently-open Session, on a delivery that hasn't reached `DELIVERED`/`COMPLETED`/`CANCELLED` yet.

The Trip remains active as a business assignment.

## Resume Trip

Driver presses Resume Trip.

The backend:

- verifies there is no currently open Session for this delivery request (see the Pause Trip note above on what "Paused" means)
- confirms the truck for this Session — defaults to the Trip's current truck (`delivery_requests.assigned_truck_plate`), but the driver/Supervisor may select a different one (e.g. a truck breakdown during the Pause) — see the truck-swap decision in `02_BOOKING_AND_TRIP_CREATION.md`
- if a different truck is selected, updates `delivery_requests.assigned_truck_plate` to match
- resolves the assigned Raspberry Pi via `devices.plate_number` for that truck — the same lookup Start Trip performs, not reused from the Trip's prior Session, so both a truck swap and a fleet-level device reassignment since the last Session are picked up automatically
- checks for an existing open Session (no `end_time`) on the resolved device — same "one active session per device" invariant Start Trip must already enforce (see `PROJECT_CONSTRAINTS.md`, `09_EDGE_CASES.md`'s "Device already has an Active session"). If one exists, the selected truck is already in active use by another Trip — reject the swap and surface that to the driver/Supervisor rather than creating a second Session on the same device.
- creates a new Session, storing `delivery_request_id`, `driver_id`, `truck_plate`, `device_id` (the resolved truck/device above), `start_time`, `status = Active` — the same field set Start Trip's Session stores (see `03_START_TRIP_AND_SESSION.md`)

GPS and monitoring resume.

**Decided 2026-08-08 — narrows the line above:** GPS tracking should *not* actually stop during a Pause in the first place, for anti-theft/asset-visibility reasons (a Supervisor should be able to see where the truck is even while paused). Only drowsiness monitoring is meant to stop on Pause. This wording ("GPS and monitoring resume") and the Pause Trip section above (which closes the Session GPS logs are attached to) both predate that decision and describe the original, since-superseded design. See `05_GPS_PIPELINE.md`'s note for what's actually decided vs. still needing a mechanism — not implemented, and the current `pause-trip`/`resume-trip` code (built 2026-08-08, tested end-to-end) still reflects the old "everything stops on Pause" behavior until this is resolved.

## Raspberry Pi

After Pause Trip:

The Raspberry Pi may be powered off.

Heartbeat naturally stops.

Device eventually appears Offline.

This does not affect the Trip.

## Important Rules

Pause/Resume is what makes multi-day and overnight-stop Trips possible without ending the business assignment — see `01_SYSTEM_ARCHITECTURE.md`'s Trip definition.

Pause Trip is for temporary suspensions where the same assignment continues later (e.g. an overnight stop). It is not the same as End Trip — End Trip permanently completes the assignment (see `07_END_TRIP.md`).

A Trip may be paused and resumed any number of times; each Resume Trip creates a new Session, so a Trip may accumulate multiple Sessions over multiple days.

Pause/Resume closes and reopens the backend Session. Originally (as first implemented 2026-08-08) this gated GPS as well as drowsiness-alert uploads, and did not reach the Raspberry Pi at all — the vibration motor ran off the Pi's own local detection with no way to know Session state, so a manual power-off was the only way to actually stop it. Two decisions since then (both decided 2026-08-08, see `05_GPS_PIPELINE.md` and `04_DEVICE_BOOT_AND_HEARTBEAT.md`) change what "gates" what:

- Drowsiness detection/vibration/alerts: the Pi will read a `session_active` boolean back on every heartbeat and locally gate detection/vibration/alerts on it — Pause Trip silences these within one heartbeat interval (~10s), and powering the Pi off becomes optional rather than required.
- GPS: keeps flowing during a Pause regardless of `session_active` (anti-theft/asset-visibility — see below). Mechanism resolved 2026-08-10 (see `05_GPS_PIPELINE.md`'s "GPS-during-Pause" note): `gps_logs.session_id` is now nullable and a not-null `delivery_request_id` column attributes readings to the Trip directly, so GPS no longer needs an open Session to write to.

Neither is built yet (schema/backend design resolved, implementation still pending Phase 4/5/6 work).

**Decided 2026-08-08, deferred to Phase 8:** what should happen if a truck is observed moving while its Trip is Paused? Originally framed as a non-issue "by construction" (GPS uploads rejected with no active Session), that framing no longer holds once GPS-during-Pause above is built — a paused-but-moving truck would then be real, visible data. Whether/how to flag that as an anomaly to a Supervisor (vs. treating it as simply expected now that Pause no longer implies "truck isn't moving") is real-time monitoring, not Session lifecycle, so it belongs in `08_REALTIME_DASHBOARD.md`'s scope — see the note added there. Not designed, not building it now.

**Supervisor/Admin visibility into Pause state:** not built yet. The `driver-trip` Edge Function's `pause-trip`/`resume-trip` actions and the `hasOpenSession` flag `admin-users`' `get-driver-deliveries` now returns (added 2026-08-08, see `STATUS.md`) are both Driver-role-gated — a driver can only see their own delivery's session state. Whether a Trip is Active or Paused is not currently exposed to any Supervisor- or Admin-facing screen. Per `08_REALTIME_DASHBOARD.md`, Supervisors (not Admins) are the intended audience for real-time Trip/Session status — that phase is still Planned (see `STATUS.md`) and will need to compute "Paused" the same way the driver UI does: an open (`status = Active`) `sessions` row for the delivery, not a stored value.

**Helper visibility into Pause state:** Implemented 2026-08-09 (see `03_START_TRIP_AND_SESSION.md`'s Helper visibility note for the full description) — `get-helper-deliveries` returns the same `hasOpenSession` computation, and `HelperDeliveries.jsx` shows a "Trip paused" banner read-only whenever a delivery is past `ASSIGNED` with no open Session. Helpers still never call the `driver-trip` actions themselves — this is visibility only, on page load, not realtime.

## Deliverable

Implement Pause Trip and Resume Trip only.
