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
users (1) -------- (1) supervisor_records
users (1) -------- (1) admin_records
users (1) -------- (1) helper_records
users (1) -------- (1) customer_records

sessions (1) ----- (N) alerts

Each user has exactly one profile row, in the `*_records` table matching their `role` — never more than one, and never in more than one table at a time.

---

# Tables

## users

### Purpose

Stores user accounts for authentication and role management only. Personal/profile details (name, birthdate, contact info, etc.) live in the role-specific `*_records` table instead — see "Per-role profile tables" below.

### Key Fields

- id (UUID, Primary Key) — matches the corresponding Supabase Auth user id.
- login_email — the actual Supabase Auth login email. Generated server-side by the `admin-users` Edge Function from the user's name (first-name initial + middle-name initial(s), if any + surname + a 2-digit sequence, e.g. `jmdoe01@marveltrucking.local`). Unique, not editable from the UI. Shown in the UI as "Work Email".
- role
- created_at

`role` is one of: `Supervisor`, `Admin`, `Driver`, `Helper`, `Customer`.

### Relationships

- Referenced by `driver_records.auth_id`, `supervisor_records.auth_id`, `admin_records.auth_id`, `helper_records.auth_id`, `customer_records.auth_id` (exactly one of these has a row for a given user, matching their current `role`).

### Migration note

`full_name` and `email` previously lived on this table. They have moved to the matching `*_records` table (`full_name` split into `first_name`/`middle_name`/`last_name`; `email` renamed conceptually to "Personal Email" but keeps the column name `email` for continuity with the pre-existing `driver_records` shape). Existing code/RLS/Edge Function references to `users.full_name` and `users.email` need to be updated to read from the role's records table instead.


## Per-role profile tables

### Purpose

Each role has its own profile table, holding the fields captured by the "Add User" form: name (split into parts), position, personal email, contact number, birthdate, and address. This generalizes the `driver_records` table (which already existed) to the other four roles instead of collapsing everyone's profile into one wide `users` row.

Tables: `driver_records` (pre-existing), `supervisor_records`, `admin_records`, `helper_records`, `customer_records`.

### Key Fields (same shape in all five tables)

- id (TEXT, Primary Key) — sequential per-table convention, one prefix letter per role: `D001`/`D002`/... (Driver, pre-existing), `S001`/... (Supervisor), `A001`/... (Admin), `H001`/... (Helper), `C001`/... (Customer). The `admin-users` Edge Function derives the next id per table by reading the highest existing prefixed id in that table and incrementing it — the same pattern already used for `driver_records`.
- auth_id — references `users.id` (foreign key).
- first_name
- middle_name (nullable)
- last_name
- position (nullable — not meaningful for every role)
- birthdate
- email — personal/contact email entered by the admin. Account credential emails are sent here; this is **not** the Supabase Auth login (`users.login_email`).
- contact_number (new field; also being added to the existing `driver_records`, which did not have it before)
- address (JSONB; `{ "street": ..., "city": ..., "province": ... }`. New field; also being added to the existing `driver_records`, which did not have it before. Structured as JSONB rather than flat text so the three parts round-trip cleanly into a 3-field edit form and remain individually queryable — Philippines-only, no country field. `city`/`province` are chosen from a static bundled PSGC-based dataset in the frontend, not a live API — `street` stays free text.)
- profile_picture (nullable)

`customer_records` has one additional field not present in the other four tables:

- client_name — the company/organization this Customer account represents. Required by the Add User form when role is Customer; the `admin-users` Edge Function only reads/writes this column for `customer_records`, since it doesn't exist on `driver_records`/`supervisor_records`/`admin_records`/`helper_records`.

### Relationships

- `auth_id` references `users.id`. `id` is an independently generated text value, not the linked user's auth id.

See `AUTHENTICATION.md` for how these rows get created/synced relative to `users`, and `SUPABASE_GOTCHAS.md` #2/#7 — every new table here needs its own `service_role` grant before the `admin-users` Edge Function can write to it.

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

## crew_client_specialties

### Purpose

Join table assigning Driver/Helper crew members to the Customer accounts ("clients") they specialize in, shown on `SupCrewProfile.jsx`'s Overview tab. A "client" here is a Customer-role `users` row, displayed by its `customer_records.client_name` — there is no separate `clients` table.

### Key Fields

- id (bigint, Primary Key, identity)
- crew_auth_id — references `users.id` (the Driver/Helper).
- client_auth_id — references `users.id` (the Customer).
- created_at

A `(crew_auth_id, client_auth_id)` pair is unique — a crew member can't be assigned the same client twice.

### Relationships

- Read/written only through the `admin-users` Edge Function's `list-clients`/`list-crew-clients`/`add-crew-client`/`remove-crew-client` actions (Admin or Supervisor caller) — same access model as `list-crew`. See `SUPABASE_GOTCHAS.md` #2/#7/#8 — needs its own `service_role` grant and `anon`/`authenticated` revoke before the Edge Function can use it.

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
# Naming Conventions

- Primary keys use `id` unless a domain-specific identifier is required.
- Foreign keys reference the parent table's primary key.
- Timestamps use UTC.
- Per-role profile table ids use a single role-prefix letter + zero-padded sequence: `D` (Driver), `S` (Supervisor), `A` (Admin), `H` (Helper), `C` (Customer).


This document describes the current logical database design.

Authentication, RLS policies, Edge Functions, and Supabase-specific security are documented separately.

The schema will be expanded to support trips, trucks, GPS tracking, and fleet management features as development continues.