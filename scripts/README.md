# Test scripts

## Browser control panel (`demo-control-panel.html`)

A self-serve alternative to asking someone to run the shell scripts below —
Play/Stop/Next buttons instead of terminal commands, for driving the demo
live without needing a terminal in front of you (e.g. showing it to your
professor). **Local-only, never deployed**: open the file directly in a
browser on your own machine (double-click it, or `file://` it) — it is not
part of the built app and is never served by Vite.

- **Part 1 (route colors)**: "Play GPS Route" replays the same saved
  `fixtures/DR-0020-legs.json` route `simulate-dr0020.sh` uses, with a "Stop"
  button to abort mid-replay. Open the Driver portal's Live Navigation for
  DR-0020 in another tab first, then Play.
- **Part 2/3 (photo upload + location gate)**: "Reset Chain" mirrors
  `prep-proof-photos-test.sh` (assigns Helper H003, resets DR-0020 to a clean
  `OUT_FOR_PICKUP` state, positions the crew at Pickup). "Next" cycles the
  crew's position through Dropoff → Dropoff 2 → Dropoff 3, mirroring
  `set-dr0020-location.sh` — click it right before completing each next step
  in the real Helper UI.

Needs your Supabase project's URL/anon key (prefilled with this project's
public values, safe to hardcode — they already ship in the deployed app
bundle) and your `service_role` key, which you paste into a password-masked
field on first use. **The service_role key is saved only to that browser's
`localStorage` on your own machine — it is never written into this file,
never sent anywhere but your own Supabase project, and never committed.**
This is exactly why this stays a standalone local HTML file instead of a
button inside the real Driver/Helper app: the app's shipped JS bundle can
never safely hold a `service_role` key (see `admin-users/index.ts`'s own
warning about this), so any in-app version of this control would need a new
server-side Edge Function action instead — more invasive, and it'd add
permanent test-only code paths to the graded app itself. This file sidesteps
that entirely by never being part of the deployed app.

## Full demo (`demo-dr0020.sh`)

One command for the whole Phase 2C demo (route colors + proof-of-delivery
photos) on the DR-0020 fixture — this is the one to reference for a
professor/live demo:

```bash
bash scripts/demo-dr0020.sh [delay_seconds]
```

Runs `simulate-dr0020.sh` (Part 1 — watch the route colors live), then
`prep-proof-photos-test.sh` (Part 2 — resets DR-0020 and assigns the test
Helper so you can manually complete Confirm Pickup -> Complete Dropoff ->
Complete Stop 1 -> Complete Stop 2 in the real Helper UI, picking actual
photos from your device each time). See each script's own section below for
what it does individually if you only need one part.

## Quick replay: DR-0020 fixture (`simulate-dr0020.sh`)

The fastest way to re-watch the per-leg route colors/pins
(`02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md`) without redoing the capture
step below. Uses a permanent fixture delivery, `DR-0020` (driver D002,
`ayroque01@drivewise.local`, pickup/dropoff in Metro Manila with 2 stops) and
its already-captured route geometry (`fixtures/DR-0020-legs.json` — 559
points, every point along each step's actual road-following path rather than
just each turn's end point, so replaying it glides along the road instead of
jumping between sparse waypoints; reusable indefinitely since the fixture's
coordinates never change).

```bash
# 1. Open the app yourself, log in as ayroque01@drivewise.local, navigate to
#    DR-0020's Live Navigation view so you can watch it live.
# 2. Replay the saved route:
bash scripts/simulate-dr0020.sh [delay_seconds]   # default 0.1s/tick (~56s total)
```

Idempotent: reuses DR-0020's existing Active session if one is already open,
otherwise resets it to `ASSIGNED`, starts a fresh trip, and fast-forwards
straight to `OUT_FOR_DROPOFF` via `service_role` (skipping the Helper-owned
Confirm Pickup step — fine for a route-rendering test, since that step only
gates the *pickup* leg, not the dropoff-leg chain colors this fixture is for).

If you need a *different* route (different coordinates/stop count) than this
fixture, follow the general capture flow below instead and save your own
`fixtures/<id>-legs.json`.

