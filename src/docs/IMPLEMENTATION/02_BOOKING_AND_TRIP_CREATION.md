# Phase 2 - Booking and Trip Creation

## Goal

Implement how a trip comes to exist in the Assigned status that Phase 3 (Start Trip) begins from.

A trip can be created two ways:

- From a Customer booking request that a Supervisor reviews and approves.
- Directly by a Supervisor, with no booking involved.

Both paths end at the same place: a trip row with driver, truck, and schedule filled in, status Assigned.

## Required Schema

Decided 2026-08-08: there is no `bookings` table and no `trips` table, and neither will be built. `delivery_requests` (already deployed — see `DATABASE.md`) plays both roles: it's the booking record from creation, and it already carries driver/truck/helper assignment (`assigned_driver_id`/`assigned_truck_plate`/`assigned_helper_ids`/`assigned_at`) — a separate `trips` table would have duplicated those same fields and created two sources of truth for "who's driving this." Everywhere below that used to say `trips`/`bookings`, read it as `delivery_requests`.

`sessions` has been extended (2026-08-08) with `delivery_request_id`/`driver_id`/`truck_plate`/`device_id`/`status`, linking a Session directly to the `delivery_requests` row it belongs to — see `DATABASE.md`'s `sessions` entry for the exact columns. This is what Phase 3 onward (Start Trip, GPS, Alerts) writes to.

`trucks` and `devices` already exist in Supabase (see `DATABASE.md`). A device is linked to its truck directly via `devices.plate_number` — decided 2026-08-06 not to build a separate `truck_device_assignments` table, since nothing needs assignment history, just the current pairing.

Per `00_IMPLEMENTATION_RULES.md`, remaining gaps are reported rather than assumed:

