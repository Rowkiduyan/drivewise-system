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

**Helper visibility:** Implemented 2026-08-09. Helpers never press Start Trip (or Pause/Resume/End) — only the Driver does. `admin-users`' `get-helper-deliveries` action (Helper-role-gated, resolved via `assigned_helper_ids` containment) returns each assigned delivery's real `delivery_requests.status` plus `hasOpenSession`, computed the same open (`status = Active`) `sessions`-row check `get-driver-deliveries` uses — no separate action trigger, no `update-helper-delivery` action exists. `HelperDeliveries.jsx` renders this read-only: status badge/progress bar reflect the real status, and an Active/Paused banner mirrors the Driver's. Not realtime — the Helper's portal fetches once on page load, same as the Driver's own page; picking up a Trip-state change made while the page is already open is deferred to `08_REALTIME_DASHBOARD.md`'s scope, not specific to Helper.

## Rest Stop Recommendation

Every 2 hours of continuous driving within a single active Session, the Driver Web Application shows a rest stop recommendation notification. This is anchored to that Session's `start_time` (continuous driving time), not the Trip overall — since Pause/Resume already splits driving into separate Sessions, the 2-hour clock naturally resets whenever the driver actually takes a break, and doesn't carry over across days on a multi-Session Trip.

This is advisory only:

- It is entirely up to the driver whether to act on it (e.g. press Pause Trip) or dismiss it and keep driving.
- It never automatically pauses, ends, or otherwise changes Trip or Session state — same principle as the "never auto-end" rules elsewhere (see `08_REALTIME_DASHBOARD.md`, `09_EDGE_CASES.md`).

No new schema is needed — `sessions.start_time` already exists, so this is a client-side timer in the Driver Web Application while a Session is active, not a backend/database feature.

## Deliverable

Implement only the Start Trip workflow.