-- service_role is missing DELETE on public.alerts (confirmed live:
-- `delete().eq('session_id', ...)` via service_role returned 42501
-- "permission denied for table alerts", hint: "Grant the required
-- privileges to the current role with: GRANT DELETE ON public.alerts TO
-- service_role;"). Only DELETE was ever missing -- select/insert already
-- work for service_role -- but this had a real, quiet cost: every prior
-- run of scripts/verify-critical-alerts.mjs's cleanup step silently failed
-- (the script never checked the delete's result), so the DR-0051 test
-- fixture's session accumulated 30+ stray alert rows over repeated runs.
-- SupDashboard.jsx's "Very High Risk of Drowsiness" popup only fires on a
-- session's alert count hitting exactly 5 (not any multiple), so a
-- polluted session could never trigger it again -- this masked that check
-- from being testable at all until this grant was found and applied.

grant select, insert, update, delete on public.alerts to service_role;
