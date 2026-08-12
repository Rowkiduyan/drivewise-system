# Phase 10 - Testing Checklist

## Goal

Verify every workflow and edge case described in Phases 1-9 before sign-off.

## Trip and Session Lifecycle

- Start Trip creates the first Session (`status = Active`) without changing `delivery_requests.status` (still `ASSIGNED`).
- Pause Trip completes the current Session; `delivery_requests.status` is unaffected either way.
- Resume Trip creates a new Session and continues the same Trip (same `delivery_requests` row).
- End Trip completes the current Session and sets `delivery_requests.status` to `DELIVERED` (the one deliberate exception — see `07_END_TRIP.md`).
- A Trip with multiple Sessions (via one or more Pause/Resume cycles) is still one Trip.
- A completed Trip is never resumed as the same Trip.
- Driver returns to depot, receives a new assignment: a new Trip is created, not a resumption of the completed one.
- A Trip with multiple planned/delivery stops (multiple branches or customers in one dispatch) remains one Trip.
- A long-haul Trip with an overnight stop remains one Trip when paused/resumed, not ended.

## Raspberry Pi / Device

- Raspberry Pi never powered on: Trip can still be started; dashboard reflects no device connection.
- Driver intentionally never powers on the Raspberry Pi: Trip proceeds normally; dashboard shows Monitoring Unavailable, not an error state.
- Raspberry Pi loses internet mid-Trip: heartbeat stops, device eventually shows Offline, Trip and Session remain Active.
- Raspberry Pi is powered off during a Pause: no heartbeat while paused; Trip unaffected; Resume Trip works normally when the Pi is powered back on.
- Duplicate Start Trip is rejected/idempotent.
- Device already has an Active session: new session is not created for a second concurrent Start Trip on the same device.
- Device reassignment away from its current truck while that device has an Active session is rejected by `EditDeviceModal.jsx` ("This device is powering an active trip…"); succeeds normally once the trip is Paused or Ended (see `09_EDGE_CASES.md` gap #2).

## Heartbeat

- Heartbeat is sent every 10 seconds and updates `devices.last_ping`.
- Online status is derived as `now - last_ping <= 30 seconds`, with no stored online boolean.
- Heartbeat continues even when no Active Session exists.
- Heartbeat loss is never interpreted as trip completion.

## GPS Pipeline

- GPS uploads occur at a 1 second interval whenever the device's Trip is in progress — Active or Paused (see `05_GPS_PIPELINE.md`'s "GPS-during-Pause" note) — not only while a Session is open.
- During a Pause, the uploaded `gps_logs` row has `delivery_request_id` set but `session_id` null; once the Trip fully ends (`delivery_requests.status = DELIVERED`), further uploads for that device are rejected.
- GPS unavailable: upload is skipped for that reading; heartbeat continues; no session/device error state is raised.
- The Raspberry Pi never inserts directly into `gps_logs`; the backend resolves the Trip (and, if open, the Session) before insert.
- A Trip's actual route is correctly reconstructed by combining GPS logs from all of its Sessions in chronological order (multi-session and multi-day Trips).
- Route Comparison correctly compares the Trip's suggested route against its reconstructed actual route.

## Drowsiness Alerts

- Alerts upload immediately on detection; none are buffered until trip end.
- Alerts are only accepted for an Active Session; the backend resolves the active session before insert.
- A new alert triggers an audio cue in the Driver Web Application in near-real-time (not just a silent row in `alerts`).
- Audio playback works despite browser autoplay restrictions (unlocked at Start Trip, not first alert).

## Rest Stop Recommendation

- Notification appears after 2 continuous hours of driving within a single active Session.
- The 2-hour clock resets on Pause/Resume (measured from the current Session's `start_time`, not cumulative Trip time).
- Dismissing/ignoring it never changes Trip or Session state.

## Multi-Stop Deliveries

- Booking form: stops can be added/removed, capped at 5, and unfilled rows are dropped on submit rather than stored.
- Supervisor's request detail panel shows the customer-entered stops read-only, in order; no edit UI exists.
- Driver navigation's dropoff leg renders a route through all stops in order via `DirectionsService` `waypoints`; the to-pickup leg never includes stops.
- The "Stop X of Y" indicator advances as the driver's GPS position reaches each stop, and reads "Heading to Drop-off" on the final leg.
- Rerouting after a deviation only re-includes stops not yet reached, not the full original list.
- With stops present, `dropoff_location` routes as a waypoint (not the final destination) and the last stop is the actual navigation target; with no stops, `dropoff_location` is still the final destination (unchanged behavior).

## Photo-Required Chain Completion

- Driver can only Start Pickup — Confirm Pickup and Complete Delivery buttons/confirm-modals no longer exist on `DriverDeliveries.jsx`; it shows a read-only "waiting for the helper" banner during `FOR_PICKUP`/`OUT_FOR_DELIVERY` instead.
- Helper cannot complete Pickup/Dropoff/any stop without selecting a photo first — the Complete button in each confirm-modal stays disabled until one is chosen.
- **No-stops case:** Helper completes Pickup (photo → `pickup_photo_url` set, status → `OUT_FOR_DROPOFF`), then completes Dropoff (photo → `dropoff_photo_url`/`dropoff_completed_at` set, response `isFinal: true`, status → `DELIVERED`, Session closed via `end-trip`).
- **With-stops case:** Helper completes Pickup, then Dropoff (response `isFinal: false`, status stays `OUT_FOR_DROPOFF`), then each stop in turn (`isFinal: false` until the last one, which returns `isFinal: true` and triggers `DELIVERED`/`end-trip`).
- Completing stops out of order (e.g. stop 2 before stop 1) is allowed — no ordering enforced server-side.
- `DriverDeliveries.jsx` picks up the Helper-driven `DELIVERED` transition live (Realtime subscription on `delivery_requests`) and shows the same completion toast/archiving its old Complete Delivery button used to trigger directly, without needing a page reload.
- `end-trip` succeeds when called by an assigned Helper (not just the Driver); still rejects a Helper not assigned to that delivery, and still rejects any caller for `start-trip`/`pause-trip`/`resume-trip`.

## Dashboard

- Trip Status, Device Status, Last Heartbeat, Current GPS, and Latest Alerts all render correctly.
- Monitoring Status correctly distinguishes Waiting for Device, Online, Offline, and Monitoring Unavailable.
- Monitoring Unavailable is shown when a Trip has started but the Raspberry Pi has never connected, and is visually distinct from Offline (a device that connected before and dropped).
- Dashboard never auto-ends a Trip due to Offline/Monitoring Unavailable status.

## Deliverable

Confirm each item above against the running implementation before marking a phase complete.
