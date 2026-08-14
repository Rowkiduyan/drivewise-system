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

---

## 7. Gotcha #2 repeats per table — `driver_records` needed its own `service_role` grant

**Symptom:** The `admin-users` Edge Function's new `ensure-driver-record` action (and the `driver_records` insert added to `create-user`) returned a `400` with no useful message in the browser console — just `Failed to load resource: ... 400`.

**Cause:** Same root cause as #2, on a different table. `service_role` bypasses RLS but was never granted table-level access to `public.driver_records`, so the insert failed with `permission denied for table driver_records` (visible only in the Edge Function's own logs, not the client response).

**Fix:**
```sql
grant select, insert, update, delete on public.driver_records to service_role;
```

**Takeaway:** the `service_role` grant is per-table, not global — every new table an Edge Function writes to needs this same grant applied explicitly.

---

## 8. New tables aren't private by default — Supabase auto-grants `anon`/`authenticated` baseline access

**Symptom:** Running `select grantee, privilege_type from information_schema.role_table_grants where table_name = 'driver_records';` showed `anon` with `SELECT` and `authenticated` with `SELECT`/`INSERT` on `driver_records` — despite nobody ever writing a `GRANT` statement for those roles on that table. The five `*_records` tables (`driver_records`, `supervisor_records`, `admin_records`, `helper_records`, `customer_records`) were designed to be reachable only through the `admin-users` Edge Function's `service_role` connection (see `DATABASE.md`, `AUTHENTICATION.md`) — `anon` having `SELECT` on a table holding names, birthdates, addresses, and contact numbers defeats that entirely.

**Cause:** Supabase configures `ALTER DEFAULT PRIVILEGES` on the `public` schema so that *every new table* automatically inherits baseline grants to `anon`/`authenticated`, independent of whatever explicit `GRANT`s are added afterward. The `grant ... to service_role` statements from gotcha #2/#7 are additive — they hand `service_role` access, they don't revoke what Supabase auto-granted to `anon`/`authenticated` at table-creation time. Creating a table and only granting `service_role` is not the same as making it `service_role`-only.

**Fix:**
```sql
revoke all on public.driver_records from anon, authenticated;
revoke all on public.supervisor_records from anon, authenticated;
revoke all on public.admin_records from anon, authenticated;
revoke all on public.helper_records from anon, authenticated;
revoke all on public.customer_records from anon, authenticated;
```

**How it was diagnosed:**
```sql
select relrowsecurity from pg_class where relname = 'driver_records';
select grantee, privilege_type from information_schema.role_table_grants where table_name = 'driver_records';
```

**Takeaway:** a table meant to be `service_role`-only needs an explicit `REVOKE ALL ... FROM anon, authenticated`, not just the absence of a `GRANT` statement for those roles — Supabase's schema-level default privileges fill that gap in silently. Check every new table this way, not just the ones an Edge Function writes to.

---

## 9. Realtime `postgres_changes` silently drops every event if the RLS policy's `USING` clause joins to another table

**Symptom:** Building Helper-portal Realtime subscriptions on `sessions` and `delivery_requests` (read-only mirrors of Driver's own working `alerts`/`gps_logs` subscriptions), the channel joined fine (`"Subscribed to PostgreSQL"` reply, correct `postgres_changes` filter echoed back) and the underlying data was correct on every fresh fetch — but a change made while the tab was already open (a Driver pressing Pause Trip, a stage advance) never arrived on the open Realtime connection. No error anywhere — client, Edge Function, and Postgres logs were all clean. Confirmed via raw websocket frame inspection (Playwright's `page.on('websocket')`), not just UI symptoms: the `alerts` channel reliably delivered a `postgres_changes` data frame on `INSERT` in the same live session; the `sessions`/`delivery_requests` channels never did, no matter how long the wait.

**Cause:** The new RLS policies written for these two tables (scoping a Driver/Helper to their own assigned rows) used an inline `exists (select 1 from other_table where ...)` join directly inside the `USING` clause — e.g. `exists (select 1 from helper_records where helper_records.auth_id = auth.uid() and helper_records.id = any(assigned_helper_ids))`. This evaluates correctly for ordinary REST `select`s (confirmed: manual client-side queries against the same tables returned the right rows), but Supabase Realtime's per-subscriber authorization check for `postgres_changes` does not reliably evaluate policies that reference a second table inline — it silently excludes the row from the broadcast rather than erroring. The two Admin/Supervisor-only policies already on `users`/`sessions` that use a bare function call (`current_user_role() = 'Admin'`) were unaffected, since a function call is opaque to this check even though the function body itself queries another table.

