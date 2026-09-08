-- service_role has had insert/update/select on sessions since 2026-08-08, but
-- delete was never granted -- discovered 2026-08-14 (SUPABASE_GOTCHAS.md #11)
-- and again 2026-09-08 while cleaning up a leftover Active session from a
-- live browser test of Start Pickup. No real Trip-lifecycle action
-- (start-trip/pause-trip/resume-trip/end-trip) has ever needed to delete a
-- sessions row -- they only insert/update -- but the missing grant blocks
-- any legitimate cleanup (test fixtures, admin tooling) that does.
grant delete on public.sessions to service_role;
