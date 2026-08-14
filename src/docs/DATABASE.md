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
    sessions (0..1) ----- (N) gps_logs             [gps_logs.session_id -> sessions.session_id, nullable]
    delivery_requests (1) ----- (N) gps_logs       [gps_logs.delivery_request_id -> delivery_requests.id]

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

    ### delivery-proof-photos

    Holds proof-of-completion photos for each item in a delivery's Pickup → Dropoff → Stops chain (`IMPLEMENTATION/02B_MULTI_STOP_DELIVERIES.md`'s "Photo-Required Chain Completion"), uploaded by the Helper: `{delivery_id}/pickup.jpg`, `{delivery_id}/dropoff.jpg`, `{delivery_id}/stop-{index}.jpg` (always JPEG, resized client-side but not cropped square — see `src/lib/proofPhoto.js`). Written by three Helper-gated `admin-users` actions (`update-driver-delivery` scoped to `OUT_FOR_DROPOFF`, `complete-dropoff`, `complete-stop`), `upsert: true`.

    **Created 2026-08-12 via the Storage REST API** (`POST {SUPABASE_URL}/storage/v1/bucket`, service-role key) rather than the Dashboard — unlike raw table DDL (which needs the SQL Editor/a DB connection), bucket creation goes through the same REST surface `service_role` already has, so no manual step was needed this time. Public, same reasoning as `driver-profile-pics` above.

    ---

    ## sessions

    ### Purpose

    Represents one drowsiness monitoring session.

    A session begins when raspberry pi is turned on and monitoring starts and ends when monitoring stops.

    This described the original prototype's session lifecycle. Per `IMPLEMENTATION/03_START_TRIP_AND_SESSION.md` and `IMPLEMENTATION/03B_PAUSE_AND_RESUME_TRIP.md`, the lifecycle becomes driver-triggered (Start/Pause/Resume/End Trip) as those phases are implemented. Start/Pause/Resume/End Trip are all implemented and tested (2026-08-08, `driver-trip` Edge Function).

    `service_role` grants confirmed working (2026-08-08) via the `driver-trip` Edge Function: `select`/`insert`/`update` on `sessions` (had to be granted — see `SUPABASE_GOTCHAS.md` #2/#7), plus `select` on `delivery_requests`/`driver_records`/`users`/`devices` (already sufficient, no grant needed). **`delete` confirmed missing, 2026-08-14** (`SUPABASE_GOTCHAS.md` #11) — every real Trip-lifecycle action only ever inserts/updates a session, so this was never granted and never needed until a disposable test script tried to delete one. Not fixed (schema/grants change, needs explicit approval); flag this if a real feature ever needs to delete a `sessions` row.

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

    ### Realtime

    Added to the `supabase_realtime` publication 2026-08-12 (`alter publication supabase_realtime add table public.sessions;`) — previously missing, same class of gap already hit for `alerts`/`delivery_requests`/`gps_logs`. Needed for the Helper portal's live Active/Paused status (`IMPLEMENTATION/03_START_TRIP_AND_SESSION.md`'s Realtime catch-up). Also required a new RLS policy (`assigned crew can read own sessions`, see `RLS.md`) since Driver/Helper had no read access to this table at all before — and that policy had to be written as a `SECURITY DEFINER` function call rather than an inline join, or Realtime silently drops every event despite the publication/RLS otherwise being correct (see `SUPABASE_GOTCHAS.md` #9).

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

    ### Key Fields (verified via `information_schema.columns` 2026-08-11, ahead of Phase 6)

    - id (bigint, Primary Key, identity, not null)
    - created_at (timestamptz, not null, default `now()`)
    - event_type (text, not null)
    - duration (double precision, not null)
    - session_id (text, nullable) — references `sessions.session_id`. Nullable at the DB level, though Phase 6's Rules ("Only active sessions may generate alerts") mean a correctly-behaving alert-upload function should always set it.

    17 existing rows as of 2026-08-11 (leftover from `drowsines.py`/`renz_test.py` prototype testing — direct anon-key inserts, not through any Edge Function).

    ### Grants (verified via `information_schema.role_table_grants` 2026-08-11; `service_role` fixed same day ahead of Phase 6's `alert-upload` deploy)

    - `service_role`: `select`, `insert` (plus `references`/`trigger`/`truncate`) — run via `grant select, insert on public.alerts to service_role;` before deploying `alert-upload`. Same per-table grant gotcha every other telemetry table hit (`SUPABASE_GOTCHAS.md` #2/#7).
    - `anon`: **revoked 2026-08-12** (`revoke all on public.alerts from anon;`, confirmed via `information_schema.role_table_grants` — `anon` no longer appears in the table's grants at all). Previously had unrestricted `select`/`insert`/`references`/`trigger`/`truncate`, matching the prototype scripts' direct-anon-key write pattern; since the anon/publishable key is public and client-embedded, that had allowed anyone to insert or read arbitrary alert rows (same category of gap `devices` had before being tightened 2026-08-11). Held back at the time pending confirmation that `alert-upload` was the sole write path — confirmed via repeated bench testing through 2026-08-12 (Phase 6 completion, GSM retest), so the revoke was executed.
    - `authenticated`: `select`/`references`/`trigger`/`truncate` — no `insert`/`update`/`delete`. This is what lets the Driver Web App's Realtime subscription (`DriverDeliveries.jsx`, Phase 6) receive `alerts` `INSERT` events.

    ### Relationships

    - `session_id` references `sessions.session_id`, nullable.

    ---

    ## gps_logs

    ### Purpose

    Stores one GPS reading per upload from a device whose Trip is in progress (Active or Paused). Added 2026-08-08 to support `IMPLEMENTATION/05_GPS_PIPELINE.md` — previously did not exist at all.

    ### Key Fields

    - id (bigint, Primary Key, identity)
    - session_id (text, nullable) — references `sessions.session_id`. Set when an open (`status = Active`) Session exists for the reading; null while the Trip is Paused (see "GPS-during-Pause" below). **Actually made nullable 2026-08-11** — the GPS-during-Pause design was written up as resolved 2026-08-10, but the live column was still `NOT NULL` until this date; see the note under "GPS-during-Pause" below.
    - delivery_request_id (text, not null) — references `delivery_requests.id`. **Actually added 2026-08-11** — same gap as `session_id` above: designed 2026-08-10, but the column didn't exist on the live table until this date. Always set, regardless of Session state, so every reading is attributable to its Trip even when there's no open Session to hang it off of.
    - latitude (double precision, not null)
    - longitude (double precision, not null)
    - timestamp (timestamptz, not null) — the reading's own timestamp, as sent by the Raspberry Pi.
    - created_at (timestamptz, not null, default `now()`) — when the row landed in the database (kept separate from `timestamp` in case of upload delay).

An index on `(session_id, timestamp)` supports reconstructing a Session's route in chronological order (Route Comparison, mileage calculation — Session-scoped, so it only ever sees Active-Session readings). A second index on `(delivery_request_id, timestamp)` supports Trip-level live-position queries (Supervisor asset visibility) that need every reading regardless of which Session, if any, was open when it landed. **Created 2026-08-12**, ahead of Phase 8 (`IMPLEMENTATION/08_REALTIME_DASHBOARD.md`) — both were part of the original design but had sat unopened since the 2026-08-11 fix (which only added the missing column/nullability):
```sql
create index on public.gps_logs (session_id, timestamp);
create index on public.gps_logs (delivery_request_id, timestamp);
```

    `service_role` grant confirmed 2026-08-08: `grant select on public.gps_logs to service_role;` — added ahead of `driver-trip`'s Pause Trip action, which sums this table's rows per Session to compute mileage. Re-checked 2026-08-11 ahead of Phase 5 (GPS upload): `service_role` already has full `select`/`insert`/`update`/`delete` on this table (confirmed via `information_schema.role_table_grants`) — `insert` was never previously exercised by any Edge Function, but the grant already exists. Phase 5's `gps-upload` function is now built, deployed, and curl-verified end-to-end (2026-08-11) against this schema.

    `authenticated` grant added 2026-08-12: `grant select on public.gps_logs to authenticated;` — needed for `DriverDeliveries.jsx`'s live in-app navigation (`LiveNavigationMap`, Google Maps JavaScript API) to subscribe to `gps_logs` `INSERT`s via Supabase Realtime, which honors table grants the same way a normal `select` does; without this the subscription would silently receive nothing. Same reasoning/pattern as the `alerts` table's `authenticated: select` grant. Originally recorded here as "a blanket grant, no RLS restriction" — **that was wrong, caught 2026-08-12 (later same-day session) while live-testing the navigation feature**: RLS is in fact enabled on this table, and no policy had ever been added alongside this grant, so every `authenticated` query was silently returning zero rows the entire time (a grant alone does not bypass RLS) — the live-position arrow could never have rendered, for real GPS data or test data alike, until this was fixed. Added: `create policy "authenticated select gps_logs" on public.gps_logs for select to authenticated using (true);`, matching `alerts`' equally permissive existing policy. Confirmed live afterward: the Realtime subscription actually receives rows now.

    **Second, separate gap found right after fixing the one above, same session:** the RLS fix alone still wasn't enough for live *updates* — the seed-fetch (a plain REST `select` on mount) worked, but the `postgres_changes` `INSERT` subscription itself never fired, so the map's position arrow updated once and then never moved again. Root cause: `gps_logs` had never been added to the `supabase_realtime` publication — the same class of gap already hit and fixed for `alerts`/`delivery_requests` during Phase 6 (see that table's entry). `postgres_changes` only broadcasts for tables in that publication, independent of grants/RLS. Fixed: `alter publication supabase_realtime add table public.gps_logs;`. Confirmed live via a scripted GPS-movement simulation afterward.

    ### Relationships

    - `session_id` references `sessions.session_id`, nullable.
    - `delivery_request_id` references `delivery_requests.id`, not null.
    - `service_role` (full access, bypasses RLS) and `authenticated` (`select` only, gated by the RLS policy above, not just the grant) — added 2026-08-12 for the Driver app's own navigation, and confirmed sufficient as-is for Phase 8's Supervisor dashboard too (`IMPLEMENTATION/08_REALTIME_DASHBOARD.md`), also built 2026-08-12: the existing `using (true)` policy is unscoped by role, so no separate grant/policy was needed for Supervisor reads.

    ### GPS-during-Pause (designed 2026-08-10, actually deployed 2026-08-11)

    GPS tracking continues while a Trip is Paused, for anti-theft/asset-visibility reasons (see `IMPLEMENTATION/05_GPS_PIPELINE.md`, `IMPLEMENTATION/03B_PAUSE_AND_RESUME_TRIP.md`). `session_id` was `not null` originally, and Pause Trip closes the Session it would otherwise reference — so there was no valid `session_id` to write during a pause under the original schema. Resolved by making `session_id` nullable and adding `delivery_request_id` (always set) so a reading can be attributed to its Trip directly, independent of whether a Session happens to be open. See `IMPLEMENTATION/05_GPS_PIPELINE.md` for the backend lookup logic that resolves `delivery_request_id`/`session_id` per upload.

    **Gap found 2026-08-11:** this design was documented as "resolved" on 2026-08-10, but the actual `alter table` statements were never run — the live table still had `session_id not null` and no `delivery_request_id` column at all until this was caught while curl-testing the newly-built `gps-upload` function (Phase 5) and traced back via `information_schema.columns`. Fixed by running (table was empty, 0 rows, no backfill needed): `alter table public.gps_logs alter column session_id drop not null;` then `alter table public.gps_logs add column delivery_request_id text not null references public.delivery_requests(id);`. Lesson: a decision documented as "resolved" here previously meant "decided," not necessarily "applied to the live database" — worth re-verifying schema docs against `information_schema` before trusting them as current, not just against migration history (these tables have no migration files at all, see each table's Purpose note).

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
    - device_secret_hash (text, nullable) — added 2026-08-06. Backfilled 2026-08-08 (every existing device row now has a SHA-256 hash of a randomly generated secret; the plaintext was only ever shown once, in the backfill query's output, and must be manually configured on each physical Raspberry Pi). Read/written starting 2026-08-11: the `admin-users` Edge Function's `register-device` action generates a new device's secret server-side, hashes it (plain lowercase-hex SHA-256, no salt — same format the backfill used), stores the hash, and returns the plaintext once for the Admin to copy onto the physical Pi (never stored, never retrievable again). The `device-heartbeat` Edge Function reads this hash on every heartbeat to authenticate the device (`04_DEVICE_BOOT_AND_HEARTBEAT.md`).

    ### Grants (confirmed 2026-08-11)

    Unlike `sessions`/`gps_logs`/`trucks`, this table was originally left with full unrestricted `anon`/`authenticated` grants (a Supabase default-privileges gap, see `SUPABASE_GOTCHAS.md` #8) — notable here specifically because `device_secret_hash` is a live authentication credential once Phase 4 heartbeat is wired up. Tightened 2026-08-11:
    - `anon`: no access (`revoke all`).
    - `authenticated`: column-scoped — `select`/`insert`/`update` on `id, device_id, plate_number, device_status, created_at, last_ping` only (never `device_secret_hash`), plus the original `delete` (unchanged, used by Admin Devices' delete action). This is what the Admin Devices/Add-Truck/Edit-Device UI reads and writes directly from the browser.
    - `service_role`: full `select`/`insert`/`update`/`delete`, unchanged — used by `admin-users` (`register-device`) and `device-heartbeat`.

    ### Relationships

    - `plate_number` references `trucks.plate_number` directly — there is no separate `truck_device_assignments` join table in the deployed schema.

    ### Open contradictions with `IMPLEMENTATION/*.md`

    See the chat discussion from 2026-08-06 — not resolved here, flagged for the team to decide:

    - ~~No `device_secret` (or hashed equivalent) column exists.~~ Resolved 2026-08-06: `device_secret_hash` added; backfilled 2026-08-08. Resolved 2026-08-11: `admin-users` (`register-device`) writes it, `device-heartbeat` reads it — see the Key Fields entry above. `05_GPS_PIPELINE.md`/`06_DROWSINESS_ALERT_PIPELINE.md` still don't authenticate against it yet — those are separate, later phases.
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
    - stops (jsonb, not null, default `'[]'`) — **deployed 2026-08-12** (`supabase/migrations/20260812134525_delivery_requests_stops.sql`, verified live via REST `select` before building against it). An ordered array of intermediate stop locations visited after `dropoff_location` in the real chain order Pickup → Dropoff → Stops (see `IMPLEMENTATION/02B_MULTI_STOP_DELIVERIES.md` — originally documented as "between pickup and dropoff," corrected same day). Customer-entered at booking time only, capped at 5. ~~Reference-only (no per-stop status)~~ — superseded 2026-08-12: each entry gains `completed`/`completedAt`/`photoUrl` once the Helper completes it: `{"location": "...", "completed": true, "completedAt": "<iso>", "photoUrl": "..."}`.
    - pickup_photo_url / dropoff_photo_url (text, nullable), dropoff_completed_at (timestamptz, nullable) — **deployed 2026-08-12** (`supabase/migrations/20260812151605_delivery_requests_proof_photos.sql`). Proof-of-completion photos for the first two items in the chain (Pickup, Dropoff), written by the Helper-gated `admin-users` actions described in `IMPLEMENTATION/02B_MULTI_STOP_DELIVERIES.md`. `dropoff_completed_at` exists separately from `updated_at` because completing the dropoff doesn't always change `status` (only does when there are no stops after it — see that doc's "finality is computed dynamically" note).
    - suggested_route (jsonb, nullable) — **deployed 2026-08-14** (`supabase/migrations/20260814131307_delivery_requests_suggested_route.sql`). The frozen planned route for Pickup → Dropoff → Stops (nearest-order), written once by the Driver app's `save-suggested-route` action (`driver-trip` Edge Function) the first time the pre-trip screen computes it, never recomputed after. Shape: an array of per-leg entries, `[{"from": "pickup", "to": "dropoff", "path": [[lat,lng], ...]}, ...]`, each `path` built from `DirectionsResult`'s per-step `path` (denser than `overview_path`). See `IMPLEMENTATION/11_ROUTE_COMPARISON.md`.

    ### Relationships

    - `customer_auth_id` references `users.id` (enforced foreign key).
    - `assigned_driver_id`, `assigned_helper_ids`, and `assigned_truck_plate` are **not** enforced foreign keys at the database level, despite conceptually referring to `driver_records.id`, crew `users.id` values, and `trucks.plate_number` respectively — treat as unvalidated at the DB layer until confirmed otherwise.

    ### Realtime

    Found 2026-08-11 while testing Phase 6's Realtime alerts (`06_DROWSINESS_ALERT_PIPELINE.md`): `delivery_requests` was never added to Supabase's `supabase_realtime` publication, despite `SupDeliveries.jsx` already having a `postgres_changes` subscription on it (`sup-delivery-requests-live`) since before this session. That subscription was therefore silently non-functional — the table not being published means no event ever fires, regardless of RLS/grants. Fixed by running `alter publication supabase_realtime add table public.delivery_requests;`. Its `"Supervisors can read all delivery requests"` RLS policy (`authenticated` role, `current_user_role() = 'Supervisor'`) should now let a real Supervisor session receive these events; not live-verified against an actual Supervisor login (none available this session), only confirmed the publication + policy are both now in place.

    **Driver/Helper read access added 2026-08-12** (`assigned crew can read own deliveries`, see `RLS.md`), for the Helper portal's Realtime catch-up (`IMPLEMENTATION/03_START_TRIP_AND_SESSION.md`). Previously Driver/Helper had no direct read access to this table at all — all reads went through `admin-users`'s `service_role` connection. Live-verified end-to-end in the browser: Driver pressing "Complete Delivery" (a `status` change to `DELIVERED`) was picked up by an already-open Helper tab within seconds, no reload. Written as a `SECURITY DEFINER` function call (`delivery_request_visible_to_caller`) rather than an inline join for the same reason as `sessions`' equivalent policy — see `SUPABASE_GOTCHAS.md` #9.

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
    - `sessions` now has the columns to link to `delivery_requests`, `driver_records`, `trucks`, and `devices` (added 2026-08-08). Start/Pause/Resume/End Trip logic is implemented and writes these columns on every new Session — older rows created before that logic existed still have them `null`.

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

    The schema will be expanded to support further fleet management features as development continues. `trucks`, `devices`, and `gps_logs` already exist; `sessions` now has the columns linking it to `delivery_requests`/`driver_records`/`trucks`/`devices` (2026-08-08). Start/Pause/Resume/End Trip logic is implemented; GPS-upload logic has not been — see the "Open contradictions" notes above and each `IMPLEMENTATION/*.md` phase's Required Schema section.