# Phase 4 - Raspberry Pi Boot and Heartbeat

## Goal

Implement Raspberry Pi startup and heartbeat communication.

## Raspberry Pi Startup

Linux automatically launches drivewise.py.

The Raspberry Pi loads:

- device_id
- device_secret

No other information is stored on the Raspberry Pi.

## Heartbeat

Every 10 seconds:

Send:

- device_id
- device_secret
- timestamp

to the backend through an Edge Function.

The backend:

- authenticates the device
- updates devices.last_seen

No online flag is stored.

## Online Detection

A device is Online when:

Current Server Time - last_seen <= 30 seconds

Otherwise:

Offline

## Active Session

Heartbeat continues even when no active session exists.

GPS and drowsiness detection must NOT start unless an active session exists.

## Deliverable

Implement heartbeat only.

Do not implement GPS.

Do not implement alerts.