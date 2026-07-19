### Auth

- **Admin-created accounts** (`AdminHome.jsx`, any role — Supervisor/Admin/Driver/Helper/Customer): created via the `admin-users` Edge Function's `create-user` action (`{ fullName, email, role }`), which uses `supabase.auth.admin.createUser` (server-side, `service_role`) and then inserts the matching `users` row itself. This runs entirely outside the admin's own browser session — the admin's session is never touched during creation. The admin-entered `email` is stored purely as the account's contact/notification address — it is **not** used as the Supabase Auth login. The real Auth login (`users.login_email`) is generated server-side from `fullName` by `loginEmailLocalPart`/`nextLoginEmail` in `supabase/functions/admin-users/index.ts`: first-name initial + middle-name initial(s) (if any) + surname + a 2-digit sequence, e.g. "John Michael Doe" → `jmdoe01@marveltrucking.local`, sequenced per unique prefix. That generated login email plus a random temp password are emailed to the contact `email` via Resend (`sendCredentialsEmail`) instead of being shown to the admin. If `RESEND_API_KEY`/`RESEND_FROM_EMAIL` aren't set or the send fails, the response falls back to `emailSent: false` + `emailError` + a directly-returned `tempPassword`, and `AdminHome.jsx` falls back to showing it in a modal so the password is never silently lost. When `role` is `Driver`, the function also inserts a matching `driver_records` row in the same request via the shared `ensureDriverRecord` helper (`auth_id` = the new user's id, `id` = the next sequential `D001`/`D002`/... value, `first_name`/`last_name` split from `fullName`, `email` = the contact email, `middle_name`/`birthdate`/`profile_picture` left null). If that insert fails, both the `users` row and the auth user are rolled back so a Driver account is never left without its `driver_records` row.
- **Editing an existing user's role to Driver** (`AdminHome.jsx`'s "Save Changes"): after the client-side `users` update succeeds, if the new role is `Driver` the client calls the `admin-users` Edge Function's `ensure-driver-record` action (`{ userId }`). `ensureDriverRecord` first checks for an existing `driver_records` row by `auth_id` and only inserts a new one if none exists — so toggling a user's role Helper→Driver→Helper→Driver repeatedly reuses the same `driver_records` row instead of creating duplicates. Demoting a user away from `Driver` does **not** touch or delete their `driver_records` row; it's left as-is and picked back up if they're promoted to Driver again.
- **Driver crew accounts** (`SupDeliveryCrew.jsx`, Supervisor adding a Driver/Helper): still created client-side via `supabase.auth.signUp` followed by a `users`/`driver_records` insert. Note `supabase.auth.signUp` swaps the *caller's own browser session* to the newly created user as a side effect — the Supervisor's session is briefly replaced by the new driver's session during this flow.
- Login (`src/pages/Login.jsx`) calls `supabase.auth.signInWithPassword`, then looks up the caller's own `users.role` to redirect to the matching portal home (`Admin` → `/admin/user-management`, `Supervisor` → `/supervisor/dashboard`, `Driver` → `/driver/performance`, `Customer` → `/customer/home`). If the role has no portal yet (`Helper`) or the `users` row can't be read, the session is signed back out and an error is shown. This role→route lookup is shared (`resolveHomeRoute`) with an `useEffect` that runs on every mount of `Login`: it calls `supabase.auth.getSession()` first, and if a still-valid persisted session exists (see "Remember Me" below), redirects straight to the portal home without showing the form — since `/` always renders `Login` regardless of auth state (`App.jsx` has no route guarding), this mount-time check is the only thing that makes a persisted session actually skip the login screen.
- A `LogoutButton` (`src/layout/LogoutButton.jsx`) is wired into all four portal sidebars (Admin, Supervisor, Driver, Customer) — it confirms via a modal (rendered through a `createPortal` into `document.body` so it isn't affected by the sidebar's own stacking context), disables itself once clicked to prevent double-submission, then calls `supabase.auth.signOut()` and redirects to `/`.
- Deactivating an account, resetting another user's password, creating a new account (any role), and syncing a `driver_records` row for a promoted user all require the Supabase Admin API (`service_role` key) and cannot run in client code. These are handled by the `admin-users` Edge Function (`supabase/functions/admin-users`, actions: `create-user`, `deactivate`, `reset-password`, `ensure-driver-record`), which the client calls via `supabase.functions.invoke`. The function verifies the caller's own `users.role` is `Admin` before acting on any of the four. `reset-password` looks up the target's existing `email`/`login_email`, generates a new temp password, and emails both to the contact `email` the same way `create-user` does — same `emailSent`/`emailError`/`tempPassword` fallback contract.
- Sending credentials by email requires two Edge Function secrets that are **not** provided automatically: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (set via `npx supabase secrets set ... --project-ref <ref>`). Without them, `sendCredentialsEmail` short-circuits with `emailSent: false` — account creation and password resets still succeed, they just fall back to returning `tempPassword` directly. Resend's free/unverified sender (`onboarding@resend.dev`) can only deliver to the email address the Resend account itself was signed up with; sending to any other contact email requires verifying a real domain in Resend and pointing `RESEND_FROM_EMAIL` at it.
- `service_role` bypasses RLS but still needs explicit Postgres `GRANT`s per table — `public.users` and `public.driver_records` both had to be granted to `service_role` before the Edge Function could write to them (see `SUPABASE_GOTCHAS.md` #2 and #7). Any new table the Edge Function needs to touch will need the same grant.
- Editing an existing user's name, role, or email (`AdminHome.jsx`'s "Save Changes" in the Manage Account modal) does **not** go through the `admin-users` Edge Function for the `users` write itself — it performs a direct client-side `supabase.from('users').update(...)` against the `users` table, so this write — including role changes — bypasses the Admin-API gate that protects create/deactivate/reset-password and relies solely on RLS policies (not documented here) to prevent unauthorized use. It does, however, call the Edge Function's `ensure-driver-record` action afterward when the new role is `Driver`, since creating a `driver_records` row still requires `service_role`.

# Current Limitations

Driver and Helper accounts created by Supervisors still use
`supabase.auth.signUp()` on the client.

As a result, the Supervisor's browser session is temporarily
replaced by the newly created user's session.

This flow should eventually be migrated to the
`admin-users` Edge Function.

Editing a user's role/name/email from the Admin User Management
screen also bypasses the `admin-users` Edge Function, updating
the `users` table directly from the client. This should likely
be migrated to the Edge Function as well, so role changes get
the same Admin-only server-side check as create/deactivate/reset-password.

## Browser Sessions

Supabase stores authentication sessions in browser
localStorage by default.

The login form (`src/pages/Login.jsx`) has a "Remember Me"
checkbox. `src/lib/supabaseClient.js` configures the Supabase
client with a custom `auth.storage` adapter (`rememberMeStorage`)
that reads/writes the session under either `localStorage` (Remember
Me checked — session survives closing the browser) or
`sessionStorage` (unchecked — session is cleared when the tab/
browser closes). The checkbox state itself is written to
`localStorage` under the `rememberMe` key right before
`signInWithPassword` is called, since the storage adapter checks
that flag whenever Supabase persists a session.

Restarting the Vite development server does not clear
the current login session.

To switch accounts:

- Logout normally, or
- Navigate back to Login and sign in again.

## Admin-created Accounts

Higher-privilege accounts are created through the
`admin-users` Edge Function.

The Edge Function uses the Supabase Admin API
(`supabase.auth.admin.createUser()`).

Only Admin users are allowed to perform this action.


Admin/Supervisor/Customer accounts can now only be created through the `admin-users` Edge Function, which is gated on the caller already being an Admin.