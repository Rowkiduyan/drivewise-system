# Phase 2B - Multi-Stop Deliveries

## Goal

Let a Trip visit one or more intermediate locations between pickup and dropoff — still ONE `delivery_requests` row, per `01_SYSTEM_ARCHITECTURE.md`'s Trip definition ("A Trip may... contain one or more planned/delivery stops"). The storage shape was decided back on 2026-08-10 (`02_BOOKING_AND_TRIP_CREATION.md`'s Required Schema gap #2) but never scheduled as a phase or built against — `09_EDGE_CASES.md`'s Phase 9 pre-work check confirmed nothing downstream depended on it. This phase builds it, inserted after Phase 2 (hence `02B`, same lettered-sub-phase pattern as `03B_PAUSE_AND_RESUME_TRIP.md`).

## Decisions

- **Customer-entered only, at booking time.** Same as `pickup_location`/`dropoff_location` today — no Supervisor editing UI. Read-only everywhere after submission.
- ~~Capped at 5 stops per delivery.~~ **Raised to 20, 2026-09-22** (explicit user request: allow more than 5 dropoffs, as long as the whole delivery still fits inside the existing 13-hour cap). The 5-stop cap was never actually a business rule — it existed only to keep the booking form and the single DirectionsService `waypoints` request simple. The real per-delivery bound is `MAX_TOTAL_DELIVERY_HOURS` (`scheduleSimulator.js`, see `02_BOOKING_AND_TRIP_CREATION.md`'s "Delivery Time Planning" section), which already applies to the full leg chain regardless of stop count — both the live schedule preview and `handleSubmit` recompute travel time for every leg and reject via the same `travelTimeModalSchedule` rejection modal. `MAX_STOPS` in `CustomerRequestDelivery.jsx` now exists purely as a technical ceiling on that one `waypoints` request (Google's Directions API caps `waypoints` at 25 entries; this form's request shape sends one waypoint per stop, so 20 stops stays safely under that with room to spare) — in practice the 13-hour cap will almost always bind first, since each stop also costs a fixed 30-minute unload.
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
- Same action name, `update-driver-delivery`, now **also** exists inside the Helper block (`callerRow.role === "Helper"`), handling only `OUT_FOR_PICKUP -> OUT_FOR_DROPOFF` (Confirm Pickup) with a required photo, setting `pickup_photo_url`. Since role blocks are mutually exclusive `if`s gated on the caller's actual role, reusing the action name across both blocks is safe — only the block matching the caller's role ever executes. **Also sets `pickup_completed_at` since 2026-09-04** (`DATABASE.md`'s `pickup_completed_at` entry) — this branch originally only wrote `pickup_photo_url`, matching `dropoff_completed_at`'s own already-established pattern one item later in the chain.
- New Helper-gated action `complete-dropoff`: uploads to `dropoff.jpg`, sets `dropoff_photo_url`/`dropoff_completed_at`, and sets `status = DELIVERED` (returning `isFinal: true`) only if `stops` is empty.
- New Helper-gated action `complete-stop`: uploads to `stop-{index}.jpg`, updates that entry in `stops`, and sets `status = DELIVERED` (returning `isFinal: true`) only if it's the last entry.
- Shared `uploadProofPhoto()` helper (base64 → validate → Storage upload → cache-busted public URL) factors out what would otherwise be near-identical logic across all three actions.

### Backend — `supabase/functions/driver-trip/index.ts`

`end-trip` is the one action a Helper now needs to call too (closes the Session, computes mileage) — the blanket `callerRow.role !== "Driver"` gate at the top now has a carve-out (`isHelperEndTrip = callerRow.role === "Helper" && action === "end-trip"`), resolving `helper_records.id` instead of `driver_records.id` in that case, and the ownership check accepts either `assigned_driver_id` (Driver) or membership in `assigned_helper_ids` (Helper). `start-trip`/`pause-trip`/`resume-trip` are unaffected — still Driver-only.

### Frontend — `HelperDeliveries.jsx` (previously fully read-only)

New `chainItems` list (`[Pickup, Dropoff, ...stops]` in the real order), each row showing a "Complete" button when actionable (gated on delivery status matching that item's stage) or a checkmark + photo thumbnail once done. A confirm-modal (mirroring `DriverDeliveries.jsx`'s existing shape) requires a photo (via `src/lib/proofPhoto.js`, camera-preferring file input) before the primary button enables. Whichever action responds `isFinal: true` triggers `driver-trip`'s `end-trip` immediately after — same two-call pattern the old Driver-side Complete Delivery used, just dynamically triggered now.

**Upload success toast, added 2026-08-14.** `submitChainAction` previously closed the confirm modal silently on a successful upload with no confirmation the photo actually went through — added a `chainSuccessNotice` state (`{ label, isFinal }`, set right after the action succeeds) rendering a floating toast that auto-dismisses after 5s, mirroring `DriverDeliveries.jsx`'s existing `completionNotice` toast exactly (same emerald styling, same `z-[70]` above the confirm modal's `z-[60]`). Reads "`<Item> Confirmed` / Photo uploaded successfully." for a normal item, or "Delivery Completed / Every item in the chain is done — the trip has been closed out." when the action's `isFinal` came back true. **Live-verified 2026-08-14** via new `scripts/repro-chain-success-toast.mjs` (reusable disposable tooling): injected a real Helper session into the browser via `localStorage` (obtained through the same magic-link technique as `repro-nearest-dropoff.mjs`, since H003's password is undocumented/untouched), clicked through a real Complete Dropoff with an actual file-picker upload, and confirmed both the toast text and the Delivery Chain list's "Next" badge (`Dropoff 2`) updated together in the same screenshot — screenshot-confirmed, not just a DOM query.

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

