#!/usr/bin/env bash
# Replays DR-0040's persisted suggested_route (pickup -> dropoff leg only,
# no stops) -- mirrors scripts/simulate-dr0020.sh, adapted for a delivery
# whose driver (D008, a real person's account) has no documented test
# password.
#
# Fixture: DR-0040, driver D008, single pickup/dropoff leg in Manila, no
# stops. Route geometry is DR-0040's real delivery_requests.suggested_route
# pickup->dropoff leg (229 points), not an independently regenerated one --
# deliberately kept identical to what the app itself already computed and
# persisted, so replaying it can't drift onto a different path than what
# LiveNavigationMap would show (e.g. from a different traffic-model read at
# a different time of day) and never triggers the app's own
# reroute-on-deviation logic.
#
# Default delay matches the real Pi's actual GPS upload cadence
# (GPS_UPLOAD_INTERVAL_SEC = 1.0 in pi/drowsiness_monitor.py), not the
# artificially sped-up 0.1s DR-0020's script uses for a quick demo.
#
# Because D008's password is unknown, this script does not call
# driver-trip's start-trip action the way simulate-dr0020.sh does. Instead,
# when no Active session exists, it inserts the session row directly via
# service_role -- same test-only-shortcut precedent gps-route-simulate.py
# already documents for gps_logs, just extended to session creation.
#
# Usage:
#   bash scripts/simulate-dr0040.sh [delay_seconds]
#
# Before running: open the app yourself, log in as D008, and navigate to
# DR-0040's Live Navigation view so you can watch it live.
set -euo pipefail
cd "$(dirname "$0")/.."

DELAY="${1:-1.0}"
DELIVERY_ID="DR-0040"
DRIVER_ID="D008"
TRUCK_PLATE="AAA 1111"
DEVICE_ID="DV-1114"

set -a; source .env; set +a

echo "--- checking for an existing Active session on $DELIVERY_ID ---"
EXISTING_SESSION=$(curl -s "$VITE_SUPABASE_URL/rest/v1/sessions?delivery_request_id=eq.$DELIVERY_ID&status=eq.Active&select=session_id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['session_id'] if d else '')")

if [ -n "$EXISTING_SESSION" ]; then
  echo "Reusing existing Active session: $EXISTING_SESSION"
  SESSION_ID="$EXISTING_SESSION"
else
  echo "--- no Active session, resetting $DELIVERY_ID to ASSIGNED and inserting a fresh Active session directly ---"
  curl -s -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.$DELIVERY_ID" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" -d '{"status":"ASSIGNED"}' > /dev/null

  SESSION_ID=$(python -c "import uuid; print(uuid.uuid4())")
  TIMESTAMP=$(python -c "import time; print(time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()))")
  curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/sessions" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "{\"session_id\":\"$SESSION_ID\",\"delivery_request_id\":\"$DELIVERY_ID\",\"driver_id\":\"$DRIVER_ID\",\"truck_plate\":\"$TRUCK_PLATE\",\"device_id\":\"$DEVICE_ID\",\"status\":\"Active\",\"start_time\":\"$TIMESTAMP\"}"
fi

# DR-0040 has no stops, but LiveNavigationMap still gates its post-pickup
# route on status being past ASSIGNED/OUT_FOR_PICKUP -- force it here the
# same way simulate-dr0020.sh does, whether the session was reused or fresh.
echo "--- advancing $DELIVERY_ID to OUT_FOR_DROPOFF (skips the Helper-owned Confirm Pickup step -- fine for a route-rendering test) ---"
curl -s -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.$DELIVERY_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"status":"OUT_FOR_DROPOFF"}' > /dev/null

echo "Session: $SESSION_ID"
echo "--- replaying the saved route (open the app now if you haven't) ---"
python scripts/gps-route-simulate.py "$SESSION_ID" "$DELIVERY_ID" scripts/fixtures/DR-0040-legs.json "$DELAY"
