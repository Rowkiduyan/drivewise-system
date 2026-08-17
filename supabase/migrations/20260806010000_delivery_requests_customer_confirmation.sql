-- delivery_requests: add the customer's delivery-confirmation columns. Backs
-- the customer "Confirm Received" action (CustomerDeliveries.jsx):
--   - received_confirmed / received_confirmed_at — customer confirmed receipt,
--     which also moves the request to COMPLETED.
--   - completed_at — timestamp of the COMPLETED state.
-- No new grants/RLS needed: columns inherit the table's existing grants, and
-- both the customer UPDATE policy (own row) and the supervisor UPDATE policy
-- (status + these columns, not guarded by enforce_supervisor_status_only_update)
-- already allow writes.
alter table public.delivery_requests
  add column received_confirmed boolean not null default false,
  add column received_confirmed_at timestamptz,
  add column completed_at timestamptz;
