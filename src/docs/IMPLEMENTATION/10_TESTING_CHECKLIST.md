# Phase 10 - Testing Checklist

## Goal

Verify every workflow and edge case described in Phases 1-9 before sign-off.

## Trip and Session Lifecycle

- Start Trip transitions trip status Assigned → Active and creates the first Session.
- Pause Trip completes the current Session and keeps the Trip Active (status Paused).
- Resume Trip creates a new Session and continues the same Trip.
- End Trip transitions trip status Active → Completed and completes the current Session.
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
- Device reassignment while a session is Active is handled without corrupting the active session's telemetry routing.

## Heartbeat

- Heartbeat is sent every 10 seconds and updates `devices.last_ping`.
- Online status is derived as `now - last_ping <= 30 seconds`, with no stored online boolean.
- Heartbeat continues even when no Active Session exists.
- Heartbeat loss is never interpreted as trip completion.

## GPS Pipeline

- GPS uploads occur only while an Active Session exists, at a 1 second interval.
- GPS unavailable: upload is skipped for that reading; heartbeat continues; no session/device error state is raised.
- The Raspberry Pi never inserts directly into `gps_logs`; the backend resolves the active session before insert.
- A Trip's actual route is correctly reconstructed by combining GPS logs from all of its Sessions in chronological order (multi-session and multi-day Trips).
- Route Comparison correctly compares the Trip's suggested route against its reconstructed actual route.

## Drowsiness Alerts

- Alerts upload immediately on detection; none are buffered until trip end.
- Alerts are only accepted for an Active Session; the backend resolves the active session before insert.
- A new alert triggers an audio cue in the Driver Web Application in near-real-time (not just a silent row in `alerts`).
- Audio playback works despite browser autoplay restrictions (unlocked at Start Trip, not first alert).

## Rest Stop Recommendation

- Notification appears after 2 continuous hours of driving within a single active Session.
- The 2-hour clock resets on Pause/Resume (measured from the current Session's `started_at`, not cumulative Trip time).
- Dismissing/ignoring it never changes Trip or Session state.

## Dashboard

- Trip Status, Device Status, Last Heartbeat, Current GPS, and Latest Alerts all render correctly.
- Monitoring Status correctly distinguishes Waiting for Device, Online, Offline, and Monitoring Unavailable.
- Monitoring Unavailable is shown when a Trip has started but the Raspberry Pi has never connected, and is visually distinct from Offline (a device that connected before and dropped).
- Dashboard never auto-ends a Trip due to Offline/Monitoring Unavailable status.

## Deliverable

Confirm each item above against the running implementation before marking a phase complete.
