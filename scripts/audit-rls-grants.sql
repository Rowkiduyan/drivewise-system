-- Security Advisor follow-up audit (src/docs/IMPLEMENTATION/13_SECURITY_ADVISOR_FINDINGS.md).
-- Run once in the Supabase SQL editor; paste the two result sets back for review.
-- Per-table grants (SUPABASE_GOTCHAS.md #1: grants gate before RLS, so a policy for a
-- role with no grant row below is inert regardless of its USING/WITH CHECK clause).

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_name in (
  'sessions',
  'maintenance_records',
  'trucks',
  'driver_records',
  'driver_default_assignments'
)
order by table_name, grantee, privilege_type;

-- Live policies on the same tables, for side-by-side comparison against the grants above.

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where tablename in (
  'sessions',
  'maintenance_records',
  'trucks',
  'driver_records',
  'driver_default_assignments'
)
order by tablename, policyname;
