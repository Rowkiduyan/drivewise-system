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

## Helper visibility

**Decided 2026-08-12, not built.** Same precedent as the Helper visibility note in `03_START_TRIP_AND_SESSION.md`: Helper never triggers anything and this adds no new action, only read access to data the Driver's own page already shows.

Give the Helper portal a read-only view of the same `alerts` feed the Driver's `LiveMonitoringCard` shows (alert count/history for the current Trip) — reusing that exact Realtime pattern (seed-fetch the session's existing `alerts` rows, then subscribe to `postgres_changes` `INSERT`s filtered by `session_id`, same as `DriverDeliveries.jsx` already does), rendered into `HelperDeliveries.jsx` alongside the realtime status upgrade planned in `03_START_TRIP_AND_SESSION.md`.

**No audio for the Helper.** The Driver's page plays an audible clip per alert (`Usual Alert.mp3`/`5+ Multiple Alert.mp3`, see `STATUS.md`'s Phase 6 completion entry); the Helper's device should not also play it. The Helper is physically riding in the same cab as the Driver, so the Driver's own device audio is already audible to them — a second `<audio>` element on a second device would double the sound, not add information. Show the count/history visually only.

**No separate GPS/position source either** — see `05_GPS_PIPELINE.md`'s Helper note, same reasoning (one truck, one Pi, one real position per Trip).

## Related, not this phase

Rest-stop recommendations (distance/time-based, not drowsiness-triggered) are a separate, unbuilt feature — see `12_REST_STOP_RECOMMENDATIONS.md`. Do not add a fifth `event_type` to this table for it; that doc explains why.

## Deliverable

Implement alert uploads only.