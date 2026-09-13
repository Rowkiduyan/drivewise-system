# Phase 14B - "Arrived at Base" Confirmation + Supervisor Visibility

## Status: implemented 2026-09-13

## Goal

`14_RETURN_TRIP_MONITORING.md`'s manual "Arrived at Base" button
(`DriverDeliveries.jsx`'s `handleArrivedAtBase` → `driver-trip`'s
`end-return-trip` action) exists as a fallback for the rare case the
automatic ~150m geofence never fires. Right now it's a plain button with no
confirmation step, and closes the return-trip Session unconditionally
regardless of where the driver actually is — a driver could tap it from
anywhere and the Session just closes, no questions asked.

Per explicit user instruction: the button should **stay clickable even when
the driver genuinely isn't at the warehouse yet** (no hard block — it's
still a legitimate fallback for GPS drift/a slightly-off geofence, and nothing
should force a driver to physically be somewhere before software will
believe them). But tapping it while clearly not there yet should show a
**confirm modal that warns the driver their Supervisor will be able to see
this** — and that visibility must be **passive/inspectable, not a push
notification**: nothing pages the Supervisor in real time, nothing shows up
as an alert or toast on their end. It just becomes visible if/when they
look at that trip's report, the same way every other real-data detail in
this app already is.

## Scope decisions (explicit)

- **No hard block.** The button always works, at any distance. This is a
  transparency/accountability feature, not an enforcement one — matches
  this phase's own "the geofence auto-close already covers the honest case,
  this button is just a fallback" framing from `14_RETURN_TRIP_MONITORING.md`.
- **Warn conditionally, not always.** A driver tapping the button while
  actually near the warehouse (geofence would have fired shortly anyway)
  doesn't need a scary warning — only show the "your Supervisor will see
  this" copy when the driver's current position is genuinely outside the
  ~150m geofence at the moment they tap it. Reuses the same
  `RETURN_TRIP_GEOFENCE_METERS` constant `driver-trip`/`gps-upload` already
  use for the automatic close, so "far enough to warn about" means exactly
  the same thing everywhere in this feature.
- **Passive visibility, not a notification.** Nothing calls the
  Supervisor's Realtime dashboard, nothing inserts an alert row, nothing
  triggers a toast/push/badge count on the Supervisor's side. The fact is
  simply recorded on the Session at close time and shown wherever that
  Session's data already surfaces (Supervisor's DriveWise Report /
  per-session breakdown, same place the existing "RETURN TO BASE" label
  renders) — visible only if a Supervisor actually opens that trip's report,
  same as everything else in it.
- **Recorded once, at close time** — not tracked live, not updated
  afterward. The distance is a one-time fact about the moment the driver
  chose to close it manually, not an ongoing status.

## Key facts confirmed via code trace

- `handleArrivedAtBase`/`endReturnTrip` (`DriverDeliveries.jsx`, added
  2026-09-11) currently call `driver-trip`'s `end-return-trip` directly, with
  no confirm modal — unlike every other trip action on this page (`Pause
  Trip`, `Resume Trip`, `Arrived at Pickup/Drop-off`, stage-advance), which
  all go through a `confirming<X>` boolean + a modal + `runTripAction`. See
  `confirmingArrival`'s modal (`DriverDeliveries.jsx`, "Record arrival at
  pickup/drop-off?") for the exact structure this phase's new modal should
  match — same z-index layering (`z-[60]`), same Cancel/Confirm button pair,
  same `isSubmittingTripAction`-driven loading state via `runTripAction`.
