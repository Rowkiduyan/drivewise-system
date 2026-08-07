# Phase 5 - GPS Pipeline

## Goal

Implement GPS uploads.

## Required Schema

`DATABASE.md` does not yet define a `gps_logs` table at all — only `sessions` and `alerts` currently exist. Per `00_IMPLEMENTATION_RULES.md`, this is reported rather than assumed. Before implementing this phase, define/confirm a `gps_logs` table: id, `session_id` (FK to `sessions`), latitude, longitude, timestamp, created_at.

## Rules

GPS uploads only occur when:

An active session exists for the device.

Every 1 second:

Read GPS.

If GPS is unavailable:

Skip upload.

Continue heartbeat.

Send:

- device_id
- device_secret
- latitude
- longitude
- timestamp

The backend:

- authenticates the device
- finds the active session
- inserts a gps_logs record

The Raspberry Pi never knows session_id.

The backend performs the lookup.

Stored GPS logs must remain attributable to their Session (and, through the Session, their Trip) in chronological order — this is what lets a Trip's actual route be reconstructed for Route Comparison against its suggested route (see `01_SYSTEM_ARCHITECTURE.md`). A Trip that spans multiple Sessions (e.g. after a Pause/Resume) reconstructs its route by combining GPS logs from all of its Sessions, in order.

The same per-Session GPS log also drives truck mileage tracking (see `03B_PAUSE_AND_RESUME_TRIP.md`/`07_END_TRIP.md`): distance driven is the sum of the point-to-point distances between consecutive `gps_logs` rows within that Session, added to `trucks.current_mileage` when the Session closes (Pause or End Trip). Computing it per-Session, not per-Trip, means it stays correct even if the assigned truck ever changes between Sessions of the same Trip (see the truck-swap decision in `02_BOOKING_AND_TRIP_CREATION.md`) — each Session's mileage always goes to whichever truck it actually used.

## Deliverable

Implement GPS upload only.