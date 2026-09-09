-- Supervisor Trip Details report wants a real "Arrival" time per location,
-- distinct from the existing pickup_completed_at/dropoff_completed_at
-- ("confirmed"/"departed") timestamps. ARRIVED_PICKUP/ARRIVED_DROPOFF already
-- exist as recognized status values in admin-users' transition guards,
-- driver-trip's in-progress status list, and the truck_status_sync trigger --
-- but no UI action has ever actually set a delivery to either one. These
-- columns are stamped by a new Driver-side "Arrived" action going forward;
-- older/in-flight deliveries simply keep these null (rendered as "not
-- recorded", never fabricated).
alter table public.delivery_requests
  add column if not exists pickup_arrived_at timestamptz null,
  add column if not exists dropoff_arrived_at timestamptz null;
