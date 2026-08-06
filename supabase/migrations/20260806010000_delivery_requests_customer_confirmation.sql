-- delivery_requests: add the customer's delivery-confirmation and issue-report
-- columns. Backs the customer "Confirm Received" / "Report an Issue" actions
-- (CustomerDeliveries.jsx):
--   - received_confirmed / received_confirmed_at — customer confirmed receipt,
--     which also moves the request to COMPLETED.
--   - issue_reported / issue_reported_at / issue_description — customer reported
--     an issue while status stays DELIVERED (per the SupDeliveries status-flow
--     contract: the Issues module reads issue_reported, not a separate status).
--   - resolved_at — supervisor marks the reported issue resolved (which moves
--     the request to COMPLETED).
--   - completed_at — timestamp of the COMPLETED state.
-- No new grants/RLS needed: columns inherit the table's existing grants, and
-- both the customer UPDATE policy (own row) and the supervisor UPDATE policy
-- (status + these columns, not guarded by enforce_supervisor_status_only_update)
-- already allow writes.
alter table public.delivery_requests
  add column received_confirmed boolean not null default false,
  add column received_confirmed_at timestamptz,
  add column issue_reported boolean not null default false,
  add column issue_reported_at timestamptz,
  add column issue_description text,
  add column resolved_at timestamptz,
  add column completed_at timestamptz;
