# Phase 2 - Booking and Trip Creation

## Goal

Implement how a trip comes to exist in the Assigned status that Phase 3 (Start Trip) begins from.

A trip can be created two ways:

- From a Customer booking request that a Supervisor reviews and approves.
- Directly by a Supervisor, with no booking involved.

Both paths end at the same place: a trip row with driver, truck, and schedule filled in, status Assigned.

## Required Schema

DATABASE.md does not yet define a `bookings` table or a `trips` table (`sessions` and `alerts` exist, but not in the shape Phase 3 onward already assumes — e.g. a `session` needs `trip_id`/`driver_id`/`truck_id`/`device_id`/`status`, which the current `sessions` table does not have).

`trucks` and `devices` already exist in Supabase (see `DATABASE.md`). A device is linked to its truck directly via `devices.plate_number` — decided 2026-08-06 not to build a separate `truck_device_assignments` table, since nothing needs assignment history, just the current pairing.

Per `00_IMPLEMENTATION_RULES.md`, this is reported rather than assumed. Before implementing this phase:

1. Confirm the actual current schema (DATABASE.md may be behind the real database — verify directly against Supabase).
2. Define/confirm a `bookings` table: booking id, `customer_auth_id`, pickup/dropoff location, pickup/dropoff date & time, item type, truck type requested, notes, status, created_at.
3. Define/confirm a `trips` table: trip id, nullable `booking_id` (FK to `bookings`), `driver_id`, `truck_id`, status, scheduled/actual start & end times, pickup/dropoff location, a suggested route (for Route Comparison, see `01_SYSTEM_ARCHITECTURE.md`), created_at. Decided 2026-08-06: the suggested route is auto-generated (via the Google Directions API, from pickup to dropoff) rather than manually drawn by the Supervisor — so this column stores a full route (e.g. an encoded polyline/coordinate list), generated once at trip-creation time, not just the two endpoint locations.
4. A Trip may contain multiple delivery stops (see `01_SYSTEM_ARCHITECTURE.md`'s Trip definition). A single `pickup/dropoff location` pair on `trips` does not represent multi-stop trips — confirm whether a separate stops table (or an ordered stops column) is required, or whether stops are out of scope for the current phase. Do not assume a shape. If/when implemented, stops are a simple ordered list (for route/reference purposes only) — do not add per-stop status tracking (e.g. Pending/Arrived/Departed) unless a later phase explicitly specifies it; nothing in the current spec calls for stop-level progress.
5. Decided 2026-08-08: the truck (and therefore the Raspberry Pi) assigned to a Trip **can** change between Sessions of the same Trip (e.g. a truck breakdown during an overnight Pause, Resume Trip on a different truck). Consequences for schema:
   - `sessions` gets its own `truck_id`/`device_id`, independently resolved per Session, not inherited from the Trip. This is already implied by the existing mileage rule in `03B_PAUSE_AND_RESUME_TRIP.md` and `07_END_TRIP.md`, which each add distance to `trucks.current_mileage` for "the truck used in this Session" — that only makes sense if a Session can pin its own truck independent of whatever the Trip is currently assigned.
   - `trips.truck_id` remains and is mutable — it tracks the truck *currently* assigned to the Trip (for supervisor-facing "what truck is this trip on right now" views). It gets updated whenever a Resume Trip happens on a different truck. The Session rows are the historical record of what was actually used at each point in time; `trips.truck_id` is only the live pointer.
   - See `03B_PAUSE_AND_RESUME_TRIP.md`'s Resume Trip section for the resulting workflow (truck selection/confirmation, then device resolution from that truck).
6. Do not implement against assumed column names — get them confirmed first, the same way Phase 1 verifies schema before Phase 3 writes code.

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

## Quotation Negotiation (Supervisor ↔ Customer)

This is the real, already-partially-built flow (see `DATABASE.md`'s `delivery_requests`/`delivery_quotations` notes and `SupDeliveries.jsx`), documented here in place of the earlier simplified Approve/Reject description:

Supervisor reviews incoming requests with status `PENDING_REQUEST`.

Supervisor submits an initial quotation — a `delivery_quotations` row linked to the request — status becomes `QUOTATION_SUBMITTED`.

Customer may counter-offer (`delivery_requests.customer_counter_min`/`customer_counter_max`) — status becomes `COUNTER_OFFER_SUBMITTED`.

Supervisor may submit a revised quotation (another `delivery_quotations` row) — status becomes `FINAL_QUOTATION_SUBMITTED`. This can repeat until the Customer accepts.

Customer approves a quotation — status becomes `APPROVED`. This confirms the final delivery rate; no driver, helper, or truck has been decided yet.

## Delivery Crew Assignment (Supervisor)

Once a request is `APPROVED`, the Supervisor assigns:

- a Driver (`delivery_requests.assigned_driver_id`)
- one or more Helpers (`delivery_requests.assigned_helper_ids`) — the Driver and Helpers together make up the delivery crew
- a Truck (`delivery_requests.assigned_truck_plate`)

The backend records `assigned_at` and sets status to `ASSIGNED`.

The assigned delivery crew (driver and helpers) then sees this as their assigned delivery in their respective portals. `ASSIGNED` is the state Phase 3 (Start Trip) begins from once the driver is ready to actually start driving.

If a separate `trips` table ends up being built (see the open question in Required Schema above), this assignment step is what would create/populate it — that architectural question is still unresolved and is tracked separately in `DATABASE.md`, not restated here.

## Important Rules

A booking never becomes Active or Completed by itself — only the trip it produces does. Booking status and trip status are tracked separately.

Quotation negotiation and crew (driver/helper) assignment are now documented above (2026-08-06) — `delivery_quotations` and `delivery_requests.assigned_helper_ids` already have backing schema, contradicting what this line used to say. `SupDeliveries.jsx`/`CustomerDeliveries.jsx` are the existing UI for this — per `00_IMPLEMENTATION_RULES.md`'s Existing UI and Design rule, wire into it as-is rather than rebuilding it.

Do not implement GPS, heartbeat, sessions, or alerts in this phase — those begin in Phase 3 onward, once the trip is Active.

A completed assignment is never reopened as the same trip. If a driver returns to the depot and later receives a new assignment (even the same day or the next day), that is a new trip creation — a new `trips` row via this phase's workflow — not a resumption of the prior trip. See `01_SYSTEM_ARCHITECTURE.md`'s Trip definition.

## Deliverable

Produce an implementation plan only, per the schema questions above. Do not modify any code until the required schema is confirmed.
