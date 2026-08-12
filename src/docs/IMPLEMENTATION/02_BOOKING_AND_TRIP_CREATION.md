# Phase 2 - Booking and Trip Creation

## Goal

Implement how a trip comes to exist in the Assigned status that Phase 3 (Start Trip) begins from.

A trip can be created two ways:

- From a Customer booking request that a Supervisor reviews and approves.
- Directly by a Supervisor, with no booking involved.

Both paths end at the same place: a trip row with driver, truck, and schedule filled in, status Assigned.

## Required Schema

Decided 2026-08-08: there is no `bookings` table and no `trips` table, and neither will be built. `delivery_requests` (already deployed — see `DATABASE.md`) plays both roles: it's the booking record from creation, and it already carries driver/truck/helper assignment (`assigned_driver_id`/`assigned_truck_plate`/`assigned_helper_ids`/`assigned_at`) — a separate `trips` table would have duplicated those same fields and created two sources of truth for "who's driving this." Everywhere below that used to say `trips`/`bookings`, read it as `delivery_requests`.

`sessions` has been extended (2026-08-08) with `delivery_request_id`/`driver_id`/`truck_plate`/`device_id`/`status`, linking a Session directly to the `delivery_requests` row it belongs to — see `DATABASE.md`'s `sessions` entry for the exact columns. This is what Phase 3 onward (Start Trip, GPS, Alerts) writes to.

`trucks` and `devices` already exist in Supabase (see `DATABASE.md`). A device is linked to its truck directly via `devices.plate_number` — decided 2026-08-06 not to build a separate `truck_device_assignments` table, since nothing needs assignment history, just the current pairing.

Per `00_IMPLEMENTATION_RULES.md`, remaining gaps are reported rather than assumed:

1. `delivery_requests` does not yet have a stored suggested route. Decided 2026-08-06: the suggested route is auto-generated (from pickup to dropoff) rather than manually drawn by the Supervisor — so this column, once added, stores a full route (e.g. an encoded polyline/coordinate list), generated once at trip-creation time, not just the two endpoint locations. Decided 2026-08-08: route generation uses the **Routes API** (`computeRoutes`), not the legacy Directions API — see "Google Maps Platform Setup" below. Confirm/add this column before implementing route generation.
2. A Trip may contain multiple delivery stops (see `01_SYSTEM_ARCHITECTURE.md`'s Trip definition). Decided 2026-08-10: in scope, and stored as a `stops` column (`jsonb`, not null, default `'[]'`) on `delivery_requests` — an ordered array of intermediate stop locations (e.g. `[{"location": "..."}, ...]`) visited **between** the existing `pickup_location` (first) and `dropoff_location` (last), which are unchanged and keep their current meaning; `stops` only carries what's in between. Chosen over a separate stops table because nothing in scope needs to query, filter, or join on an individual stop — stops are a simple ordered list for route/reference purposes only (do not add per-stop status tracking, e.g. Pending/Arrived/Departed, unless a later phase explicitly specifies it), and a `jsonb` array maps directly onto the ordered-waypoints shape the Routes API's `computeRoutes` (see "Google Maps Platform Setup" below) already expects between origin and destination — no join required to build that request. Confirm/add this column before implementing multi-stop route generation or the booking form's stop-entry UI.
3. Decided 2026-08-08: the truck (and therefore the Raspberry Pi) assigned to a Trip **can** change between Sessions of the same Trip (e.g. a truck breakdown during an overnight Pause, Resume Trip on a different truck). Consequences for schema:
   - `sessions.truck_plate`/`sessions.device_id` are resolved independently per Session, not inherited from the Trip — already added (see above). This is what the mileage rule in `03B_PAUSE_AND_RESUME_TRIP.md` and `07_END_TRIP.md` relies on: each adds distance to `trucks.current_mileage` for "the truck used in this Session," which only makes sense if a Session can pin its own truck independent of whatever the delivery is currently assigned.
   - `delivery_requests.assigned_truck_plate` remains the *current* truck (for supervisor-facing "what truck is this on right now" views) — it gets updated whenever a Resume Trip happens on a different truck. The `sessions` rows are the historical record of what was actually used at each point in time; `assigned_truck_plate` is only the live pointer.
   - See `03B_PAUSE_AND_RESUME_TRIP.md`'s Resume Trip section for the resulting workflow (truck selection/confirmation, then device resolution from that truck).
4. Do not implement against assumed column names — get them confirmed first, the same way Phase 1 verifies schema before Phase 3 writes code.

## Google Maps Platform Setup

Decided 2026-08-08 (billing/API setup session):

- Google Cloud project billing is linked to the free $300/90-day trial credit. A budget alert is configured (Billing → Budgets & alerts) so spend is monitored; this is a notification only, it does not cap or disable billing automatically.
- APIs enabled: **Maps JavaScript API** (renders the map/route — **reopened contradiction as of 2026-08-12**: the already-built `DriverDeliveries.jsx` actually renders its map with Leaflet/`react-leaflet`, not this API, but the project's capstone documentation specifies in-app navigation built with this API specifically — a fixed external requirement, not a preference resolvable by keeping existing UI as-is; see `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section for the full note and open scope questions before implementing map rendering), **Routes API** (`computeRoutes` — generates the suggested route stored on `delivery_requests` at creation time, see Required Schema above; unaffected by the rendering question), and **Places API (New)** (address autocomplete on the booking form's pickup/dropoff fields).
- One API key is shared across all three APIs (an API key is scoped to the Cloud project, not to an individual API) — restricted by HTTP referrer (Website restriction) to the app's dev/prod origins, and by API restriction to only the three APIs above.
- The key is stored as `VITE_GOOGLE_MAPS_API_KEY` in `.env` (gitignored) / `.env.example` (placeholder only).
- Places Autocomplete must use session tokens (or the `PlaceAutocompleteElement` widget, which handles this automatically) so a single address search is billed once per session rather than once per keystroke.

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

This assignment step is what makes the `delivery_requests` row ready for Phase 3 — no separate `trips` row gets created, per the decision in Required Schema above.

## Important Rules

Booking and Trip are now the same `delivery_requests` row (see Required Schema above) — there is no separate booking-status/trip-status pair to keep in sync. `PENDING_REQUEST`/`APPROVED`/etc. and Session-driven telemetry state coexist on that one row without conflicting (see `DATABASE.md`'s `delivery_requests` notes on why `status` and `sessions` are different concerns).

Quotation negotiation and crew (driver/helper) assignment are now documented above (2026-08-06) — `delivery_quotations` and `delivery_requests.assigned_helper_ids` already have backing schema, contradicting what this line used to say. `SupDeliveries.jsx`/`CustomerDeliveries.jsx` are the existing UI for this — per `00_IMPLEMENTATION_RULES.md`'s Existing UI and Design rule, wire into it as-is rather than rebuilding it.

Do not implement GPS, heartbeat, sessions, or alerts in this phase — those begin in Phase 3 onward, once the trip is Active.

A completed assignment is never reopened as the same trip. If a driver returns to the depot and later receives a new assignment (even the same day or the next day), that is a new trip creation — a new `delivery_requests` row via this phase's workflow — not a resumption of the prior one. See `01_SYSTEM_ARCHITECTURE.md`'s Trip definition.

## Deliverable

Produce an implementation plan only, per the schema questions above. Do not modify any code until the required schema is confirmed.
