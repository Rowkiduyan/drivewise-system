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

One narrow exception (decided 2026-08-08, see `04_DEVICE_BOOT_AND_HEARTBEAT.md`'s Heartbeat and Active Session sections): the backend's heartbeat response includes a `session_active` boolean, which the Pi reads to locally start/stop drowsiness detection and alert uploads (including the vibration motor) — this is what makes Pause Trip actually silence the device instead of requiring a manual power-off. GPS is a deliberate exception to this exception (mechanism resolved 2026-08-10, see `05_GPS_PIPELINE.md`'s "GPS-during-Pause" note): it is **not** gated on `session_active` — the Pi keeps sending GPS unconditionally, and the backend alone decides whether to accept/attribute each reading, since GPS needs to keep flowing through a Pause while the other three correctly stop. It is a status readback, not a command: the backend still never tells the Pi to do anything, and the Pi still never learns `session_id`/`trip_id`/`driver_id`/`truck_id`. This does not make the channel bidirectional in the command sense — see `04_DEVICE_BOOT_AND_HEARTBEAT.md`'s Raspberry Pi Shutdown section for why that distinction is deliberate.

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

## Missing UI

If no screen, component, or button exists yet for triggering the current phase's functionality (e.g. no button wired to call it), building/wiring that minimal UI is part of implementing that phase — not a separate, later step. A phase implemented as backend-only, with no way for a user to actually trigger it, is not considered complete.

This does not authorize new screens, redesigns, or extra UI beyond what the phase requires to be usable — only the minimum needed to trigger and observe the phase's functionality end-to-end. If it's unclear whether a phase requires new UI or is meant to be backend-only, ask instead of assuming.