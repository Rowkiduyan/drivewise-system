# Phase 2C - Route Styling & Proof-of-Delivery Visibility

## Goal

Two related pieces of polish on top of `02B_MULTI_STOP_DELIVERIES.md`'s multi-stop + photo-completion work, scoped here as a doc only (no code yet, per explicit user request):

1. A designated color and icon per leg/waypoint on the Driver's Live Navigation map — previously discussed and deferred (`STATUS.md`'s 2026-08-12 "Planned" entry: "Distinguishable pickup vs. dropoff markers/route color on `LiveNavigationMap`").
2. Every role that can see a completed delivery should also be able to view its proof-of-delivery photos (`pickup_photo_url`, `dropoff_photo_url`, `stops[].photoUrl` — added in `02B`'s "Photo-Required Chain Completion"): Supervisor (`SupDeliveries.jsx`, Completed Deliveries tab), Customer (`CustomerDeliveries.jsx`, Completed tab), Driver (`DriverDeliveries.jsx`, Past tab), Helper (`HelperDeliveries.jsx`, Past tab) — an icon on the delivery's detail view opens the photos.

## Part 1: Route color + icon per leg — IMPLEMENTED 2026-08-13

### Prior decision (STATUS.md, 2026-08-12, not built)

Two options were discussed and option (1) was recommended, then deferred: "(1) simpler — keep the one-leg-at-a-time model, add a distinct pin icon for whichever point is the current target plus a different route-polyline color per leg (e.g. amber heading to pickup, purple heading to dropoff); (2) bigger — show both pins and the full pickup→dropoff route simultaneously." That note predates `02B`'s Pickup → Dropoff → Stops chain — the design below updates option (1) for the chain instead of just two legs.

### Design (superseded amber/purple two-color plan — user asked for a distinct color per leg, not per DirectionsService call)

- **Polyline color is per-leg, not per-call**: each leg of the route (one `directions.routes[0].legs[]` entry per waypoint, plus the final leg) gets its own color from a fixed 6-color palette (`NAV_LEG_COLORS`: red, blue, green, purple, orange, pink — cycles if a chain has more legs than colors). The to-pickup leg is its own single-leg `DirectionsService` call and is always pinned to palette index 0 (red); the post-pickup chain's legs (pickup→dropoff, dropoff→stop 1, stop 1→stop 2, …) start one color over (blue) so the leg right after arriving at pickup is never the same color as the leg that led up to it.
- **Waypoint markers**, reusing the app's existing badge convention:
  - Pickup: blue/sky "P" (matches `SupDeliveries.jsx`/`HelperDeliveries.jsx`'s existing pickup badge color).
  - Dropoff: emerald "D" pin (matches the existing dropoff badge color).
  - Each stop ("Dropoff 2", "Dropoff 3", …): amber numbered pin (matches the numbered stop badges already built into `SupDeliveries.jsx`'s Location section for `02B`).
- **Current leg only, not the whole chain at once** (revised 2026-08-13, superseding the original "render every leg/pin simultaneously, mute the non-current ones" design below — user feedback: showing the entire future route/every pin at once read as cluttered for a turn-by-turn view). Only `legs[currentLegIndex]`'s polyline renders, and only the one pin whose coordinates match the current leg's `end_location` renders — not Pickup+Dropoff+every Stop simultaneously. Still colored/labeled per its position in the chain, so the color and pin still change leg to leg as the driver progresses; there just isn't a preview of the whole remaining route visible at once anymore.
- Dropoff/Stop pins use a proper map-pin teardrop SVG shape (`dropoffPinIcon`, Material "place" glyph), not a plain circle — added 2026-08-13 per user feedback that a circle alone didn't read as "you're supposed to drop off here." Pickup deliberately keeps the plain circle (conceptually different — picking up, not dropping off).

### Implementation (`DriverDeliveries.jsx`)

- `NAV_LEG_COLORS` constant (module-level, near `NAV_ZOOM`).
- `isCurrentNavTarget(coords, legEnd)` module-level helper — compares a parsed marker coordinate against the current leg's `end_location`; now also gates *whether* a pin renders at all, not just its emphasis styling.
- `dropoffPinIcon(fillColor, isCurrent)` module-level helper — builds the map-pin `Symbol` icon (custom SVG path, explicit `anchor`/`labelOrigin` since a custom path's natural anchor is `(0,0)`, not its visual tip/center the way `SymbolPath.CIRCLE`'s is).
- `LiveNavigationMap` gained four new props: `needsPickup` (renamed from the parent's `activeNeedsPickup`), `pickupCoords`, `dropoffCoords`, `allStops` — all sourced from `active.pickupCoords`/`active.destinationCoords`/`active.stops` in the parent, independent of the routing-only `origin`/`destination`/`stops` props (which represent the *current leg's* waypoints, not the full chain of points to render pins for).
- The single `overview_path` `<Polyline>` was replaced with one `<Polyline>` for `legs[currentLegIndex]` only, colored via `NAV_LEG_COLORS`.
- One conditionally-rendered `<Marker>` each for Pickup/Dropoff/every Stop, gated on `isCurrentNavTarget` — a stop is also skipped if its coordinates don't parse (same known limitation as routing itself, see `02B`'s "falls back... if the last stop's address doesn't parse to coordinates" note).

## Part 2: Proof-of-delivery visibility

### Data availability audit (done, no code changes)

- `admin-users`' `get-helper-deliveries` action already returns `pickupPhotoUrl`/`dropoffPhotoUrl`/`dropoffCompletedAt`/`stops` (with each entry's `photoUrl`) — added alongside `02B`'s Helper-owned completion actions. Nothing further needed on the Helper backend side.
- `admin-users`' `get-driver-deliveries` action returns `stops` but **not** `pickupPhotoUrl`/`dropoffPhotoUrl`/`dropoffCompletedAt` — needs the same three fields added (mirrors `get-helper-deliveries`' equivalent lines almost exactly).
- `SupDeliveries.jsx` and `CustomerDeliveries.jsx` both read `delivery_requests` directly via `.select('*')` under RLS (not through an Edge Function) — the raw photo/stop columns are already present in every fetched row today. Only their JS-side row mappers need to carry the fields through:
  - `SupDeliveries.jsx`'s `mapDbRequest` (`:2162` area) already carries `stops` through (added for `02B`'s Supervisor read-only display) but not `pickup_photo_url`/`dropoff_photo_url`/`dropoff_completed_at`.
  - `CustomerDeliveries.jsx`'s `mapDeliveryRow` (`:2454`) carries neither `stops` nor the photo fields today — needs all of them added.

