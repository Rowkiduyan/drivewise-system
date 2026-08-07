# Phase 9 - Edge Cases

Implement handling for:

- Raspberry Pi never powered on
- Driver intentionally never powers on the Raspberry Pi (Trip proceeds; dashboard shows Monitoring Unavailable, not an error)
- Raspberry Pi loses internet
- Device offline during an active Trip
- Monitoring unavailable (Trip started, Raspberry Pi has never connected — see `08_REALTIME_DASHBOARD.md`)
- GPS unavailable
- Camera unavailable
- Duplicate Start Trip
- Driver attempts Start Trip while already on a different Active or Paused Trip (rejected — see `PROJECT_CONSTRAINTS.md`)
- Device already has an Active session
- Device reassignment while a session is Active
- End Trip while Raspberry Pi is Offline
- Overnight pause and resume (Pause Trip, device powered off overnight, Resume Trip the next day — see `03B_PAUSE_AND_RESUME_TRIP.md`)
- Multi-session Trips (a Trip accumulating more than one Session via Pause/Resume)
- Multi-stop Trips (a Trip with more than one planned/delivery stop, still ONE Trip)
- Driver returns to depot and receives a new assignment (a NEW Trip, never a resumption of the completed one — see `01_SYSTEM_ARCHITECTURE.md` and `02_BOOKING_AND_TRIP_CREATION.md`)
- Multiple customer branches within one Trip (still ONE Trip)
- Trip left Paused indefinitely (driver never presses Resume Trip or End Trip) — no automatic expiry, cancellation, or state change; the Trip stays Paused until the driver acts, same as heartbeat loss never ending a trip
- Driver ignores/dismisses the rest stop recommendation (see `03_START_TRIP_AND_SESSION.md`) — purely advisory, never forces a Pause or otherwise changes Trip/Session state

Never infer trip completion from heartbeat loss.

Trips only end when the driver presses End Trip.

A Trip does not automatically end because monitoring/telemetry is unavailable.