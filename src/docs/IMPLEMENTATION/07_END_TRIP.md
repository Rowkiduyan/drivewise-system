# Phase 7 - End Trip

## Goal

Implement the complete End Trip workflow.

## Workflow

Driver presses End Trip in the Driver Web Application.

The backend:

- verifies the trip is Active
- updates trip status to Completed
- records actual_end_time
- updates the session
- records ended_at
- calculates duration
- marks session Completed

After the backend confirms completion:

The driver may shut down the Raspberry Pi.

Heartbeat naturally stops.

The device eventually appears Offline.

The completed trip is unaffected.

## Deliverable

Implement only End Trip.