# Phase 14 - Return-Trip Drowsiness/GPS Monitoring

## Status: built, deployed, and live-verified 2026-09-11/12 (see "Verification results" near the bottom)

## Goal

Close a real gap identified ahead of a capstone panel defense: once a
delivery is marked DELIVERED, `end-trip` closes the driver's Session, and
the Raspberry Pi's drowsiness detection + GPS logging both **stop
entirely**. The driver still has to drive back to the Marvel warehouse —
arguably more fatigued than during the outbound leg — with zero monitoring
and no way to alert them if they become drowsy on that drive. If asked "so
how did you monitor the return trip?" the honest current answer is "we
didn't." This phase adds automatic monitoring for that leg.

## Scope decisions (explicit, already made)

- **Covers only** the drive back to base after a delivery is DELIVERED —
  not the separately-real gap of driving to the *next* pickup (a next
  delivery's Session still only starts once someone manually taps "Start
  Pickup"; that gap is out of scope here, by choice).
- **Starts automatically** the instant a delivery is marked DELIVERED — no
  driver action needed, so a tired driver can't forget to start it.
- **Ends automatically** once GPS shows the driver near the warehouse, or
  the moment they start their next delivery — whichever comes first — plus
  a safety-net max duration so it can never run forever.
- **No Raspberry Pi (hardware/Python) changes required at all** — see
  "Why no Pi changes" below. This is 100% backend (Edge Functions) +
  frontend (React) + one new database column.
- **Phone GPS stays primary, Pi GPS stays the fallback** — same hierarchy
  as every other leg of a trip today (`05_GPS_PIPELINE.md`'s "GPS source
  split"). This phase doesn't change that priority order, it just extends
  both ingestion paths to also handle this new leg.

## Key facts confirmed via code trace (this is what makes "fully automatic" work)

- `device-heartbeat` (`supabase/functions/device-heartbeat/index.ts:79-90`)
  resolves the `session_active` boolean it hands to the Pi purely from
  `sessions.device_id` + `status = 'Active'` — it never looks at
  `delivery_request_id` or the delivery's own status:
  ```js
  const { data: activeSession } = await adminClient
    .from("sessions")
    .select("session_id")
    .eq("device_id", deviceId)
    .eq("status", "Active")
    .maybeSingle();
  return json({ session_active: Boolean(activeSession) });
  ```
  A synthetic "return-trip" Session with `status: 'Active'` on the same
  device will keep the Pi's detection/vibration/alert-upload alive exactly
  as a normal delivery Session does.

- **Why no Pi changes**: the Pi never knows about deliveries, sessions, or
  trip state directly (`04_DEVICE_BOOT_AND_HEARTBEAT.md` — it authenticates
  purely via its own fixed `device_id`/`device_secret`, "it never knows
  session_id, driver_id, or truck_plate"). Every 10s it just asks
  `device-heartbeat` "is there an active session for me right now?" and
  gates detection/vibration/alert-upload on that yes/no. Whatever creates or
  closes that session is an entirely server-side decision. Same for GPS:
  the Pi's own `gps-upload` path authenticates independently and just
  uploads readings whenever a session is open for its device — the
  "arrived near warehouse / been too long" check lives in the Edge Function
  receiving that upload, not in the Pi's script.

- The **phone's** GPS (`DriverDeliveries.jsx`'s `watchPosition` effect,
  ~4544-4613) is gated on `isMonitoring` (`isDrivingStage &&
  workspaceDelivery.hasOpenSession`, ~4010-4014), which in turn requires
  `workspaceDelivery.status` to be `FOR_PICKUP`/`OUT_FOR_DELIVERY`. Once a
  delivery is DELIVERED it's excluded from `nonTerminal`, `workspaceDelivery`
  becomes `null` if nothing else qualifies, and the phone's `watchPosition`
  tears down — **phone GPS goes silent** the moment DELIVERED fires, unless
  the frontend is taught to treat "DELIVERED with an open return-trip
  Session" as a new, still-monitorable pseudo-stage (see Frontend section
  below). This is why a frontend fix is required even though phone GPS
  logging itself is otherwise unchanged — without it, only the Pi's
  fallback path would cover the return leg, which would be a real
  regression from how every other leg works today (phone-first).

- **Real correctness risk to handle, not just a nice-to-have**: the existing
  Route Deviation report (`classifyRouteDeviation`, `11_ROUTE_COMPARISON.md`)
  reconstructs "actual route driven" from *every* Session tied to a
  `delivery_request_id`, and compares it against `suggested_route`'s planned
  distance — which only covers Warehouse → Pickup → Dropoff/Stops,
  **one-way**. If the return-trip Session's GPS gets included in that same
  comparison unfiltered, every delivery would suddenly show a huge, fake
  "deviation" (the entire return drive counted as unplanned extra
  distance), breaking a feature that already works today. This must be
  explicitly excluded from that one comparison while still counting
  normally for drowsiness/alerts reporting (a drowsiness alert on the way
  back should still show up everywhere alerts normally show up).

## Approach

### 1. Schema: mark a Session as a return-trip leg
New migration: `alter table public.sessions add column if not exists
is_return_trip boolean not null default false;` — same lightweight-flag
precedent as `sessions.rest_stop_recommended`
(`20260908120100_sessions_rest_stop_recommended.sql`).

### 2. Backend (`supabase/functions/driver-trip/index.ts`)

**`end-trip`** (~720-836): right after it sets `delivery_requests.status =
"DELIVERED"` and closes the main Session, insert a new `sessions` row for
the same `delivery_request_id`/`driver_id`/`device_id` (same device the
just-closed session used — already resolved earlier in this action):
`status: 'Active'`, `is_return_trip: true`, `start_time: now()`. This is the
"fully automatic start."

**`log-position`** (~149-195) and `gps-upload` (mirror the same check in
both, since either can be the live GPS source): after inserting the reading,
if an Active `is_return_trip` Session exists for this device/delivery:
- If the new position is within ~150m of `WAREHOUSE_COORDS` (duplicate the
  constant server-side — `{ lat: 14.57147, lng: 121.08762 }` — same
  per-Edge-Function duplication convention this codebase already uses for
  `distanceKm`/haversine helpers), close it (`status: 'Completed'`,
  `end_time: now()`).
- Independently, if that Session's `start_time` is older than a safety-net
  max (e.g. 3 hours), close it the same way regardless of position — so a
  driver who never actually returns to base that day (different route home,
  Pi/phone GPS drifts) can't leave it open indefinitely.

**`start-trip`** (~197-325+): before creating the new delivery's Session,
close out any still-Active `is_return_trip` Session for this `driver_id`
(any `delivery_request_id`) the same way — "starting a real trip ends the
return-trip leg," per the decided end condition.

### 3. Frontend (`DriverDeliveries.jsx`) — make the phone GPS/monitoring UI follow the return-trip Session
- `workspaceDelivery` selection (~4179-4183) gets one more fallback tier,
  after the existing three: a DELIVERED delivery that still has an Active
  `is_return_trip` Session for this driver (need to confirm/extend wherever
  `nonTerminal` is filtered upstream so this one delivery isn't excluded
  purely for being DELIVERED).
- New derived flag `isReturningToBase = workspaceDelivery?.status ===
  "DELIVERED" && workspaceDelivery.hasOpenReturnSession`. Extend
  `isMonitoring` to `isDrivingStage || isReturningToBase` so the existing
  phone-GPS `watchPosition` effect and the drowsiness-monitoring panel both
  keep running unchanged — no new GPS-sending code needed, just widening
  the existing condition.
- New render branch for this stage: the existing Drowsiness Monitoring panel
  (unchanged) plus a dedicated live turn-by-turn navigation surface to the
  warehouse. Shipped in two passes — first as a static distance-to-warehouse
  card, then upgraded the same day to full live navigation
  (`ReturnTripNavigationMap`, a new component deliberately separate from
  `LiveNavigationMap` — see this doc's own "Live turn-by-turn navigation for
  the return leg" section below for the shipped design and why it isn't a
  reuse). Includes an optional manual "Arrived at Base" button as a
  fallback for the rare case the automatic geofence never fires (driver
  parks slightly outside the 150m radius, etc.) — a convenience fallback,
  not a contradiction of "starts/ends automatically."

### 4. Keep the Route Deviation report correct
In both `buildRealDriverTripReport` (`DriverDeliveries.jsx`) and
`buildRealTripAndBehaviorReport` (`SupDeliveries.jsx`): when building
`actualPointsWithTime`/`totalMeters` for the `routeDeviation` comparison,
filter out GPS rows whose `session_id` belongs to an `is_return_trip`
Session (fetch `sessions.is_return_trip` alongside the existing
`session_id, start_time, end_time, ...` select, already queried per
delivery in both files). Everything else that already aggregates *all*
Sessions for a delivery — the Trip/Behavior tabs, total alerts, drowsiness
history — keeps including the return-trip leg unfiltered. Label the
return-trip Session distinctly in the Trip tab's per-session breakdown
("Return to Base" instead of implying another delivery leg).

## Files to touch when implemented
- `supabase/migrations/<new>.sql` — `sessions.is_return_trip` column.
- `supabase/functions/driver-trip/index.ts` — `end-trip` (auto-create),
  `log-position` (geofence + timeout auto-close), `start-trip` (close on
  next real trip).
- `supabase/functions/gps-upload/index.ts` — same geofence + timeout check
  as `log-position`, for the Pi's independent GPS path.
- `src/pages/DriverDeliveries.jsx` — `workspaceDelivery` tier,
  `isReturningToBase`/`isMonitoring` widening, new minimal render branch,
  `buildRealDriverTripReport`'s route-deviation exclusion + session
  labeling.
- `src/pages/SupDeliveries.jsx` — same route-deviation exclusion in
  `buildRealTripAndBehaviorReport`, same session labeling for the
  Supervisor's view.
- `src/docs/DATABASE.md` — document the new `sessions.is_return_trip` column.

## Verification plan (original, written before implementation)
- `npm run build` / `npx eslint .` clean.
- Live: complete a real delivery (Helper finishes last item) — confirm a
  new `Active`, `is_return_trip` Session appears immediately, the driver's
  screen shows "Returning to Base" with drowsiness monitoring still live,
  and phone GPS pings keep landing in `gps_logs` for that delivery.
- Simulate GPS arriving within ~150m of the warehouse address — confirm the
  return-trip Session auto-closes and the driver's screen returns to
  "Nothing scheduled" (or the next delivery, if one exists).
- Start a new delivery's trip while a return-trip Session is still open —
  confirm it gets closed as part of `start-trip`.
- Open that delivery's completed report (Driver + Supervisor) — confirm the
  Route Deviation tab's planned/actual distance still matches pre-feature
  behavior (return leg excluded), while the Trip/Behavior tabs show the
  return-trip Session's drowsiness data, labeled distinctly.
- Force a drowsiness alert during the return-trip Session (or seed one) —
  confirm it surfaces exactly like any other alert (vibration precedent,
  Supervisor's real-time alert dashboard) with no special-casing needed.

Superseded by "Verification results" near the bottom of this doc, which
records what was actually run against the live project and what each
result was — not started a real delivery end-to-end (that needs a live
driver/Helper walkthrough), but every backend action and the frontend
render path were each exercised directly instead.

## Open questions, resolved during implementation (2026-09-11)
- **`nonTerminal` filtering location**: client-side, in `DriverDeliveries.jsx`'s
  `loadDeliveries` (`mapped.filter(...)`). Resolved without adding any new
  field to `get-driver-deliveries`: a DELIVERED delivery's `hasOpenSession`
  can only be `true` because of a return-trip Session, since `end-trip`
  closes the real Session and only *then* flips `status` to DELIVERED,
  before it ever opens the return-trip one — there's no window where a
  genuine delivery-in-progress Session could make this true for an
  already-DELIVERED row. So `status === "DELIVERED" && hasOpenSession` alone
  is a safe, sufficient signal for "this is the return leg," reused
  everywhere the frontend needs to tell them apart (`isReturnTrip`,
  `DriverDeliveries.jsx`).
- **Truck mileage accounting**: decided yes, counted the same way End
  Trip/Pause Trip already do — `driver-trip`'s new `closeReturnTripSession`
  helper (shared by `log-position`'s auto-close, `start-trip`'s forced
  close, and the manual `end-return-trip` action) sums the return Session's
  own `gps_logs` and adds it to `trucks.current_mileage`, duplicated in
  `gps-upload/index.ts` for the Pi's independent auto-close path (same
  per-Edge-Function duplication convention as `distanceKm` elsewhere).

## Built 2026-09-11
- `supabase/migrations/20260911150000_sessions_is_return_trip.sql` —
  `sessions.is_return_trip`, approved and deployed.
- `driver-trip`'s `end-trip` opens the return-trip Session (best-effort,
  never turns End Trip itself into a failure); `log-position` and
  `start-trip` gained the geofence/timeout auto-close and forced-close
  described above; a new `end-return-trip` action is the manual "I've
  Arrived at Base" fallback. `gps-upload/index.ts` mirrors the same
  auto-close for the Pi's independent GPS path.
