# Phase 2 - Start Trip

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

If the Raspberry Pi is offline:

- Trip remains Active.
- Session remains Active.
- Dashboard shows Waiting for Device.

Do not implement heartbeat.

Do not implement GPS.

Do not implement alerts.

## Deliverable

Implement only the Start Trip workflow.