1. `delivery_requests` does not yet have a stored suggested route. Decided 2026-08-06: the suggested route is auto-generated (from pickup to dropoff) rather than manually drawn by the Supervisor — so this column, once added, stores a full route (e.g. an encoded polyline/coordinate list), generated once at trip-creation time, not just the two endpoint locations. Decided 2026-08-08: route generation uses the **Routes API** (`computeRoutes`), not the legacy Directions API — see "Google Maps Platform Setup" below. Confirm/add this column before implementing route generation.
2. ~~A Trip may contain multiple delivery stops...~~ **Built as Phase 2B, see `02B_MULTI_STOP_DELIVERIES.md` (2026-08-12).** Original text below, kept for history — one part of it turned out wrong and is corrected inline. A Trip may contain multiple delivery stops (see `01_SYSTEM_ARCHITECTURE.md`'s Trip definition). Decided 2026-08-10: in scope, and stored as a `stops` column (`jsonb`, not null, default `'[]'`) on `delivery_requests` — an ordered array of intermediate stop locations (e.g. `[{"location": "..."}, ...]`) visited **between** the existing `pickup_location` (first) and `dropoff_location` (last), which are unchanged and keep their current meaning; `stops` only carries what's in between. Chosen over a separate stops table because nothing in scope needs to query, filter, or join on an individual stop — stops are a simple ordered list for route/reference purposes only (no per-stop status tracking, e.g. Pending/Arrived/Departed — confirmed still the case in Phase 2B), and a `jsonb` array maps directly onto the ordered-waypoints shape ~~the Routes API's `computeRoutes`~~ **actually the legacy `DirectionsService`'s `waypoints` field — see `02B_MULTI_STOP_DELIVERIES.md`'s "Real contradiction found and corrected"; the driver navigation that shipped 2026-08-12 uses `DirectionsService`, not the Routes API this line originally assumed** (see "Google Maps Platform Setup" below) already expects between origin and destination — no join required to build that request.
3. Decided 2026-08-08: the truck (and therefore the Raspberry Pi) assigned to a Trip **can** change between Sessions of the same Trip (e.g. a truck breakdown during an overnight Pause, Resume Trip on a different truck). Consequences for schema:
   - `sessions.truck_plate`/`sessions.device_id` are resolved independently per Session, not inherited from the Trip — already added (see above). This is what the mileage rule in `03B_PAUSE_AND_RESUME_TRIP.md` and `07_END_TRIP.md` relies on: each adds distance to `trucks.current_mileage` for "the truck used in this Session," which only makes sense if a Session can pin its own truck independent of whatever the delivery is currently assigned.
   - `delivery_requests.assigned_truck_plate` remains the *current* truck (for supervisor-facing "what truck is this on right now" views) — it gets updated whenever a Resume Trip happens on a different truck. The `sessions` rows are the historical record of what was actually used at each point in time; `assigned_truck_plate` is only the live pointer.
   - See `03B_PAUSE_AND_RESUME_TRIP.md`'s Resume Trip section for the resulting workflow (truck selection/confirmation, then device resolution from that truck).
4. Do not implement against assumed column names — get them confirmed first, the same way Phase 1 verifies schema before Phase 3 writes code.

## Google Maps Platform Setup

Decided 2026-08-08 (billing/API setup session):

- Google Cloud project billing is linked to the free $300/90-day trial credit. A budget alert is configured (Billing → Budgets & alerts) so spend is monitored; this is a notification only, it does not cap or disable billing automatically.
- APIs enabled: **Maps JavaScript API** (renders the map/route — **reopened contradiction as of 2026-08-12**: the already-built `DriverDeliveries.jsx` actually renders its map with Leaflet/`react-leaflet`, not this API, but the project's capstone documentation specifies in-app navigation built with this API specifically — a fixed external requirement, not a preference resolvable by keeping existing UI as-is; see `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section for the full note and open scope questions before implementing map rendering), **Routes API** (`computeRoutes` — generates the suggested route stored on `delivery_requests` at creation time, see Required Schema above; unaffected by the rendering question), and **Places API (New)** (address autocomplete on the booking form's pickup/dropoff fields).
- One API key is shared across all three APIs (an API key is scoped to the Cloud project, not to an individual API) — restricted by HTTP referrer (Website restriction) to the app's dev/prod origins, and by API restriction to only the three APIs above.
- The key is stored as `VITE_GOOGLE_MAPS_API_KEY` in `.env` (gitignored) / `.env.example` (placeholder only).
- Places Autocomplete must use session tokens (or the `PlaceAutocompleteElement` widget, which handles this automatically) so a single address search is billed once per session rather than once per keystroke.

## Booking Workflow (Customer)

Customer logs into the Customer portal.

Customer submits a booking request with:

- Pickup location, pickup date/time
- Dropoff location, dropoff date/time
- Truck type requested
- Item type
- Notes (optional)

Booking status on creation:

Pending

The booking is not a trip yet. No driver, truck, or session exists for it.

### Location & Travel-Time Validation

Two client-side checks run in `CustomerRequestDelivery.jsx`'s submit handler before the `delivery_requests` insert — both reject the submission outright (no row is written) rather than warning-and-allowing:

1. **Service area (Luzon-only)** — pre-existing, not previously documented anywhere (found undocumented while adding the check below; predates this doc entry, exact build date not tracked). `src/lib/serviceArea.js` defines the service area as a set of lat/lng polygons covering mainland Luzon plus Bicol, Mindoro, Marinduque, Catanduanes, and Polillo (`isInsideLuzon`/`snapToLuzon`, ray-casting point-in-polygon). Enforced at every location-selection point (map click, pin drag, search suggestion) and again at submit time as a last line of defense, in case typed address text got geocoded to a coordinate outside the area. **Client-side only** — there is no DB constraint or server-side re-check, so this can be bypassed via a direct API call (Supabase RLS on `delivery_requests` only checks `customer_auth_id = auth.uid()`, not location). Confirmed this is the only path that creates `delivery_requests` rows in the app — Admin/Supervisor never insert new rows, only update/quote existing ones — so there's no second creation flow that needs the same check.
2. **13-hour total delivery-time cap** — added 2026-08-30, per explicit user decision, superseded the same day by the full **Delivery Time-Planning Calculation** described in its own section below (which replaced this check's original direct-leg-only implementation entirely, not just extended it). See that section for the current implementation — kept as a footnote here only because it's the reason the Luzon check alone wasn't sufficient: the Luzon area alone spans routes well over 13 hours (confirmed via a real Directions API call, Pagudpud to Sorsogon: ~20h25m in traffic, 1,093km).

See `STATUS.md`'s 2026-08-30 entries for build/lint/live-verification detail.

### Per-Stop Dropoff Time

Added 2026-08-30, per explicit user decision. Previously only the main dropoff (`dropoff_date`/`dropoff_time`, i.e. "Dropoff 1") had a scheduled time — each additional dropoff (`stops[]`, "Dropoff 2" onward) had no time of its own at all. Each stop entry can now optionally carry a dropoff window: `{"location": "...", "dropoffTime": "HH:MM", "dropoffTimeEnd": "HH:MM"}` (both fields omitted together when the customer leaves it blank, matching the existing minimal-field style already used for `completed`/`completedAt`/`photoUrl`).

Two scoping decisions, both made explicitly by the user rather than assumed:
- **Time only, no separate date** — a stop shares the main Drop Off Date; there's no per-stop date field. Keeps the form simpler and matches the likely real use case (a same-day multi-stop route).
- **Basic validation only** — each stop's window (if entered) must start later than the pickup window's end, reusing the exact same rule `getScheduleErrors` already applies to the main dropoff time (`getStopTimeError` in `lib/deliveryOptions.js`). Deliberately does **not** check chronological ordering between stops, and does **not** estimate travel time between consecutive stops — at the time this was built, only the direct pickup→dropoff leg was time-estimated at all (the original 13-hour cap), so there was no existing per-stop travel-time signal to validate against. (The same-day **Delivery Time-Planning Calculation** below later added full multi-leg travel-time estimation across every stop — this validator's scope was never revisited to use it, since arrival-time-vs-window cross-checking remains a deliberately separate, unbuilt concern.)

**Same-day follow-up: changed from a single instant to a window** ("should be a window because it should show up as like 'Open from -- to --'", explicit user request). Both the main dropoff and each stop's time became a customer-selected window (start + end), the same shape `pickup_time`/`pickup_time_end` already established (`getPickupWindowError`):
- **Main dropoff**: new `dropoff_time_end` column (nullable, mirrors `pickup_time_end` exactly) — **deployed** via `supabase/migrations/20260830140000_delivery_requests_dropoff_time_window.sql`. New `getDropoffWindowError` in `lib/deliveryOptions.js` (mirrors `getPickupWindowError`) rejects an end that isn't strictly later than the start. Both fields are required in the form, same as the Pick Up Window's two fields. UI label reads "Open From – To" (two time inputs side by side, "to" between them) beside Drop Off Location. **Same-day follow-up (Delivery Time-Planning Calculation, below)**: this is only true in `SAME_DAY` mode — in `TWO_DAY` mode the second input is hidden and the label switches to "Day 2 Start Time," since `dropoff_time` is repurposed as Day 2's start instant rather than a window.
- **Each stop**: `getStopTimeError`'s signature changed from `(stopTime, formData)` to `(stop, formData)`, reading `stop.dropoffTime`/`stop.dropoffTimeEnd` — validates (a) a half-filled window (only one of the two given) is an error, since a window needs both ends to mean anything, (b) the window's start must be later than the pickup window's end (unchanged rule from before), (c) the window's end must be later than the window's start. Still fully optional as a whole — a stop with neither field filled is valid, matching the original "silent/optional" design.
- **Migration applied 2026-08-30** alongside two unrelated, already-written-but-unpushed security-hardening migrations found sitting in the repo (`20260830120000_harden_permissive_rls_policies.sql`, `20260830130000_harden_driver_default_assignments.sql`, from the same day's Supabase Advisor audit, `13_SECURITY_ADVISOR_FINDINGS.md`) — `supabase db push` applies pending migrations in order and can't push just one, so the user was asked first and confirmed pushing all three. Discovered mid-push that both were **already live** (all target policies existed, none of the dropped ones did) but untracked in the CLI's migration history table — same "applied outside the CLI" situation this repo hit once before (see the `STATUS.md` entry for `20260814131307_delivery_requests_suggested_route.sql`). Fixed via `supabase migration repair --status applied` for those two versions (no SQL re-run, just syncing the tracking table), then pushed only the genuinely new dropoff-window migration for real. Verified live via a direct REST `select` on `dropoff_time_end` immediately after.

**Confirmed additive, not a breaking schema change** (for the `stops[]` shape — the top-level `dropoff_time_end` column is an explicit, deployed migration, not schema-free): `stops` is `jsonb` with no fixed shape (see `DATABASE.md`'s `delivery_requests` entry — it already gained `completed`/`completedAt`/`photoUrl` once before, the same way), and every other consumer of `stops` (`DriverDeliveries.jsx`, `SupDeliveries.jsx`, `HelperDeliveries.jsx`, `CustomerDeliveries.jsx`) already reads each entry as an object via `stop.location`, never as a raw string — grepped all of them to confirm none would break with an unrecognized extra field sitting alongside `location`. Build/lint-verified; not live-UI-verified.

### Delivery Time-Planning Calculation

Added 2026-08-30, per explicit user decision — **replaces** the original single-leg-only 13-hour cap above (superseded, not extended: two different 13-hour gates with different math would contradict each other). Full spec: a **Same-Day / Two-Day** mode, a sequential schedule simulation (pickup/loading → travel → unload → ... with rest and meal breaks inserted as reached), and a combined Day1+Day2 total checked against the same 13-hour cap.

**Mode is fully automatic, not a customer-clicked toggle** (same-day follow-up decision) — `deliveryMode` in `CustomerRequestDelivery.jsx` is a derived value, not `useState`: `"TWO_DAY"` whenever `dropoffDate > pickupDate`, `"SAME_DAY"` otherwise (including while the dates aren't filled in yet, matching the pre-existing pickupDate→dropoffDate auto-fill default). `getScheduleErrors` (`lib/deliveryOptions.js`) reverted to not needing a `deliveryMode` param at all, since mode can no longer disagree with the dates by construction — the mode-aware date-relationship checks it briefly gained are dead code once mode is derived, so they were removed rather than left unreachable.

Mode display went through two UI iterations the same day: first two non-interactive "Same-Day"/"Two-Day" boxes (no `onClick`, just reflecting the derived mode) — still visually read as clickable buttons regardless (large filled/bordered pill shapes), per direct user feedback on a screenshot ("it's still a button"). Replaced with a single small status badge instead ("Delivery Mode: ● Same-Day — pick a later Drop Off Date to switch to Two-Day"), which can't be mistaken for a control no matter how it's styled. The customer changes mode by picking a Drop Off Date, not by clicking anything in this section.

**UI bug fixed, same day, two attempts** — the Drop Off Time window ("Open From – To") overflowed its card, per a user screenshot. First attempt misdiagnosed it as the outer row (`LocationInput` beside the time block) not wrapping, and changed it to `sm:flex-row`/`sm:w-52` — a second screenshot showed it **still overflowing on a wide desktop card**, disproving that theory (`sm:flex-row` is active well above mobile widths, so nothing had actually changed at that size). Re-diagnosed correctly: the actual cause was the fixed `w-52` (208px) time-window box being too narrow to fit two native `<input type="time">` fields (each carries real rendered width from the browser's own clock-icon/spinner chrome) plus a "to" label — the time inputs overflowed *their own* box regardless of the outer row's layout, exactly matching the second screenshot (Drop Off Location rendering fine, only the time fields spilling past the card edge).

Fix: the outer row is `flex flex-wrap items-end gap-2` (wraps based on actual available space, not a fixed breakpoint), `LocationInput`'s wrapper is `min-w-[220px] flex-1`, and the time-window box dropped its fixed width entirely — `w-full sm:w-auto sm:shrink-0`, sized by content — with each time `<input>` given an explicit `sm:w-[8.5rem]` (136px) instead of `w-full`. Applied identically to the main Drop Off block and the per-stop block. **Verified via a standalone Tailwind reproduction of the exact structure, screenshotted with Playwright at 1435px (the reported card width), 600px, and 375px** — zero horizontal overflow at any of them, confirmed programmatically (`scrollWidth === clientWidth`), not just eyeballed. Not verified inside the real app itself (no Customer test account in this repo's scripts) — the reproduction is a structural proxy.

**Two real bugs found and fixed during a requested review pass, same day** — user asked to check for errors in what was implemented. Both are genuine logic bugs from crossing the Same-Day/Two-Day boundary, not caught earlier since neither had been exercised by hand-tracing until this pass:
1. **Stale `dropoffTimeEnd` could permanently block Two-Day submission.** It's only rendered in `SAME_DAY` mode, but nothing cleared its state on the mode auto-switching to `TWO_DAY` — `getDropoffWindowError` doesn't know about mode, so a leftover same-day value kept getting compared against the repurposed "Day 2 Start Time" field, producing an error pointing at a field no longer in the UI (no way to fix it) and risking a stale value silently persisting to `dropoff_time_end` (its `|| null` fallback only catches an empty string). Fixed with a new effect that clears `dropoffTimeEnd` the moment mode becomes `TWO_DAY`, plus a guard at both `getDropoffWindowError` call sites skipping the check in that mode regardless.
2. **Per-stop time validation broke across the Two-Day boundary.** `getStopTimeError` unconditionally compared a stop's time against the pickup window's end — correct in Same-Day mode, meaningless in Two-Day mode where stops happen on Day 2, a different calendar day (a legitimate 09:00 Day-2 stop would wrongly compare as "before" a 17:00 Day-1 pickup window). Fixed by adding an `isTwoDay` param that skips just that sub-check in Two-Day mode; the half-filled-window and end-after-start checks are unaffected since neither depends on which day it is.

Build/lint-verified. Not live-UI-verified — traced by hand through the exact field/state logic instead.

**New module: `src/lib/scheduleSimulator.js`** — pure logic (no React, no `window.google`), single source of truth for the constants and the simulation algorithm:
- `PICKUP_LOADING_MINUTES = 30`, `UNLOAD_MINUTES = 30`, `REST_INTERVAL_HOURS = 2`, `REST_MINUTES = 15`, `MEAL_MINUTES = 30`, `MAX_TOTAL_DELIVERY_HOURS = 13`.
- `LUNCH_THRESHOLD_MINUTES` (12:00) / `DINNER_THRESHOLD_MINUTES` (18:00) — **single crossing instants, not start/end windows**, per explicit user clarification ("no specific time... just add it to be calculated"). The first time the simulated clock passes noon/6pm that day (and that meal hasn't already been served) the 30-min block is added; if a day's start time is already past a threshold, that meal is treated as already eaten before the day began and never added later that day. When both trigger in one day's schedule, that's 30+30 = 60 minutes total.
- `simulateSchedule({ mode, day1StartTime, day2StartTime, legTravelSeconds })` → `{ day1TotalSeconds, day2TotalSeconds, totalSeconds, exceedsLimit }`. Internally tracks a single "time-since-last-break" counter (incremented only by travel, reset by any of rest/lunch/dinner — a meal is a genuine stop, so it shouldn't leave a spurious rest stacked right after it) and walks the leg chain inserting rests/meals as reached — but only returns the three totals, no itemized event list, per explicit user scope ("just the 3 totals... no itemized breakdown shown").
- **Same-Day**: one day, starts at `day1StartTime` (= `pickupTime`), includes the loading block, walks every leg (pickup→dropoff→stop1→stop2...). `day2TotalSeconds = null`.
- **Two-Day**: `day1TotalSeconds` is **fixed at exactly 30 minutes** — Day 1 is pickup/loading only, per explicit user decision ("Pickup + loading only, fixed 30 min... the form has no separate depot/origin, so there's nothing to drive on Day 1"). No travel ever happens on Day 1, so no rest/meal check ever fires there. Day 2 runs the identical per-leg walk starting at `day2StartTime`, with its own fresh lunch/dinner "served" flags.
- Verified by hand-tracing several scenarios (a 3h single leg crossing a rest boundary and lunch mid-unload; a start time already past the lunch threshold correctly not re-adding it; an over-cap two-day total correctly flagged) via a throwaway Node script before wiring into the page — all matched independent by-hand arithmetic.

**`delivery_mode` column** — new (`supabase/migrations/20260830150000_delivery_requests_delivery_mode.sql`, `text null`), the customer's `"SAME_DAY"`/`"TWO_DAY"` toggle choice. **Deliberately not persisting the full computed schedule breakdown** — only "show the customer... before submitting" was asked, not store it for later; recomputing on demand avoids a stored value going stale if the constants above are ever tuned. See `DATABASE.md`'s `delivery_requests` entry for the full column note.

**Day 2 start time reuses the existing `dropoffDate`/`dropoffTime` fields** (no new field) — Two-Day mode already requires `dropoffDate` to be after `pickupDate` (see `getScheduleErrors` below), and `dropoffTime` already meant "when does activity resume here." In Two-Day mode the field's label switches from "Open From – To" to "Day 2 Start Time" and its second ("to") input is hidden (a day-start instant, not a window) — see the `dropoff_time_end` note above.

**`getScheduleErrors` briefly gained, then lost, a `deliveryMode` param** — first added so `"SAME_DAY"` could require `dropoffDate === pickupDate` and `"TWO_DAY"` could require it strictly after; removed the same day once mode became a derived value instead of a customer-clicked toggle (see the "fully automatic" note above), since a mode that's computed from the dates can never disagree with them — the param would only ever have validated something already guaranteed true. `getScheduleErrors` is back to its original signature, no mode-awareness.

**Stop geocoding fix**: stops were never geocoded before this feature (`handleStopChange` discarded the lat/lng `LocationInput` already emitted) — a real gap, since the multi-leg schedule needs every stop's coordinates to build the Directions request. Fixed by capturing lat/lng live in `handleStopChange` (mirrors `handleChange`'s existing pickup/dropoff handling) plus reusing **`useResolvedStopCoords`** (`lib/forwardGeocode.js`, already built and already used this exact way by `DriverDeliveries.jsx`/`HelperDeliveries.jsx` — not rebuilt) as the Photon-by-text fallback for any stop whose live-captured coordinate is null. Live-captured coordinates win over the fallback (same "captured beats re-derived" precedent pickup/dropoff already use). Stop `lat`/`lng` stays **client-side only** — never added to `newRequest.stops`'s persisted shape (still just `location`/`dropoffTime`/`dropoffTimeEnd`), so nothing that reads `stops[]` elsewhere sees any new field.

**Multi-leg travel-time estimation**: `estimateLegDurations` (`CustomerRequestDelivery.jsx`, replaces the old single-leg `estimateTravelSeconds`) — one `DirectionsService` request with `waypoints` for the whole chain `[pickup, dropoff, ...stops]`, same traffic-aware shape (`drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' }`) every other route computation in the app uses (`DriverDeliveries.jsx`'s `computeRoute`, not exported/reusable as-is so this is a from-scratch analog). `optimizeWaypoints` deliberately left at its default `false` — the schedule must reflect the customer-entered stop order, not a re-optimized shortest path, since each returned leg maps 1:1 to an unload event in the simulator's walk.

**Live preview**: a debounced (~600ms) effect recomputes `scheduleResult` as mode/times/coordinates change, shown in a "Schedule Summary" card (Day 1 / Day 2 if applicable / Total only — no itemized listing) right after the stops section, before Cargo Details. All `setState` calls inside this effect are deferred past a microtask or the debounce's `setTimeout` boundary (never called synchronously in the effect body), matching `useResolvedStopCoords`'s own established pattern for this exact lint rule (`react-hooks/set-state-in-effect`).

**Route Plan Viewing (2026-09-11)**: a second debounced effect, same 600ms timing and same precondition checks as the schedule preview above, calls `computeSuggestedRoute` (`lib/suggestedRoute.js` — already built for `PlannedRouteMap`/`handleSubmit`, reused as-is) and renders the result live via `SuggestedRouteMap` (previously only ever shown post-submission, on `CustomerDeliveries.jsx`) directly under the Schedule Summary card. Deliberately a second, independent `DirectionsService` call rather than merged with `estimateLegDurations` above — two Directions requests per debounce tick instead of one, an explicit tradeoff for keeping the two live previews' failure modes independent (a broken route preview shouldn't take down the schedule estimate or vice versa). Purely informational, same as the schedule preview: never blocks Submit, and `handleSubmit` (next paragraph) still recomputes its own `suggested_route` fresh rather than trusting this preview.

**`handleSubmit`** always recomputes the schedule fresh (geocoding any missing stop coordinates via the same fallback, re-running `estimateLegDurations` + `simulateSchedule`) rather than trusting the live-preview state — same "never trust stale client state at the final gate" pattern the original single-leg check already used. On `exceedsLimit`, blocks with the **adapted `TravelTimeExceededModal`** (now shows the Day1/Day2/Total breakdown instead of a single "about X hours" line) instead of submitting.

**App-wide impact, verified not assumed**: grepped all of `src/` — `getScheduleErrors`, the old `estimateTravelSeconds`/`MAX_TRAVEL_HOURS`, and `TravelTimeExceededModal` are used exclusively inside `CustomerRequestDelivery.jsx`; `SupDeliveries.jsx`/`CustomerDeliveries.jsx` only import unrelated things (`truckTypes`, `getItemTypeLabel`) from `deliveryOptions.js`. Confirmed (again) `CustomerRequestDelivery.jsx` is the only `delivery_requests`-inserting path in the app. Grepped `scripts/` for anything referencing what was removed — no matches. Build/lint-verified (`npm run build`, `eslint` — no new errors beyond the one pre-existing, unrelated `CustomerRequestDelivery.jsx` lint error that predates this session's work). Not live-UI-verified end-to-end (no Customer test account exists in this repo's scripts).

## Quotation Negotiation (Supervisor ↔ Customer)

This is the real, already-partially-built flow (see `DATABASE.md`'s `delivery_requests`/`delivery_quotations` notes and `SupDeliveries.jsx`), documented here in place of the earlier simplified Approve/Reject description:

Supervisor reviews incoming requests with status `PENDING_REQUEST`.

Supervisor submits an initial quotation — a `delivery_quotations` row linked to the request — status becomes `QUOTATION_SUBMITTED`.

Customer may counter-offer (`delivery_requests.customer_counter_min`/`customer_counter_max`) — status becomes `COUNTER_OFFER_SUBMITTED`.

Supervisor may submit a revised quotation (another `delivery_quotations` row) — status becomes `FINAL_QUOTATION_SUBMITTED`. This can repeat until the Customer accepts.

Customer approves a quotation — status becomes `APPROVED`. This confirms the final delivery rate; no driver, helper, or truck has been decided yet.

## Delivery Crew Assignment (Supervisor)

Once a request is `APPROVED`, the Supervisor assigns:

- a Driver (`delivery_requests.assigned_driver_id`)
- one or more Helpers (`delivery_requests.assigned_helper_ids`) — the Driver and Helpers together make up the delivery crew
- a Truck (`delivery_requests.assigned_truck_plate`)

The backend records `assigned_at` and sets status to `ASSIGNED`.

The assigned delivery crew (driver and helpers) then sees this as their assigned delivery in their respective portals. `ASSIGNED` is the state Phase 3 (Start Trip) begins from once the driver is ready to actually start driving.

This assignment step is what makes the `delivery_requests` row ready for Phase 3 — no separate `trips` row gets created, per the decision in Required Schema above.

## Important Rules

Booking and Trip are now the same `delivery_requests` row (see Required Schema above) — there is no separate booking-status/trip-status pair to keep in sync. `PENDING_REQUEST`/`APPROVED`/etc. and Session-driven telemetry state coexist on that one row without conflicting (see `DATABASE.md`'s `delivery_requests` notes on why `status` and `sessions` are different concerns).

Quotation negotiation and crew (driver/helper) assignment are now documented above (2026-08-06) — `delivery_quotations` and `delivery_requests.assigned_helper_ids` already have backing schema, contradicting what this line used to say. `SupDeliveries.jsx`/`CustomerDeliveries.jsx` are the existing UI for this — per `00_IMPLEMENTATION_RULES.md`'s Existing UI and Design rule, wire into it as-is rather than rebuilding it.

Do not implement GPS, heartbeat, sessions, or alerts in this phase — those begin in Phase 3 onward, once the trip is Active.

A completed assignment is never reopened as the same trip. If a driver returns to the depot and later receives a new assignment (even the same day or the next day), that is a new trip creation — a new `delivery_requests` row via this phase's workflow — not a resumption of the prior one. See `01_SYSTEM_ARCHITECTURE.md`'s Trip definition.

## Deliverable

**Built** — this phase is fully implemented and live, not just planned; the line that previously stood here ("produce an implementation plan only, do not modify any code") was leftover from this doc's original planning-only pass and is stale as of every section above it. Exact build dates for the core flow aren't tracked (it predates this doc's most recent updates); what follows is a snapshot of what's actually shipped:

- **Customer booking form** — `CustomerRequestDelivery.jsx`, per the Booking Workflow section above, including the Luzon service-area and 13-hour travel-time checks documented there.
- **Quotation negotiation** — `SupDeliveries.jsx`/`CustomerDeliveries.jsx`, per the Quotation Negotiation section above (`delivery_quotations` table, counter-offer/revision flow).
- **Delivery crew assignment** — `SupDeliveries.jsx`, per the Delivery Crew Assignment section above (`assigned_driver_id`/`assigned_helper_ids`/`assigned_truck_plate`/`assigned_at`).
- **Suggested route generation** — gap #1 above (uses the legacy `DirectionsService`, not the Routes API this doc originally specified; see `02B_MULTI_STOP_DELIVERIES.md`'s "Real contradiction found and corrected") — built as part of `11_ROUTE_COMPARISON.md`'s Phase 11 work (`delivery_requests.suggested_route`, `driver-trip`'s `save-suggested-route` action), not in this phase.
- **Multi-stop `stops` column** — gap #2 above — built as Phase 2B, see `02B_MULTI_STOP_DELIVERIES.md`.

"Directly by a Supervisor, with no booking involved" (the Goal section's second creation path) was never built — confirmed while adding the 13-hour cap above that `CustomerRequestDelivery.jsx` is the only place in the codebase that inserts a `delivery_requests` row; Admin/Supervisor only ever update or quote existing ones. If a Supervisor-direct creation flow is still wanted, it remains unbuilt.