## Proof-of-delivery photo upload prep (`prep-proof-photos-test.sh`)

Sets up DR-0020 for a **manual** test of the Helper's photo-required chain
completion (`02B_MULTI_STOP_DELIVERIES.md`'s Photo-Required Chain Completion,
`02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md`'s Proof of Delivery visibility).
This script only resets delivery/session state via `service_role` — it does
**not** upload any photo itself. You then go through the real Helper UI and
pick actual photos from your own device, exercising the real file-picker/
upload path end to end (not a scripted payload), which is what actually
demonstrates the feature.

```bash
bash scripts/prep-proof-photos-test.sh
```

Assigns Helper H003 (`tdtdurden01@marveltrucking.local`) to DR-0020, ensures
an Active session exists, resets the chain to a clean `OUT_FOR_PICKUP` state
(no photos, both stops uncompleted), and moves the crew's position to the
pickup point (see the location gate below). Then in a real browser:

1. Log in as `tdtdurden01@marveltrucking.local`
2. Open DR-0020 from the Upcoming/Active tab
3. Confirm Pickup → pick a real photo
4. Complete Dropoff → pick a real photo
5. Complete Stop 1 → pick a real photo
6. Complete Stop 2 → pick a real photo (finalizes: status → `DELIVERED`)
7. Check the Proof of Delivery section on Supervisor/Customer/Driver/Helper's
   Completed views for DR-0020 — your uploaded photos should render there

Re-running this script resets DR-0020 back to a clean state for another pass.

### Location gate (`set-dr0020-location.sh`)

Confirm Pickup/Complete Dropoff/Complete Stop are gated on being within 200m
of the target location (`02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md`'s Part
3) — checked against the delivery's most recent `gps_logs` reading, since
there's no Helper-owned GPS device (only the truck's Raspberry Pi reports
position). `prep-proof-photos-test.sh` moves the position to the pickup
point automatically, but Dropoff/Stop 1/Stop 2 each need their own nudge
before you complete that step in the UI, since the position doesn't move on
its own during a manual walkthrough:

```bash
bash scripts/set-dr0020-location.sh <pickup|dropoff|stop1|stop2>
```

Run it right before each step. Skipping it (or being on the wrong point)
makes that step's Complete button fail with a "too far" error from the
server, showing the actual distance.

## GPS route simulation (`gps-route-capture.mjs` + `gps-route-simulate.py`)

Simulates a driver moving through a multi-stop delivery's route, so you can
watch `DriverDeliveries.jsx`'s Live Navigation "Stop X of Y" indicator (and
turn-by-turn/voice guidance) advance in a real browser — without a physical
Raspberry Pi or actually driving. Straight-line/interpolated GPS points don't
work for this: `NAV_STEP_ADVANCE_METERS` (35m) requires each simulated tick
to land close to the *real*, road-following route, so step 1 has to actually
capture that real route first. Capture every point along each step's actual
path (`step.path`), not just each step's `end_location` — using only
end-points (one per turn/maneuver) makes replayed ticks visibly jump between
far-apart points on long straight segments instead of gliding along the road.

### 1. Set up a fixture

You need a delivery, assigned to a test driver, with `stops` set, an Active
session, and status `OUT_FOR_DROPOFF` (past pickup — stops only apply to the
dropoff leg, see `src/docs/IMPLEMENTATION/02B_MULTI_STOP_DELIVERIES.md`).

Using `service_role` (add `SUPABASE_SERVICE_ROLE_KEY` to `.env` first — see
its own warning below) and a driver's access token (sign in via
`/auth/v1/token?grant_type=password` against `VITE_SUPABASE_URL`):

