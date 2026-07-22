# Phase 4 - GPS Pipeline

## Goal

Implement GPS uploads.

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

## Deliverable

Implement GPS upload only.