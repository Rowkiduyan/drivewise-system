# Phase 1 - Verify System Architecture

## Goal

Understand and verify the overall architecture before implementation.

## Tasks

Read DATABASE.md.

Verify the relationships between:

- devices
- trucks
- truck_device_assignments
- trips
- sessions
- gps_logs
- alerts

Verify that the architecture follows these principles:

- Driver uses a web application (installable as a home-screen shortcut).
- Raspberry Pi is an independent telemetry device.
- Raspberry Pi communicates only with Supabase.
- Driver web application communicates only with Supabase.
- Raspberry Pi never knows the driver.
- Raspberry Pi never knows the truck.
- Raspberry Pi never knows the trip.

The backend connects incoming telemetry to the active session using device_id.

## Deliverable

Produce an implementation plan only.

Do not modify any code.