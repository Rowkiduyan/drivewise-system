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

- id (UUID, Primary Key)
- full_name
- email
- role
- created_at

### Relationships

- Referenced by `driver_records.auth_id`.

---

## driver_records

### Purpose

Stores driver profile information separate from authentication data.

### Key Fields

- id
- auth_id
- first_name
- middle_name
- last_name
- birthdate
- position
- profile_picture

### Relationships

- `auth_id` references `users.id`.

---

## sessions

### Purpose

Represents one drowsiness monitoring session.

A session begins when raspberry pi is turned on and monitoring starts and ends when monitoring stops.

### Key Fields

- session_id
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