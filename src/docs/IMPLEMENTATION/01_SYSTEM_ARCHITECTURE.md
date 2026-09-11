# Phase 1 - Verify System Architecture

## Goal

Understand and verify the overall architecture before implementation.

## Tasks

Read DATABASE.md.

Verify the relationships between:

- devices
- trucks (a device is linked to its truck directly via `devices.plate_number` — no separate assignment table, decided 2026-08-06: history isn't needed)
- delivery_requests (plays the "trip" role — no separate `trips` table, decided 2026-08-08, see `02_BOOKING_AND_TRIP_CREATION.md`)
- sessions (now linked to `delivery_requests`/`driver_records`/`trucks`/`devices`, see `DATABASE.md`)
- gps_logs
- alerts

Verify that the architecture follows these principles:

- Driver uses a web application (installable as a home-screen shortcut/PWA), not a native mobile application.
- Raspberry Pi is an independent telemetry device.
- Raspberry Pi communicates only with Supabase.
- Driver web application communicates only with Supabase.
- The Driver Web Application and Raspberry Pi never communicate directly.
- Raspberry Pi never knows the driver.
- Raspberry Pi never knows the truck.
- Raspberry Pi never knows the trip.
- Raspberry Pi never knows the session.

The backend connects incoming telemetry to the active session using device_id.

## Deliverable

Produce an implementation plan only.

Do not modify any code.

---

## Trip

A Trip represents one business assignment.

A Trip may:

- contain one or more driving sessions
- contain one or more planned/delivery stops
- span multiple days

A Trip ends only when the business assignment is completed.

Examples of ONE Trip:

- Delivering to multiple branches during one dispatch.
- Delivering to multiple customers during one planned route.
- A long-haul delivery with an overnight stop.

However, if the driver completes an assignment, returns to the depot, and receives a new assignment later (e.g. the following day), that is a NEW Trip — it is never resumed as the same Trip.

Example:

- Day 1: Depot → Warehouse → Depot — Trip Completed.
- Day 2: Depot → Customer — a New Trip.

---

## Session

A Session represents one continuous period of driving.

A Session:

- is created whenever driving begins — starts when the driver presses Start Trip or Resume Trip
- ends whenever driving stops — ends when the driver presses Pause Trip or End Trip

Alerts belong to Sessions. GPS logs belong to the Trip directly, and additionally to a Session whenever one happens to be open (see `05_GPS_PIPELINE.md`'s "GPS-during-Pause" note — a GPS log captured during a Pause has no Session to attach to, only a Trip).

Sessions never resume. If the driver resumes driving later for the same Trip, a new Session is created.

A Trip may contain multiple Sessions.

---

## Route Comparison

The suggested route belongs to the Trip.

The actual route is reconstructed by combining the GPS logs from all Sessions belonging to that Trip, in chronological order — Session-scoped, so this only ever draws on Active-Session readings (Paused-Trip readings, which have no Session, are for live Supervisor position tracking, not route reconstruction — see `05_GPS_PIPELINE.md`). This is why GPS logs must always be attributable to their Trip, and, whenever a Session is open, to that Session as well.

The suggested route is shown in two different places, to two different audiences:

- Driver Web Application — a navigation view showing the suggested route to follow while driving. Despite being a web app, the driver uses it like a mobile app (installed as a home-screen shortcut/PWA — see the architecture principles above), so this map view must fit the mobile layout the Driver portal already uses (hamburger menu, no sidebar — see `UI/LAYOUT.md`'s Mobile section), not a desktop-style layout.
- Supervisor Dashboard — a tracking view showing the truck's live position, plus, once GPS logs exist, the reconstructed actual route overlaid against the suggested route for comparison (see `08_REALTIME_DASHBOARD.md`).

**Contradiction found 2026-08-08, reopened 2026-08-12 — not resolved.** The line above used to say "(Google Maps)" for both views, matching the Google Maps Platform Setup decision in `02_BOOKING_AND_TRIP_CREATION.md`. The already-built `DriverDeliveries.jsx` currently renders its embedded map with **Leaflet**/`react-leaflet` (`MapContainer`, `Polyline`, `Marker`) instead, with Google Maps only appearing as a `toGoogleMapsDirections()` deep-link handing off to the driver's native Google Maps app for actual turn-by-turn navigation.

A same-day resolution ("keep Leaflet, since ripping out working existing UI is against the rules, and the JS API can't replicate native turn-by-turn anyway") was drafted and then reverted the same day once it came to light that **the project's capstone documentation specifies in-app navigation built with the Google Maps JavaScript API** — a fixed external requirement, not a preference this project is free to resolve by keeping whatever's already built. This is exactly the "existing UI is genuinely incompatible with required functionality, report rather than silently resolve" case `00_IMPLEMENTATION_RULES.md` calls for.

**Scope decided and implemented 2026-08-12.** The Driver app's navigation view (`DriverDeliveries.jsx`) now has a `LiveNavigationMap` component built on the Google Maps JavaScript API (via `@react-google-maps/api`), shown only during the driving stage (`isDrivingStage` — `FOR_PICKUP`/`OUT_FOR_DELIVERY` with an open Session; before that, the original static Google Maps iframe embed still shows, unchanged). Route is computed client-side via `DirectionsService` from the existing pickup/dropoff coordinates — no schema/backend change needed for route storage. Live position comes from the Raspberry Pi's `gps_logs` uploads via a Realtime subscription (mirroring the existing `alerts` subscription pattern, gated on `isMonitoring` so it correctly freezes during Pause), not browser geolocation. Rerouting on deviation uses `google.maps.geometry.poly.isLocationOnEdge` against the rendered route polyline, debounced to at most once per ~12s. Turn-by-turn step advance uses `computeDistanceBetween` against each step's end point. Voice guidance (Web Speech API `SpeechSynthesisUtterance`, one announcement per step, mutable) was added alongside the visual instructions, matching the app's existing drowsiness-alert audio precedent. The existing `toGoogleMapsDirections()` deep-link to the driver's native Google Maps app is kept as a fallback "Navigate Now" button inside the new component, not removed. Required one new grant: `authenticated: select` on `gps_logs` (see `DATABASE.md`). Still open: whether the Supervisor Dashboard's map (Phase 8, not yet built) follows the same Google Maps JS pattern or stays Leaflet — not decided, since the capstone requirement was specifically about driver navigation, not supervisor tracking; ask before assuming either way when Phase 8 starts. Not yet click-tested live in the browser — see `STATUS.md` for verification status.

**Second confirmation this is `DirectionsService`, not the Routes API (2026-08-12, Phase 2B):** `02_BOOKING_AND_TRIP_CREATION.md`'s multi-stop schema decision separately assumed the Routes API's `computeRoutes`/`intermediates` — building multi-stop waypoints against the actually-shipped code required correcting that to `DirectionsService`'s `waypoints` field instead. See `02B_MULTI_STOP_DELIVERIES.md`.

**Post-trip comparison plan drafted 2026-08-13, not built:** the "reconstructed actual route overlaid against the suggested route" piece described above (the Supervisor-facing half) is now specced out in `11_ROUTE_COMPARISON.md` — the comparison UI already exists (`SupDeliveries.jsx`'s `RouteDeviationMap`, currently mock-only), but the suggested route itself is never persisted anywhere (only computed live, recomputed on every render, by `LiveNavigationMap`'s `DirectionsService` calls), which is the actual gap that doc reports and proposes a fix for. See that doc before implementing.

**Reroute-on-deviation is now recorded, not just performed, 2026-09-11:** the "Rerouting on deviation... debounced" line above is still mechanically accurate (same `isLocationOnEdge` check, still fully automatic, no driver interaction), but every time it fires the resulting path now also gets persisted (new `reroute_events` table) so the post-trip comparison above can tell an app-initiated reroute apart from genuine unexplained deviation. Full detail in `11_ROUTE_COMPARISON.md`'s "Reroute-Aware Deviation Verdict" section.

**Doc-sync flag, noticed while writing the note above, not fixed here:** that same line states the reroute debounce as "~12s" — the live constant (`NAV_REROUTE_DEBOUNCE_MS`, `DriverDeliveries.jsx`) is actually `5000` (5s), changed 2026-08-15 per the constant's own comment ("was 12000... shortened per explicit user request... felt too unresponsive"). This line was never updated to match at the time. Flagging per this project's own doc-accuracy convention rather than silently correcting a line outside today's actual task — worth a one-line fix next time this section is touched.

**Live position source changed 2026-08-31 — now the driver's own phone GPS, not the Pi:** the "Live position comes from the Raspberry Pi's `gps_logs` uploads... not browser geolocation" line above is superseded for the Driver's own `LiveNavigationMap` view only. `livePosition` is now sourced primarily from `navigator.geolocation.watchPosition` (the driver's phone), falling back to the existing `gps_logs` Realtime subscription only when the phone has no reading. This does not touch any of the architecture principles above (Pi still communicates only with Supabase, still never knows the driver/truck/trip/session, still the sole writer of `gps_logs`) — phone GPS is read client-side by the Driver Web Application itself, not a new channel to/from the Pi, and is never written back to `gps_logs`. Supervisor tracking, truck mileage, and Route Comparison all still read `gps_logs` exclusively and are unaffected. See `05_GPS_PIPELINE.md`'s "GPS Source Split" note for the reasoning.

**Routing target reworked, same day, later session:** "drop-off coordinates" is no longer always the final navigation target once stops exist — the real completion order is Pickup → Dropoff → Stop 1 → ... → Stop N, so `dropoff_location` can be a mid-route waypoint now, with the last stop as the actual destination. See `02B_MULTI_STOP_DELIVERIES.md`'s "Photo-Required Chain Completion" section, which also moved what used to be a Driver-pressed "Complete Delivery" button (ending the Session via `driver-trip`'s `end-trip`) to fire automatically off whichever action completes that last item — now Helper-triggered, not Driver-triggered.