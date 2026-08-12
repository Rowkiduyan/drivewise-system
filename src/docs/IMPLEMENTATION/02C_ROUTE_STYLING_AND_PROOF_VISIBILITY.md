# Phase 2C - Route Styling & Proof-of-Delivery Visibility

## Goal

Two related pieces of polish on top of `02B_MULTI_STOP_DELIVERIES.md`'s multi-stop + photo-completion work, scoped here as a doc only (no code yet, per explicit user request):

1. A designated color and icon per leg/waypoint on the Driver's Live Navigation map — previously discussed and deferred (`STATUS.md`'s 2026-08-12 "Planned" entry: "Distinguishable pickup vs. dropoff markers/route color on `LiveNavigationMap`").
2. Every role that can see a completed delivery should also be able to view its proof-of-delivery photos (`pickup_photo_url`, `dropoff_photo_url`, `stops[].photoUrl` — added in `02B`'s "Photo-Required Chain Completion"): Supervisor (`SupDeliveries.jsx`, Completed Deliveries tab), Customer (`CustomerDeliveries.jsx`, Completed tab), Driver (`DriverDeliveries.jsx`, Past tab), Helper (`HelperDeliveries.jsx`, Past tab) — an icon on the delivery's detail view opens the photos.

## Part 1: Route color + icon per leg

### Prior decision (STATUS.md, 2026-08-12, not built)

Two options were discussed and option (1) was recommended, then deferred: "(1) simpler — keep the one-leg-at-a-time model, add a distinct pin icon for whichever point is the current target plus a different route-polyline color per leg (e.g. amber heading to pickup, purple heading to dropoff); (2) bigger — show both pins and the full pickup→dropoff route simultaneously." That note predates `02B`'s Pickup → Dropoff → Stops chain — the design below updates option (1) for the chain instead of just two legs.

### Design

- **Polyline color** stays a single color per active `DirectionsService` call (there's only ever one route rendered at a time — either the to-pickup leg or the post-pickup chain): **amber** while `activeNeedsPickup` is true (heading to pickup), the existing **purple** (`#7C3AED`) for the whole post-pickup chain (dropoff + stops). No per-stop color variation within the chain — it's one continuous drive.
- **Waypoint markers**: today the map only shows the live-position arrow, no markers for the actual pickup/dropoff/stop points themselves. Add one `<Marker>` per relevant waypoint on the current leg, reusing the app's existing badge convention already used elsewhere for consistency rather than inventing new colors:
  - Pickup: blue/sky "P" (matches `SupDeliveries.jsx`/`HelperDeliveries.jsx`'s existing pickup badge color).
  - Dropoff: emerald "D" (matches the existing dropoff badge color).
  - Each stop: amber numbered circle (matches the numbered stop badges already built into `SupDeliveries.jsx`'s Location section for `02B`).
- **Current target emphasis**: whichever waypoint the driver is actually en route to right now (derived the same way the existing "Stop X of Y" `currentLegIndex` tracking already knows) renders larger/highlighted; the rest of the upcoming chain shows as smaller, muted pins — same "know what's coming, but don't lose track of what's next" turn-by-turn convention most nav apps use.

### Implementation surface (for the follow-up coding pass)

- `DriverDeliveries.jsx`'s `LiveNavigationMap` component (`~:364` onward): add `<Marker>` elements per waypoint coordinate for the current leg/chain, styled per the color/icon rules above. Needs `parseCoords()` applied to pickup/dropoff/each stop's `location` the same way the route/waypoints logic already does — a marker can't render for a waypoint whose address doesn't parse to coordinates (same known limitation as routing itself, see `02B`'s "falls back... if the last stop's address doesn't parse to coordinates" note).
- `<Polyline>`'s `strokeColor` prop: currently hardcoded purple — make conditional on `activeNeedsPickup` (already available as a prop/derived value in the parent).
- The "current target" marker's highlight state needs `currentLegIndex` (already tracked internally by `LiveNavigationMap` for the "Stop X of Y" indicator) exposed to the marker-rendering logic — it's already component-local state, no new prop needed.

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

## Deliverable

This document only — no code changes in this pass. The actual implementation (route markers/colors in `LiveNavigationMap`, the four `get-*-deliveries`/mapper updates, and the four proof-of-delivery UI sections) is the next step, pending approval to proceed.
