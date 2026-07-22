# Phase 6 - Drowsiness Alerts

## Goal

Implement real-time alert uploads.

## Rules

Only active sessions may generate alerts.

When a detection threshold is reached:

Immediately upload:

- device_id
- device_secret
- alert_type
- timestamp
- metadata

The backend:

- authenticates the device
- finds the active session
- inserts an alerts record

Alerts are uploaded immediately.

Do not store alerts until the trip ends.

## Deliverable

Implement alert uploads only.