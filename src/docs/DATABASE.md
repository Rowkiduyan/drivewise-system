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
- email — contact/notification address entered by the admin when the account is created. Account credentials are sent here; this is **not** the Supabase Auth login.
- login_email — the actual Supabase Auth login email. Generated server-side by the `admin-users` Edge Function from `full_name` (first-name initial + middle-name initial(s), if any + surname + a 2-digit sequence, e.g. `jmdoe01@marveltrucking.local`). Unique, not editable from the UI. For accounts created before this column existed, it was backfilled to equal `email`, since that was already their real Auth login at the time.
- role
- created_at

`role` is one of: `Supervisor`, `Admin`, `Driver`, `Helper`, `Customer`.

### Relationships

- Referenced by `driver_records.auth_id`.


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

`id` follows a sequential `D001`, `D002`, ... convention. The `admin-users` Edge Function derives the next id by reading the highest existing `D`-prefixed id and incrementing it. See `AUTHENTICATION.md` for how `driver_records` rows get created.

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
# Naming Conventions

- Primary keys use `id` unless a domain-specific identifier is required.
- Foreign keys reference the parent table's primary key.
- Timestamps use UTC.


This document describes the current logical database design.

Authentication, RLS policies, Edge Functions, and Supabase-specific security are documented separately.

The schema will be expanded to support trips, trucks, GPS tracking, and fleet management features as development continues.