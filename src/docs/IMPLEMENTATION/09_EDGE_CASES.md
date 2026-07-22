# Phase 9 - Edge Cases

Implement handling for:

- Raspberry Pi never powered on
- Raspberry Pi loses internet
- GPS unavailable
- Camera unavailable
- Duplicate Start Trip
- Device already has an Active session
- Device reassignment while a session is Active
- End Trip while Raspberry Pi is Offline

Never infer trip completion from heartbeat loss.

Trips only end when the driver presses End Trip.