### Supervisor — `SupDeliveries.jsx`, Completed Deliveries tab

The Completed tab (`activeModule === 'completed'`, `:4884`) uses a **different** detail view than the one `02B` extended with the Stops list — that earlier work was in the Assign-Vehicle-tab's request detail panel (`selectedRequest`, the "DELIVERY REQUEST DETAILS" panel with the Location/Stops section). Completed deliveries instead render `CompletedDeliveryReport` (`:1713`), which shows `DeliveryRequestDetails` (a "Details" tab) plus `QuotationTab`, and — only for entries that happen to have a matching mock `completed_delivery_reports[delivery.id]` entry — `trip`/`behavior`/`route` telemetry tabs. Real DB-backed deliveries fall back to just Details + Quotation, per the existing `report ? REPORT_TABS : REPORT_TABS.filter(...)` logic (`:1719`).

Add a "View Proof of Delivery" icon button to `CompletedDeliveryReport`'s header (next to the existing status badge, `:1723-1735`) or inside `DeliveryRequestDetails`'s own location display — opens a section/modal listing each completed chain item (Pickup, Dropoff, each Stop present) with its photo thumbnail, label, and completion timestamp. Depends on `mapDbRequest` carrying the photo fields through first (see audit above).

### Customer — `CustomerDeliveries.jsx`, Completed tab

`RequestDetailView` (`:724`) is the one shared detail view rendered for `selectedRequest` regardless of which tab it was opened from (`:2787-2799`), so no separate Completed-specific view exists to modify — the same component just needs the new section added, gated on the delivery actually having reached `DELIVERED`/`COMPLETED` (a Pending/In-Transit request has no photos yet). Depends on `mapDeliveryRow` carrying `pickupPhotoUrl`/`dropoffPhotoUrl`/`stops` through first (currently carries none of the three).

### Driver — `DriverDeliveries.jsx`, Past tab

