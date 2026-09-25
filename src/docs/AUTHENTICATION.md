### Auth

- **Admin-created accounts** (`AdminHome.jsx`, any role — Supervisor/Admin/Driver/Helper/Customer): created via the `admin-users` Edge Function's `create-user` action, called with structured fields (`firstName`, `middleName`, `lastName`, `position`, `email`, `contactNumber`, `birthdate`, `address: { street, city, province }`, `role`) rather than a single `fullName`. The function uses `supabase.auth.admin.createUser` (server-side, `service_role`), inserts the matching `users` row (now just `id`/`role`/`login_email` — see `DATABASE.md`), and then upserts a row into whichever `*_records` table matches `role` (`ROLE_TABLE` map in `supabase/functions/admin-users/index.ts`) via the shared `upsertRoleRecord` helper. This runs entirely outside the admin's own browser session — the admin's session is never touched during creation. The admin-entered `email` (personal/contact) is stored on the `*_records` row, not on `users` — it is **not** used as the Supabase Auth login. The real Auth login (`users.login_email`) is generated server-side from the structured name fields by `loginEmailLocalPart`/`nextLoginEmail`: first-name initial + middle-name initial(s) (if any) + surname + a 2-digit sequence, e.g. firstName "John", middleName "Michael", lastName "Doe" → `jmdoe01@marveltrucking.com`, sequenced per unique prefix. That generated login email plus a random temp password are emailed to the contact `email` via Resend (`sendCredentialsEmail`) instead of being shown to the admin. If `RESEND_API_KEY`/`RESEND_FROM_EMAIL` aren't set or the send fails, the response falls back to `emailSent: false` + `emailError` + a directly-returned `tempPassword`, and `AdminHome.jsx` falls back to showing it in a modal so the password is never silently lost. `upsertRoleRecord` generates the new row's `id` sequentially per table/role-prefix (`D001`/`S001`/`A001`/`H001`/`C001`, via `nextRecordId`). If that insert fails, both the `users` row and the auth user are rolled back so an account is never left without its profile row.
- **Editing an existing user** (`AdminHome.jsx`'s "Save Changes"): calls the `admin-users` Edge Function's `update-profile` action (`{ userId, role, firstName, middleName, lastName, position, email, contactNumber, birthdate, address }`) — this replaced a previous direct client-side `users` update plus a Driver-only `ensure-driver-record` action. The function updates `users.role` if it changed, then calls the same `upsertRoleRecord` helper used by `create-user` against whichever `*_records` table matches the (possibly new) `role`. `upsertRoleRecord` checks for an existing row by `auth_id` and updates it if present, or creates one (with a fresh sequential id) if not — so toggling a user's role Helper→Driver→Helper→Driver repeatedly reuses the same `driver_records` row instead of creating duplicates. Demoting a user away from a role does **not** touch or delete their old role's `*_records` row; it's left as-is and picked back up if they're promoted back to that role again.
- **Listing users** (`AdminHome.jsx`'s user table): the client can't read the `*_records` tables directly (only `service_role` has grants on them — see `DATABASE.md`), so the page calls the `admin-users` Edge Function's `list-users` action instead of querying `users`/`*_records` directly. The function reads `users` plus all five `*_records` tables with `service_role` and merges each user with their matching profile row by `auth_id` before returning the combined list.
- **Listing delivery crew** (`SupDeliveryCrew.jsx`, Supervisor-facing): same access problem as above, but for a Supervisor rather than an Admin, and scoped to just Driver/Helper. The `admin-users` Edge Function's `list-crew` action reuses the same merge helper (`listUsersWithProfiles`, shared with `list-users`) filtered to `role in (Driver, Helper)`, joining `driver_records`/`helper_records` only. Unlike every other action in this function, `list-crew` is gated on `CREW_VIEW_ROLES = ["Admin", "Supervisor"]` rather than Admin-only — it's checked separately, before the blanket Admin-only gate that guards `create-user`/`list-users`/`update-profile`/`deactivate`/`reset-password`. Several columns the page displays (Status, Shift, Client Specialty, Weekly Performance) have no backing table yet — see `DATABASE.md` "Current Notes" — so `SupDeliveryCrew.jsx` fills them with fixed placeholders rather than real values.
- **Driver crew accounts** (`SupDeliveryCrew.jsx`, Supervisor adding a Driver/Helper): still created client-side via `supabase.auth.signUp` followed by a `users`/`driver_records` insert. Note `supabase.auth.signUp` swaps the *caller's own browser session* to the newly created user as a side effect — the Supervisor's session is briefly replaced by the new driver's session during this flow.
- Login (`src/pages/Login.jsx`) calls `supabase.auth.signInWithPassword`, then looks up the caller's own `users.role` to redirect to the matching portal home (`Admin` → `/admin/dashboard`, `Supervisor` → `/supervisor/dashboard`, `Driver` → `/driver/trips`, `Helper` → `/helper/trips`, `Customer` → `/customer/deliveries`). If the `users` row can't be read, the session is signed back out and an error is shown. (This line previously read `Driver` → `/driver/performance` and omitted `Helper` — both stale; corrected here while updating the `Customer` target, found while removing `CustomerHome.jsx`/`/customer/home` 2026-09-18, per explicit user request — Deliveries is now the customer portal's default landing page.) This role→route lookup is shared (`resolveHomeRoute`) with an `useEffect` that runs on every mount of `Login`: it calls `supabase.auth.getSession()` first, and if a still-valid persisted session exists (see "Remember Me" below), redirects straight to the portal home without showing the form — since `/` always renders `Login` regardless of auth state (`App.jsx` has no route guarding), this mount-time check is the only thing that makes a persisted session actually skip the login screen.
- A `LogoutButton` (`src/layout/LogoutButton.jsx`) is wired into all four portal sidebars (Admin, Supervisor, Driver, Customer) — it confirms via a modal (rendered through a `createPortal` into `document.body` so it isn't affected by the sidebar's own stacking context), disables itself once clicked to prevent double-submission, then calls `supabase.auth.signOut()` and redirects to `/`.
- Deactivating an account, reactivating one, resetting another user's password, creating a new account (any role), listing all users, and updating a user's profile/role all require the Supabase Admin API or `service_role` table access and cannot run in client code. These are handled by the `admin-users` Edge Function (`supabase/functions/admin-users`, actions: `create-user`, `list-users`, `update-profile`, `deactivate`, `reactivate`, `reset-password`), which the client calls via `supabase.functions.invoke`. The function verifies the caller's own `users.role` is `Admin` before acting on any of these. `reset-password` looks up the target's `role` and `login_email` from `users`, then the contact `email` from the matching `*_records` table, generates a new temp password, and emails both the same way `create-user` does — same `emailSent`/`emailError`/`tempPassword` fallback contract.
- **Deactivating/reactivating an account** (`AdminHome.jsx`'s Manage Account dialog): clicking "Deactivate Account" opens a confirmation modal first; confirming calls the `deactivate` action, which just sets `users.deactivated_at = now()` — it does **not** call the Supabase Admin API to ban the account, since Supabase has no way to schedule a ban to start in the future and the intent is a 24-hour grace period, not an instant lockout (see `DATABASE.md` "users"). "Reactivate Account" (shown in place of "Deactivate Account" once a row is inactive) calls the `reactivate` action, which clears `deactivated_at` back to `null`. The actual 24-hour cutoff is enforced entirely in the client: `resolveHomeRoute` in `Login.jsx` blocks a fresh sign-in once `getDeactivationStatus(deactivated_at).isPastGrace` is true (`src/lib/deactivation.js`, `DEACTIVATION_GRACE_HOURS = 24`), and every portal layout runs `useDeactivationGuard()` (`src/lib/useDeactivationGuard.js`), which re-checks the caller's own `deactivated_at` on mount and every 5 minutes, forcing a sign-out past the grace period and showing a warning banner before it. This lazy, check-at-access-time approach means an already-open browser tab isn't cut off the instant the grace period elapses — only the next time its 5-minute poll (or a fresh login) runs — since there is no cron/scheduled job actually flipping a real ban.
- Sending credentials by email requires two Edge Function secrets that are **not** provided automatically: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (set via `npx supabase secrets set ... --project-ref <ref>`). Without them, `sendCredentialsEmail` short-circuits with `emailSent: false` — account creation and password resets still succeed, they just fall back to returning `tempPassword` directly. Resend's free/unverified sender (`onboarding@resend.dev`) can only deliver to the email address the Resend account itself was signed up with; sending to any other contact email requires verifying a real domain in Resend and pointing `RESEND_FROM_EMAIL` at it.
- `service_role` bypasses RLS but still needs explicit Postgres `GRANT`s per table — `public.users` and each of the five `*_records` tables (`driver_records`, `supervisor_records`, `admin_records`, `helper_records`, `customer_records`) had to be granted to `service_role` before the Edge Function could write to them (see `SUPABASE_GOTCHAS.md` #2 and #7). Any new table the Edge Function needs to touch will need the same grant. None of the `*_records` tables are meant to give `authenticated`/`anon` any access — they're only ever touched by this Edge Function — but that requires an explicit `revoke all ... from anon, authenticated` on each one; Supabase auto-grants baseline `anon`/`authenticated` privileges to every new `public` schema table by default, so simply never writing a `GRANT` for those roles is not enough (see `SUPABASE_GOTCHAS.md` #8).

# Current Limitations

Driver and Helper accounts created by Supervisors still use
`supabase.auth.signUp()` on the client.

As a result, the Supervisor's browser session is temporarily
replaced by the newly created user's session.

This flow should eventually be migrated to the
`admin-users` Edge Function.

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