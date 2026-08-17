-- Remove the "Reported Issues" feature entirely (per user request 2026-08-17):
--   - delivery_messages: the issue chat table (added in the now-deleted
--     20260806030000_delivery_messages.sql). Dropping it also removes its
--     supabase_realtime publication entry.
--   - delivery_requests.issue_reported / issue_reported_at / issue_description
--     / resolved_at: the issue-report and resolution columns (added in
--     20260806010000_delivery_requests_customer_confirmation.sql). The
--     separate "Confirm Received" columns (received_confirmed,
--     received_confirmed_at, completed_at) are intentionally kept.

drop table if exists public.delivery_messages;

alter table public.delivery_requests
  drop column if exists issue_reported,
  drop column if exists issue_reported_at,
  drop column if exists issue_description,
  drop column if exists resolved_at;