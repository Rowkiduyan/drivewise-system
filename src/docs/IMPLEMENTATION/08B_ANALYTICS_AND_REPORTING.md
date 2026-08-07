# Phase 8B - Analytics and Reporting

## Goal

Wire real data into `SupAnalysisIndiv.jsx` (per-driver drill-down) and `SupDashboard.jsx` (fleet-wide overview). Both are currently fully mocked (dummy arrays).

This is distinct from `08_REALTIME_DASHBOARD.md`, which covers live status for a single trip/device — this phase covers historical and aggregate reporting across drivers/sessions/alerts.

## Required Schema

`sessions` does not yet have `driver_id` (already flagged in `02_BOOKING_AND_TRIP_CREATION.md`). This phase cannot filter "this driver's sessions" or group alerts by driver without it — confirm/add it before implementing, per `00_IMPLEMENTATION_RULES.md`.

## SupAnalysisIndiv (per-driver)

Each mocked section maps to a real query, scoped to one driver:

- KPIs (Total alerts (7d), High-risk events, Avg alerts / session, Total sessions) — aggregated over `sessions`/`alerts` for that driver, filtered to the selected date range.
- Alert type breakdown — grouped count of `alerts.event_type` for that driver.
- Recent sessions list — `sessions` rows for that driver, most recent first (`session_id`, `start_time`, `end_time`, `session_duration`, `total_alerts`).
- Latest alerts list — `alerts` joined to `sessions` for that driver, most recent first.

## SupDashboard (fleet-wide)

- Live tiles (Active Deliveries, Pending Assignments, Requests Inbox, Fleet Available) — current-state counts from `delivery_requests.status` and `devices`/`trucks`.
- Live Deliveries list — `delivery_requests` joined to driver/truck/device, for deliveries currently in progress.
- Alerts Today / Driver Safety list — `alerts` created today, joined to driver/truck via `sessions`.
- High-Risk Drivers / Top Risk Drivers by date range — the same per-driver aggregation as `SupAnalysisIndiv`, computed across all drivers and ranked.
- Recent Activity feed — do not implement until a backing table is confirmed. Nothing in `DATABASE.md` currently supports an activity/audit log; report this instead of assuming a shape.

## Important Rules

Do not redesign either page — replace only the mock arrays with real data, per `00_IMPLEMENTATION_RULES.md`'s Existing UI and Design rule.

Aggregations (7d/30d rollups, per-driver averages) should be computed by the backend/database (a view or RPC function), not recomputed client-side over raw rows.

Follow the existing `SUPABASE_GOTCHAS.md` pattern (#2/#7/#8) for any new view/RPC or table this phase touches — grants aren't automatic, and new tables aren't private by default.

## Deliverable

Implement only the read/query layer wiring these two pages to real data. Do not add new UI, new pages, or new KPIs beyond what's already designed.
