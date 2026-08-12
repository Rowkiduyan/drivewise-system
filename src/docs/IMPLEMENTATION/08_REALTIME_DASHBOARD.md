# Phase 8 - Dashboard

## Goal

Implement real-time monitoring.

Display:

- Trip Status
- Device Status
- Last Heartbeat
- Current GPS
- Latest Alerts

## Monitoring Status

The dashboard must distinguish between:

- Waiting for Device
- Online
- Offline
- Monitoring Unavailable

Monitoring Unavailable means the Trip has started, but the Raspberry Pi has never connected. Supervisors should clearly understand that the driver is on an active Trip but telemetry is unavailable — not that the driver is idle or the Trip has stalled.

Monitoring Unavailable reuses `DEVICE_OFFLINE_TIMEOUT` (30 seconds, see `PROJECT_CONSTRAINTS.md`) — no separate threshold. If `Current Server Time - Session.start_time > 30 seconds` and the device has never sent a heartbeat for this Session, show Monitoring Unavailable instead of Waiting for Device. Before that 30 seconds elapses, show Waiting for Device. Once at least one heartbeat has been received for the Session, the state is governed by Online/Offline (`devices.last_ping`) instead, never Monitoring Unavailable again for that Session.

The dashboard determines online status using `devices.last_ping`.

No online boolean should exist.

## Map Display

Current GPS is rendered on a Google Maps view — the truck's live position as a marker, updated as new `gps_logs` rows come in. This is the Supervisor-facing tracking view; the Driver's own navigation view (showing the suggested route while driving) is separate — see `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section, which as of 2026-08-12 has the Driver-navigation half of this decided and implemented (Google Maps JavaScript API via `@react-google-maps/api`, driven by a capstone documentation requirement).

**Decided 2026-08-12: this Supervisor Dashboard map reuses the same Google Maps JS API stack (`@react-google-maps/api`), not a separate library.** All the infrastructure is already provisioned and paid for from the Driver-navigation work — API key, vector Map ID, Directions/Routes API enabled, referrer allowlist — and this view's needs are much simpler than Driver navigation's (a live marker per truck, no tilt/rotation/turn-by-turn/route rendering), so it's the low-effort reuse rather than standing up a second mapping stack (e.g. Leaflet, already used elsewhere in the app — see `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section for that existing contradiction, which this deliberately avoids adding a third pattern to). The one tradeoff is Google Maps JS is a paid/metered API vs. free Leaflet+OSM tiles, but since the app already bills for it on the Driver side, this is marginal added usage, not a new cost category.

## Important Rules

The Trip must NOT automatically end because monitoring is unavailable or the device is offline. Trips only end when the driver presses End Trip (see `07_END_TRIP.md` and `09_EDGE_CASES.md`).

Trip Status must also distinguish Paused from Active — not just Online/Offline/Monitoring Unavailable above, which are Device states, not Trip states. Per `03B_PAUSE_AND_RESUME_TRIP.md`, "Paused" isn't a stored value anywhere: compute it the same way the Driver UI does (`hasOpenSession` in `admin-users`' `get-driver-deliveries`, added 2026-08-08) — a delivery whose milestone status is past `ASSIGNED` but has no `sessions` row with `status = Active` is Paused, not Offline. This dashboard is the first Supervisor/Admin-facing surface for Trip/Session state at all; nothing built through Phase 3B exposes it outside the Driver's own view.

