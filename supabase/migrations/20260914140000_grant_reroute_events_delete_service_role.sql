-- service_role has had select/insert/update on reroute_events since
-- 20260911121341_reroute_events.sql, but delete was never granted -- same
-- gap as sessions' own missing delete grant (20260908110000). Discovered
-- 2026-09-14 while cleaning up a disposable test fixture (a real reroute
-- fired during a live-navigation route-trimming test, whose session
-- couldn't then be deleted without this). No real driver-trip action ever
-- deletes a reroute_events row -- only insert/update -- but the missing
-- grant blocks any legitimate cleanup (test fixtures, admin tooling) that
-- needs to remove a session/delivery these rows reference.
grant delete on public.reroute_events to service_role;