`DeliveryDetailView` (`:1437`) already branches on `isArchived` (`delivery.status === 'COMPLETED' || 'DELIVERED'`, `:1438`) to decide whether to look up `COMPLETED_REPORT_DATA[delivery.id]` — that lookup is unrelated mock telemetry data (flagged separately in `STATUS.md` as its own already-known gap) and shouldn't gate the real proof-of-delivery section, which should render whenever `isArchived` is true regardless of whether mock report data exists for that id. Depends on `get-driver-deliveries` returning the photo fields (see audit above) and Driver's own `mapDelivery` (distinct from Helper's) carrying them through — neither exists today.

### Helper — `HelperDeliveries.jsx`, Past tab

Already has all the data it needs (`pickupPhotoUrl`/`dropoffPhotoUrl`/`dropoffCompletedAt`/`stops` with `photoUrl` per entry) — no backend or mapper changes required here. `DeliveryDetailView` (`:399`) is the one shared detail view for both Upcoming and Past tabs (`:1013-1019`, `:1035-1041`) — add the proof-of-delivery section there, gated the same way (`delivery.status === 'DELIVERED' || 'COMPLETED'`).

### On a shared component

Considered factoring a single `ProofOfDeliveryList`-style component reused across all four files, but this codebase doesn't share presentational components across portals anywhere else (each portal file is self-contained, e.g. `LiveAlertsCard` exists separately and near-identically in both `DriverDeliveries.jsx` and `HelperDeliveries.jsx` rather than being extracted) — every portal also has its own distinct color theme (amber Driver, teal Helper, blue Supervisor, emerald Customer) that a shared component would need to parameterize anyway. Recommend matching the existing convention: one small, similarly-shaped block written per file, not a shared component.

## Part 3: Location-gated proof completion — IMPLEMENTED 2026-08-13

Follow-up requested after Part 2 shipped: Confirm Pickup / Complete Dropoff / Complete Stop should only succeed if the crew is actually at the location, not completable from anywhere.

### Design

- **Location source**: there is no Helper-owned GPS device — only the truck's Raspberry Pi reports position (`01_SYSTEM_ARCHITECTURE.md`'s Raspberry Pi Responsibilities). Decided to reuse the delivery's own `gps_logs` (most recent reading by `delivery_request_id`, regardless of session state so it still works mid-Pause) as "where the crew currently is," rather than adding browser geolocation to the Helper portal — matches the existing architecture and the fact that Driver and Helper ride together (`STATUS.md`'s 2026-08-12 note).
- **Radius**: 200 meters.
- **Fails open** (allows completion through without a distance check) in two cases, both deliberate:
  - The target location isn't in parseable `"lat, lng"` form — most booked addresses are plain street text, same limitation the route/marker rendering already has (Part 1 above).
  - No `gps_logs` row exists yet for the delivery (e.g. the Raspberry Pi was never powered on) — matches `09_EDGE_CASES.md`'s existing principle that Trip functionality must not block on Pi absence.
- **Fails closed** (rejects with a distance-included error message, e.g. "You're too far from the location to complete this (about 2496m away, must be within 200m)") only when the target *does* parse to coordinates and a GPS reading *does* exist, but they're further apart than the radius.

### Implementation (`supabase/functions/admin-users/index.ts`)

- `PROOF_LOCATION_RADIUS_METERS` (200), a server-side `parseCoords` mirroring `DriverDeliveries.jsx`'s client-side one, `haversineMeters`, and `checkProofLocation(adminClient, deliveryId, targetLocation)` — the shared gate function.
- Called at the top of all three Helper-owned actions, immediately after the existing status/ownership checks and before `uploadProofPhoto`: `update-driver-delivery` (Confirm Pickup, target = `pickup_location`), `complete-dropoff` (target = `dropoff_location`), `complete-stop` (target = `stops[stopIndex].location`).
- No frontend changes needed — `HelperDeliveries.jsx`'s chain-completion modal already surfaces any `{error}` string the Edge Function returns.
- Deployed via `npx supabase functions deploy admin-users`; verified live against the `DR-0020` fixture (`scripts/prep-proof-photos-test.sh`): Confirm Pickup correctly rejected from ~2.5km away, then succeeded once a `gps_logs` row was inserted at the pickup coordinates.

