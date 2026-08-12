# Test scripts

## GPS route simulation (`gps-route-capture.mjs` + `gps-route-simulate.py`)

Simulates a driver moving through a multi-stop delivery's route, so you can
watch `DriverDeliveries.jsx`'s Live Navigation "Stop X of Y" indicator (and
turn-by-turn/voice guidance) advance in a real browser — without a physical
Raspberry Pi or actually driving. Straight-line/interpolated GPS points don't
work for this: `NAV_STEP_ADVANCE_METERS` (35m) requires each simulated tick
to land close to the *real*, road-following route's step end-points, so step
1 has to actually capture that real route first.

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

# 3. Advance to the dropoff leg
curl -X POST "$VITE_SUPABASE_URL/functions/v1/admin-users" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <driver access_token>" \
  -H "Content-Type: application/json" -d '{"action":"update-driver-delivery","deliveryId":"<ID>","status":"OUT_FOR_PICKUP"}'
curl -X POST "$VITE_SUPABASE_URL/functions/v1/admin-users" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <driver access_token>" \
  -H "Content-Type: application/json" -d '{"action":"update-driver-delivery","deliveryId":"<ID>","status":"OUT_FOR_DROPOFF"}'
```

`pickup_location`/`dropoff_location` must already be in `"<lat>, <lng>"`
coordinate-text form (`DriverDeliveries.jsx`'s `parseCoords`) — a plain
street address won't resolve to a destination and the map will get stuck on
"Computing route..." forever. If they aren't already, patch them too.

### 2. Capture the real route

```bash
npx playwright install chromium   # once
DRIVER_EMAIL=... DRIVER_PASSWORD=... node scripts/gps-route-capture.mjs > /tmp/legs.json
```

Logs into the driver account headlessly, opens `/driver/trips`, and captures
the actual `DirectionsService` result the app computes — one leg per stop
plus a final leg to the destination, each leg's step end-points in order.

### 3. Replay it while watching a real browser

Open the app yourself in a normal browser, log in as the same driver, and
navigate to the delivery so you can watch it live. Then:

```bash
python scripts/gps-route-simulate.py <session_id> <delivery_id> /tmp/legs.json
```

`<session_id>` is from step 1.3's `start-trip` response. Watch the panel
below the map — it should step through "Stop 1 of N" → ... → "Heading to
Drop-off" as the ticks land, a few seconds apart.

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
