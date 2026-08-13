#!/usr/bin/env bash
# Prepares the DR-0020 fixture (see simulate-dr0020.sh) for a MANUAL test of
# the Helper-owned photo-required chain completion
# (02B_MULTI_STOP_DELIVERIES.md / 02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md) --
# this script only sets up delivery/session state via service_role; it does
# NOT upload anything itself. You then log in as the Helper in a real browser
# and manually complete Confirm Pickup -> Complete Dropoff -> Complete Stop 1
# -> Complete Stop 2 through the actual UI, picking real photos from your
# own computer each time -- exercises the real file-picker/upload path, not
# a scripted payload.
#
# Usage: bash scripts/prep-proof-photos-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DELIVERY_ID="DR-0020"
DRIVER_EMAIL="ayroque01@drivewise.local"
DRIVER_PASSWORD="Temp13dpjkd1opm3chztfhlxa0haeq!"
HELPER_ID="H003"
HELPER_EMAIL="tdtdurden01@marveltrucking.local"

set -a; source .env; set +a

echo "--- assigning $HELPER_ID to $DELIVERY_ID ---"
curl -s -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.$DELIVERY_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"assigned_helper_ids\":[\"$HELPER_ID\"]}" > /dev/null

echo "--- checking for an existing Active session on $DELIVERY_ID ---"
EXISTING_SESSION=$(curl -s "$VITE_SUPABASE_URL/rest/v1/sessions?delivery_request_id=eq.$DELIVERY_ID&status=eq.Active&select=session_id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['session_id'] if d else '')")

if [ -z "$EXISTING_SESSION" ]; then
  echo "--- no Active session, resetting to ASSIGNED and starting a fresh trip as the driver ---"
  curl -s -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.$DELIVERY_ID" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" -d '{"status":"ASSIGNED"}' > /dev/null

  DRIVER_TOKEN=$(curl -s -X POST "$VITE_SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$DRIVER_EMAIL\",\"password\":\"$DRIVER_PASSWORD\"}" \
    | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

  curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/driver-trip" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $DRIVER_TOKEN" \
    -H "Content-Type: application/json" -d "{\"action\":\"start-trip\",\"deliveryRequestId\":\"$DELIVERY_ID\"}" > /dev/null
fi

echo "--- resetting chain state: status -> OUT_FOR_PICKUP, clearing any prior photos/stop completion ---"
curl -s -X PATCH "$VITE_SUPABASE_URL/rest/v1/delivery_requests?id=eq.$DELIVERY_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"OUT_FOR_PICKUP","pickup_photo_url":null,"dropoff_photo_url":null,"dropoff_completed_at":null,"stops":[{"location":"14.5995, 120.9842"},{"location":"14.6050, 121.0000"}]}' > /dev/null

echo "--- moving the crew's position to the pickup point (location gate, Part 3) ---"
bash scripts/set-dr0020-location.sh pickup

echo ""
echo "Ready. Now in a real browser:"
echo "  1. Log in as Helper: $HELPER_EMAIL"
echo "  2. Open the Upcoming/Active tab, select $DELIVERY_ID"
echo "  3. Confirm Pickup -> pick a real photo from your computer"
echo "     (before each next step, run: bash scripts/set-dr0020-location.sh <dropoff|stop1|stop2>"
echo "     -- Confirm Pickup/Complete Dropoff/Complete Stop are location-gated, 200m radius)"
echo "  4. bash scripts/set-dr0020-location.sh dropoff ; then Complete Dropoff -> pick a real photo"
echo "  5. bash scripts/set-dr0020-location.sh stop1 ; then Complete Stop 1 -> pick a real photo"
echo "  6. bash scripts/set-dr0020-location.sh stop2 ; then Complete Stop 2 -> pick a real photo (finalizes: status -> DELIVERED)"
echo "  7. Check Supervisor/Customer/Driver/Helper Completed views for $DELIVERY_ID to see your uploaded photos in the Proof of Delivery section"