## Dynamic Nearest-Dropoff Ordering (decided 2026-08-14, built 2026-08-14)

**Supersedes the "fixed customer-entered order" behavior documented below and in "Photo-Required Chain Completion" above.** Today, `dropoff_location`/`stops` are visited in whatever order the customer entered them at booking (see Booking form section below) — no distance logic anywhere, and the Helper can complete them in literally any order with zero enforcement ("Accepted as-designed, not a bug," per the section above).

The decided replacement logic:

- **Pickup is always first**, unconditionally — unaffected by this change.
- **After pickup, the next dropoff given to the driver is whichever remaining dropoff (`dropoff_location` or a `stops` entry) is geographically nearest to the driver's current position** — not the next one in the customer-entered list.
- **Confirmed with the user 2026-08-14: greedy nearest-neighbor re-evaluation, not a one-time reorder.** After *each* dropoff is completed, the *next* dropoff is whichever of the *remaining* dropoffs is nearest to the driver's position at that moment — recalculated fresh every time, not decided once up front right after pickup. Concrete example that pins down why this matters: if completing dropoff A leaves the driver physically closer to C than to B (routes aren't straight lines, this happens easily), the driver goes to C next, not B — even if B was "next in line" under a distance snapshot taken back at pickup. A one-time reorder computed once at pickup and then followed as a fixed sequence was explicitly considered and rejected.

**Built 2026-08-14:**