```bash
# 1. Give the delivery stops and reset it to ASSIGNED
curl -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.<ID>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"ASSIGNED","stops":[{"location":"<lat>, <lng>"},{"location":"<lat>, <lng>"}]}'

# 2. Start the trip as the driver (creates the Active session — note the session_id in the response)
curl -X POST "$VITE_SUPABASE_URL/functions/v1/driver-trip" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <driver access_token>" \
  -H "Content-Type: application/json" -d '{"action":"start-trip","deliveryRequestId":"<ID>"}'

# 3. Advance to the dropoff leg. update-driver-delivery ASSIGNED->OUT_FOR_PICKUP
#    is still Driver-owned; OUT_FOR_PICKUP->OUT_FOR_DROPOFF is NOT (it moved to
#    the Helper-owned "Confirm Pickup" action, photo-required, when
#    02B_MULTI_STOP_DELIVERIES.md's Photo-Required Chain Completion shipped —
#    a Driver token calling the old two-step version below now gets
#    "Cannot move a delivery from OUT_FOR_PICKUP to OUT_FOR_DROPOFF"). For a
#    test fixture with no real Helper photo to attach, skip straight to
#    OUT_FOR_DROPOFF with service_role instead of impersonating the driver:
curl -X POST "$VITE_SUPABASE_URL/functions/v1/admin-users" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <driver access_token>" \
  -H "Content-Type: application/json" -d '{"action":"update-driver-delivery","deliveryId":"<ID>","status":"OUT_FOR_PICKUP"}'
curl -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.<ID>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"status":"OUT_FOR_DROPOFF"}'
```

`pickup_location`/`dropoff_location` must already be in `"<lat>, <lng>"`
coordinate-text form (`DriverDeliveries.jsx`'s `parseCoords`) — a plain
street address won't resolve to a destination and the map will get stuck on
"Computing route..." forever. If they aren't already, patch them too.

### 2. Capture the real route

```bash
npx playwright install chromium   # once
# Clear any stale gps_logs for this delivery first -- computeRoute() prefers
# a stale livePosition over the true pickup/origin coordinate when one
# exists, so leftover rows from earlier testing can make the captured route
# silently start mid-route instead of at the real origin:
curl -X DELETE "$VITE_SUPABASE_URL/rest/v1/gps_logs?delivery_request_id=eq.<ID>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
DRIVER_EMAIL=... DRIVER_PASSWORD=... node scripts/gps-route-capture.mjs > /tmp/legs.json
```

Logs into the driver account headlessly, opens `/driver/trips`, and captures
the actual `DirectionsService` result the app computes — one leg per stop
plus a final leg to the destination, every point along each leg's actual
road-following path (not just each step's end point) in order.

### 3. Replay it while watching a real browser

Open the app yourself in a normal browser, log in as the same driver, and
navigate to the delivery so you can watch it live. Then:

```bash
python scripts/gps-route-simulate.py <session_id> <delivery_id> /tmp/legs.json
```

`<session_id>` is from step 1.3's `start-trip` response. Pass a short delay
(e.g. `python scripts/gps-route-simulate.py <session_id> <delivery_id> /tmp/legs.json 0.1`)
since a dense capture has hundreds of points, not a couple dozen — the
default 1.3s/tick would take far too long. Watch the panel below the map —
it should step through "Stop 1 of N" → ... → "Heading to Drop-off" as the
ticks land.

### 4. Clean up afterward

```bash
curl -X POST "$VITE_SUPABASE_URL/functions/v1/driver-trip" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <driver access_token>" \
  -H "Content-Type: application/json" -d '{"action":"end-trip","deliveryRequestId":"<ID>"}'

curl -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.<ID>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"<original status>","pickup_location":"<original>","dropoff_location":"<original>","stops":[]}'

curl -X DELETE "$VITE_SUPABASE_URL/rest/v1/gps_logs?delivery_request_id=eq.<ID>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Revert whatever you overwrote in step 1 — capture the original values before
you patch them.

### Notes

- **`SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS.** Only ever put it in your
  local `.env` (gitignored), never commit it, never use it for anything but
  local test scripts like this one.
- The simulate script inserts `gps_logs` rows directly, bypassing
  `gps-upload`'s device-secret auth entirely — a deliberate test-only
  shortcut, never how the real Raspberry Pi uploads.
- Reassigning `DirectionsService.prototype.route` directly is silently
  ignored by Google's Maps JS SDK — the capture script works around this by
  replacing the whole class once it appears on `window.google.maps`.
