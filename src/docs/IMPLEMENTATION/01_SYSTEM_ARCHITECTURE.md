# Phase 1 - Verify System Architecture

## Goal

Understand and verify the overall architecture before implementation.

## Tasks

Read DATABASE.md.

Verify the relationships between:

- devices
- trucks (a device is linked to its truck directly via `devices.plate_number` — no separate assignment table, decided 2026-08-06: history isn't needed)
- trips
- sessions
- gps_logs
- alerts

Verify that the architecture follows these principles:

- Driver uses a web application (installable as a home-screen shortcut/PWA), not a native mobile application.
- Raspberry Pi is an independent telemetry device.
- Raspberry Pi communicates only with Supabase.
- Driver web application communicates only with Supabase.
- The Driver Web Application and Raspberry Pi never communicate directly.
- Raspberry Pi never knows the driver.
- Raspberry Pi never knows the truck.
- Raspberry Pi never knows the trip.
- Raspberry Pi never knows the session.

The backend connects incoming telemetry to the active session using device_id.

## Deliverable

Produce an implementation plan only.

Do not modify any code.

---

## Trip

A Trip represents one business assignment.

A Trip may:

- contain one or more driving sessions
- contain one or more planned/delivery stops
- span multiple days

A Trip ends only when the business assignment is completed.

Examples of ONE Trip:

- Delivering to multiple branches during one dispatch.
- Delivering to multiple customers during one planned route.
- A long-haul delivery with an overnight stop.

However, if the driver completes an assignment, returns to the depot, and receives a new assignment later (e.g. the following day), that is a NEW Trip — it is never resumed as the same Trip.

Example:

- Day 1: Depot → Warehouse → Depot — Trip Completed.
- Day 2: Depot → Customer — a New Trip.

---

## Session

A Session represents one continuous period of driving.

A Session:

- is created whenever driving begins — starts when the driver presses Start Trip or Resume Trip
- ends whenever driving stops — ends when the driver presses Pause Trip or End Trip

GPS logs and alerts belong to Sessions.

Sessions never resume. If the driver resumes driving later for the same Trip, a new Session is created.

A Trip may contain multiple Sessions.

---

## Route Comparison

The suggested route belongs to the Trip.

The actual route is reconstructed by combining the GPS logs from all Sessions belonging to that Trip, in chronological order. This is why GPS logs must always be attributable to both their Session and, through the Session, their Trip.

The suggested route (Google Maps) is shown in two different places, to two different audiences:

- Driver Web Application — a navigation view showing the suggested route to follow while driving. Despite being a web app, the driver uses it like a mobile app (installed as a home-screen shortcut/PWA — see the architecture principles above), so this map view must fit the mobile layout the Driver portal already uses (hamburger menu, no sidebar — see `UI/LAYOUT.md`'s Mobile section), not a desktop-style layout.
- Supervisor Dashboard — a tracking view showing the truck's live position, plus, once GPS logs exist, the reconstructed actual route overlaid against the suggested route for comparison (see `08_REALTIME_DASHBOARD.md`).