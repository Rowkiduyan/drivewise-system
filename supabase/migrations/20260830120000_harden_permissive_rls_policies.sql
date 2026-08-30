-- Follow-up to the 2026-08-30 Supabase Advisor audit
-- (src/docs/IMPLEMENTATION/13_SECURITY_ADVISOR_FINDINGS.md).
--
-- Verified live via information_schema.role_table_grants + pg_policies before
-- writing this (not assumed from the Advisor export alone):
--
--   maintenance_records / trucks: every insert/update/delete policy is scoped
--   to role `public` with `true`/`true`, and `authenticated` genuinely holds
--   INSERT/UPDATE/DELETE grants on both tables -- confirmed LIVE: any logged-in
--   user (Driver/Helper/Customer, not just Admin/Supervisor) can currently
--   write/delete rows in both tables via direct REST calls, even though only
--   Admin/Supervisor-only pages (SupTrucks.jsx, AdminTrucks.jsx,
--   SupTruckProfile.jsx, AdminTruckProfile.jsx, AddTruckModal.jsx,
--   EditDeviceModal.jsx, RegisterDeviceModal.jsx) ever touch these tables in
--   the app itself.
--
--   driver_records: `authenticated` holds only SELECT (no INSERT/UPDATE/DELETE
--   grant at all), so every insert/update policy on this table is currently
--   dead regardless of its own scoping -- confirmed via grants query, not
--   assumed. But `Allow public read driver_records` (SELECT, true) IS live for
--   `authenticated`, meaning any logged-in user of any role can read every
--   driver's PII (first/last/middle name at minimum) today. Only
--   SupTruckProfile.jsx/AdminTruckProfile.jsx read this table in the app, both
--   Admin/Supervisor-only screens.
--
--   sessions: `authenticated` holds only SELECT/REFERENCES/TRIGGER/TRUNCATE
--   (no INSERT/UPDATE), and `anon` holds nothing at all on this table --
--   confirmed the three `anon ...` policies are already fully dead. Included
--   here as cleanup only, not a live fix.
--
-- This migration ONLY tightens policies that were confirmed reachable above,
-- or drops policies confirmed dead. It does not touch any grant (the
-- authenticated grants on trucks/maintenance_records stay as-is -- the app's
-- own Admin/Supervisor screens need them; the fix is narrowing which rows/
-- roles the policy itself allows, not the underlying table privilege).
--
-- Uses current_user_role() (SECURITY DEFINER, set search_path = public) --
-- the same helper already relied on by quotation_settings
-- (20260826100000_quotation_settings.sql) and delivery_quotations
-- (20260805233000_delivery_quotations.sql), not the undocumented
-- is_admin()/is_supervisor() functions whose live definitions this repo
-- could not verify (see 13_SECURITY_ADVISOR_FINDINGS.md's search_path note).

-- ============================================================
-- 1. maintenance_records: scope write access to Admin/Supervisor
-- ============================================================

drop policy if exists "Allow authenticated/anon insert to maintenance_records" on public.maintenance_records;
drop policy if exists "Allow authenticated/anon update to maintenance_records" on public.maintenance_records;
drop policy if exists "Allow authenticated/anon delete to maintenance_records" on public.maintenance_records;
-- "Allow public read access to maintenance_records" (SELECT) intentionally left
-- untouched -- not confirmed as a problem, and no confirmed reader outside the
-- already-restricted Admin/Supervisor pages exists to check it against.

create policy "admins and supervisors manage maintenance_records"
  on public.maintenance_records
  for all to authenticated
  using (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]))
  with check (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]));

-- ============================================================
-- 2. trucks: scope write access to Admin/Supervisor
-- ============================================================

drop policy if exists "Allow authenticated/anon insert to trucks" on public.trucks;
drop policy if exists "Allow authenticated/anon update to trucks" on public.trucks;
drop policy if exists "Allow authenticated/anon delete to trucks" on public.trucks;
-- "Allow public read access to trucks" (SELECT) left untouched, same reasoning.

create policy "admins and supervisors manage trucks"
  on public.trucks
  for all to authenticated
  using (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]))
  with check (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]));

-- ============================================================
-- 3. driver_records: scope the live read policy; drop the dead
--    insert/update policies (cleanup -- currently unreachable since
--    authenticated has no write grant, but a landmine if that grant is
--    ever added later without re-checking these)
-- ============================================================

drop policy if exists "Allow public read driver_records" on public.driver_records;
drop policy if exists "Allow authenticated inserts to driver_records" on public.driver_records;
drop policy if exists "public insert driver_records" on public.driver_records;
drop policy if exists "Supervisors can insert driver records" on public.driver_records;
drop policy if exists "Supervisors can update driver records" on public.driver_records;

create policy "admins and supervisors read driver_records"
  on public.driver_records
  for select to authenticated
  using (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]));

create policy "admins and supervisors manage driver_records"
  on public.driver_records
  for all to authenticated
  using (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]))
  with check (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]));

-- ============================================================
-- 4. sessions: drop the three confirmed-dead anon policies (cleanup only)
-- ============================================================

drop policy if exists "anon insert sessions" on public.sessions;
drop policy if exists "anon select sessions" on public.sessions;
drop policy if exists "anon update sessions" on public.sessions;
