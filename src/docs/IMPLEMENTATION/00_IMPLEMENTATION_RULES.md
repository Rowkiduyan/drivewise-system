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

The Raspberry Pi only knows:

- device_id
- device_secret

It never knows:

- driver_id
- truck_id
- trip_id

Those relationships are managed entirely by the backend.

## Backend Responsibilities

The backend is responsible for:

- Trip lifecycle
- Session lifecycle
- Device authentication
- GPS storage
- Alert storage
- Device online/offline detection

## Implementation Philosophy

Implement only the current phase.

Do not implement future phases.

Do not add extra features not described in the current phase.

If information is missing, ask instead of assuming.