- `end-return-trip` (`supabase/functions/driver-trip/index.ts`) currently
  takes only `deliveryRequestId` in its body and closes the session via the
  shared `closeReturnTripSession` helper, which has no concept of "how far
  from the warehouse was this." The helper needs either a lat/lng passed in
  (from the driver's current `livePosition` at the moment of the tap — the
  most accurate, freshest value available, already computed client-side for
  the live-nav card's own distance readout) or to fall back to the most
  recent `gps_logs` row for that session if the client can't supply one
  (mirrors this codebase's existing "prefer live, fall back to last known"
  pattern elsewhere).
- The geofence check itself (`distanceKm(...) * 1000 <=
  RETURN_TRIP_GEOFENCE_METERS`) already exists in three places
  (`driver-trip`'s `log-position`, `gps-upload`, and now would be a fourth
  in `end-return-trip`) — this phase doesn't need a new distance formula,
  just one more call site of the same math against the same constant.

## Required Schema

Per `00_IMPLEMENTATION_RULES.md`, reported here rather than assumed:

- `sessions.manual_close_offset_meters` (numeric, nullable) — the distance
  (in meters) from `WAREHOUSE_COORDS` at the moment `end-return-trip` closed
  this Session, or `null` for every Session not closed this way (auto-closed
  via geofence/timeout, closed by `start-trip`'s force-close, or not a
  return-trip Session at all). Presence alone (`is not null`) is what marks
  "this was a manual close where the driver wasn't actually there yet" — a
  manual close from *within* the geofence intentionally also writes a value
  here (a small one), so the Supervisor's report can show the real number
  either way rather than only ever showing the flagged cases; the UI layer
  decides whether to call it out based on the stored value being over/under
  `RETURN_TRIP_GEOFENCE_METERS`, not a separate boolean.

## Approach

### 1. Schema
New migration: `alter table public.sessions add column if not exists
manual_close_offset_meters numeric;` — same lightweight-flag precedent as
`is_return_trip`/`rest_stop_recommended`.

### 2. Backend (`driver-trip`'s `end-return-trip`)
- Accept optional `lat`/`lng` in the request body (the driver's current
  `livePosition` at tap time, sent from the frontend).
- If provided and finite, compute `distanceKm(lat, lng, WAREHOUSE_COORDS.lat,
  WAREHOUSE_COORDS.lng) * 1000` directly. If not provided (or not finite —
  e.g. `livePosition` genuinely never resolved), fall back to the most
  recent `gps_logs` row for this session (same "best available" reasoning
  `log-position`/`gps-upload` already lean on elsewhere); if neither exists,
  leave `manual_close_offset_meters` `null` rather than fabricating a
  number.
- Pass the computed value through to `closeReturnTripSession` (extend its
  signature with an optional `manualCloseOffsetMeters` param) so it's
  written in the same `sessions` update the helper already performs — no
  second round-trip.

### 3. Frontend (`DriverDeliveries.jsx`)
- New `confirmingArrivedAtBase` state (same pattern as `confirmingArrival`
  etc.) — `handleArrivedAtBase` (currently calling `runTripAction` directly)
  becomes `() => setConfirmingArrivedAtBase(true)`; the modal's own Confirm
  button calls `runTripAction(endReturnTrip, () =>
  setConfirmingArrivedAtBase(false))`, matching every other confirm modal on
  this page exactly.
- The modal's body copy branches on whether `livePosition` is currently
  within `RETURN_TRIP_GEOFENCE_METERS` of `WAREHOUSE_COORDS` (computed
  client-side via the same `distanceMeters` helper `ReturnTripNavigationMap`
  already uses for its own distance-to-base readout):
  - **Within the geofence** (or `livePosition` unavailable): plain
    confirmation, no warning — "Confirm you've arrived at the warehouse?"
    same tone as the existing `confirmingArrival` modal.
  - **Outside the geofence**: the actual ask from this phase — something
    like "You're still {distance} from the warehouse. If you close this now,
    your Supervisor will be able to see that you marked this trip complete
    before actually arriving. Continue anyway?" — worded as a heads-up, not
    a threat, and not blocking the action either way (Cancel/Confirm both
    stay available).
- `endReturnTrip`'s `supabase.functions.invoke` call gains `lat`/`lng` from
  `livePosition` in its body (when available), matching the backend's new
  optional params above.

### 4. Supervisor visibility (passive, per-session)
- `buildRealTripAndBehaviorReport` (`SupDeliveries.jsx`) and
  `buildRealDriverTripReport` (`DriverDeliveries.jsx`, shared by
  `HelperDeliveries.jsx`) both already select
  `session_id, start_time, end_time, total_alerts, session_duration,
  is_return_trip` per session (`14_RETURN_TRIP_MONITORING.md`) — add
  `manual_close_offset_meters` to that same select in all three fetch sites,
  and thread it into each function's `behavior.sessions`/`sessions` mapping
  (same place the `label: s.is_return_trip ? "Return to Base" : null` field
  already lives).
- In the per-session breakdown UI (both `SupDeliveries.jsx`'s
  `DriveWiseAnalysisTab` and `DriverDeliveries.jsx`'s
  `CompletedDeliveryReport`, same rows the existing "RETURN TO BASE" badge
  renders in): when `manual_close_offset_meters` is present **and** exceeds
  `RETURN_TRIP_GEOFENCE_METERS`, show a small, quiet secondary badge/note —
  e.g. "Closed {X.X}km from base" — next to the existing "RETURN TO BASE"
  label. Not a banner, not a color-coded warning tone (red/amber) — this is
  a factual note for a Supervisor who's already looking, not an accusation;
  matches this phase's own "passive, not a notification" scope decision.
  A manual close **within** the geofence shows nothing extra (the number is
  still stored, just not surfaced as a callout — see the schema note above
  for why it's still written either way).

## Files to touch when implemented
- `supabase/migrations/<new>.sql` — `sessions.manual_close_offset_meters`.
- `supabase/functions/driver-trip/index.ts` — `end-return-trip` (accept
  `lat`/`lng`, compute offset), `closeReturnTripSession` (accept + persist
  the optional offset).
- `src/pages/DriverDeliveries.jsx` — `confirmingArrivedAtBase` state + modal,
  `handleArrivedAtBase`/`endReturnTrip` wiring, `manual_close_offset_meters`
  threaded through `buildRealDriverTripReport`'s session select/mapping, the
  per-session breakdown UI's new badge.
- `src/pages/HelperDeliveries.jsx` — same session-select addition (shares
  `buildRealDriverTripReport`, so no separate mapping/UI work needed there
  beyond the fetch).
- `src/pages/SupDeliveries.jsx` — same session-select addition,
  `buildRealTripAndBehaviorReport`'s mapping, and its own copy of the
  per-session breakdown UI's new badge.
- `src/docs/DATABASE.md` — document the new column.

## Verification plan (once implemented)
- `npm run build` / `eslint` / `deno check` clean.
- Live: open the Driver portal with `livePosition` genuinely far from
  `WAREHOUSE_COORDS` (or simulate via geolocation override), tap "Arrived at
  Base" — confirm the warning-copy modal appears, Cancel leaves the Session
  open, Confirm closes it and records a real
  `manual_close_offset_meters` value.
- Repeat with `livePosition` inside the geofence — confirm the plain
  (non-warning) modal appears instead, and the stored offset is small
  (under `RETURN_TRIP_GEOFENCE_METERS`).
- Open that delivery's completed report as both Driver and Supervisor —
  confirm the "Closed {X}km from base" badge appears only for the
  far-from-base case, next to the existing "RETURN TO BASE" label, with no
  toast/alert/notification firing anywhere on the Supervisor's side at the
  time it happened.
- Confirm a session closed by the automatic geofence, the safety-net
  timeout, or `start-trip`'s force-close all leave
  `manual_close_offset_meters` `null` — this is strictly an
  `end-return-trip`-only field.

## Open questions for whoever implements this
- Exact copy for the warning modal — the draft above ("your Supervisor will
  be able to see that you marked this trip complete before actually
  arriving") is a starting point, not final wording; worth confirming tone
  before shipping, especially in translation if this app ever needs one.
- Whether the Supervisor's badge should show the precise distance (e.g.
  "4.2km from base") or a coarser bucket (e.g. "Closed early") — precise is
  more informative but a touch more clinical; not explicitly decided.

**Resolved at implementation (2026-09-13):** shipped with the draft warning
copy as-is, and the precise-distance badge ("Closed {X.X}km from base") over
a coarse bucket — both were left as open/not-explicitly-decided rather than
blocking, and neither has a correctness implication if revisited later.
Flag to the user for a tone/copy pass if this ships somewhere more visible
than an internal per-session breakdown.
