-- Pickup Time becomes a customer-selected window (start + end) instead of a
-- single instant, per explicit request. pickup_time (existing column) is now
-- the window's start; this adds the window's end. Nullable since existing
-- rows only ever had a single pickup_time -- the Request Delivery form
-- requires both fields for every new submission going forward, but older
-- rows simply render as a single time (no end) rather than being backfilled
-- with an invented value.
alter table public.delivery_requests
  add column pickup_time_end time null;
