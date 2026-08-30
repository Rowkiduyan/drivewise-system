-- Follow-up to 20260830120000_harden_permissive_rls_policies.sql, same audit
-- (src/docs/IMPLEMENTATION/13_SECURITY_ADVISOR_FINDINGS.md).
--
-- driver_default_assignments (20260826110000_driver_default_assignments.sql)
-- was built as an explicit copy of the same open-to-authenticated model
-- trucks/maintenance_records had -- its own migration comment says so ("Same
-- open-to-authenticated model as the trucks table"). authenticated holds full
-- SELECT/INSERT/UPDATE/DELETE (20260826110500_driver_default_assignments_grants.sql),
-- and the policy is USING(true)/WITH CHECK(true) with no role check -- any
-- logged-in user (Driver/Helper/Customer, not just Supervisor) can currently
-- read/write/delete every row. Only SupDeliveryCrew.jsx/SupDeliveries.jsx/
-- SupCrewProfile.jsx (Supervisor-only pages) touch this table in the app.
--
-- Scoped to Admin+Supervisor (not Supervisor-only) to match the same
-- established convention as the trucks/maintenance_records/driver_records fix
-- -- Admin doesn't currently use this table, but adding it access doesn't
-- remove anything Supervisor already has.

drop policy if exists "authenticated can manage driver default assignments" on public.driver_default_assignments;

create policy "admins and supervisors manage driver_default_assignments"
  on public.driver_default_assignments
  for all to authenticated
  using (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]))
  with check (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]));
