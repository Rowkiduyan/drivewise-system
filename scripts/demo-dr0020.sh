#!/usr/bin/env bash
# Full demo of Phase 2C (02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md) on the
# DR-0020 fixture, in one run:
#   Part 1 -- per-leg route colors/pins: simulates GPS movement through the
#             Pickup -> Dropoff -> Stop 1 -> Stop 2 chain so you can watch
#             the colored route segments and waypoint pins live.
#   Part 2 -- proof-of-delivery photo upload: resets the delivery afterward
#             and assigns the test Helper, so you can manually walk through
#             Confirm Pickup -> Complete Dropoff -> Complete Stop 1 ->
#             Complete Stop 2 in the real Helper UI, picking actual photos
#             from your own device each time.
#
# Usage: bash scripts/demo-dr0020.sh [delay_seconds]
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=========================================="
echo " Part 1: GPS route color simulation"
echo "=========================================="
echo "Open the app, log in as driver ayroque01@drivewise.local, and watch"
echo "DR-0020's Live Navigation map while this runs."
echo ""
bash scripts/simulate-dr0020.sh "$@"

echo ""
echo "=========================================="
echo " Part 2: preparing for the photo upload demo"
echo "=========================================="
bash scripts/prep-proof-photos-test.sh
