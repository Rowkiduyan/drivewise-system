# DriveWise

## Overview

DriveWise is a web-based fleet management system for trucking companies. It allows supervisors to manage trips, monitor truck locations in real time, and detect driver drowsiness using an AI-powered camera system. The system also records trip history and analytics, helping supervisors identify drivers who frequently trigger drowsiness alerts.

---

# Objectives

The system aims to:

- Monitor driver drowsiness in real time.
- Track truck locations using GPS.
- Assist supervisors in managing delivery trips.
- Record trip history and analytics.
- Improve road safety by reducing fatigue-related accidents.

---

# Users

## Admin

Responsible for overall system management, including creating and managing user accounts (Supervisor, Admin, Driver, Helper, Customer roles).

## Supervisor

- Creates delivery trips.
- Assigns trucks to drivers.
- Monitors active trips.
- Views GPS locations.
- Reviews trip history.
- Views driver analytics.

## Driver

- Confirms assigned trips.
- Performs deliveries.
- Is monitored for drowsiness during trips.

## Helper

- Assists the driver during deliveries.

## Customer

- Requests deliveries.
- Views their own delivery/booking activity.

---

# Planned Features

## Fleet Management

- Driver Management
- Truck Management
- Device Management

## Trip Management

- Create Trips
- Assign Drivers
- Assign Trucks
- Trip Confirmation

## GPS Tracking

- Real-time truck tracking
- Route history
- Suggested routes
- Rest stop suggestions
- Google Maps integration

## Drowsiness Detection

- Eye closure detection
- Drowsiness alerts
- Alert history

## Analytics

- Drowsiness statistics
- Driver performance reports
- Trip reports

---

# Hardware

## Raspberry Pi 4 Model B

Runs the drowsiness detection program and communicates with the web system.

## Raspberry Pi Camera Module

Captures the driver's face for AI-based drowsiness detection.

## NEO GPS Module

Collects the truck's real-time GPS location.

---

# Software Stack

Frontend

- React

Backend

- Supabase

Database

- Supabase PostgreSQL

Maps

- Google Maps API

AI

- Python
- MediaPipe

Hosting

- Firebase Hosting

---

# High-Level System Flow

1. A supervisor creates a new delivery trip.
2. The supervisor assigns both a driver and a truck.
3. Each truck is permanently paired with a dedicated hardware device consisting of a Raspberry Pi, camera module, and GPS module.
4. The driver confirms the assigned trip before starting the journey.
5. The paired device identifies the active trip and begins monitoring.
6. The GPS module continuously sends location updates to the database.
7. The camera continuously performs AI-based drowsiness detection.
8. Drowsiness alerts are recorded whenever fatigue is detected.
9. The dashboard displays the truck's current location in real time.
10. When the trip is completed, all trip records, GPS history, and drowsiness events are stored.
11. Supervisors can review completed trips, traveled routes, and driver analytics.

---

# Current Development Status

Project Stage

Early Development

Completed

- Initial project planning
- Drowsiness detection prototype
- Login authentication (Supabase Auth, role-based routing to each portal: Admin, Supervisor, Driver, Customer)
- Logout (confirmation modal, single-click guard, wired into all four portals: Admin, Supervisor, Driver, Customer)
- Admin account management (create, update role/name/email, deactivate, reset password — via the `admin-users` Edge Function and Admin panel; supports Supervisor/Admin/Driver/Helper/Customer roles)

In Progress

- Web application development

Planned

- Fleet management
- GPS tracking
- Trip management
- Reports
- Analytics Dashboard