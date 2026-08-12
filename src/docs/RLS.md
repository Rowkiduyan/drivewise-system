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

Policies (confirmed 2026-08-11, all pre-existing — none added this session), all with `qual`/`with_check: true`, i.e. no row-level restriction at all:
- `devices`: `Allow public read access to devices` (SELECT), `Allow authenticated/anon insert to devices` (INSERT), `Allow authenticated/anon update to devices` (UPDATE), `Allow authenticated/anon delete to devices` (DELETE) — all four target role `public` (every role, not just `authenticated`).
- `sessions`: `anon insert/select/update sessions` (role `anon`, all inert now since `anon`'s table grant was revoked — grants and policies are ANDed, see `SUPABASE_GOTCHAS.md` #1), `Allow public read sessions` (SELECT, roles `anon, authenticated`).

**Known gap, not yet fixed (flagged 2026-08-11):** because these policies target `public`/`authenticated` with no role check, *any* signed-in user of *any* role — not just Admin — can currently `DELETE`/`UPDATE` any `devices` row and read every `sessions` row (all trips, all drivers), directly from the browser console, regardless of which portal's UI they're using. The 2026-08-11 grant tightening stops `device_secret_hash` specifically from leaking (column grants are independent of row-level policies — RLS can't restrict columns at all, see gotcha #5) and stops `anon` entirely, but does not add any Admin-only row-level restriction the way `users` has (`current_user_role() = 'Admin'`, see above). Fixing this properly needs the same `is_admin()`/`current_user_role()`-style policy pattern already used on `users`, plus confirming first that no non-Admin flow currently depends on this openness (e.g. `SupCrewProfile.jsx` reads `sessions` directly as `authenticated` — see `src/pages/SupCrewProfile.jsx`). Scoped as its own follow-up, not done as part of Phase 4.