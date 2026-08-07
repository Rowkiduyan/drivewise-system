# Phase 6 - Drowsiness Alerts

## Goal

Implement real-time alert uploads.

## Required Schema

The upload payload below does not match `DATABASE.md`'s existing `alerts` table. `DATABASE.md` has `event_type` and `duration`; this phase's payload has `alert_type` and `metadata`, with no `duration`. Per `00_IMPLEMENTATION_RULES.md`, this is reported rather than assumed — confirm before implementing whether:

- `event_type`/`alert_type` is a rename (pick one name) or two distinct fields.
- `metadata` (shape TBD — e.g. JSONB) is added to `alerts`.
- `duration` is still populated (and if so, by what — is it sent by the Raspberry Pi, or computed by the backend from consecutive alerts?), or dropped from the table.

## Rules

Only active sessions may generate alerts.

When a detection threshold is reached:

Immediately upload:

- device_id
- device_secret
- alert_type
- timestamp
- metadata

The backend:

- authenticates the device
- finds the active session
- inserts an alerts record

Alerts are uploaded immediately.

Do not store alerts until the trip ends.

## Driver-Facing Audio Alert

`DROWSINESS.md` already documents that an audio alert must reach the driver's web application when drowsiness is detected (alongside the Raspberry Pi's own vibration motor, which is hardware-only and separate from this). This is possible in a web app — browsers can play sound with no native app required — but it needs its own delivery path, since the upload above only gets the alert into the `alerts` table, it doesn't push anything to the driver.

Mechanism: the Driver Web Application subscribes (Supabase Realtime) to new rows in `alerts` for its own active session. On receiving one, it plays a sound client-side (an `<audio>` element or the Web Audio API).

One browser-specific caveat to design around: browsers block audio from autoplaying without a prior user interaction on the page. Pressing Start Trip counts as that interaction, so audio playback should be "unlocked" (e.g. play-and-immediately-pause a silent clip) at that point, rather than assuming the first real alert can just play on its own.

## Deliverable

Implement alert uploads only.