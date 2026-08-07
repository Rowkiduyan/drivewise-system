# Phase 4 - Raspberry Pi Boot and Heartbeat

## Goal

Implement Raspberry Pi startup and heartbeat communication.

## Raspberry Pi Startup

Linux automatically launches drivewise.py.

The Raspberry Pi loads:

- device_id
- device_secret

No other information is stored on the Raspberry Pi.

## Heartbeat

Every 10 seconds:

Send:

- device_id
- device_secret
- timestamp

to the backend through an Edge Function.

The backend:

- authenticates the device
- updates devices.last_ping

No online flag is stored.

## Device Authentication

`devices.device_secret_hash` stores only a hash of the secret, never the plaintext value. The Raspberry Pi still sends its plaintext `device_secret` on every heartbeat/GPS/alert request (it's the only credential it has); the backend hashes the incoming value and compares it against the stored hash to authenticate the device, the same way a password login is verified. This applies to every Edge Function that authenticates a device (`04`, `05_GPS_PIPELINE.md`, `06_DROWSINESS_ALERT_PIPELINE.md`).

## Online Detection

A device is Online when:

Current Server Time - last_ping <= 30 seconds

Otherwise:

Offline

## Raspberry Pi Shutdown

The Raspberry Pi has no shutdown signal and no bidirectional control channel with the backend — it only ever sends telemetry, it never receives commands (see `00_IMPLEMENTATION_RULES.md`).

Powering off the Raspberry Pi (for any reason, at any time) does exactly this and nothing else:

- Heartbeat stops immediately.
- GPS uploads and drowsiness detection stop immediately — there is no final/clean upload on shutdown.
- No message announces the shutdown. The backend cannot distinguish a deliberate power-off from a lost connection, a crash, or a dead battery.

The backend only detects this passively, through Online Detection below: once `Current Server Time - last_ping > 30 seconds`, the device is Offline.

Powering off the Raspberry Pi never changes Trip or Session status by itself. Trip/Session state is controlled only by the driver's actions in the Driver Web Application (Start/Pause/Resume/End Trip) — never inferred from device power state (see `09_EDGE_CASES.md`).

Recommended driver flow (not enforced by the backend): press Pause Trip or End Trip in the app first, then power off the Raspberry Pi. If the Pi is powered off first without pausing/ending, the Trip and Session remain Active/Paused as applicable, and the dashboard shows Offline (or Monitoring Unavailable if it never connected) until the driver returns to the app.

## Active Session

Heartbeat continues even when no active session exists.

GPS, drowsiness detection, and alert uploads must NOT start unless an active session exists.

Once an active session exists:

- GPS uploads begin.
- Drowsiness detection begins.
- Alert uploads begin.

## Deliverable

Implement heartbeat only.

Do not implement GPS.

Do not implement alerts.