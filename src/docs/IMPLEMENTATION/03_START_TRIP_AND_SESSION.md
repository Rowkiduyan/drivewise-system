# Phase 3 - Start Trip

## Goal

Implement the complete Start Trip workflow.

## Workflow

Supervisor has already created a trip.

Trip status:

Assigned

Driver logs into the Driver Web Application.

The application loads assigned trips for that driver.

Driver presses Start Trip.

The backend:

- verifies the trip is Assigned
- changes trip status to Active
- records actual_start_time
- determines the Raspberry Pi assigned to the selected truck
- creates a new session

The session stores:

- trip_id
- driver_id
- truck_id
- device_id
- started_at
- status = Active

The backend expects telemetry after the session is created.

The Raspberry Pi does not need to be online.

## Important Rules

Pressing Start Trip:

- activates the Trip
- creates the first Session

Subsequent driving periods use Resume Trip instead of Start Trip.

Trips may contain multiple Sessions.

If the Raspberry Pi is offline:

- Trip remains Active.
- Session remains Active.
- Dashboard shows Waiting for Device immediately after Start Trip; once 30 seconds pass with no heartbeat for the new Session, the dashboard shows Monitoring Unavailable instead (see `08_REALTIME_DASHBOARD.md`).
- The Trip does NOT automatically end because telemetry is unavailable.

Do not implement heartbeat.

Do not implement GPS.

Do not implement alerts.

## Rest Stop Recommendation

Every 2 hours of continuous driving within a single active Session, the Driver Web Application shows a rest stop recommendation notification. This is anchored to that Session's `started_at` (continuous driving time), not the Trip overall — since Pause/Resume already splits driving into separate Sessions, the 2-hour clock naturally resets whenever the driver actually takes a break, and doesn't carry over across days on a multi-Session Trip.

This is advisory only:

- It is entirely up to the driver whether to act on it (e.g. press Pause Trip) or dismiss it and keep driving.
- It never automatically pauses, ends, or otherwise changes Trip or Session state — same principle as the "never auto-end" rules elsewhere (see `08_REALTIME_DASHBOARD.md`, `09_EDGE_CASES.md`).

No new schema is needed — `sessions.started_at` already exists, so this is a client-side timer in the Driver Web Application while a Session is active, not a backend/database feature.

## Deliverable

Implement only the Start Trip workflow.