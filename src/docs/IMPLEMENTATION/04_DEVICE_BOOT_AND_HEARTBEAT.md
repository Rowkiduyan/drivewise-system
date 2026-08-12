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
- resolves whether an active Session currently exists for this device

No online flag is stored.

The backend's response includes one field back to the Raspberry Pi:

- session_active (boolean)

Decided 2026-08-08: this is the only thing the backend ever sends back on a heartbeat, and it is a status readback, not a command — see the Raspberry Pi Shutdown section below for why that distinction matters. It exists so Pause Trip has a real effect on the physical device (see `03B_PAUSE_AND_RESUME_TRIP.md`): without it, pausing a Trip in the Driver Web Application had no way to reach the Raspberry Pi at all, and the only way to actually stop detection/vibration was manually powering the device off.

## Device Authentication

`devices.device_secret_hash` stores only a hash of the secret, never the plaintext value. The Raspberry Pi still sends its plaintext `device_secret` on every heartbeat/GPS/alert request (it's the only credential it has); the backend hashes the incoming value and compares it against the stored hash to authenticate the device, the same way a password login is verified. This applies to every Edge Function that authenticates a device (`04`, `05_GPS_PIPELINE.md`, `06_DROWSINESS_ALERT_PIPELINE.md`).

## Online Detection

A device is Online when:

Current Server Time - last_ping <= 30 seconds

Otherwise:

Offline

## Raspberry Pi Shutdown

The Raspberry Pi has no shutdown signal and no command channel with the backend — it only ever sends telemetry and reads back its own `session_active` status (see Heartbeat above); the backend never pushes an instruction to the Pi, and the Pi never receives or executes commands (see `00_IMPLEMENTATION_RULES.md`). This is a deliberate, narrower exception to "telemetry only," not a general bidirectional channel — if a future need calls for the backend to actually instruct the Pi to do something, that is a separate decision, not an extension of this one.

Powering off the Raspberry Pi (for any reason, at any time) does exactly this and nothing else:

- Heartbeat stops immediately.
- GPS uploads and drowsiness detection stop immediately — there is no final/clean upload on shutdown.
- No message announces the shutdown. The backend cannot distinguish a deliberate power-off from a lost connection, a crash, or a dead battery.

The backend only detects this passively, through Online Detection below: once `Current Server Time - last_ping > 30 seconds`, the device is Offline.

Powering off the Raspberry Pi never changes Trip or Session status by itself. Trip/Session state is controlled only by the driver's actions in the Driver Web Application (Start/Pause/Resume/End Trip) — never inferred from device power state (see `09_EDGE_CASES.md`).

Recommended driver flow (not enforced by the backend): press Pause Trip or End Trip in the app first, then power off the Raspberry Pi. If the Pi is powered off first without pausing/ending, the Trip and Session remain Active/Paused as applicable, and the dashboard shows Offline (or Monitoring Unavailable if it never connected) until the driver returns to the app.

## Active Session

Heartbeat continues even when no active session exists.

Drowsiness detection and alert uploads must NOT start unless an active session exists. GPS is a partial exception — see the note below, decided 2026-08-08, superseding the original "all three gated identically" design this section first described.

Once an active session exists:

- GPS uploads begin (though see below — GPS is meant to also run during a Pause, not only while a Session is Active).
- Drowsiness detection begins.
- Alert uploads begin.

Mechanism for detection/vibration/alerts (decided 2026-08-08, resolves how the Raspberry Pi — which never knows `session_id` and previously had no way to learn session state at all, see `00_IMPLEMENTATION_RULES.md` — can actually gate any of this locally): the Pi reads `session_active` off every heartbeat response and starts/stops drowsiness detection (including the vibration motor) and alert uploads accordingly, on its own, within one heartbeat interval (~10 seconds) of a Pause/Resume/Start/End Trip action. This makes Pause Trip's effect on the physical device immediate and automatic for these three — powering the Pi off during a pause (`Raspberry Pi Shutdown` above) becomes optional, not the only way to stop them. Implemented in code as of the 2026-08-11 `pi/drowsiness_monitor.py` rewrite (reads `session_active` off every heartbeat, gates detection/vibration/`alert-upload` on it) — hardware-verified for detection/`alert-upload` themselves, and **bench-tested end-to-end 2026-08-12** (see `STATUS.md`): Pause Trip flipped `session_active` to `false` and silenced detection/vibration/alert-upload well within the 10s heartbeat interval; Resume correctly restored it. Confirmed working, not just implemented.

GPS is different (decided 2026-08-08, mechanism resolved 2026-08-10 — see `05_GPS_PIPELINE.md`'s "GPS-during-Pause" note): it keeps flowing during a Pause for anti-theft/asset-visibility reasons, so it cannot simply be gated on `session_active` the way the other three are — that flag goes false exactly when Pause happens, which is the one moment GPS should keep working. Resolved not by a Pi-side gating flag at all, but backend-side: the Pi keeps sending GPS unconditionally whenever it's running, and the backend (not the Pi) decides whether to accept/attribute each reading, based on whether the device's Trip is still in progress (Active or Paused) — see `05_GPS_PIPELINE.md`'s backend lookup logic. `session_active` as specified above remains the right (and only) signal for detection/vibration/alerts; it was never meant to gate GPS.

## Deliverable

Implement heartbeat only.

Do not implement GPS.

Do not implement alerts.

Backend implemented 2026-08-11: the `device-heartbeat` Edge Function authenticates `device_id`/`device_secret` against `devices.device_secret_hash`, updates `last_ping`, resolves `session_active` from `sessions` (`device_id` + `status = 'Active'`), and returns `{ session_active }` — nothing else, per the Heartbeat section above. Device registration (generating `device_secret`, hashing it into `device_secret_hash`, and showing the plaintext to the Admin exactly once) is handled by the `admin-users` Edge Function's `register-device` action, called from `RegisterDeviceModal.jsx`.

Pi-side heartbeat sending itself is now implemented: `pi/drowsiness_monitor.py` (added 2026-08-11, hardware-verified against a real Pi 4 and the live backend) calls `device-heartbeat` every 10s and reads back `session_active`, gating detection/vibration/`alert-upload` on it as described in "Active Session" above — bench-tested end-to-end 2026-08-12, see that section's note. Not implemented: auto-launching this script on boot (a `systemd` unit — see `pi/README.md`'s "Not done here" section, still open as of 2026-08-12).