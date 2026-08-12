### RLS & Grants (`users` table)

Row Level Security is on. Current state:

- Policies: `Allow read for authenticated users` (SELECT, `authenticated`, `qual: true`), `Admins can read all users` (SELECT, `authenticated`, via `is_admin()`), `Self-registration is limited to low-privilege roles` (INSERT, `public`, `with_check: role in ('Driver', 'Helper')`), `Admins can update any user, others can update themselves` (UPDATE, `authenticated`, `qual`/`with_check`: `current_user_role() = 'Admin' OR auth.uid() = id`).
- `current_user_role()` is a `SECURITY DEFINER` helper (`select role from public.users where id = auth.uid()`) used by the UPDATE policy to check the caller's own role without recursively re-triggering RLS on `users`.
- Grants: `authenticated` has `SELECT`, `INSERT`, `UPDATE` (no `DELETE`). `service_role` has `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Trigger `enforce_role_change_admin_only` (BEFORE UPDATE) rejects the update if `role` is being changed and the caller's own `current_user_role()` isn't `Admin` — applies even when a user is updating their own row, so a non-Admin cannot self-escalate. Only fires on UPDATE, not INSERT — the self-registration policy above is what restricts `role` on the INSERT path.

See `SUPABASE_GOTCHAS.md` for the debugging history behind these policies/grants/trigger (missing grants, `service_role` permissions, the role-escalation fix, etc.) — none of this is captured as a tracked migration file (see gotcha #7).

### RLS & Grants (`devices` and `sessions` tables)

Row Level Security is on for both (confirmed 2026-08-11 via `select relrowsecurity from pg_class where relname in ('devices','sessions')`).

Grants tightened 2026-08-11 alongside Phase 4 (`04_DEVICE_BOOT_AND_HEARTBEAT.md`) — see `DATABASE.md`'s `devices` "Grants" note for the full column-level breakdown. Summary:
- `devices`: `anon` has no access. `authenticated` has column-scoped `select`/`insert`/`update` (excludes `device_secret_hash`) plus unrestricted `delete`. `service_role` has full access.
- `sessions`: `anon` has no access (previously had `insert`/`update`). `authenticated`/`service_role` grants unchanged (see `DATABASE.md`'s `sessions` entry).

**Policies for `devices` — corrected 2026-08-12, ahead of Phase 8 (`IMPLEMENTATION/08_REALTIME_DASHBOARD.md`).** The entry that used to live here (`Allow public read access to devices`/insert/update/delete, all `public` role, `qual`/`with_check: true`) was stale — ground truth via `pg_policies` showed the "Known gap" below had, at some point, actually already been closed (not documented anywhere when it happened, same undocumented-fix pattern as `sessions` before its own 2026-08-12 correction): `Admins can read devices` / `Admins can insert devices` / `Admins can update devices` / `Admins can delete devices`, all `authenticated` role, `qual`/`with_check: current_user_role() = 'Admin'`.

That Admin-only SELECT policy was then itself a blocker for Phase 8 — a Supervisor session got zero rows reading `devices` at all, contradicting that phase's Implementation Plan (which assumed the old wide-open policy still applied). Fixed by replacing the SELECT policy only:
```sql
drop policy "Admins can read devices" on public.devices;
create policy "Admins and Supervisors can read devices" on public.devices
for select to authenticated
using (current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]));
```
INSERT/UPDATE/DELETE stay Admin-only, unchanged — Phase 8 only reads this table.

**`sessions` policies — corrected 2026-08-12, the entry that previously lived here (`"Allow public read sessions" ... roles anon, authenticated`) was stale/wrong and never actually existed live; ground truth confirmed via `select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'sessions'`:**
- `anon insert sessions` (INSERT, role `anon`, `with_check: true`), `anon select sessions` (SELECT, role `anon`, `qual: true`), `anon update sessions` (UPDATE, role `anon`, `qual`/`with_check: true`) — all three inert since `anon`'s table grant was revoked (grants and policies are ANDed, see `SUPABASE_GOTCHAS.md` #1).
- `Admins and Supervisors can read sessions` (SELECT, role `authenticated`, `qual: current_user_role() = ANY(ARRAY['Admin','Supervisor'])`) — this is what lets `SupCrewProfile.jsx` read `sessions` directly.
- `assigned crew can read own sessions` (SELECT, role `authenticated`, added 2026-08-12 for the Helper-portal Realtime catch-up, see `IMPLEMENTATION/03_START_TRIP_AND_SESSION.md`) — `using (public.session_visible_to_caller(driver_id, delivery_request_id))`, scoping a Driver to their own sessions and a Helper to sessions on deliveries they're assigned to. Written as a `SECURITY DEFINER` function call rather than an inline join specifically because Realtime's `postgres_changes` authorization doesn't reliably evaluate inline joins — see `SUPABASE_GOTCHAS.md` #9 for the full incident.

Before the 2026-08-12 fix, Driver/Helper had **no** read access to `sessions` at all (only Admin/Supervisor did) — despite this file previously claiming otherwise. That gap was invisible until a direct client-side Realtime subscription was attempted; the app's existing `sessions` reads all went through Edge Functions using `service_role`, which bypasses RLS entirely and never surfaced the missing policy.

**`delivery_requests` policy — added 2026-08-12** alongside the same Helper-portal catch-up: `assigned crew can read own deliveries` (SELECT, role `authenticated`) — `using (public.delivery_request_visible_to_caller(assigned_driver_id, assigned_helper_ids))`, same function-call-not-inline-join reasoning as above. Previously Driver/Helper had no direct read access to `delivery_requests` either (see that table's entry in `DATABASE.md`) — reads went through `admin-users`'s `service_role` connection.

~~Known gap, not yet fixed (flagged 2026-08-11, `devices` only): any signed-in user of any role could DELETE/UPDATE any `devices` row.~~ Resolved — see the corrected policies above (found already fixed to Admin-only, undocumented, while investigating Phase 8's schema check 2026-08-12; SELECT then further opened to include Supervisor the same day).