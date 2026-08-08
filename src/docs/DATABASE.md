    # Database

    ## Overview

    DriveWise uses Supabase PostgreSQL as its primary database.

    The database currently stores:

    - User accounts
    - Driver profiles
    - Drowsiness monitoring sessions
    - Drowsiness alert records
    - Trucks
    - Telemetry devices
    - Delivery requests and quotations
    - GPS logs

    The schema is currently under active development and will expand as additional fleet management features are implemented.

    ---

    # Entity Relationship

    users (1) -------- (1) driver_records
    users (1) -------- (1) supervisor_records
    users (1) -------- (1) admin_records
    users (1) -------- (1) helper_records
    users (1) -------- (1) customer_records

    sessions (1) ----- (N) alerts

    trucks (1) ----- (0..N) devices              [devices.plate_number -> trucks.plate_number]
    users (1) ----- (N) delivery_requests         [delivery_requests.customer_auth_id -> users.id]
    delivery_requests (1) ----- (N) delivery_quotations [delivery_quotations.delivery_id -> delivery_requests.id]
    users (1) ----- (N) delivery_quotations        [delivery_quotations.submitted_by -> users.id]
    delivery_requests (1) ----- (N) sessions       [sessions.delivery_request_id -> delivery_requests.id]
    driver_records (1) ----- (N) sessions          [sessions.driver_id -> driver_records.id]
    trucks (1) ----- (N) sessions                  [sessions.truck_plate -> trucks.plate_number]
    devices (1) ----- (N) sessions                 [sessions.device_id -> devices.device_id]
    sessions (1) ----- (N) gps_logs                [gps_logs.session_id -> sessions.session_id]

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
    - deactivated_at (nullable, timestamptz) — set by `AdminHome.jsx`'s "Deactivate Account" (via the `admin-users` Edge Function's `deactivate` action) when an Admin deactivates an account; cleared back to `null` by "Reactivate Account" (`reactivate` action). Deactivating does **not** ban the account in Supabase Auth — Supabase has no way to schedule a ban to start in the future, and the intent is a 24-hour grace period, not an instant lockout. Instead, every login (`Login.jsx`) and every portal layout (`useDeactivationGuard`, polled every 5 minutes for already-open sessions) compares this timestamp against now: access is only actually cut off once `DEACTIVATION_GRACE_HOURS` (24, see `src/lib/deactivation.js`) have elapsed, and a warning banner is shown in the meantime.

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
    - profile_picture (nullable) — public Storage URL (with a `?v=` cache-busting query param) into the `driver-profile-pics` bucket, keyed by `auth_id + ".jpg"` (client always crops/re-encodes to a 256x256 JPEG before upload, so re-uploads overwrite the same object — see `src/lib/profilePicture.js`). Written only by the `admin-users` Edge Function's `upload-profile-picture` action.

    `customer_records` has one additional field not present in the other four tables:

    - client_name — the company/organization this Customer account represents. Required by the Add User form when role is Customer; the `admin-users` Edge Function only reads/writes this column for `customer_records`, since it doesn't exist on `driver_records`/`supervisor_records`/`admin_records`/`helper_records`.

    ### Relationships

    - `auth_id` references `users.id`. `id` is an independently generated text value, not the linked user's auth id.

    See `AUTHENTICATION.md` for how these rows get created/synced relative to `users`, and `SUPABASE_GOTCHAS.md` #2/#7 — every new table here needs its own `service_role` grant before the `admin-users` Edge Function can write to it.

    ---

    ## Storage buckets

    ### driver-profile-pics

    Holds one object per user with a profile picture: `{auth_id}.jpg` (always JPEG — the client crops/re-encodes to a fixed 256x256 square before upload, see `src/lib/profilePicture.js`). Written only by the `admin-users` Edge Function's `upload-profile-picture` action, using `upsert: true` so a re-upload overwrites the same object rather than accumulating orphans.

    **Manual setup required** (not created by any migration in this repo): create the bucket in the Supabase Dashboard (Storage → New bucket → name `driver-profile-pics` → Public). It must be Public since the frontend renders `profile_picture`'s stored URL directly as an `<img src>` with no signing step. `service_role` bypasses object-level RLS the same way it bypasses table RLS (unlike gotcha #2/#7, `storage.objects` is a Supabase-managed table that already grants `service_role` full access — only the bucket itself needs to be created manually).

    ---

    ## sessions

    ### Purpose

    Represents one drowsiness monitoring session.

    A session begins when raspberry pi is turned on and monitoring starts and ends when monitoring stops.

    This described the original prototype's session lifecycle. Per `IMPLEMENTATION/03_START_TRIP_AND_SESSION.md` and `IMPLEMENTATION/03B_PAUSE_AND_RESUME_TRIP.md`, the lifecycle becomes driver-triggered (Start/Pause/Resume/End Trip) as those phases are implemented. Start Trip is implemented and tested (2026-08-08, `driver-trip` Edge Function) — Pause/Resume/End Trip are not yet built.

    `service_role` grants confirmed working (2026-08-08) via the `driver-trip` Edge Function: `select`/`insert`/`update` on `sessions` (had to be granted — see `SUPABASE_GOTCHAS.md` #2/#7), plus `select` on `delivery_requests`/`driver_records`/`users`/`devices` (already sufficient, no grant needed).

    ### Key Fields

    - session_id
    - created_at
    - start_time
    - end_time
    - total_alerts
    - session_duration
    - delivery_request_id (text, nullable) — references `delivery_requests.id`. Added 2026-08-08. There is no separate `trips` table (see `delivery_requests`' notes below) — a Session belongs directly to a `delivery_requests` row.
    - driver_id (text, nullable) — references `driver_records.id`. Added 2026-08-08.
    - truck_plate (text, nullable) — references `trucks.plate_number`. Added 2026-08-08. Pinned per-Session (not inherited from the Trip) so a truck swap between Sessions of the same delivery is representable — see `IMPLEMENTATION/02_BOOKING_AND_TRIP_CREATION.md`.
    - device_id (text, nullable) — references `devices.device_id`. Added 2026-08-08.
    - status (text, nullable) — e.g. `Active`/`Completed`. Added 2026-08-08.

    A partial unique index (`sessions_one_active_per_device`) enforces at most one `status = 'Active'` session per `device_id` — the "one active session per device" rule from `PROJECT_CONSTRAINTS.md` is now DB-enforced, not just an application-level rule.

    ### Relationships

    - One session can contain multiple alerts.
    - `delivery_request_id` references `delivery_requests.id`.
    - `driver_id` references `driver_records.id`.
    - `truck_plate` references `trucks.plate_number`.
    - `device_id` references `devices.device_id`.

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

    ## gps_logs

    ### Purpose

    Stores one GPS reading per upload from an active Session's device. Added 2026-08-08 to support `IMPLEMENTATION/05_GPS_PIPELINE.md` — previously did not exist at all.

    ### Key Fields

    - id (bigint, Primary Key, identity)
    - session_id (text, not null) — references `sessions.session_id`.
    - latitude (double precision, not null)
    - longitude (double precision, not null)
    - timestamp (timestamptz, not null) — the reading's own timestamp, as sent by the Raspberry Pi.
    - created_at (timestamptz, not null, default `now()`) — when the row landed in the database (kept separate from `timestamp` in case of upload delay).

    An index on `(session_id, timestamp)` supports reconstructing a Session's route in chronological order (Route Comparison, mileage calculation).

    `service_role` grant confirmed 2026-08-08: `grant select on public.gps_logs to service_role;` — added ahead of `driver-trip`'s Pause Trip action, which sums this table's rows per Session to compute mileage. Not tested by any Edge Function before this (Phase 5/GPS upload isn't implemented yet), so this was unconfirmed until now — same per-table grant gotcha as `SUPABASE_GOTCHAS.md` #2/#7.

    ### Relationships

    - `session_id` references `sessions.session_id`.
    - Locked to `service_role` only for now (see `SUPABASE_GOTCHAS.md` #2/#7/#8) — a read path for the Supervisor dashboard (RLS policy or Edge Function) is a decision for `IMPLEMENTATION/08_REALTIME_DASHBOARD.md`, not made yet.

    ---

    ## trucks

    ### Purpose

    Stores registered delivery trucks in the fleet. Created outside this document's original scope (added directly in Supabase); documented here to match the deployed schema as of 2026-08-06.

    ### Key Fields

    - id (UUID, Primary Key, default `gen_random_uuid()`)
    - plate_number (text, unique, not null) — the truck's business identifier; referenced by `devices.plate_number`.
    - date_acquired (text, nullable)
    - brand (text, not null)
    - model (text, not null)
    - truck_type (text, not null)
    - year_model (integer, nullable)
    - container_height / container_width / container_length (numeric, nullable)
    - max_capacity (numeric, nullable)
    - current_mileage (numeric, nullable, default 0) — currently set manually via `AddTruckModal.jsx` (initial odometer reading). Decided 2026-08-08: once GPS/Sessions are implemented, this also gets auto-incremented per completed Session (Pause or End Trip) by that Session's GPS-derived distance — see `IMPLEMENTATION/05_GPS_PIPELINE.md`. Manual entry stays as the initial baseline only.
    - maintenance_mileage_interval (numeric, nullable)
    - maintenance_interval (integer, nullable)
    - created_at (timestamptz, not null, default `timezone('utc', now())`)

    Column `ordinal_position` has gaps (8, 9, 17, 18 are missing) from previously dropped columns — no action needed, just noting the deployed table doesn't have contiguous positions.

    `service_role` grant confirmed 2026-08-08: `grant update on public.trucks to service_role;` — added ahead of `driver-trip`'s Pause Trip action (`IMPLEMENTATION/03B_PAUSE_AND_RESUME_TRIP.md`), which auto-increments `current_mileage` on session close. Previously only `select` was granted (see `driver-trip/index.ts`'s header comment) — same per-table grant gotcha as `SUPABASE_GOTCHAS.md` #2/#7.

    ### Relationships

    - Referenced by `devices.plate_number`.

    ---

    ## devices

    ### Purpose

    Represents a Raspberry Pi telemetry device. Created outside this document's original scope (added directly in Supabase); documented here to match the deployed schema as of 2026-08-06.

    ### Key Fields

    - id (UUID, Primary Key, default `gen_random_uuid()`)
    - device_id (text, unique, not null) — the device's own identifier, distinct from the internal `id` column. This is what `IMPLEMENTATION/*.md` refers to as `device_id`.
    - plate_number (text, nullable) — references `trucks.plate_number`; nullable, so a device can exist unassigned to any truck.
    - device_status (text, nullable, default `'Active'`)
    - created_at (timestamptz, not null, default `timezone('utc', now())`)
    - last_ping (timestamptz, nullable)
    - device_secret_hash (text, nullable) — added 2026-08-06. Backfilled 2026-08-08 (every existing device row now has a SHA-256 hash of a randomly generated secret; the plaintext was only ever shown once, in the backfill query's output, and must be manually configured on each physical Raspberry Pi). Not yet read/written by any Edge Function — device authentication isn't wired up yet.

    ### Relationships

    - `plate_number` references `trucks.plate_number` directly — there is no separate `truck_device_assignments` join table in the deployed schema.

    ### Open contradictions with `IMPLEMENTATION/*.md`

    See the chat discussion from 2026-08-06 — not resolved here, flagged for the team to decide:

    - ~~No `device_secret` (or hashed equivalent) column exists.~~ Resolved 2026-08-06: `device_secret_hash` added; backfilled 2026-08-08. Still open: no Edge Function in `04_DEVICE_BOOT_AND_HEARTBEAT.md`/`05_GPS_PIPELINE.md`/`06_DROWSINESS_ALERT_PIPELINE.md` reads/writes it yet — the column is populated but device authentication isn't wired up to it. That's implementation code, not a schema gap — see Phase 3 onward.
    - ~~There is no `truck_device_assignments` table.~~ Resolved 2026-08-06 (decision, not a gap): not building one. Nothing needs assignment history — `devices.plate_number` (a direct FK to `trucks.plate_number`) is sufficient and is what the already-shipped Truck Management UI (`AdminTrucks.jsx`, `AddTruckModal.jsx`, `AdminTruckProfile.jsx`) already reads/writes. `IMPLEMENTATION/*.md` has been updated to reference this lookup instead.
    - ~~`last_ping` exists instead of `last_seen`.~~ Resolved 2026-08-06 (decision, not a gap): confirmed `last_ping` is the same heartbeat-timestamp concept the docs called `last_seen`, and the column stays named `last_ping` since other modules already depend on it. `IMPLEMENTATION/*.md` (`04_DEVICE_BOOT_AND_HEARTBEAT.md`, `08_REALTIME_DASHBOARD.md`, `10_TESTING_CHECKLIST.md`) has been updated to reference `last_ping`.

    ---

    ## delivery_requests

    ### Purpose

    Represents a customer's delivery request, from initial booking through completion. Created outside this document's original scope (added directly in Supabase); documented here to match the deployed schema as of 2026-08-06.

    ### Key Fields

    - id (text, Primary Key, default `'DR-' || zero-padded sequence`, e.g. `DR-0001`)
    - customer_auth_id (uuid, not null) — references `users.id`.
    - pickup_date / pickup_time, dropoff_date / dropoff_time (not null)
    - pickup_location / dropoff_location (text, not null)
    - truck_type (text, not null) — requested truck type
    - item_type (text, not null), other_item_type (text, nullable)
    - cargo_weight (numeric, not null)
    - budget_min / budget_max (numeric, nullable)
    - notes (text, nullable)
    - status (text, not null, default `'PENDING_REQUEST'`)
    - customer_counter_min / customer_counter_max (numeric, nullable) — customer's counter-proposal on budget
    - assigned_driver_id (text, nullable)
    - assigned_helper_ids (array, nullable)
    - assigned_truck_plate (text, nullable)
    - assigned_at (timestamptz, nullable)
    - created_at / updated_at (timestamptz, not null, default `now()`)

    ### Relationships

    - `customer_auth_id` references `users.id` (enforced foreign key).
    - `assigned_driver_id`, `assigned_helper_ids`, and `assigned_truck_plate` are **not** enforced foreign keys at the database level, despite conceptually referring to `driver_records.id`, crew `users.id` values, and `trucks.plate_number` respectively — treat as unvalidated at the DB layer until confirmed otherwise.

    ### Open contradictions with `IMPLEMENTATION/*.md`

    - ~~There is no separate `trips` table.~~ Resolved 2026-08-08 (decision, not a gap): not building one. `delivery_requests` already carries driver/truck/helper assignment (`assigned_driver_id`/`assigned_truck_plate`/`assigned_helper_ids`) — a separate `trips` table would duplicate that data and create two sources of truth for "who's driving this." Instead, `sessions` was extended (see `sessions`' Key Fields above) with `delivery_request_id`/`driver_id`/`truck_plate`/`device_id`/`status`, linking Sessions directly to `delivery_requests`. `IMPLEMENTATION/02_BOOKING_AND_TRIP_CREATION.md` still describes a `bookings`/`trips` two-table model in places — that description is superseded by this decision and should be read as historical/aspirational, not current.
    - ~~Counter-proposals and helper assignment "not described by this workflow, no backing schema."~~ Resolved 2026-08-06: `IMPLEMENTATION/02_BOOKING_AND_TRIP_CREATION.md` now documents the real quotation-negotiation and crew-assignment flow (`delivery_quotations`, `customer_counter_min`/`max`, `assigned_helper_ids`).
    - `status` already carries a full shipment-milestone flow, defined in code comments in `src/pages/SupDeliveries.jsx` (~line 434): `PENDING_REQUEST` → `QUOTATION_SUBMITTED`/`COUNTER_OFFER_SUBMITTED`/`FINAL_QUOTATION_SUBMITTED` → `APPROVED` → `ASSIGNED` → `OUT_FOR_PICKUP`/`ARRIVED_PICKUP` → `OUT_FOR_DROPOFF`/`ARRIVED_DROPOFF` → `DELIVERED` → `COMPLETED` (or `CANCELLED`). This tracks *where the shipment physically is*, driven by driver/dispatcher checkpoint actions — it is a different concern from `IMPLEMENTATION/`'s Trip/Session model, which tracks *whether GPS/drowsiness monitoring is currently running*. Resolution (not a contradiction, just a note for whoever implements Start/Pause/Resume/End Trip against this table): do not add Active/Paused/etc. values into `delivery_requests.status` — it already has no room for them alongside the milestone values above, and a single column can't hold both "`OUT_FOR_PICKUP`" and "`Paused`" at once. Start/Pause/Resume should only ever create/close rows in `sessions`; whether monitoring is currently on is answered by whether an open (no `ended_at`) `sessions` row exists for the delivery request, never by `delivery_requests.status`.

One deliberate exception (decided 2026-08-06, see `IMPLEMENTATION/07_END_TRIP.md`): End Trip *does* also set `delivery_requests.status` to `DELIVERED`, since that's an existing milestone value in the flow above, not a new Session-state value — it's wiring an existing action (delivery physically finished) to an existing milestone, not mixing the two concerns. The Customer's "Confirm Receive" button then advances it to `COMPLETED`, same as the existing flow already does for a manually-confirmed delivery.

    ---

    ## delivery_quotations

    ### Purpose

    A price quotation submitted against a delivery request. Created outside this document's original scope (added directly in Supabase); documented here to match the deployed schema as of 2026-08-06.

    ### Key Fields

    - id (text, Primary Key, default `'QTN-' || zero-padded sequence`, e.g. `QTN-0001`)
    - delivery_id (text, not null) — references `delivery_requests.id`.
    - quotation_type (text, not null, default `'initial'`)
    - amount (numeric, not null)
    - breakdown (jsonb, not null, default `'{}'`)
    - notes (text, nullable)
    - valid_until (date, nullable)
    - submitted_by (uuid, nullable) — references `users.id`.
    - created_at (timestamptz, not null, default `now()`)

    ### Relationships

    - `delivery_id` references `delivery_requests.id`.
    - `submitted_by` references `users.id`.

    ### Open contradiction with `IMPLEMENTATION/*.md`

    `IMPLEMENTATION/02_BOOKING_AND_TRIP_CREATION.md`'s Important Rules currently states quotations are "not described by this workflow and have no backing schema... treat as unbuilt" — that line is no longer accurate now that `delivery_quotations` exists.

    ---

    # Current Notes

    The `sessions`/`alerts` pair still only runs the original drowsiness detection prototype's logic:

    - One Raspberry Pi device sends monitoring data.
    - Drowsiness events are associated with a single predefined account.
    - `sessions` now has the columns to link to `delivery_requests`, `driver_records`, `trucks`, and `devices` (added 2026-08-08), but nothing writes to them yet — no Start/Pause/Resume/End Trip logic exists, so every current `sessions` row still has these columns `null`.

    `trucks` and `devices` tables now exist (added directly in Supabase, outside this document's original scope) — multi-truck fleet data is tracked. `gps_logs` now exists (2026-08-08) but nothing writes to it yet — no GPS upload Edge Function has been implemented. `alerts`' shape is confirmed correct as-is (2026-08-08) — `IMPLEMENTATION/06_DROWSINESS_ALERT_PIPELINE.md`'s payload was fixed to match it (`event_type`/`duration`, no `metadata`), not the other way around. See the "Open contradictions" notes under `devices` and `delivery_requests` for what's resolved vs. still open.

    ---
    # Naming Conventions

    - Primary keys use `id` unless a domain-specific identifier is required.
    - Foreign keys reference the parent table's primary key.
    - Timestamps use UTC.
    - Per-role profile table ids use a single role-prefix letter + zero-padded sequence: `D` (Driver), `S` (Supervisor), `A` (Admin), `H` (Helper), `C` (Customer).
    - `delivery_requests`/`delivery_quotations` ids use a short word prefix + zero-padded sequence instead: `DR-0001`, `QTN-0001` (via `nextval()` on a dedicated sequence per table, not the per-role letter convention above).


    This document describes the current logical database design.

    Authentication, RLS policies, Edge Functions, and Supabase-specific security are documented separately.

    The schema will be expanded to support further fleet management features as development continues. `trucks`, `devices`, and `gps_logs` already exist; `sessions` now has the columns linking it to `delivery_requests`/`driver_records`/`trucks`/`devices` (2026-08-08). No Start/Pause/Resume/End Trip or GPS-upload logic has been implemented yet — see the "Open contradictions" notes above and each `IMPLEMENTATION/*.md` phase's Required Schema section.