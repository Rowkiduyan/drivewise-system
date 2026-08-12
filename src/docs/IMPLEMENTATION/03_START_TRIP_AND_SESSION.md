# Phase 3 - Start Trip

## Status

Implemented and tested 2026-08-08 — `supabase/functions/driver-trip/index.ts` (`action: "start-trip"`). Verified end-to-end: creates the `sessions` row correctly and leaves `delivery_requests.status` unchanged.

## Goal

Implement the complete Start Trip workflow.

## Workflow

Supervisor has already created a trip.

`delivery_requests.status`:

`ASSIGNED`

Driver logs into the Driver Web Application.

The application loads assigned trips for that driver.

Driver presses Start Trip.

The backend:

- verifies `delivery_requests.status` is `ASSIGNED`
- determines the Raspberry Pi assigned to the selected truck
- creates a new session

Start Trip does **not** change `delivery_requests.status` — per the two-axis rule (see `DATABASE.md`'s `delivery_requests` notes), Active is a Session-state concept, not a milestone value, so it only ever lives on the `sessions` row. The Session's existence (and its own `status = Active`) *is* the record that the Trip is actively being driven; there's no separate Trip-level marker for it. (Whether Start Trip should also advance the milestone status, e.g. to `OUT_FOR_PICKUP`, is a separate question that hasn't been decided — flagging rather than assuming, same as the deliberate End Trip → `DELIVERED` exception was an explicit decision, not a default.)

The session stores (see `DATABASE.md`'s `sessions` entry for the exact deployed column names):

- delivery_request_id
- driver_id
- truck_plate
- device_id
- start_time
- status = Active

The backend expects telemetry after the session is created.

The Raspberry Pi does not need to be online.

## Important Rules

Pressing Start Trip:

- creates the first Session (its `status = Active` is what makes the Trip "active" in practice — see the Workflow note above on why `delivery_requests.status` itself doesn't change)

Subsequent driving periods use Resume Trip instead of Start Trip.

Trips may contain multiple Sessions.

If the Raspberry Pi is offline:

- `delivery_requests.status` is unaffected either way (see above).
- Session remains Active.
- Dashboard shows Waiting for Device immediately after Start Trip; once 30 seconds pass with no heartbeat for the new Session, the dashboard shows Monitoring Unavailable instead (see `08_REALTIME_DASHBOARD.md`).
- The Trip does NOT automatically end because telemetry is unavailable.

Do not implement heartbeat.

Do not implement GPS.

Do not implement alerts.

**Helper visibility:** Implemented 2026-08-09, **reopened 2026-08-12.** Helpers never press Start Trip (or Pause/Resume) — only the Driver does; those stay Session/device actions tied to the vehicle. But per `02B_MULTI_STOP_DELIVERIES.md`'s "Photo-Required Chain Completion," the Helper now DOES own Confirm Pickup, the dropoff, and every stop — three new Helper-gated `admin-users` actions (`update-driver-delivery` scoped to `OUT_FOR_DROPOFF` only, `complete-dropoff`, `complete-stop`), each requiring a proof photo. Completing the last item in that chain also calls `driver-trip`'s `end-trip` (now Helper-callable for this one action — see that Edge Function's auth). `HelperDeliveries.jsx` is no longer read-only for these three actions; Start Trip/Pause/Resume remain exclusively Driver-triggered. `admin-users`' `get-helper-deliveries` also returns `stops`/`pickupPhotoUrl`/`dropoffPhotoUrl`/`dropoffCompletedAt` now, same fields `get-driver-deliveries` returns. Not realtime for the delivery list itself — the Helper's portal fetches once on page load plus the Realtime subscriptions from the "Planned catch-up" note below; picking up a Trip-state change made while the page is already open otherwise requires a page reload.

**Planned catch-up (decided 2026-08-12, not built):** at the time the note above was written, this "fetch once, not realtime" limitation was shared with the Driver's own page too — that's no longer true. `DriverDeliveries.jsx` now has multiple live Realtime subscriptions built and proven working end-to-end (delivery status/session state, `alerts`, `gps_logs` — see `STATUS.md`'s 2026-08-12 entries), so Helper is now specifically behind, not just deferred alongside Driver. The fix is a straightforward port, not new design: wire the same `postgres_changes` subscription pattern already used for delivery/session state in `DriverDeliveries.jsx` into `HelperDeliveries.jsx`, reading the same rows Helper already fetches once today. See `06_DROWSINESS_ALERT_PIPELINE.md`'s Helper visibility note for the second half of this catch-up (read-only alert-feed visibility).

## Rest Stop Recommendation

Every 2 hours of continuous driving within a single active Session, the Driver Web Application shows a rest stop recommendation notification. This is anchored to that Session's `start_time` (continuous driving time), not the Trip overall — since Pause/Resume already splits driving into separate Sessions, the 2-hour clock naturally resets whenever the driver actually takes a break, and doesn't carry over across days on a multi-Session Trip.

This is advisory only:

- It is entirely up to the driver whether to act on it (e.g. press Pause Trip) or dismiss it and keep driving.
- It never automatically pauses, ends, or otherwise changes Trip or Session state — same principle as the "never auto-end" rules elsewhere (see `08_REALTIME_DASHBOARD.md`, `09_EDGE_CASES.md`).

No new schema is needed — `sessions.start_time` already exists, so this is a client-side timer in the Driver Web Application while a Session is active, not a backend/database feature.

## Deliverable

Implement only the Start Trip workflow.