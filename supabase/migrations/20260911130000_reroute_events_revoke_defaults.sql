-- SUPABASE_GOTCHAS.md #8: every new table auto-inherits baseline anon/
-- authenticated grants from this project's schema-level default privileges,
-- independent of whatever explicit GRANTs the creating migration added --
-- the previous reroute_events migration (20260911121341) only ever added
-- grants, never revoked Supabase's auto-granted baseline first, same gap
-- that gotcha documents for driver_records/etc. RLS (already enabled, with
-- only a `select`-for-authenticated policy) has been denying anything not
-- covered by a policy in the meantime, so this wasn't a live hole today --
-- but closing it explicitly, not just relying on RLS alone, matches this
-- project's own established convention (gotcha #8's fix).
revoke all on public.reroute_events from anon, authenticated;

grant select, insert, update on public.reroute_events to service_role;
grant select on public.reroute_events to authenticated;
