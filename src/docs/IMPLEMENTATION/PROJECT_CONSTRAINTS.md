## System Architecture

- Driver uses a web application (not a native mobile app).
- Raspberry Pi and Driver Web Application never communicate directly.
- Both communicate only with Supabase.

## Raspberry Pi

- Knows only device_id and device_secret.
- Never knows driver_id, truck_id, trip_id, or session_id.

## Fixed Constants

- HEARTBEAT_INTERVAL = 10 seconds
- DEVICE_OFFLINE_TIMEOUT = 30 seconds
- GPS_UPLOAD_INTERVAL = 1 second

## Business Rules

- One active session per device.
- One active device assignment per truck.
- One Active or Paused Trip per driver at a time — a driver may have several Assigned Trips queued, but must complete (End Trip) the one they're on before starting a different one.
- Trips begin only when the driver presses Start Trip.
- Trips end only when the driver presses End Trip.
- Heartbeat loss never ends a trip.
- Powering off the Raspberry Pi never changes Trip or Session status — it is only detected passively via heartbeat timeout.