# Phase 7 - End Trip

## Goal

Implement the complete End Trip workflow.

## Workflow

Driver presses End Trip in the Driver Web Application.

The backend:

- verifies there is a currently open Session for this delivery request
- updates `delivery_requests.status` to `DELIVERED` (see "Delivery Status" below — this is the one place Trip actions touch `status`, not a generic "Completed" value)
- updates the session:
  - records end_time
  - calculates duration
  - computes the distance driven this Session, from its GPS route (see `05_GPS_PIPELINE.md`), and adds it to `trucks.current_mileage` for the truck used in this Session
  - marks session Completed

After the backend confirms completion:

The driver may shut down the Raspberry Pi.

Heartbeat naturally stops.

The device eventually appears Offline.

The completed trip is unaffected.

## Important Rules

End Trip permanently completes the business assignment. It should only be used after the final destination has been reached.

Drivers should not use End Trip for overnight stops or other temporary interruptions if they intend to continue the same assignment later — use Pause Trip instead (see `03B_PAUSE_AND_RESUME_TRIP.md`). Once a trip is Completed, it cannot be resumed; continuing the same assignment after an erroneous End Trip requires a new Trip.

## Delivery Status (`delivery_requests.status`)

Pressing End Trip (i.e. completing the delivery) also sets `delivery_requests.status` to `DELIVERED`. This is the one deliberate exception to the rule elsewhere (see `DATABASE.md`'s `delivery_requests` notes) that Start/Pause/Resume/End Trip never touch `delivery_requests.status` — `DELIVERED` is an existing milestone value in the already-built status flow (`SupDeliveries.jsx`), not a new Session-state value, so this is wiring an existing action to an existing milestone rather than mixing the two concerns.

In the Customer's view, a delivery with status `DELIVERED` shows a "Confirm Receive" button — a second validation, independent of the driver's End Trip action, that the customer actually received the goods. Pressing it sets status to `COMPLETED`. This matches the existing status flow already documented in `SupDeliveries.jsx`, where `COMPLETED` happens either from customer confirmation or automatically 7 days after `DELIVERED` with no action taken.

**Helper visibility:** Implemented 2026-08-09 (see `03_START_TRIP_AND_SESSION.md`'s Helper visibility note). Helpers never press End Trip — only the Driver does. `HelperDeliveries.jsx` no longer has its own local stage-advance buttons (the old `Start Pickup`/`Confirm Pickup`/`Complete Delivery` mock actions were removed) — the page is fully read-only now. Once the Driver ends the Trip and `delivery_requests.status` becomes `DELIVERED`, `get-helper-deliveries` returns that real status and the delivery moves into the Helper's "Past" tab on next page load, the same crew-visibility principle as `02_BOOKING_AND_TRIP_CREATION.md`'s `ASSIGNED` note. Not realtime — requires a reload if the page was already open when the Driver ended the trip (see `03_START_TRIP_AND_SESSION.md`'s note; `08_REALTIME_DASHBOARD.md` scope).

## Deliverable

Implement only End Trip.