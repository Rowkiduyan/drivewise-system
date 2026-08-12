-- Multi-stop deliveries (02B_MULTI_STOP_DELIVERIES.md): an ordered array of
-- intermediate stop locations visited between pickup_location (first) and
-- dropoff_location (last), which are unaffected. Reference-only, no
-- per-stop status tracking (decided 02_BOOKING_AND_TRIP_CREATION.md).
alter table public.delivery_requests
  add column stops jsonb not null default '[]';