- **`DriverDeliveries.jsx`**: new module-level `nearestDropoffOrder(referencePos, candidates)` helper (greedy nearest-neighbor, chains from each pick's own coords for the next pick). `activeNavTarget`/`activeNavStops` and the status banner's `currentDropoffRaw` now all derive from `orderedRemainingDropoffs`, computed fresh on every render from `livePosition || activeNavOrigin` against the not-yet-completed dropoff/stops — recomputes automatically whenever a completion changes the candidate list (via the existing `delivery_requests` Realtime subscription), not continuously mid-drive. A candidate whose address doesn't parse to `"lat, lng"` (a real street address) can't be ranked by distance and is kept at its original relative position among other un-rankable candidates, same fallback philosophy `parseCoords` already has elsewhere.
- **`admin-users`' `complete-dropoff`/`complete-stop`**: `isFinal` was positional (`stops.length === 0`, `stopIndex === stops.length - 1`), silently assuming array order was visiting order — fixed to "are all OTHER chain items already completed" (`stops.every(...)` for dropoff; `dropoff_completed_at` truthy AND every other stop completed, for a stop). Deployed (`npx supabase functions deploy admin-users`).
- **`HelperDeliveries.jsx`**: new `livePosition` state + a `gps_logs` Realtime subscription (seed-fetch + `INSERT`, same pattern as the existing alerts subscription, gated on `isMonitoring`) — the Helper has no GPS device of their own, only the truck's Pi does, so this reads the same stream the backend's proof-location check and the Driver's own nav already use. `chainItems` now computes an `isNext` flag (pickup if undone, else whichever remaining dropoff/stop is nearest `livePosition`, falling back to first-remaining-in-chain-order if no position yet) and the Delivery Chain list shows a "Next" badge on that item. **Does not** change which items are `actionable` — completion order is still unenforced server-side, this is purely an informational highlight matching what the driver's nav is routing to.
- Build/lint clean on all three files (`npm run build`, `eslint`); `deno check` on `admin-users/index.ts` shows only the file's pre-existing systemic `SupabaseClient` generic-mismatch noise, confirmed unrelated to the new lines.
- **Live-verified 2026-08-14** via new `scripts/repro-nearest-dropoff.mjs` (reusable disposable tooling, kept in the repo), reusing `DR-0020` (driver D002, helper H003, 2 known-coordinate stops):
  - **Driver nav**: captured the real `DirectionsService` request's `destination` field via the same class-replace patch `gps-route-capture.mjs` uses (deliberately not asserting on rendered text, since `useResolvedAddress` reverse-geocodes coordinate strings asynchronously and could flip the visible label mid-test). With the driver's live position placed near Stop 2, the computed route's destination was Stop 2; moved to near Dropoff instead, it flipped to Dropoff. Confirmed the target tracks position, not customer-entered order.
  - **Backend `isFinal`**: completed Stop 2 *first* (positionally last in the array — the old bug would have returned `isFinal: true` immediately) and got `isFinal: false`, correct since Dropoff/Stop 1 were still open; completed Dropoff next, `isFinal: false` (Stop 1 still open); completed Stop 1 last, `isFinal: true`, and `delivery_requests.status` genuinely reached `DELIVERED`. Used a real Helper session obtained via Supabase's admin `generateLink` (magic link) + `verifyOtp`, not a password reset — H003's actual password is undocumented/untouched.
  - Fixture fully reverted afterward: session closed, `gps_logs` cleared, delivery back to `OUT_FOR_PICKUP` with clean stops/no photos, all 3 test photos deleted from the `delivery-proof-photos` bucket.
  - Helper's "Next" badge was later click-tested for real too (see the chain-completion success toast entry below) — screenshot-confirmed updating correctly alongside a real Complete Dropoff submission.
- **Booking/Supervisor UI updated to stop implying stop order is a route, 2026-08-14.** Now that dropoff visiting order is dynamic (nearest-first, not customer-entered), the surviving "ordered list" framing in two places was stale and worth fixing rather than leaving to confuse a future reader:
  - `CustomerRequestDelivery.jsx`: added a caption under the stops section ("not necessarily visited in this order — the driver is routed to whichever is nearest at each point along the trip") and reworded the add-button from "+ Add another dropoff after Drop Off" (implied sequence) to "+ Add another dropoff destination".
  - `SupDeliveries.jsx`'s `LocationSwitcher` (the read-only chip/map switcher in the request detail panel): added the same clarifying caption, shown only when stops exist (`points.length > 2`).
  - Build clean; lint clean on the actual touched lines (two pre-existing, unrelated `react-hooks/set-state-in-effect` errors elsewhere in both files, confirmed via diff to be nowhere near this change).

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

`formData.stops` (array of plain address strings while editing) renders one `LocationInput` per entry between the existing Pick Up/Drop Off fields, with a remove button per row and an "Add a stop" button (hidden once `MAX_STOPS` is reached — 20 as of 2026-09-22, see the Decisions section above). No dynamic add/remove-row pattern existed anywhere in this codebase before this — `LocationInput` itself (autocomplete + map picker) is reused unchanged per row; only the add/remove/cap scaffolding around it is new. On submit, empty rows are dropped and the rest are shaped into `{ location }` objects for the `stops` column.

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