- `DriverDeliveries.jsx`: `nonTerminal`/`isReturnTrip`/`isMonitoring` wired
  as described above; the live workspace gets a dedicated minimal branch
  for this stage (a "Returning to Base" card with a distance-to-warehouse
  readout, reusing the existing static-embed pattern rather than
  `LiveNavigationMap`, whose props are all pickup/dropoff-leg shaped) and
  its own sticky footer (just the manual arrival button — Pause/Arrived/
  Advance don't apply to this leg).
- Route Deviation exclusion + "Return to Base" per-session labeling landed
  in both `buildRealDriverTripReport` (`DriverDeliveries.jsx`, shared by
  `HelperDeliveries.jsx`) and `buildRealTripAndBehaviorReport`
  (`SupDeliveries.jsx`) — all three sessions fetches now select
  `is_return_trip`.
- **Correctness bug caught and fixed in the same pass, not by the original
  plan above**: both report-builders picked "Delivery Completed"'s
  timestamp (Timeline/History, and `SupDeliveries.jsx`'s `deliveredAt`
  fallback) from the chronologically-last Session. Once a return-trip
  Session exists it always sorts last, which would have silently shown
  "when the driver got back to base" as the delivery's completion time
  instead of when it actually happened. Fixed by deriving that timestamp
  from the last *non*-return-trip Session (`lastMainSession`) instead —
  `totalDurationSec`/`totalMeters` (Trip/Behavior tabs' own "driven today"
  figures) deliberately still sum every Session, unaffected.
- Build/lint-verified (`npm run build`, `eslint`) both pass; not yet
  live-verified end-to-end against a real Supabase project (would need a
  live delivery driven to DELIVERED, simulated GPS approaching the
  warehouse, and a completed-trip report review to actually exercise the
  full path).
- Migration pushed and both Edge Functions (`driver-trip`, `gps-upload`)
  deployed to the live project 2026-09-11; `service_role` grants on
  `sessions`/`trucks` confirmed already sufficient (no new grant needed).
  Demoed live via a disposable seed script (`scripts/seed-dr0053-return-
  trip.mjs`/`cleanup-dr0053-return-trip.mjs`) that opens/closes a real
  return-trip Session on an already-DELIVERED delivery without re-running a
  full delivery cycle.

## Live turn-by-turn navigation for the return leg (upgraded 2026-09-11, per explicit user request)

The first pass above shipped only a static distance-to-warehouse card
("simple distance-to-warehouse indicator," per this doc's original plan).
Per explicit user request after seeing it, upgraded to full live turn-by-
turn navigation — same visual language as the outbound `LiveNavigationMap`
(tilted/rotating camera, turn-by-turn voice guidance, fullscreen mode, live
arrow marker) — but as a **new, separate component**
(`ReturnTripNavigationMap`, `DriverDeliveries.jsx`), not `LiveNavigationMap`
reused with extra props, per explicit user instruction that this stay
"separate from the planned route and all."

Why separate rather than reused: `LiveNavigationMap` is built entirely
around the customer-booked `suggested_route` — stops/waypoints, pickup/
dropoff pins, per-leg color indexing, and critically its reroute-on-
deviation effect, which calls `driver-trip`'s `log-reroute` action so the
post-trip Route Deviation verdict (`classifyRouteDeviation`,
`11_ROUTE_COMPARISON.md`) can tell an app-initiated reroute apart from
unexplained deviation. The return leg has no `suggested_route` to compare
against at all — `11_ROUTE_COMPARISON.md`'s Route Deviation comparison
explicitly excludes this leg's GPS entirely (see this doc's own "Keep the
Route Deviation report correct" section above). Grafting return-trip nav
onto `LiveNavigationMap` would mean either logging fake "reroutes" against
a planned route this leg was never part of, or threading a new "skip the
logging" flag through code that currently assumes it always applies to a
real Trip leg. `ReturnTripNavigationMap` has no waypoints/pickup/dropoff
concepts, a single origin (live GPS) → fixed destination
(`WAREHOUSE_COORDS`) route, and never calls `log-reroute` — its own
recompute-on-deviation effect (same `isLocationOnEdge`/debounce mechanism)
just silently recomputes the route, nothing more.

Reused as-is from `LiveNavigationMap`: the `moveCamera()`-based tilt/
rotation/recenter logic (avoids the same setCenter()-resets-tilt bug that
one's own header comment documents), the turn-by-turn step-advance effect,
`SpeechSynthesisUtterance` voice guidance (shares the same
`driverNavMuted` localStorage mute preference), the fullscreen toggle, the
"Recenter" button, and the route-request timeout/retry pattern
(`ROUTE_REQUEST_TIMEOUT_MS`/`ROUTE_RETRY_DELAY_MS`). Distinguishing visual
choices, deliberate: the route polyline is a fixed color (`#0891b2`, cyan)
rather than `NAV_LEG_COLORS`-indexed (that palette's whole point is
distinguishing consecutive legs of the planned chain, which this isn't
part of), and the destination marker reuses the existing
`warehouseMarkerIcon()` (already used by `PlannedRouteMap` for the same
Warehouse point) rather than the pickup/dropoff package/flag icons, which
would misleadingly imply this is a delivery leg.

## Verification results (final, 2026-09-11/12)

Two pre-existing TS-only errors unrelated to this phase (in the earlier,
separately-built `log-reroute`/`tag-reroute-reason` reroute-tagging code —
an implicit-`any` callback param and an embedded-resource type the untyped
Supabase client infers as an array) were fixed in passing while confirming
this phase's own code type-checks cleanly; `driver-trip` was redeployed
after. Not a behavior change, purely type annotations.

**Static checks** — `npm run build`, `eslint` (whole `src/`), `deno check`
(both touched Edge Functions): all clean.

**Deployed to the live project**: migration pushed
(`sessions.is_return_trip` confirmed present), `driver-trip` and
`gps-upload` both deployed, `service_role` grants on `sessions`/`trucks`
confirmed already sufficient (queried `information_schema.role_table_grants`
directly — no new grant migration needed).

**Backend, exercised directly against the deployed functions (not just
read from code)**:
- `log-position`'s geofence auto-close — driver-authenticated call with a
  point ~30m from `WAREHOUSE_COORDS`: session correctly flipped to
  `Completed` with `end_time` set. **PASS**
- `end-return-trip` (manual fallback) — closed a fresh Active return-trip
  session on request. **PASS**
- `end-return-trip` called with nothing open — correctly `400`s
  ("No active return-trip session found for this delivery") instead of
  crashing. **PASS**
- `gps-upload`'s geofence auto-close — via a disposable test device
  (`device_id`/`device_secret` auth, exactly like a real Pi, registered and
  fully removed afterward): two GPS points ending near the warehouse
  correctly closed the session **and** summed real distance into
  `trucks.current_mileage` (+2.2km, matching the actual distance between
  the two test points). **PASS**
- `start-trip`'s force-close of an open return-trip session was **not**
  independently exercised live (would have required disturbing a real
  driver's actually-`ASSIGNED` delivery to trigger a genuine `start-trip`
  call) — verified by code review instead: it's a fourth call site of the
  same `closeReturnTripSession` helper the two tests above already proved
  correct, wrapped in a straightforward select-then-call with no additional
  logic of its own.

**The actual correctness guarantee this phase exists to protect, verified
with real data, not just inspection**: inserted real `gps_logs` rows on a
return-trip session tracing Quezon City → the warehouse (a genuine ~60km
detour relative to a real delivery's actual planned/actual route), then
confirmed the Supervisor's Route Deviation Report numbers were byte-for-byte
unchanged before and after (`Actual Distance: 101.4 km`, `Deviation: 86.1
km`, `561%`, all identical). Without the `mainSessions`/`mainTotalMeters`
exclusion this phase adds, that ~60km detour would have leaked into the
comparison and produced a false, inflated deviation reading — the exact
regression `11_ROUTE_COMPARISON.md`'s original design flagged as a real
risk. Test-only rows removed afterward.

**Frontend, live browser (real login, real Supabase project, Playwright)**:
- Driver portal, D002, a delivery in the return-trip state — the
  `ReturnTripNavigationMap` live-nav card renders, computes and draws a
  real route (distance/ETA header populated), no uncaught page errors. The
  one console message present (`Vector Map... falling back to Raster`) is
  a pre-existing, already-documented (`STATUS.md`, 2026-08-12) headless/
  no-GPU limitation, not introduced by this phase — real driver phones have
  hardware WebGL by default.
- Regression check, Driver portal, a normal delivery with no return-trip
  Session (DR-0057) — Trip/Behavior/Route tabs all render correctly, no
  errors. Confirms `mainSessions`/`lastMainSession` are a no-op when there's
  nothing to exclude, as designed.
- Regression check, Supervisor portal, same delivery — Trip Details/
  DriveWise Report/Route Deviation Report all render, no errors.
  Supervisor's DriveWise Report also confirmed the **"RETURN TO BASE"**
  per-session label renders correctly for a delivery that does have one
  (DR-0053).
- Bonus finding, not a deliberate test: the live-nav browser test's real
  `watchPosition` ticks actually flowed through `log-position` into
  `gps_logs` for the return-trip session — confirms the frontend → Edge
  Function → DB path is genuinely wired end-to-end for this leg, not just
  rendering correctly in isolation.

**Not covered by this pass** (flagged honestly, not swept under a "done"
label): a real end-to-end walkthrough (Driver/Helper driving an actual
delivery to DELIVERED, then physically approaching the real warehouse
address) — everything that walkthrough would exercise was instead verified
in the pieces above (each Edge Function action called directly, the
frontend render path confirmed live, the Route Deviation exclusion proven
with real inserted data), but the pieces were never chained through one
continuous real drive. Left as the one remaining gap if a fully live
hardware/road test is wanted before the panel defense.

## Remaining test gaps and how to close them (deferred to 2026-09-13, user's own manual pass)

Two things weren't independently exercised in the pass above — flagged
rather than assumed fine:

1. **`start-trip`'s force-close of a still-open return-trip Session.**
   Confirmed correct by code review (it's a fourth call site of the same
   `closeReturnTripSession` helper the geofence-auto-close and manual-close
   tests above already proved works), but never actually triggered live —
   doing so would have meant calling `start-trip` for real, which requires
   a delivery genuinely in `ASSIGNED`/`OUT_FOR_PICKUP` status, and the only
   one available for D002 right now (`DR-0065`) is a real assignment that
   shouldn't be disturbed for a test.

   **Recommended fix**: create one disposable `delivery_requests` row
   (status `ASSIGNED`, assigned to D002, same throwaway-fixture pattern
   `scripts/repro-real-gps-pipeline.mjs` already uses for `DR-0020`), open
   a fake Active `is_return_trip` Session for D002 on a *different*
   delivery, call `driver-trip`'s `start-trip` against the disposable
   delivery, confirm the return-trip Session got closed, then delete the
   disposable delivery. ~15 minutes, zero risk to real data.

2. **One continuous real-life walkthrough** (Helper completes the last
   item → `end-trip` fires → return-trip Session opens → driver drives →
   GPS nears the warehouse → auto-closes) — every individual piece of this
   was verified separately above (each backend action, the live-nav render,
   the Route Deviation exclusion), but never chained through one real,
   continuous drive. Best done manually, close to whenever this needs to be
   demoed, rather than scripted — the point of this one is that it's
   genuinely live, not simulated piece-by-piece.

Both deferred to the user's own testing pass, 2026-09-13.

## Unrelated fix: gps-upload/index.ts line endings (2026-09-12)

Found while working in this area, not a Phase 14 bug: `gps-upload/index.ts`
had CRLF line endings throughout (all 221 lines), while this repo's
`.gitattributes` (`* text=auto eol=lf`) forces LF for all text files and
`core.safecrlf=true` is set — the mismatch made every `git` operation
touching this file (`add`, `commit`, `stash`) fail with `fatal: CRLF would
be replaced by LF`. `driver-trip/index.ts` and every other Edge Function
already used LF; this one file didn't, for reasons predating this session.
Fixed by normalizing it to LF (confirmed via a byte-level check, not just
`file`/`grep`, which gave misleading results on Windows) and redeploying —
no functional change, Deno doesn't care about source line endings either
way.
