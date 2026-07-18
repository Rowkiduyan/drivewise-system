# Database

## Overview

DriveWise uses Supabase PostgreSQL as its primary database.

The database currently stores:

- User accounts
- Driver profiles
- Drowsiness monitoring sessions
- Drowsiness alert records

The schema is currently under active development and will expand as additional fleet management features are implemented.

---

# Entity Relationship

users (1) -------- (1) driver_records

sessions (1) ----- (N) alerts

---

# Tables

## users

### Purpose

Stores user accounts for authentication and role management.

### Key Fields

- id (UUID, Primary Key) — matches the corresponding Supabase Auth user id.
- full_name
- email
- role
- created_at

`role` is one of: `Supervisor`, `Admin`, `Driver`, `Helper`, `Customer`.

### Relationships

- Referenced by `driver_records.auth_id`.

### Auth

- **Admin-created accounts** (`AdminHome.jsx`, any role — Supervisor/Admin/Driver/Helper/Customer): created via the `admin-users` Edge Function's `create-user` action, which uses `supabase.auth.admin.createUser` (server-side, `service_role`) and then inserts the matching `users` row itself. This runs entirely outside the admin's own browser session — the admin's session is never touched during creation.
- **Driver crew accounts** (`SupDeliveryCrew.jsx`, Supervisor adding a Driver/Helper): still created client-side via `supabase.auth.signUp` followed by a `users`/`driver_records` insert. Note `supabase.auth.signUp` swaps the *caller's own browser session* to the newly created user as a side effect — the Supervisor's session is briefly replaced by the new driver's session during this flow.
- Login (`src/pages/Login.jsx`) calls `supabase.auth.signInWithPassword`, then looks up the caller's own `users.role` to redirect to the matching portal home (`Admin` → `/admin/user-management`, `Supervisor` → `/supervisor/dashboard`, `Driver` → `/driver/performance`, `Customer` → `/customer/home`). If the role has no portal yet (`Helper`) or the `users` row can't be read, the session is signed back out and an error is shown.
- A `LogoutButton` (`src/layout/LogoutButton.jsx`) is wired into all four portal sidebars (Admin, Supervisor, Driver, Customer) — it confirms via a modal (rendered through a `createPortal` into `document.body` so it isn't affected by the sidebar's own stacking context), disables itself once clicked to prevent double-submission, then calls `supabase.auth.signOut()` and redirects to `/`.
- Deactivating an account, resetting another user's password, and creating a new account (any role) all require the Supabase Admin API (`service_role` key) and cannot run in client code. These are handled by the `admin-users` Edge Function (`supabase/functions/admin-users`, actions: `create-user`, `deactivate`, `reset-password`), which the client calls via `supabase.functions.invoke`. The function verifies the caller's own `users.role` is `Admin` before acting on any of the three.

### RLS & Grants (`users` table)

Row Level Security is on. Current state:

- Policies: `Allow read for authenticated users` (SELECT, `authenticated`, `qual: true`), `Admins can read all users` (SELECT, `authenticated`, via `is_admin()`), `Self-registration is limited to low-privilege roles` (INSERT, `public`, `with_check: role in ('Driver', 'Helper')`), `Admins can update any user, others can update themselves` (UPDATE, `authenticated`, `qual`/`with_check`: `current_user_role() = 'Admin' OR auth.uid() = id`).
- `current_user_role()` is a `SECURITY DEFINER` helper (`select role from public.users where id = auth.uid()`) used by the UPDATE policy to check the caller's own role without recursively re-triggering RLS on `users`.
- Grants: `authenticated` has `SELECT`, `INSERT`, `UPDATE` (no `DELETE`). `service_role` has `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Trigger `enforce_role_change_admin_only` (BEFORE UPDATE) rejects the update if `role` is being changed and the caller's own `current_user_role()` isn't `Admin` — applies even when a user is updating their own row, so a non-Admin cannot self-escalate. Only fires on UPDATE, not INSERT — the self-registration policy above is what restricts `role` on the INSERT path.

See `SUPABASE_GOTCHAS.md` for the debugging history behind these policies/grants/trigger (missing grants, `service_role` permissions, the role-escalation fix, etc.) — none of this is captured as a tracked migration file (see gotcha #7).

---

## driver_records

### Purpose

Stores driver profile information separate from authentication data.

### Key Fields

- id (TEXT, Primary Key)
- auth_id
- first_name
- middle_name
- last_name
- birthdate
- position
- email
- profile_picture

### Relationships

- `auth_id` references `users.id` (foreign key). `id` is an independently generated text value and is no longer the same as the linked user's auth id.

---

## sessions

### Purpose

Represents one drowsiness monitoring session.

A session begins when raspberry pi is turned on and monitoring starts and ends when monitoring stops.

### Key Fields

- session_id
- created_at
- start_time
- end_time
- total_alerts
- session_duration

### Relationships

- One session can contain multiple alerts.

---

## alerts

### Purpose

Stores every drowsiness event detected during a monitoring session.

### Key Fields

- id
- event_type
- duration
- session_id
- created_at

### Relationships

- Belongs to one monitoring session.

---

# Current Notes

The current database supports the drowsiness detection prototype.

At this stage:

- One Raspberry Pi device sends monitoring data.
- Drowsiness events are associated with a single predefined account.
- Multi-driver and multi-truck support has not yet been implemented.

---


These tables will allow the system to associate GPS tracking and drowsiness events with specific drivers, trucks, and delivery trips.