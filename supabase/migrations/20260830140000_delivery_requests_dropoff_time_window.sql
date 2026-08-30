-- Drop Off Time becomes a customer-selected window (start + end) instead of
-- a single instant, per explicit request -- same shape as pickup_time_end
-- (20260816095039_delivery_requests_pickup_time_window.sql). dropoff_time
-- (existing column) is now the window's start; this adds the window's end.
-- Nullable since existing rows only ever had a single dropoff_time -- the
-- Request Delivery form requires both fields for every new submission going
-- forward, but older rows simply render as a single time (no end) rather
-- than being backfilled with an invented value.
alter table public.delivery_requests
  add column dropoff_time_end time null;
