# Supabase Gotchas

A running list of non-obvious Supabase behavior this project has actually hit, and how each was fixed. `DATABASE.md` documents current-state schema/policies/grants; this file documents the incidents behind them, so the same debugging loop doesn't happen again on the next table.

---

## 1. A missing `GRANT` returns 403 even with a correct RLS policy

**Symptom:** `AdminHome.jsx`'s "Save Changes" (a `.update()` on `users`) returned `403 Forbidden` on the REST `PATCH` request, even after a correct UPDATE policy was in place allowing the calling Admin to update the target row.

**Cause:** Postgres checks the base table `GRANT` before RLS policies are evaluated at all. The `authenticated` role had never been granted `UPDATE` on `public.users` — RLS policy content is irrelevant if the underlying grant is missing.

**Fix:**
```sql
grant update on public.users to authenticated;
```

**How it was diagnosed:**
```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'users';
```

---

## 2. `service_role` does not automatically have full access to a table

**Symptom:** The `admin-users` Edge Function's `create-user` action returned `403`, despite using the `service_role` key (which bypasses RLS entirely). The client only saw a generic "Edge Function returned a non-2xx status code" — the real error only showed up in the function's own server-side logs (Supabase Dashboard → Edge Functions → admin-users → Logs): `permission denied for table users`, Postgres code `42501`.

**Cause:** `service_role` bypasses Row Level Security, but it still needs the ordinary Postgres table grants — those are not automatically full just because the key is privileged.

**Fix:**
```sql
grant select, insert, update, delete on public.users to service_role;
```

**Takeaway:** if a `service_role`-backed Edge Function call gets a permission error, it's not an RLS problem (service_role skips RLS) — go straight to `information_schema.role_table_grants`, not `pg_policies`.

---

## 3. `supabase.auth.signUp()` swaps the *caller's* browser session

**Symptom:** The original `AdminHome.jsx` "Add User" flow called `supabase.auth.signUp()` client-side to create a new account. This silently replaced the *admin's own* logged-in session with the newly created user's session as a side effect.

**Cause:** This is real (if easy to miss) Supabase Auth behavior — calling `signUp` on a client instance behaves like signing in as the newly created user on that same client, unless email confirmation is required (in which case there's no session change at all, and the client is left signed out).

**Fix:** Admin-panel account creation was moved into the `admin-users` Edge Function, which uses `supabase.auth.admin.createUser()` server-side with the `service_role` key — this never touches the caller's browser session.

**Still open:** `SupDeliveryCrew.jsx`'s driver-crew creation flow still creates accounts client-side via `signUp`, so a Supervisor's session still gets swapped to the new driver's session during that flow. Not yet migrated to the Edge Function (see `DATABASE.md`).

**Related confusion during debugging:** stopping/restarting the local dev server does **not** clear or refresh the browser's session — the Supabase session lives in `localStorage`, independent of the dev server process entirely. Before a logout button existed, the only way to force re-authentication as a different account was to navigate directly to `/login` and sign in again, which overwrites the stored session.

---

## 4. Edge Functions need CORS handled manually — nothing is automatic

**Symptom:** Browser console: `blocked by CORS policy: ... No 'Access-Control-Allow-Origin' header is present`. The request never showed up in the function's logs at all.

**Cause:** `supabase.functions.invoke()` triggers a browser preflight `OPTIONS` request first. The function had no `OPTIONS` handling and returned no CORS headers on any response, so the preflight itself failed before the real `POST` was ever sent.

**Fix:** Added an `OPTIONS` short-circuit and `Access-Control-Allow-Origin` / `-Headers` / `-Methods` headers, merged into **every** response — including error responses. (CORS headers matter on error responses too; omitting them just moves the same failure to the error path.)

---

## 5. RLS is row-level only — it cannot restrict which *columns* change

**Context:** After Admins could update any user's row, the requirement became "only Admin can change roles" — including blocking a non-Admin from escalating their *own* role, even though the same UPDATE policy legitimately lets them edit their own name/email.

**Why RLS alone can't do this:** `USING`/`WITH CHECK` operate per-row, not per-column. There's no way to express "allow this row's update, but only if the `role` column specifically doesn't change" purely inside a policy.

**Fix:** Added a `BEFORE UPDATE` trigger that rejects the write outright if `role` changed and the caller isn't an Admin:
```sql
create or replace function public.enforce_role_change_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and public.current_user_role() <> 'Admin' then
    raise exception 'Only Admin can change roles';
  end if;
  return new;
end;
$$;

create trigger enforce_role_change_admin_only
before update on public.users
for each row
execute function public.enforce_role_change_admin_only();
```

---

## 6. A permissive `public` INSERT policy let anyone self-assign `role: 'Admin'`

**Symptom (caught in review, not a live incident):** The original account-creation flow needed an INSERT policy loose enough for a just-signed-up (or still-unconfirmed, effectively anonymous) user to insert their own `users` row client-side. It was set to `with_check: true` for the `public` role — which also meant literally anyone with just the public anon key could `POST /rest/v1/users` with `{"role": "Admin"}` and no authentication at all.

**Compounding factor:** the role-change trigger in #5 only fires on `UPDATE`. It does nothing to stop a direct `INSERT` with an arbitrary `role` already set.

**Fix:** Replaced the policy with one scoped to low-privilege self-registration only:
```sql
drop policy "public insert users" on public.users;

create policy "Self-registration is limited to low-privilege roles"
on public.users
for insert
to public
with check (role in ('Driver', 'Helper'));
```
Admin/Supervisor/Customer accounts can now only be created through the `admin-users` Edge Function, which is gated on the caller already being an Admin.

---

## 7. Schema/policy/grant/trigger changes here are not version-controlled

There is currently no `supabase/migrations/` directory in this repo. Every SQL statement in this file (policies, grants, the trigger) was run by hand in the Supabase Dashboard's SQL Editor against the live project — none of it is captured as a migration file. If this project's Supabase instance were ever rebuilt from scratch, none of the above would be replayed automatically; it would all need to be re-applied from this document. Worth turning into tracked migrations at some point.

---

## Unrelated noise (not a bug)

Running Supabase CLI commands (e.g. `npx supabase functions deploy`) prints a Node.js deprecation warning (`Node.js 20 and below are deprecated...`). This is harmless and unrelated to any of the above — it does not indicate a failed deploy.
