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

## Deliverable

Implement Pause Trip and Resume Trip only.
