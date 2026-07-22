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
- Trips begin only when the driver presses Start Trip.
- Trips end only when the driver presses End Trip.
- Heartbeat loss never ends a trip.