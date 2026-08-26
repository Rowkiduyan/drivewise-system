-- Grants for driver_default_assignments (20260826110000): this project does
-- not apply default privileges to newly created tables (same reason the
-- crew_availability migration carries its own GRANT statements), so the
-- Supervisor's portal got "permission denied" on save. Mirror the
-- crew_availability grant set — authenticated reads/writes, service_role for
-- admin tooling; anon stays locked out (RLS policy is authenticated-only).

grant select, insert, update, delete on public.driver_default_assignments to authenticated;
grant select, insert, update, delete on public.driver_default_assignments to service_role;
