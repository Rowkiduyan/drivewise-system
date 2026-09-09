# Phase 5 - GPS Pipeline

## Goal

Implement GPS uploads.

## Required Schema

Resolved 2026-08-08, updated 2026-08-10: `gps_logs` now exists (id, `session_id` text FK to `sessions.session_id` — nullable, `delivery_request_id` text FK to `delivery_requests.id` — not null, latitude, longitude, timestamp, created_at — see `DATABASE.md`). Originally locked to `service_role` only; as of 2026-08-12, `authenticated` also has a `select` grant + RLS policy (added for the Driver-navigation live map, see `DATABASE.md`'s `gps_logs` entry for the full grant/RLS/Realtime-publication history) — a broader Supervisor-dashboard read path is still its own decision for `08_REALTIME_DASHBOARD.md`, not this phase.

## Rules

GPS uploads occur whenever the device's Trip is in progress — Active *or* Paused (see "GPS-during-Pause" below), not only while a Session happens to be open.

Every 1 second:

Read GPS.

If GPS is unavailable:

Skip upload.

Continue heartbeat.

Send:

- device_id
- device_secret
- latitude
- longitude
- timestamp

The backend:

- authenticates the device
- resolves the device's truck (`devices.plate_number`)
- finds the most recent `sessions` row for that `device_id` (there is at most one Trip in progress per device at a time)
- takes that session's `delivery_request_id` — this is always set on `gps_logs`, whether or not a Session is currently open (see "GPS-during-Pause" below)
- if that session is still open (`status = Active`), also sets `session_id`; if it's closed (Paused) but its `delivery_request_id`'s Trip hasn't been ended (`delivery_requests.status` is not yet `DELIVERED` — End Trip is the only Trip action that touches `status`, per `07_END_TRIP.md`), leaves `session_id` null and still inserts
- if the most recent session's Trip has already ended (`status = DELIVERED`/`COMPLETED`/`CANCELLED`), rejects the upload — there is no Trip in progress for this device
- inserts a gps_logs record

The Raspberry Pi never knows session_id or delivery_request_id.

The backend performs the lookup.

Stored GPS logs must remain attributable to their Session (and, through the Session, their Trip) in chronological order — this is what lets a Trip's actual route be reconstructed for Route Comparison against its suggested route (see `01_SYSTEM_ARCHITECTURE.md`). A Trip that spans multiple Sessions (e.g. after a Pause/Resume) reconstructs its route by combining GPS logs from all of its Sessions, in order.

The same per-Session GPS log also drives truck mileage tracking (see `03B_PAUSE_AND_RESUME_TRIP.md`/`07_END_TRIP.md`): distance driven is the sum of the point-to-point distances between consecutive `gps_logs` rows within that Session, added to `trucks.current_mileage` when the Session closes (Pause or End Trip). Computing it per-Session, not per-Trip, means it stays correct even if the assigned truck ever changes between Sessions of the same Trip (see the truck-swap decision in `02_BOOKING_AND_TRIP_CREATION.md`) — each Session's mileage always goes to whichever truck it actually used.

**GPS-during-Pause (decided 2026-08-08, mechanism resolved 2026-08-10):** GPS tracking continues while a Trip is Paused, for anti-theft/asset-visibility reasons — a Supervisor should be able to see where the truck actually is even if the driver paused (see `03B_PAUSE_AND_RESUME_TRIP.md`). `pause-trip` (`driver-trip` Edge Function, built 2026-08-08) closes the Session outright (`end_time` set, `status = Completed`), so a GPS point captured during a Pause has no open Session to attach to.

Resolved: `gps_logs.session_id` is now nullable, and a `delivery_request_id` column (not null, see `DATABASE.md`) attributes every reading to its Trip directly, independent of Session state — GPS keeps flowing whenever a Trip is in progress, i.e. from Start Trip until End Trip, Paused or not (see the backend lookup logic above). `session_id` is still set whenever a Session happens to be open, so per-Session route reconstruction and mileage calculation (which only ever look at Active-Session readings) are unaffected — this only adds attribution for the gap where a Session is closed but the Trip isn't over.

The alternative considered and rejected: not closing the Session on Pause at all, reintroducing a real "Paused" status on `sessions` instead of ending it. Rejected because it would reverse `03B_PAUSE_AND_RESUME_TRIP.md`'s "Paused isn't a stored value anywhere" decision and require reworking the already-implemented/tested `pause-trip` mileage-on-close behavior, for no benefit over the chosen approach.

Downstream of this: whether a truck observed moving while its Trip is Paused should be flagged to a Supervisor as an anomaly is a separate question, now decided — see `08_REALTIME_DASHBOARD.md`'s Map Display section (decided 2026-08-12).

**Helper never gets its own GPS source (decided 2026-08-12, not built — planned alongside the Helper alert-visibility note in `06_DROWSINESS_ALERT_PIPELINE.md`):** if a live-position/map view is ever built for the Helper portal, it must read the *same* `gps_logs` rows the Driver's own `LiveNavigationMap` already reads (same `delivery_request_id`/`session_id`, same Realtime subscription pattern) — never a second, independently-sourced position for the Helper's own device. Reasoning: the Helper rides along in the same physical truck as the Driver for the whole Trip (see `UI/LAYOUT.md`'s Mobile section), so there is exactly one real position per Trip, already produced by the one Raspberry Pi mounted in that truck; a second GPS source would be redundant at best and a source of drift/disagreement at worst, and `gps_logs` itself has no concept of "whose device" a reading came from — it's scoped to the truck/device, not a user. This mirrors the existing rule that only the Driver ever triggers Start/Pause/Resume/End Trip — Helper is a read-only passenger on this Trip's data in every other respect too.

**GPS Source Split — Driver's own live nav view now phone-sourced (decided 2026-08-31):** the note above (a second GPS source is redundant) was written for a second read-only *display* of the same Trip — it does not apply here, because the Driver's `LiveNavigationMap` is the position's *consumer*, not a second Trip record. `LiveNavigationMap` now sources its `livePosition` primarily from the driver's own phone GPS (`navigator.geolocation.watchPosition`, client-side only, never written to `gps_logs`), falling back to the existing `gps_logs` Realtime feed only when the phone has no reading (permission denied, no signal, unsupported). This does not change anything above: `gps_logs` is still written exclusively by the Pi via `gps-upload`, unchanged in shape or cadence, and remains the sole source for truck mileage and Route Comparison — those need one authoritative, device-attributed record of where the truck actually was, which is exactly what the Pi provides and what phone GPS (ephemeral, browser-local, never persisted) cannot substitute for.

**Supervisor Dashboard live-view extension, 2026-09-03 (per user request, easier demo/testing without needing Pi hardware present):** the Supervisor Dashboard's *live-view map/marker only* — not mileage, not Route Comparison — now also optionally prefers the driver's phone GPS, mirroring the same fallback the Driver's own nav uses. At the time, this did **not** reuse `gps_logs` for it (see the correction directly below — that reasoning no longer holds). Instead, `DriverDeliveries.jsx`'s phone-GPS `watchPosition` effect also sends each reading over a new, ephemeral Supabase Realtime **broadcast** channel (`phone-gps-<deliveryId>`, no schema/grant/RLS involved — broadcast is independent of table Realtime publications), which `SupDashboard.jsx` joins per in-progress delivery and prefers when a reading has arrived in the last 20s, falling back to the existing `gps_logs`-sourced position otherwise. See `STATUS.md`'s 2026-09-03 entry for the full implementation/verification writeup. **The broadcast channel itself is unaffected by the correction below and still exists** — the same `watchPosition` tick now both broadcasts and persists.

**Correction, 2026-09-09 — the two entries above's "Pi-only"/"never written to `gps_logs`" claims are reversed, by explicit user decision.** Phone GPS is now the **primary persisted** source: a new `driver-trip` Edge Function action, `log-position` (Driver-JWT-authenticated — a phone can't use `gps-upload`'s device-secret auth, which is Pi-only), inserts phone readings directly into `gps_logs` (throttled to ~1/s to match the Pi's own cadence), with `session_id` resolved the same way `gps-upload` already does (Active session or null while Paused). `gps-upload`'s own Pi path is completely unchanged and still writes to the same table — it's now the **fallback** for whenever a phone isn't actively broadcasting (no permission, tab closed), not the sole authoritative source described above. This means mileage summation, Route Comparison, and the proof-of-location check (`checkProofLocation`) all now see real phone data whenever a phone is broadcasting, not only Pi data. See `project_gps_source_split` (session memory) and `STATUS.md`'s 2026-09-09 entry for the full writeup — treat every "Pi-only"/"authoritative"/"never persisted" claim above this line as historical context, not current behavior.

## Deliverable

Implement GPS upload only.