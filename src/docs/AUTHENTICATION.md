### Auth

- **Admin-created accounts** (`AdminHome.jsx`, any role — Supervisor/Admin/Driver/Helper/Customer): created via the `admin-users` Edge Function's `create-user` action, which uses `supabase.auth.admin.createUser` (server-side, `service_role`) and then inserts the matching `users` row itself. This runs entirely outside the admin's own browser session — the admin's session is never touched during creation.
- **Driver crew accounts** (`SupDeliveryCrew.jsx`, Supervisor adding a Driver/Helper): still created client-side via `supabase.auth.signUp` followed by a `users`/`driver_records` insert. Note `supabase.auth.signUp` swaps the *caller's own browser session* to the newly created user as a side effect — the Supervisor's session is briefly replaced by the new driver's session during this flow.
- Login (`src/pages/Login.jsx`) calls `supabase.auth.signInWithPassword`, then looks up the caller's own `users.role` to redirect to the matching portal home (`Admin` → `/admin/user-management`, `Supervisor` → `/supervisor/dashboard`, `Driver` → `/driver/performance`, `Customer` → `/customer/home`). If the role has no portal yet (`Helper`) or the `users` row can't be read, the session is signed back out and an error is shown.
- A `LogoutButton` (`src/layout/LogoutButton.jsx`) is wired into all four portal sidebars (Admin, Supervisor, Driver, Customer) — it confirms via a modal (rendered through a `createPortal` into `document.body` so it isn't affected by the sidebar's own stacking context), disables itself once clicked to prevent double-submission, then calls `supabase.auth.signOut()` and redirects to `/`.
- Deactivating an account, resetting another user's password, and creating a new account (any role) all require the Supabase Admin API (`service_role` key) and cannot run in client code. These are handled by the `admin-users` Edge Function (`supabase/functions/admin-users`, actions: `create-user`, `deactivate`, `reset-password`), which the client calls via `supabase.functions.invoke`. The function verifies the caller's own `users.role` is `Admin` before acting on any of the three.

# Current Limitations

Driver and Helper accounts created by Supervisors still use
`supabase.auth.signUp()` on the client.

As a result, the Supervisor's browser session is temporarily
replaced by the newly created user's session.

This flow should eventually be migrated to the
`admin-users` Edge Function.

## Browser Sessions

Supabase stores authentication sessions in browser
localStorage.

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