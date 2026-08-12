-- Photo-required waypoint completion (chain: Pickup -> Dropoff -> Stops),
-- done by the Helper. See src/docs/IMPLEMENTATION/02B_MULTI_STOP_DELIVERIES.md.
-- pickup_photo_url: set when Pickup (item 1) completes.
-- dropoff_photo_url/dropoff_completed_at: set when dropoff_location (item 2)
-- completes -- whether or not that's also the final item in the chain
-- (finality is computed dynamically from stops.length, not stored).
alter table public.delivery_requests
  add column pickup_photo_url text,
  add column dropoff_photo_url text,
  add column dropoff_completed_at timestamptz;
