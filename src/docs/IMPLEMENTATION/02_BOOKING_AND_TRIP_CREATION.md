# Phase 2 - Booking and Trip Creation

## Goal

Implement how a trip comes to exist in the Assigned status that Phase 3 (Start Trip) begins from.

A trip can be created two ways:

- From a Customer booking request that a Supervisor reviews and approves.
- Directly by a Supervisor, with no booking involved.

Both paths end at the same place: a trip row with driver, truck, and schedule filled in, status Assigned.

## Required Schema

DATABASE.md does not yet define a `bookings` table or a `trips` table (`sessions` and `alerts` exist, but not in the shape Phase 3 onward already assumes — e.g. a `session` needs `trip_id`/`driver_id`/`truck_id`/`device_id`/`status`, which the current `sessions` table does not have). `trucks`, `devices`, and `truck_device_assignments` referenced throughout this folder are also not yet in DATABASE.md.

Per `00_IMPLEMENTATION_RULES.md`, this is reported rather than assumed. Before implementing this phase:

1. Confirm the actual current schema (DATABASE.md may be behind the real database — verify directly against Supabase).
2. Define/confirm a `bookings` table: booking id, `customer_auth_id`, pickup/dropoff location, pickup/dropoff date & time, item type, truck type requested, notes, status, created_at.
3. Define/confirm a `trips` table: trip id, nullable `booking_id` (FK to `bookings`), `driver_id`, `truck_id`, status, scheduled/actual start & end times, pickup/dropoff location, created_at.
4. Do not implement against assumed column names — get them confirmed first, the same way Phase 1 verifies schema before Phase 3 writes code.

## Booking Workflow (Customer)

Customer logs into the Customer portal.

Customer submits a booking request with:

- Pickup location, pickup date/time
- Dropoff location, dropoff date/time
- Truck type requested
- Item type
- Notes (optional)

Booking status on creation:

Pending

The booking is not a trip yet. No driver, truck, or session exists for it.

## Booking Review (Supervisor)

Supervisor views incoming bookings with status Pending.

Supervisor may:

- Reject the booking (status becomes Rejected; workflow ends).
- Approve the booking and proceed to trip creation.

Approving a booking does not by itself create a trip. Approval only unlocks the trip-creation step below — a trip is not Assigned until the Supervisor completes it with a driver and truck.

## Trip Creation (Supervisor)

Supervisor fills in trip details:

- Driver
- Truck
- Scheduled start time
- Pickup / dropoff location (pre-filled from the booking if one exists, editable)

The backend:

- creates the trip row
- if created from a booking, sets `trips.booking_id` to that booking and marks the booking Approved
- sets trip status to Assigned

This is the same trip-creation step in both paths:

- Booking-originated: Supervisor opens an Approved booking and fills in driver/truck/schedule.
- Direct: Supervisor starts a new trip from scratch, with no booking involved. `trips.booking_id` is null.

A trip with status Assigned is what Phase 3 (Start Trip) expects to already exist.

## Important Rules

A booking never becomes Active or Completed by itself — only the trip it produces does. Booking status and trip status are tracked separately.

Do not implement quotations, price negotiation, schedule counter-proposals, or crew/helper assignment in this phase — `SupDeliveries.jsx` and `CustomerDeliveries.jsx` currently contain mocked UI for these, but they are not described by this workflow and have no backing schema. Treat them as unbuilt until specified.

Do not implement GPS, heartbeat, sessions, or alerts in this phase — those begin in Phase 3 onward, once the trip is Active.

## Deliverable

Produce an implementation plan only, per the schema questions above. Do not modify any code until the required schema is confirmed.