**Fix:** Move the cross-table logic into a `SECURITY DEFINER` SQL function that takes the row's own columns as arguments, so the policy's visible predicate is a single opaque function call — same pattern already established for `current_user_role()`/`is_admin()` on `users`:
```sql
create or replace function public.session_visible_to_caller(p_driver_id text, p_delivery_request_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    p_driver_id = (select id from driver_records where auth_id = auth.uid())
    or exists (
      select 1 from delivery_requests dr
      where dr.id = p_delivery_request_id
        and (select id from helper_records where auth_id = auth.uid()) = any(dr.assigned_helper_ids)
    )
$$;

create policy "assigned crew can read own sessions" on public.sessions
for select to authenticated
using (public.session_visible_to_caller(driver_id, delivery_request_id));
```
The function body can still contain joins/subqueries freely — only the policy's own `USING`/`WITH CHECK` expression needs to stay join-free for Realtime to authorize correctly.

**How it was diagnosed:** confirmed the publication (`select * from pg_publication_tables where pubname = 'supabase_realtime'`), replica identity, and the actual live policy definitions (`select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'sessions'` — this also caught `RLS.md` being stale/wrong about this table's policies, see that file). Isolated the join-vs-function distinction empirically: a temporary `using (true)` debug policy made events flow immediately, proving the RLS layer itself (not the publication or client code) was the point of failure, then narrowed it to the join specifically by comparing against the one already-working function-based policy on the same table.

**Takeaway:** any RLS policy meant to gate a `postgres_changes` subscription should be a bare column comparison or a single function call — never an inline join/`exists` against another table, even though that exact same policy works fine for ordinary `select` queries via REST/Edge Functions. This is easy to miss because everything except the live subscription itself (fetch, publication membership, channel join) looks correct.

---

## 10. `select('*')` 403s the whole request if a column-scoped grant excludes even one column

**Symptom:** Building Phase 8's Supervisor Dashboard (`08_REALTIME_DASHBOARD.md`), a plain `supabase.from('devices').select('*')` from a Supervisor's browser session returned `403 Forbidden` on the REST `GET`, even after confirming (via `pg_policies`) that a correct SELECT policy existed covering `Supervisor`.

**Cause:** Same root mechanism as gotcha #1 (grant checked before RLS), but via a *column*-scoped grant instead of a missing table-level one. `devices`' `authenticated` grant is deliberately column-scoped — `select` on `id, device_id, plate_number, device_status, created_at, last_ping` only, excluding `device_secret_hash` (a live auth credential, see `DATABASE.md`'s `devices` "Grants" note). `select('*')` asks Postgres to read every column, including the excluded one — and unlike RLS (which silently filters *rows*), a missing column grant fails the *entire* request with `403`, not just omitting that one column.

**Fix:** Select an explicit column list instead of `*` on any table with a column-scoped grant:
```js
supabase.from('devices').select('id, device_id, plate_number, device_status, created_at, last_ping')
```

**Takeaway:** `select('*')` is only safe against a table where `authenticated`/`anon` has an unrestricted (whole-row) grant. Before querying a new table client-side, check `information_schema.role_table_grants` for a `column_name` restriction (or check `DATABASE.md`'s Grants note for that table) — RLS being correct doesn't rule this out, since it's a separate, earlier check.

---

## 11. `service_role` had `insert`/`update` on `sessions` but no `delete` at all

**Symptom:** Found 2026-08-14 while writing a disposable test script (`scripts/repro-real-gps-pipeline.mjs`) that needed to clean up a test session it had created: `admin.from('sessions').delete().eq('session_id', ...)` (using `service_role`) failed with `permission denied for table sessions`, `hint: "Grant the required privileges to the current role with: GRANT DELETE ON public.sessions TO service_role;"` — a direct Postgres grants error, not an app bug.

**Cause:** Same root shape as gotcha #2/#7 (`service_role` grants are per-table and per-verb, never assumed) — every real Trip-lifecycle action this codebase has ever written (`start-trip`/`pause-trip`/`resume-trip`/`end-trip` in `driver-trip`) only ever `insert`s or `update`s a `sessions` row, never deletes one, so a missing `delete` grant had no way to surface until something (in this case, disposable test-fixture cleanup) actually tried to delete a session row.

**Fix:** Not fixed — this is a schema/grants change, which needs explicit approval per `00_IMPLEMENTATION_RULES.md`, not something to run ad hoc from a test script. Worked around instead: `UPDATE`d the leftover session's `device_id` to `null` (which *is* granted) to free the `sessions_device_id_fkey` reference blocking the unrelated device row's own deletion, and left the now-harmless session row in place rather than deleting it.

**Takeaway:** A missing grant can hide indefinitely if nothing in the existing codebase happens to exercise that specific verb — `insert`/`update`/`select` all being granted on a table is no guarantee `delete` is too. If a future feature genuinely needs to delete a `sessions` row (not just test cleanup), `grant delete on public.sessions to service_role;` needs to be proposed and approved first, per this table's precedent above.


