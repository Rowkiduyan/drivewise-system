# Phase 2B - Multi-Stop Deliveries

## Goal

Let a Trip visit one or more intermediate locations between pickup and dropoff — still ONE `delivery_requests` row, per `01_SYSTEM_ARCHITECTURE.md`'s Trip definition ("A Trip may... contain one or more planned/delivery stops"). The storage shape was decided back on 2026-08-10 (`02_BOOKING_AND_TRIP_CREATION.md`'s Required Schema gap #2) but never scheduled as a phase or built against — `09_EDGE_CASES.md`'s Phase 9 pre-work check confirmed nothing downstream depended on it. This phase builds it, inserted after Phase 2 (hence `02B`, same lettered-sub-phase pattern as `03B_PAUSE_AND_RESUME_TRIP.md`).

## Decisions

- **Customer-entered only, at booking time.** Same as `pickup_location`/`dropoff_location` today — no Supervisor editing UI. Read-only everywhere after submission.
- **Capped at 5 stops per delivery.** Keeps the booking form and the route/waypoints request simple; mirrors the existing bounded-list feel of `SupDeliveries.jsx`'s 2-helper cap.
- ~~Reference-only — no per-stop status tracking.~~ **Superseded 2026-08-12, see "Photo-Required Chain Completion" below.** Originally decided this way (no Pending/Arrived/Departed per stop, "Stop X of Y" progress purely client-side) — reopened on purpose once the user asked for photo-required completion on every waypoint.
- Stops sit **between** `pickup_location` (first) and `dropoff_location` (second) — they apply only to the driver's dropoff leg (`OUT_FOR_DELIVERY`), never the to-pickup leg. Originally `dropoff_location` was documented as always-last; see below for why that's since changed.

## Photo-Required Chain Completion (2026-08-12)

The real completion order is **Pickup → Dropoff → Stop 1 → ... → Stop N**, not "stops sandwiched between pickup and a fixed final dropoff." `dropoff_location` is the **second** item in the chain, not necessarily the last — confirmed with the user through several rounds of clarification ("a sequence of trips added to each other"). `pickup_location`/`dropoff_location` **stay the real database columns** (load-bearing everywhere else — quotation, distance calc, RLS, Supervisor UI) — this reorder is UI/routing-logic-level, not a schema merge.

Every item in the chain now requires a driver-submitted proof photo to complete. **The Helper does this, not the Driver** — reopens a previously-deliberate decision (`admin-users/index.ts`'s Helper block used to be explicitly read-only, see `03_START_TRIP_AND_SESSION.md`'s "Helper visibility" note, now updated). The Driver keeps only Start Pickup and Pause/Resume Trip — session/device actions tied to the vehicle, not cargo handling.

