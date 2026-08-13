#!/usr/bin/env bash
# Replays the saved DR-0020 fixture (per-leg route colors test, see
# src/docs/IMPLEMENTATION/02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md) without
# needing to re-run gps-route-capture.mjs -- the captured route geometry
# (scripts/fixtures/DR-0020-legs.json) is static since DR-0020's pickup/
# dropoff/stops coordinates never change, only the delivery's status/session
# do (reset by this script itself on every run).
#
# Fixture: DR-0020, driver D002 (ayroque01@drivewise.local), pickup/dropoff
# in Metro Manila with 2 stops, chain = pickup -> dropoff -> stop 1 -> stop 2.
# The fixture captures every point along each step's actual road-following
# path (559 points total, not just each turn's end point), so replaying it
# glides along the drawn route instead of visibly jumping between sparse
# waypoints -- default delay is short (0.1s) to match, since there are far
# more points to get through than the original 21-point capture had. Captured
# with DR-0020's gps_logs cleared first, so DirectionsService's origin was
# the real pickup coordinate, not a stale livePosition left over from earlier
# testing (computeRoute prefers livePosition over origin when one exists --
# an earlier capture attempt silently started mid-route because of this).
#
# Usage:
#   bash scripts/simulate-dr0020.sh [delay_seconds]
#
# Before running: open the app yourself, log in as ayroque01@drivewise.local,
# and navigate to DR-0020's Live Navigation view so you can watch it live.
set -euo pipefail
cd "$(dirname "$0")/.."

DELAY="${1:-0.1}"
DELIVERY_ID="DR-0020"
DRIVER_EMAIL="ayroque01@drivewise.local"
DRIVER_PASSWORD="Temp13dpjkd1opm3chztfhlxa0haeq!"

set -a; source .env; set +a

echo "--- signing in as $DRIVER_EMAIL ---"
AUTH_RESPONSE=$(curl -s -X POST "$VITE_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DRIVER_EMAIL\",\"password\":\"$DRIVER_PASSWORD\"}")
ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "--- checking for an existing Active session on $DELIVERY_ID ---"
EXISTING_SESSION=$(curl -s "$VITE_SUPABASE_URL/rest/v1/sessions?delivery_request_id=eq.$DELIVERY_ID&status=eq.Active&select=session_id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['session_id'] if d else '')")

if [ -n "$EXISTING_SESSION" ]; then
  echo "Reusing existing Active session: $EXISTING_SESSION"
  SESSION_ID="$EXISTING_SESSION"
else
  echo "--- no Active session, resetting $DELIVERY_ID to ASSIGNED and starting a fresh trip ---"
  curl -s -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.$DELIVERY_ID" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" -d '{"status":"ASSIGNED"}' > /dev/null

  START_RESPONSE=$(curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/driver-trip" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" -d "{\"action\":\"start-trip\",\"deliveryRequestId\":\"$DELIVERY_ID\"}")
  SESSION_ID=$(echo "$START_RESPONSE" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('session', {}).get('session_id', ''))" 2>/dev/null || true)

  if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "None" ]; then
    echo "start-trip response: $START_RESPONSE"
    echo "Could not read a session id back -- checking sessions table directly."
    SESSION_ID=$(curl -s "$VITE_SUPABASE_URL/rest/v1/sessions?delivery_request_id=eq.$DELIVERY_ID&status=eq.Active&select=session_id" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['session_id'] if d else '')")
  fi

fi

# Always force OUT_FOR_DROPOFF here, whether the session was reused or just
# started -- a reused session's delivery could still be sitting at
# OUT_FOR_PICKUP (e.g. left there by prep-proof-photos-test.sh's Reset), and
# LiveNavigationMap only renders the multi-color post-pickup chain once
# status is actually past pickup (needsPickup gates on ASSIGNED/OUT_FOR_PICKUP).
# Without this, replaying the route silently shows just the single to-pickup
# leg/color instead of the full chain.
echo "--- advancing $DELIVERY_ID to OUT_FOR_DROPOFF (skips the Helper-owned Confirm Pickup step -- fine for a route-rendering test) ---"
curl -s -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.$DELIVERY_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"status":"OUT_FOR_DROPOFF"}' > /dev/null

echo "Session: $SESSION_ID"
echo "--- replaying the saved route (open the app now if you haven't) ---"
python scripts/gps-route-simulate.py "$SESSION_ID" "$DELIVERY_ID" scripts/fixtures/DR-0020-legs.json "$DELAY"
