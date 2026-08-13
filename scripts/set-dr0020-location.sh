#!/usr/bin/env bash
# Inserts a single gps_logs reading for DR-0020 at one of its fixed chain
# points, so the location-gate on Confirm Pickup/Complete Dropoff/Complete
# Stop (02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md's Part 3) passes when you
# then complete that step manually in the Helper UI. Run this right before
# each step during a manual walkthrough -- the gate checks DR-0020's most
# recent gps_logs row, so "being at" a point just means this was the last
# one inserted.
#
# Usage: bash scripts/set-dr0020-location.sh <pickup|dropoff|stop1|stop2>
set -euo pipefail
cd "$(dirname "$0")/.."

POINT="${1:-}"
case "$POINT" in
  pickup)  LAT="14.5906";   LNG="120.9822"   ;;
  dropoff) LAT="14.6091";   LNG="121.0223"   ;;
  stop1)   LAT="14.5995";   LNG="120.9842"   ;;
  stop2)   LAT="14.6050";   LNG="121.0000"   ;;
  *)
    echo "Usage: bash scripts/set-dr0020-location.sh <pickup|dropoff|stop1|stop2>" >&2
    exit 1
    ;;
esac

set -a; source .env; set +a

TIMESTAMP=$(python -c "import time; print(time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()))")

curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/gps_logs" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"delivery_request_id\":\"DR-0020\",\"latitude\":$LAT,\"longitude\":$LNG,\"timestamp\":\"$TIMESTAMP\"}"

echo "DR-0020 is now at $POINT ($LAT, $LNG) -- you can complete that step in the Helper UI now."
