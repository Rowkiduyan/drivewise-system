-- delivery_requests: add the supervisor's vehicle/crew assignment columns.
-- Backs the "Assign Vehicle" step (SupDeliveries.jsx) after a quotation is
-- approved: the supervisor picks a driver/helpers/truck and the request moves
-- to ASSIGNED. The truck is stored by plate number (the identifier the fleet
-- picker uses); driver/helpers by their crew ids.
-- No new grants/RLS needed: columns inherit the table's existing grants, and
-- both the supervisor UPDATE policy and the enforce_supervisor_status_only_update
-- trigger already allow these columns (the trigger only guards customer data
-- fields, so assigning a crew alongside the status change is permitted).
alter table public.delivery_requests
  add column assigned_driver_id text,
  add column assigned_helper_ids text[],
  add column assigned_truck_plate text,
  add column assigned_at timestamptz;
