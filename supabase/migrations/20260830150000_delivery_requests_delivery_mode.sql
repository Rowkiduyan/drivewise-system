-- Delivery time-planning calculation (2026-08-30, explicit user request):
-- "Same-Day" (pickup + all drop-offs on one day) vs "Two-Day" (pickup on
-- Day 1, all drop-offs on Day 2) is now an explicit customer-facing toggle
-- in the Request Delivery form. Persisting the choice itself (not the full
-- computed schedule breakdown, which stays client-side-only and is
-- recomputed on demand) so a saved row stays interpretable later -- without
-- it, dropoff_date alone can't distinguish "this was booked as Same-Day"
-- from "this was booked as Two-Day," and getScheduleErrors' mode-aware
-- validation needs somewhere to read the mode back from on any future edit
-- flow. Nullable, not backfilled -- same "don't invent a value for
-- pre-existing rows" precedent pickup_time_end/dropoff_time_end both used.
alter table public.delivery_requests
  add column delivery_mode text null;
