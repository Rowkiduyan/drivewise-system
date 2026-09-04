-- pickup_completed_at (timestamptz, nullable): the pickup half of the same
-- gap dropoff_completed_at already closed (20260812151605) -- Confirm
-- Pickup (item 1 of the Pickup -> Dropoff -> Stops chain,
-- 02B_MULTI_STOP_DELIVERIES.md) only ever wrote pickup_photo_url and the
-- generic updated_at, with no dedicated event timestamp. Needed for the
-- Customer portal's real-time "completed pickup from <location> at <time>"
-- Progress Details line (2026-09-04) -- updated_at isn't usable for this,
-- since it changes on later unrelated updates too.
alter table public.delivery_requests
  add column pickup_completed_at timestamptz;