## Part 4: "Dropoff N" terminology (not "Stop N") — IMPLEMENTED 2026-08-13

Follow-up requested after Parts 1-3 shipped: every item-label surface used inconsistent "Stop N" vs "Dropoff" vocabulary for what is, conceptually, the same kind of chain item (a location the crew drops something off at). Renamed to a single consistent scheme: Pickup → Dropoff → Dropoff 2 → Dropoff 3 → ... (i.e. `stops[i]` is "Dropoff `i + 2`", since the main `dropoff_location` is implicitly "Dropoff 1").

### Touched

- `HelperDeliveries.jsx`: Delivery Chain list item labels, confirm-modal title ("Complete Dropoff N" instead of "Complete Stop N"), `ProofOfDeliverySection` thumbnail labels.
- `DriverDeliveries.jsx`, `CustomerDeliveries.jsx`, `SupDeliveries.jsx`: `ProofOfDeliverySection` thumbnail labels (same rename, all four portals).
- `DriverDeliveries.jsx`'s `LiveNavigationMap`: each Stop marker's numeric badge label changed from `i + 1` to `i + 2` to match.
- `SupDeliveries.jsx`: the read-only "Stops (N)" section header (in the Assign-Vehicle tab's request detail panel, `02B`'s Location section) renamed to "Additional Dropoffs (N)"; its numbered badges now start at 2 instead of 1, so a badge's number always matches that item's "Dropoff N" label elsewhere.
- `CustomerRequestDelivery.jsx` (booking form): stop-input field labels renamed the same way. Also fixed a **stale/wrong label found while touching this file**: the "+ Add a stop" button read "between Pick Up and Drop Off," contradicting `02B_MULTI_STOP_DELIVERIES.md`'s already-documented correction that these locations come *after* Drop Off in the real chain order, not between pickup and dropoff — a leftover from before that correction shipped, never caught until this pass. Now reads "+ Add another dropoff after Drop Off."

### Deliberately not touched

`DriverDeliveries.jsx`'s Live Navigation turn-by-turn progress text ("Stop X of Y" / "Heading to Drop-off") — a different kind of label (a progress counter over `currentLegIndex`, not an item name), and its `X` doesn't map 1:1 onto the "Dropoff N" numbering the way item labels do (waypoint reordering means leg 0 already targets the main dropoff, not "stop 1"). Left as-is; flagged to the user as something that could be revisited separately if wanted.

## Deliverable

All four parts implemented 2026-08-13. Part 1: route markers/colors in `LiveNavigationMap` — revised same day to current-leg-only rendering and map-pin-shaped Dropoff/Stop markers, per direct user feedback while watching it live. Part 2: `get-driver-deliveries` now returns `pickupPhotoUrl`/`dropoffPhotoUrl`/`dropoffCompletedAt` (mirroring `get-helper-deliveries`); `SupDeliveries.jsx`'s `mapDbRequest`, `CustomerDeliveries.jsx`'s `mapDeliveryRow`, and `DriverDeliveries.jsx`'s `mapDelivery` all carry the photo fields (+`stops` for Customer) through; each of the four portal files gained its own `ProofOfDeliverySection` component (per the "On a shared component" note — not shared across files), gated on the delivery having reached `DELIVERED`/`COMPLETED`, rendering a thumbnail grid (Pickup/Dropoff/each completed item) that links out to the full-size photo. Part 3: Confirm Pickup/Complete Dropoff/Complete Stop are now gated on the crew's last known GPS position being within 200m of the target location. Part 4: item labels renamed to a consistent "Dropoff N" scheme across every portal.

Reusable test tooling built alongside this phase (all in `scripts/`, documented in `scripts/README.md`): a permanent fixture delivery `DR-0020` with a densely-captured route (`fixtures/DR-0020-legs.json`, every point along the actual road-following path, not just each turn's end point); `simulate-dr0020.sh` / `prep-proof-photos-test.sh` / `set-dr0020-location.sh` / `demo-dr0020.sh` (terminal scripts covering GPS replay, the Part 2/3 manual photo-upload walkthrough, and the Part 3 location-gate nudge); `demo-control-panel.html` (a standalone local-only browser tool with Play/Stop/Next buttons for the same actions, for driving a live demo without a terminal — never part of the deployed app, since its actions need the `service_role` key, which must never ship to users).
