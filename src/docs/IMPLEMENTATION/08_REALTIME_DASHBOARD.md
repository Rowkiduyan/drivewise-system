# Phase 8 - Dashboard

## Goal

Implement real-time monitoring.

Display:

- Trip Status
- Device Status
- Last Heartbeat
- Current GPS
- Latest Alerts

## Monitoring Status

The dashboard must distinguish between:

- Waiting for Device
- Online
- Offline
- Monitoring Unavailable

Monitoring Unavailable means the Trip has started, but the Raspberry Pi has never connected. Supervisors should clearly understand that the driver is on an active Trip but telemetry is unavailable — not that the driver is idle or the Trip has stalled.

Monitoring Unavailable reuses `DEVICE_OFFLINE_TIMEOUT` (30 seconds, see `PROJECT_CONSTRAINTS.md`) — no separate threshold. If `Current Server Time - Session.started_at > 30 seconds` and the device has never sent a heartbeat for this Session, show Monitoring Unavailable instead of Waiting for Device. Before that 30 seconds elapses, show Waiting for Device. Once at least one heartbeat has been received for the Session, the state is governed by Online/Offline (`devices.last_ping`) instead, never Monitoring Unavailable again for that Session.

The dashboard determines online status using `devices.last_ping`.

No online boolean should exist.

## Map Display

Current GPS is rendered on a Google Maps view — the truck's live position as a marker, updated as new `gps_logs` rows come in. This is the Supervisor-facing tracking view; the Driver's own navigation view (showing the suggested route while driving) is separate — see `01_SYSTEM_ARCHITECTURE.md`'s Route Comparison section.

## Important Rules

The Trip must NOT automatically end because monitoring is unavailable or the device is offline. Trips only end when the driver presses End Trip (see `07_END_TRIP.md` and `09_EDGE_CASES.md`).

## Deliverable

Implement real-time dashboard status display only.