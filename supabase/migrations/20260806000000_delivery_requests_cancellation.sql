-- delivery_requests: add who/when/why a request was cancelled.
-- Shared by both cancellation actors:
--   - Customer cancel (CustomerDeliveries.jsx): writes cancelled_by='customer',
--     cancel_reason (from the reason dropdown), cancelled_at.
--   - Supervisor decline (SupDeliveries.jsx): currently status-only
--     (cancelled_by/reason/at stay null).
-- No new grants/RLS needed: columns inherit the table's grants, and the
-- enforce_supervisor_status_only_update trigger only guards customer data
-- fields, so this is writable by the customer (own row) and the supervisor
-- (status + these columns).
alter table public.delivery_requests
  add column cancelled_by text,
  add column cancel_reason text,
  add column cancelled_at timestamptz;
