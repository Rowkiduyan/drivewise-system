-- Phase 14 (14_RETURN_TRIP_MONITORING.md): marks a Session as the
-- automatic drive-back-to-warehouse leg opened right after end-trip closes
-- the real delivery Session, rather than a normal Pickup/Dropoff leg.
-- Lets log-position/gps-upload/start-trip find and auto-close it, and lets
-- the Route Deviation comparison (11_ROUTE_COMPARISON.md) exclude its GPS
-- from a comparison that only ever covered the one-way planned route.
-- Same lightweight-flag precedent as sessions.rest_stop_recommended
-- (20260908120100_sessions_rest_stop_recommended.sql).
alter table public.sessions
  add column if not exists is_return_trip boolean not null default false;
