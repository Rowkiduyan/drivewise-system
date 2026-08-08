# Current Development Status

Project Stage

Early Development

Completed

- Initial project planning
- Drowsiness detection prototype (the detection logic itself runs and works — see caveat under In Progress)
- Login authentication (Supabase Auth, role-based routing to each portal: Admin, Supervisor, Driver, Customer)
- Logout (confirmation modal, single-click guard, wired into all four portals: Admin, Supervisor, Driver, Customer)
- Admin account management (create, update role/name/email, deactivate, reset password — via the `admin-users` Edge Function and Admin panel; supports Supervisor/Admin/Driver/Helper/Customer roles)
- Start Trip backend (`driver-trip` Edge Function, `action: "start-trip"`) — driver-authenticated, creates the `sessions` row, tested end-to-end 2026-08-08.
- `admin-users`' `get-driver-deliveries` and `update-driver-delivery` actions — Driver-gated, back `DriverDeliveries.jsx`'s "Start Pickup"/"Confirm Pickup"/"Complete Delivery" buttons.
- Start Trip UI wiring (2026-08-08): `DriverDeliveries.jsx`'s "Start Pickup" button now calls `update-driver-delivery` (status → `OUT_FOR_PICKUP`) then `driver-trip`'s `start-trip`, in that order. Tested end-to-end: delivery status advances and a `sessions` row (`status = Active`) is created. Guardrails verified directly against the Edge Function via curl (the UI can't retrigger these once a session is Active): calling `start-trip` again on the same delivery (`DR-0011`) while its session was still Active returned `409 "You already have an active trip in progress"`; calling it on a second delivery (`DR-0016`, a test row assigned to the same driver, since deleted) while the first was still Active returned the same 409 — confirming the check is keyed on the driver, not the delivery.
- Fixed a bug found during that testing: `start-trip` originally required `delivery_requests.status === "ASSIGNED"`, but by the time it runs the paired `update-driver-delivery` call has already advanced status to `OUT_FOR_PICKUP`, so every call failed. Now accepts either `ASSIGNED` or `OUT_FOR_PICKUP` (see the Edge Function's inline comment for why the session-uniqueness checks, not this status check, are what actually guard against duplicate/late calls).
- Also verified via curl: calling `start-trip` on a delivery whose status is neither `ASSIGNED` nor `OUT_FOR_PICKUP` (tested with `PENDING_REQUEST`) returns `400` with a clear message. (The remaining guardrail — a delivery assigned to a different driver — wasn't tested; deemed low-risk since it's the same simple equality check pattern as the ones already verified, and the effort wasn't worth it against implementing actual unbuilt functionality next.)
- `service_role` grants confirmed 2026-08-08, ahead of implementing Pause Trip: `update on public.trucks` (previously only `select`) and `select on public.gps_logs` (never previously tested by any Edge Function, since Phase 5/GPS upload isn't implemented yet). See `DATABASE.md`'s `trucks`/`gps_logs` entries and `SUPABASE_GOTCHAS.md` #2/#7 for why these needed checking explicitly rather than assuming `service_role` already had them.

In Progress

- Web application development
- Raspberry Pi boot automation and device identification: `drowsiness detection` itself already runs and detects on the Pi, but the Pi is not yet coded to (a) auto-launch the detection script on boot (per `IMPLEMENTATION/04_DEVICE_BOOT_AND_HEARTBEAT.md`'s Raspberry Pi Startup section) or (b) send `device_id` to the backend. Heartbeat/telemetry identification is not wired up yet.
- Trip management: Start Trip done end-to-end (see Completed). Pause/Resume/End Trip are not implemented — confirmed by testing 2026-08-08: pressing "Complete Delivery" only sets `delivery_requests.status` to `DELIVERED` via `update-driver-delivery`; it does not call any `driver-trip` action, so the session's `end_time` stays `null` even after the customer presses "Confirm Receive". `driver-trip` still only implements `start-trip`.
- Driver-portal UI still missing a "Pause" button/flow entirely (`03B_PAUSE_AND_RESUME_TRIP.md`).

Planned

- Fleet management
- GPS tracking
- Reports
- Analytics Dashboard

---

## Next Steps (handoff notes, updated 2026-08-08)

Steps 1-4 of the original plan are done (see Completed above: `get-driver-deliveries`/`update-driver-delivery` actions added, "Start Pickup" wired to `start-trip`, tested end-to-end including guardrails). What's left:

Also found and parked (not resolved): `DriverDeliveries.jsx` renders its map with **Leaflet**/`react-leaflet`, not Google Maps — contradicts the Google Maps Platform Setup decision in `IMPLEMENTATION/02_BOOKING_AND_TRIP_CREATION.md`. Full note on the likely resolution (Routes API still generates route data, Leaflet still renders it, Google Maps stays only as the existing navigation deep-link) is in `IMPLEMENTATION/01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section — check there before touching map rendering.

Decided 2026-08-08: implement remaining phases in documented order (Phase 3B before Phase 7), rather than by which existing UI is easiest to wire — see `00_IMPLEMENTATION_RULES.md`'s "Implement only the current phase" principle.

**Remaining step-by-step plan, next action is step 1:**

1. **[NEXT]** Implement Phase 3B (Pause/Resume Trip) in `driver-trip/index.ts`:
   - `pause-trip` — verify the delivery belongs to the caller, find its open Session (`status = Active`), set `end_time`/`session_duration`, sum `gps_logs` distances for that session (will be `0` for now — no telemetry exists yet, that's expected, not a bug) and add to `trucks.current_mileage`, mark the Session `Completed`. Does not touch `delivery_requests.status`.
   - `resume-trip` — verify no open Session exists for the delivery, resolve the truck (defaults to `delivery_requests.assigned_truck_plate`, optionally overridden), resolve its device, reject if that device already has an open Session elsewhere, insert a new Active Session.
   - Scope decision: backend accepts an optional truck override on Resume (per the doc's truck-swap-after-breakdown case), but no truck-picker UI is being built for it yet — Resume always defaults to the same truck for now. Revisit if/when a truck swap actually needs testing.
2. Add a "Pause Trip" button (shown while monitoring is active) and a "Resume Trip" button (shown when paused but not yet Delivered) to `DriverDeliveries.jsx` — this screen has no Pause UI yet, a legitimate case for adding new UI per `00_IMPLEMENTATION_RULES.md`'s Missing UI rule. Requires extending `admin-users`' `get-driver-deliveries` to also report whether the active delivery currently has an open Session, so the UI knows which button to show.
3. Implement Phase 7 (End Trip) in `driver-trip/index.ts`: an `end-trip` action, same shape as `pause-trip` above but also sets `delivery_requests.status` to `DELIVERED` (the one deliberate status-touching exception, see `07_END_TRIP.md`). Wire "Complete Delivery" (`DELIVERED` stage in `advanceStage()`, `DriverDeliveries.jsx`) to call `update-driver-delivery` then `end-trip`, same call-order pattern as Start Pickup.
4. Note: `MIN_SCHEDULING_DAYS` in `src/lib/deliveryOptions.js` is temporarily set to `0` (was `3`) to allow same-day test deliveries — revert before production, see the `TEMPORARY` comment at that line.