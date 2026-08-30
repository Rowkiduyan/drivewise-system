#!/usr/bin/env bash
# Inserts a single gps_logs reading for DR-0040 at its pickup or dropoff
# point, so the location-gate on Confirm Pickup/Complete Dropoff
# (02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md's Part 3) passes when you then
# complete that step manually in the Helper UI. Mirrors
# scripts/set-dr0020-location.sh; DR-0040 has no stops, so only two points.
#
# Coordinates are the endpoints of DR-0040's persisted suggested_route
# pickup->dropoff leg (delivery_requests.suggested_route), not independently
# geocoded -- keeps this in sync with the fixture simulate-dr0040.sh replays.
#
# Usage: bash scripts/set-dr0040-location.sh <pickup|dropoff>
set -euo pipefail
cd "$(dirname "$0")/.."

POINT="${1:-}"
case "$POINT" in
  pickup)  LAT="14.598520";  LNG="120.966250"  ;;
  dropoff) LAT="14.590040";  LNG="120.980900"  ;;
  *)
    echo "Usage: bash scripts/set-dr0040-location.sh <pickup|dropoff>" >&2
    exit 1
    ;;
esac

set -a; source .env; set +a

TIMESTAMP=$(python -c "import time; print(time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()))")

curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/gps_logs" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"delivery_request_id\":\"DR-0040\",\"latitude\":$LAT,\"longitude\":$LNG,\"timestamp\":\"$TIMESTAMP\"}"

echo "DR-0040 is now at $POINT ($LAT, $LNG) -- you can complete that step in the Helper UI now."
