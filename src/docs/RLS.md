### RLS & Grants (`users` table)

Row Level Security is on. Current state:

- Policies: `Allow read for authenticated users` (SELECT, `authenticated`, `qual: true`), `Admins can read all users` (SELECT, `authenticated`, via `is_admin()`), `Self-registration is limited to low-privilege roles` (INSERT, `public`, `with_check: role in ('Driver', 'Helper')`), `Admins can update any user, others can update themselves` (UPDATE, `authenticated`, `qual`/`with_check`: `current_user_role() = 'Admin' OR auth.uid() = id`).
- `current_user_role()` is a `SECURITY DEFINER` helper (`select role from public.users where id = auth.uid()`) used by the UPDATE policy to check the caller's own role without recursively re-triggering RLS on `users`.
- Grants: `authenticated` has `SELECT`, `INSERT`, `UPDATE` (no `DELETE`). `service_role` has `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Trigger `enforce_role_change_admin_only` (BEFORE UPDATE) rejects the update if `role` is being changed and the caller's own `current_user_role()` isn't `Admin` — applies even when a user is updating their own row, so a non-Admin cannot self-escalate. Only fires on UPDATE, not INSERT — the self-registration policy above is what restricts `role` on the INSERT path.

See `SUPABASE_GOTCHAS.md` for the debugging history behind these policies/grants/trigger (missing grants, `service_role` permissions, the role-escalation fix, etc.) — none of this is captured as a tracked migration file (see gotcha #7).