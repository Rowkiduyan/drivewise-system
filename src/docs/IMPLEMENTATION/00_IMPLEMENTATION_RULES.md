# Implementation Rules

These rules apply to every implementation phase.

## Source of Truth

- DATABASE.md is the authoritative source for the database schema.
- Never rename existing tables or columns.
- Never modify the database schema unless explicitly instructed.
- Never duplicate existing functionality.

## Development Process

Before writing any code:

1. Read DATABASE.md.
2. Verify that every required table and column already exists.
3. Report any missing schema instead of creating assumptions.
4. Produce an implementation plan.
5. Wait for approval before making code changes.

## System Architecture

The system consists of three independent components:

- Driver Web Application
- Raspberry Pi
- Supabase Backend

The Driver Web Application and Raspberry Pi never communicate directly.

Both communicate only with Supabase over the internet.

## Raspberry Pi Responsibilities

The Raspberry Pi is only a telemetry device.

It only knows:

- device_id
- device_secret

It never knows:

- driver_id
- truck_id
- trip_id
- session_id

Those relationships are managed entirely by the backend.

It is only responsible for:

- heartbeat
- GPS
- drowsiness detection
- uploading alerts

Business logic always belongs to the backend.

## Backend Responsibilities

The backend is responsible for:

- Trip lifecycle
- Session lifecycle
- Device authentication
- Device lookup
- GPS storage
- Alert storage
- Device online/offline detection

The backend maps incoming telemetry to the correct active session.

## Implementation Philosophy

Implement only the current phase.

Do not implement future phases.

Do not add extra features not described in the current phase.

If information is missing, ask instead of assuming.

## Existing UI and Design

If a screen, component, or design already exists for a feature being implemented, wire the backend/logic into it as-is — do not redesign, restyle, or restructure it as part of implementing that phase.

This applies even if the existing UI is currently mocked, uses placeholder data, or doesn't yet match a phase's described backend shape (e.g. `SupDeliveries.jsx`, `CustomerDeliveries.jsx`) — connect it to the real data source, do not rebuild it.

If the existing UI is genuinely incompatible with the required functionality, report that instead of changing it unasked, per the "ask instead of assuming" rule above.