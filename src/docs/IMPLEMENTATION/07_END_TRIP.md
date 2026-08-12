# Phase 7 - End Trip

## Goal

Implement the complete End Trip workflow.

## Workflow

**Reopened 2026-08-12** — End Trip is no longer triggered by a Driver pressing a dedicated "Complete Delivery" button. It now fires automatically as a side effect of the Helper completing the last item in the Pickup → Dropoff → Stops chain (whichever item that dynamically turns out to be) — see `02B_MULTI_STOP_DELIVERIES.md`'s "Photo-Required Chain Completion." `driver-trip`'s `end-trip` action itself is unchanged in what it does, just in who's allowed to call it: still Driver-only for `start-trip`/`pause-trip`/`resume-trip`, but `end-trip` now also accepts a caller who's an assigned Helper on that delivery. The rest of this doc describes the backend workflow, which is otherwise unchanged.

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

**Helper visibility, reopened 2026-08-12** (see `03_START_TRIP_AND_SESSION.md`'s Helper visibility note). The Helper is no longer just a read-only observer of End Trip — completing the chain's last item (Confirm Pickup/dropoff/a stop, via `HelperDeliveries.jsx`) is what triggers it now, calling `end-trip` itself once `complete-dropoff`/`complete-stop` responds `isFinal: true`. Once `delivery_requests.status` becomes `DELIVERED`, both `get-helper-deliveries` and `get-driver-deliveries` return the real status; `DriverDeliveries.jsx`'s Realtime subscription on `delivery_requests` (added 2026-08-12 alongside this change) picks it up live rather than needing a reload, showing the same completion toast/archiving its own old Complete Delivery button used to trigger directly.

## Deliverable

Implement only End Trip.