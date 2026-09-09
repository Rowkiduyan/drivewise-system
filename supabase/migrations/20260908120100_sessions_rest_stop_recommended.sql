-- Rest-stop recommendations have always been ephemeral, client-side-only
-- state in DriverDeliveries.jsx (12_REST_STOP_RECOMMENDATIONS.md, decided
-- 2026-08-13) -- never persisted, so a Supervisor reviewing a completed trip
-- has no way to know whether a pause coincided with a rest-stop
-- recommendation. Adding a column so pause-trip can record it going forward;
-- older sessions default false, which is correct (the flag genuinely didn't
-- exist yet), not a data gap to explain away.
alter table public.sessions
  add column if not exists rest_stop_recommended boolean not null default false;