**Completing the LAST item in the chain — whichever one that is — is what finalizes the delivery** (sets `delivery_requests.status = DELIVERED`, closes the Session via `driver-trip`'s `end-trip`). No separate "Complete Delivery" button exists anymore. Finality is computed dynamically, never stored: completing `dropoff_location` is final only if `stops` is empty; otherwise the last entry of `stops` is final. No ordering is enforced server-side — a Helper can complete stops (or even skip straight to the last one) in any order, which means `dropoff_location` can end up never completed at all if the last stop is completed directly. Accepted as-designed, not a bug.

### Schema

```sql
alter table public.delivery_requests
  add column pickup_photo_url text,
  add column dropoff_photo_url text,
  add column dropoff_completed_at timestamptz;
```

Deployed 2026-08-12 (`supabase/migrations/20260812151605_delivery_requests_proof_photos.sql`). `stops` entries gain fields only once completed: `{ "location": "...", "completed": true, "completedAt": "<iso>", "photoUrl": "..." }`.

### Storage bucket

`delivery-proof-photos`, Public, created via the Storage REST API (`POST {SUPABASE_URL}/storage/v1/bucket`, service-role key) — unlike raw table DDL, bucket creation went through fine that way, no manual Dashboard step needed. Path convention: `{deliveryId}/pickup.jpg`, `{deliveryId}/dropoff.jpg`, `{deliveryId}/stop-{index}.jpg`, `upsert: true`. Same public-bucket pattern as `driver-profile-pics` (see `DATABASE.md`'s Storage buckets section).

### Backend — `supabase/functions/admin-users/index.ts`

- `update-driver-delivery`'s `DRIVER_STATUS_TRANSITIONS` trimmed to `ASSIGNED: ["OUT_FOR_PICKUP"]` only — Driver can no longer advance past Start Pickup.
- Same action name, `update-driver-delivery`, now **also** exists inside the Helper block (`callerRow.role === "Helper"`), handling only `OUT_FOR_PICKUP -> OUT_FOR_DROPOFF` (Confirm Pickup) with a required photo, setting `pickup_photo_url`. Since role blocks are mutually exclusive `if`s gated on the caller's actual role, reusing the action name across both blocks is safe — only the block matching the caller's role ever executes.
- New Helper-gated action `complete-dropoff`: uploads to `dropoff.jpg`, sets `dropoff_photo_url`/`dropoff_completed_at`, and sets `status = DELIVERED` (returning `isFinal: true`) only if `stops` is empty.
- New Helper-gated action `complete-stop`: uploads to `stop-{index}.jpg`, updates that entry in `stops`, and sets `status = DELIVERED` (returning `isFinal: true`) only if it's the last entry.
- Shared `uploadProofPhoto()` helper (base64 → validate → Storage upload → cache-busted public URL) factors out what would otherwise be near-identical logic across all three actions.

### Backend — `supabase/functions/driver-trip/index.ts`

`end-trip` is the one action a Helper now needs to call too (closes the Session, computes mileage) — the blanket `callerRow.role !== "Driver"` gate at the top now has a carve-out (`isHelperEndTrip = callerRow.role === "Helper" && action === "end-trip"`), resolving `helper_records.id` instead of `driver_records.id` in that case, and the ownership check accepts either `assigned_driver_id` (Driver) or membership in `assigned_helper_ids` (Helper). `start-trip`/`pause-trip`/`resume-trip` are unaffected — still Driver-only.

### Frontend — `HelperDeliveries.jsx` (previously fully read-only)

New `chainItems` list (`[Pickup, Dropoff, ...stops]` in the real order), each row showing a "Complete" button when actionable (gated on delivery status matching that item's stage) or a checkmark + photo thumbnail once done. A confirm-modal (mirroring `DriverDeliveries.jsx`'s existing shape) requires a photo (via `src/lib/proofPhoto.js`, camera-preferring file input) before the primary button enables. Whichever action responds `isFinal: true` triggers `driver-trip`'s `end-trip` immediately after — same two-call pattern the old Driver-side Complete Delivery used, just dynamically triggered now.

### Frontend — `DriverDeliveries.jsx`

- `FOR_PICKUP`/`OUT_FOR_DELIVERY` no longer have a `nextStage`/`nextLabel` in `statusConfig` — the stage-advance button and its confirm-modal automatically stop rendering (already gated on `nextLabel` truthiness everywhere). Those two stages now only show their existing `banner` text, reworded to reflect waiting on the Helper.
- `advanceStage` simplified to only handle `ASSIGNED -> FOR_PICKUP` (Start Pickup) — the dead `DELIVERED`/`OUT_FOR_DELIVERY` branches were removed rather than left unreachable.
- New Realtime subscription on `delivery_requests` (mirrors `HelperDeliveries.jsx`'s existing one) — needed now that this page has no local call site for "the trip just finished," since that happens in a different portal/session. `loadDeliveries` also detects "the delivery I was watching just reached DELIVERED" (via a `prevActiveIdRef` comparison) and still shows the same completion toast/archiving behavior the old Complete Delivery button used to trigger directly.
- `LiveNavigationMap`'s destination/waypoints reworked for the real chain order: when stops exist, `dropoff_location` becomes a waypoint and the **last stop** becomes the actual destination, falling back to the old dropoff-is-final behavior if the last stop's address doesn't parse to coordinates (`parseCoords` only understands `"lat, lng"` text — same limitation pickup/dropoff already had).

### Verification (2026-08-12)

Build/lint clean (`npm run build`, `eslint`) on every modified/new file. Both Edge Functions deployed (`npx supabase functions deploy admin-users`/`driver-trip`).

**Full backend chain verified live via curl against the deployed functions, both finality cases, using real driver/helper test logins and a real small JPEG (base64) as the proof photo**, disposable fixtures (`DR-0015`, `DR-0016`, reverted afterward):
- **No-stops case (`DR-0015`):** Driver `start-trip` → Driver `update-driver-delivery` (→`OUT_FOR_PICKUP`) → Helper `update-driver-delivery` (→`OUT_FOR_DROPOFF`, photo, returns `pickupPhotoUrl`) → Helper `complete-dropoff` (photo, returned `isFinal: true` as expected since `stops` was empty) → Helper `end-trip` (200, Session closed) → confirmed `delivery_requests.status = DELIVERED` with both `pickup_photo_url`/`dropoff_photo_url` set and `dropoff_completed_at` populated.
- **With-stops case (`DR-0016`, 2 stops):** same start through Confirm Pickup, then Helper `complete-dropoff` (`isFinal: false`, correct — 2 stops remained), Helper `complete-stop` index 0 (`isFinal: false`, correct — 1 stop remained), Helper `complete-stop` index 1 (`isFinal: true`, correct — last stop), Helper `end-trip` (200) → confirmed `DELIVERED`, both `stops` entries carrying `completed`/`completedAt`/`photoUrl`.
- **Guardrails confirmed**: a Driver attempting the old Confirm Pickup transition now gets `400` ("Cannot move a delivery from OUT_FOR_PICKUP to OUT_FOR_DROPOFF" — `DRIVER_STATUS_TRANSITIONS` correctly no longer allows it); a Helper attempting to confirm pickup with no photo gets `400` ("A proof-of-pickup photo is required").
- Test photos deleted from the `delivery-proof-photos` bucket afterward; both fixtures reverted to their original `DELIVERED`/no-photo state; no leftover Active sessions.

**Also click-tested through the actual browser UI** (Playwright, real accounts) earlier the same day: confirmed Driver's page shows zero Confirm Pickup/Complete Delivery buttons plus the new read-only "Waiting for the helper..." banners, and Helper's confirm-modal correctly disables its submit button until a photo is chosen. That pass also caught and fixed a real bug — `HelperDeliveries.jsx` had the same stale-open-session bug `DriverDeliveries.jsx` was fixed for on 2026-08-11 (Helper's "Active" delivery was selected purely by `pickupDate === today`, so a delivery with a genuinely open Session but a different date never rendered as Active — see `STATUS.md`'s full write-up for this phase, including both the curl- and browser-verified detail). Fixed the same way: `hasOpenSession` checked before `pickupDate`, render gate switched to `hasActiveDelivery = Boolean(active)`.

## Real contradiction found and corrected

`02_BOOKING_AND_TRIP_CREATION.md` assumed route generation would use the Routes API (`computeRoutes`/`intermediates`, decided 2026-08-08). The driver navigation that actually shipped (`DriverDeliveries.jsx`'s inline `LiveNavigationMap`, built 2026-08-12) uses the legacy `DirectionsService` JS API instead, whose request field is `waypoints: [{location, stopover}]` — already flagged as an open, previously-reverted contradiction in `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section. This phase builds against what's actually shipped (`waypoints`), not the doc's stale assumption. `02_BOOKING_AND_TRIP_CREATION.md`'s gap #2 text should be read with this correction — it still says `computeRoutes`/`intermediates`, which does not match the deployed code.

## Schema

```sql
alter table public.delivery_requests
  add column stops jsonb not null default '[]';
```

Deployed 2026-08-12 (`supabase/migrations/20260812134525_delivery_requests_stops.sql`), verified live via a REST `select` against the real table before any code was built against it — this project has repeatedly documented a column as "decided" while the live table still lacked it (`gps_logs` twice, `devices` RLS once), so this was confirmed, not assumed.

Stop shape: `{ "location": "<display address text, or a 'lat, lng' fallback>" }` — the same text-address convention `pickup_location`/`dropoff_location` already use. `DriverDeliveries.jsx`'s existing `parseCoords()` regexes the `"lat, lng"` form back into coordinates for the map/waypoints; an address that doesn't match is passed through to `DirectionsService` as a raw string, which it accepts natively.

## Booking form — `CustomerRequestDelivery.jsx`

`formData.stops` (array of plain address strings while editing) renders one `LocationInput` per entry between the existing Pick Up/Drop Off fields, with a remove button per row and an "Add a stop" button (hidden once `MAX_STOPS = 5` is reached). No dynamic add/remove-row pattern existed anywhere in this codebase before this — `LocationInput` itself (autocomplete + map picker) is reused unchanged per row; only the add/remove/cap scaffolding around it is new. On submit, empty rows are dropped and the rest are shaped into `{ location }` objects for the `stops` column.

## Supervisor view — `SupDeliveries.jsx`

Read-only ordered list in the request detail panel, next to the existing Pick-up/Drop-off Location block — same rendering style already used there. `mapDbRequest` (the one real mapper backing `selectedRequest`, not the separate mock-data array earlier in the file) now carries `stops` through from the raw row. No write path.

## Driver navigation — `DriverDeliveries.jsx`'s `LiveNavigationMap`

**Superseded in part by "Photo-Required Chain Completion" below (2026-08-12)** — `dropoff_location` is no longer always the final destination when stops exist; see that section for the corrected routing logic. The rest of this section (waypoints mechanism, leg tracking, voice guidance) is unchanged.

- `admin-users`' `get-driver-deliveries` action now returns `stops` per delivery (deployed 2026-08-12); `mapDelivery` carries it into the frontend's delivery object.
- `activeNavStops` is computed only on the dropoff leg (`!activeNeedsPickup`) and passed to `LiveNavigationMap` as `stops`.
- `computeRoute` now accepts a `waypoints` array (`{location, stopover: true}` per stop, coordinates via `parseCoords` where possible) and passes it straight through to `DirectionsService.route()`.
- `DirectionsService` returns one `legs[]` entry per waypoint segment when `waypoints` is set (`legs.length === stops.length + 1`, the last leg being to the final destination). A new `currentLegIndex` state (client-side only, mirrors the existing `currentStepIndex` turn-by-turn tracking) tracks which leg the driver is currently on; the existing step-advance effect now advances `currentLegIndex` (and resets `currentStepIndex`) once the last step of a leg is reached, instead of only ever reading `legs[0]`.
- Voice guidance and the turn-by-turn instruction panel now key off `legs[currentLegIndex]`, not `legs[0]`.
- Reroute-on-deviation now re-routes through only the stops not yet reached (`waypoints.slice(currentLegIndex)`) rather than the full original list, so a mid-trip reroute doesn't reinsert stops already passed.
- A "Stop X of Y" indicator (or "Heading to Drop-off" on the final leg) renders above the turn-by-turn text whenever the route has more than one leg.
- Nothing here writes to `delivery_requests.status` or any new table — matches the "reference-only" decision above.

## Deliverable

Implement stop entry (booking), read-only display (Supervisor), and dropoff-leg route/progress (Driver navigation). ~~No per-stop status persistence~~ — superseded 2026-08-12 by "Photo-Required Chain Completion" above; per-stop completion state now persists (`stops[].completed`/`completedAt`/`photoUrl`), Helper-owned. No Supervisor editing, still true.

## Verification (2026-08-12)

Build/lint clean (`npm run build`, `eslint`) on all three modified frontend files plus the `admin-users` Edge Function change (deployed).

**Browser click-tested end-to-end** using Playwright against the real dev server and real test accounts (customer, then Supervisor), a disposable fixture (`DR-0019`, deleted afterward):
- Customer booking form: added two stops via the new "+ Add a stop" UI, submitted alongside normal pickup/dropoff/schedule/truck fields. Screenshot confirmed the "Stop 1"/"Stop 2" rows render correctly with remove buttons, matching the existing Pick Up/Drop Off styling.
- Verified via REST that the submitted row landed with `stops: [{"location": "14.5750, 120.9900"}, {"location": "14.5850, 121.0000"}]` — the exact shape designed.
- Fast-tracked the fixture to `APPROVED` (service-role, bypassing the quotation negotiation flow which is orthogonal to this feature) and opened it in Supervisor's "Assign Vehicle" tab: the detail panel's Location section correctly showed "STOPS (2)" with numbered badges, above Pick-up/Drop-off Location, read-only — confirmed via screenshot.
- No console errors during either flow.

**Driver navigation "Stop X of Y" indicator — verified live 2026-08-12**, reusing `DR-0011`/`D002`/`DV-1114` as a fresh disposable fixture (stops set, Active session, advanced to `OUT_FOR_DROPOFF`). Straight-line interpolated GPS points were tried first and failed — `NAV_STEP_ADVANCE_METERS` (35m) requires each tick to land close to the *real* road-following route's step end-points, not a coarse straight line between waypoints, so the indicator never advanced past "Stop 1 of 2" (in hindsight, expected: sequential per-step advance means an early step never reached blocks every step after it, straight-line points routinely overshoot a 35m-wide target). Fixed by capturing the actual `DirectionsService` result (`scripts/gps-route-capture.mjs`, headless Playwright, patches `google.maps.DirectionsService` by class replacement — reassigning just `.prototype.route` is silently ignored by the SDK) and replaying its real step end-points as GPS ticks (`scripts/gps-route-simulate.py`) while watching a real logged-in browser tab. Confirmed live: the indicator correctly advanced "Stop 1 of 2" → "Stop 2 of 2" → "Heading to Drop-off" as the ticks landed. Also caught and fixed a fixture bug during setup: `DR-0011`'s `dropoff_location` was still a plain street address from earlier testing, not `"lat, lng"` text — `parseCoords` can't parse that, so `destination` stayed null and the map got stuck on "Computing route..." with no error; fixed by setting real coordinate-text locations. Fixture fully reverted afterward (session ended, status/locations/stops restored, simulated `gps_logs` rows deleted). See `scripts/README.md` for the reusable version of this test flow.
