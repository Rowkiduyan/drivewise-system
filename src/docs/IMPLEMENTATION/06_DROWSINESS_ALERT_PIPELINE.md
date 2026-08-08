# Phase 6 - Drowsiness Alerts

## Goal

Implement real-time alert uploads.

## Required Schema

Resolved 2026-08-08 — no schema change needed, only the payload below was wrong:

- Use `event_type` (the real column), not `alert_type` — per `00_IMPLEMENTATION_RULES.md`'s rule against renaming existing columns, the docs were fixed instead of the table.
- No `metadata` column — nothing in `DROWSINESS.md`'s "Data Produced" section calls for one; not adding a column nothing needs.
- `duration` is populated by the Raspberry Pi directly — its detection logic already measures duration (e.g. "eyes closed continuously for 3 seconds") before sending the alert, so the backend doesn't need to compute it.

Decided 2026-08-08 — `event_type` uses these four values, matching `DROWSINESS.md`'s detection conditions:

- `prolonged_eye_closure` — Continuous Eye Closure
- `pattern_eye_closure_yawn` — Eye Closure + Yawning
- `pattern_repeated_eye_closure` — Repeated Eye Closure
- `face_not_detected` — Eyes Not Detected

The first three reuse `SupAnalysisIndiv.jsx`'s existing `ALERT_TYPE_LABELS` values as-is, since that UI is already built around them. `face_not_detected` is new — `DROWSINESS.md`'s fourth condition wasn't in that mock yet, so `ALERT_TYPE_LABELS` (and any other place alert types are enumerated) needs this value added when this phase is implemented.

## Rules

Only active sessions may generate alerts.

When a detection threshold is reached:

Immediately upload:

- device_id
- device_secret
- event_type
- duration

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