**Deferred here from `03B_PAUSE_AND_RESUME_TRIP.md` (decided 2026-08-08):** flagging a truck observed moving while its Trip is Paused as an anomaly is in scope for this phase. As of this writing, GPS-during-Pause is schema/mechanism-resolved but not implemented (`05_GPS_PIPELINE.md`'s "GPS-during-Pause" note) — once it is, a paused-but-moving truck becomes real, visible data for the first time, which is exactly what this note is flagging ahead of time so the gap isn't rediscovered from scratch when this phase starts.

**Decided 2026-08-12:** trigger and surfacing both resolved. Trigger — reuse the same Haversine distance math Pause Trip already runs for mileage (`03B_PAUSE_AND_RESUME_TRIP.md`) against the Paused-but-still-uploading `gps_logs` rows (attributed via `delivery_request_id` per the GPS-during-Pause design, since there's no open Session to key off of): sum cumulative movement since the Pause began, and flag anomalous once it exceeds a threshold comfortably above ordinary GPS drift noise (~100m — exact figure not yet tuned against real drift data, revisit once implemented). Surfacing — a distinct banner state on the truck's/trip's own card, not folded into the Latest Alerts feed: that feed is specifically drowsiness events (a driver-attention concern), while paused-but-moving is a different category entirely (security/theft) that a Supervisor should be able to tell apart from a drowsiness alert at a glance, not by reading alert text.

**Built and live-verified 2026-08-12** — see the Implementation Plan below for what actually shipped (the trigger ended up keyed on `gps_logs.session_id is null` rather than a cached pause-start timestamp, after live testing found the timestamp approach could race and silently drop the first post-pause reading).

## Deliverable

Implement real-time dashboard status display only.

## Implementation Plan (drafted 2026-08-12, built and live-verified 2026-08-12)

Drafted per `00_IMPLEMENTATION_RULES.md`'s "read `DATABASE.md`, verify schema, produce a plan, wait for approval" process, approved in shape by the user, then built and click-tested the same day. See `STATUS.md`'s Phase 8 entry for the full build/test history, including two real bugs found and fixed during live testing (a `devices` RLS gap this schema check didn't anticipate, and a UI/timing bug in the paused-but-moving anomaly detector) — not just what was originally planned.

### Schema/access check (done 2026-08-12; one gap found here was wrong and had to be fixed live)

Unlike Driver/Helper, **Supervisor already has direct RLS read access to almost everything this phase needs** — no new Edge Function:
- `devices` — **this check was wrong.** At plan-drafting time this bullet assumed the old `Allow public read access to devices` policy (`qual: true`, target `public`) still applied. Live-testing found `devices`' SELECT policy had actually already been tightened to Admin-only at some undocumented point before this phase started (see `RLS.md`'s corrected `devices` section) — a Supervisor session got zero rows. Fixed with a new policy scoped to `current_user_role() = ANY(ARRAY['Admin','Supervisor'])`, same pattern as `sessions`. Also note: `select('*')` against this table 403s outright (not just filters rows) because of its column-scoped `authenticated` grant — see `SUPABASE_GOTCHAS.md` #10. Already in the `supabase_realtime` publication.
- `sessions` — `Admins and Supervisors can read sessions` policy (`current_user_role() = ANY(ARRAY['Admin','Supervisor'])`, see `RLS.md`). Already a bare function call, not an inline join — safe for Realtime per `SUPABASE_GOTCHAS.md` #9, no rewrite needed the way Driver/Helper's policies needed one.
- `delivery_requests` — `Supervisors can read all delivery requests` policy (`current_user_role() = 'Supervisor'`), same function-call shape, already Realtime-safe. Already in the publication (added 2026-08-11).
- `alerts` — `authenticated: select` (unscoped, not row-restricted), already in the publication (added during Phase 6).
- `gps_logs` — `authenticated: select` via the `using (true)` policy added 2026-08-12 alongside the Driver-navigation map, already in the publication (added the same day). The two indexes this phase's queries rely on (`(session_id, timestamp)`, `(delivery_request_id, timestamp)`) were also actually created this same day — see `DATABASE.md`'s `gps_logs` entry, which had documented them as designed-but-never-applied since 2026-08-08.

Net effect: this phase was almost pure frontend + realtime-subscription wiring against existing tables, but "almost" mattered — the one schema assumption that turned out stale (`devices`) was still a real blocker until caught live, the same class of gap (`DATABASE.md`/`RLS.md` describing a decision that was never actually applied, or was applied differently than documented) this project has hit repeatedly on other tables.

### Dashboard-reuse decision (decided 2026-08-12)

`SupDashboard.jsx` already exists but is a general "Operations Overview" page (KPI tiles, an `ActiveDeliveries` table, `LiveFleet` truck/crew status bars, `DriverSafetyList`, `RecentActivity`, `WeeklySafetySummary`) — entirely mock data, and a different shape than this phase's actual spec (per-device Online/Offline/Waiting-for-Device/Monitoring-Unavailable states, a live GPS marker map, a Latest Alerts feed, a paused-but-moving anomaly banner). Decided: **wire real data into the panels whose shape already matches, and add net-new UI only for what has no existing slot at all** — not a redesign, per `00_IMPLEMENTATION_RULES.md`'s "Existing UI" and "Missing UI" sections.
- Reuse (wire to real data): `ActiveDeliveries` (add a device-status badge alongside its existing delivery-status badge), `DriverSafetyList` (wire to real `alerts`).
- Net new (no existing UI to wire into): the live GPS map panel, the paused-but-moving anomaly banner.
- Explicitly out of scope, left as mock/untouched: the KPI strip, `LiveFleet`, `RecentActivity`, `WeeklySafetySummary` — general ops-overview content beyond this phase's stated deliverable (Trip Status / Device Status / Last Heartbeat / Current GPS / Latest Alerts).

### The plan

1. **Device/Trip state resolution** (client-side, computed per truck with an assigned device):
   - No session at all for the truck → not shown as an active trip.
   - Session exists, no heartbeat ever received for it, `now - session.start_time ≤ 30s` (`DEVICE_OFFLINE_TIMEOUT`, `PROJECT_CONSTRAINTS.md`) → **Waiting for Device**.
   - Session exists, no heartbeat ever received, `> 30s` → **Monitoring Unavailable** (Trip is running, telemetry never arrived — not "idle").
   - At least one heartbeat received for this session → governed by `devices.last_ping` alone from then on: `now - last_ping ≤ 30s` → **Online**, else **Offline**. Never governed by Monitoring Unavailable again for that Session, per the doc's explicit rule.
   - Trip Status is a separate axis from Device state: `sessions.status = 'Active'` → Active; a delivery past `ASSIGNED` with no open Session → Paused (same `hasOpenSession` computation already used in `get-driver-deliveries`/`get-helper-deliveries`, just via a direct client query here instead of an Edge Function).
2. **Data fetching + realtime**: initial client-side fetch (Supervisor's trucks/deliveries/devices/sessions), then `postgres_changes` subscriptions on `devices` (heartbeat), `sessions` (Active/Paused transitions), `alerts` (Latest Alerts feed), `gps_logs` (live position) — same seed-fetch-then-subscribe pattern already proven in `DriverDeliveries.jsx`/`HelperDeliveries.jsx`.
3. **UI**: `ActiveDeliveries` (its mock `ETA` column was dropped — no real backing data existed anywhere for it — and replaced with real `Trip`/`Device` badge columns, plus a locate/recenter icon per row) + `DriverSafetyList` wired to real data per the reuse decision above; new live GPS map panel (`@react-google-maps/api`, one marker per truck with a live position, `fitBounds` across all of them when more than one, zoom 17 for a single truck — simpler than Driver nav's `LiveNavigationMap`, no tilt/rotation/turn-by-turn/route rendering per the doc's Map Display section); new paused-but-moving banner. **The anomaly trigger ended up keyed on `gps_logs.session_id is null`, not a locally-cached "pause started at" timestamp as first implemented** — see `STATUS.md` for the live-testing bug that motivated the switch; `session_id is null` is the real backend's own marker for "this reading landed during a Pause" (per the GPS-during-Pause design), so it's race-free by construction instead of racing against a Realtime-driven cache. ~100m threshold, still not tuned against real drift data. The locate/recenter icon per truck row (click to pan+zoom the map to that specific truck, works repeatably even on the same truck) wasn't in the original plan — added per user request during testing.
4. **Verification**: `npm run build`/`eslint` clean throughout. Live click-tested 2026-08-12 against a disposable fixture on `DR-0015` (see `STATUS.md` for the full sequence and the three real bugs found/fixed along the way: the `devices` RLS gap above, a `Panel`/Tailwind height-class conflict that silently collapsed the Live GPS panel to nothing, and the `session_id`-vs-timestamp paused-movement race). Online/Offline/Waiting-for-Device/Monitoring-Unavailable, Paused, live map marker movement, the locate button, and the anomaly banner were all confirmed working live, not just build-clean.