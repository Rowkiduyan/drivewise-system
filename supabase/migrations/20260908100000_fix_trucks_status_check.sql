-- Real live-breaking bug found 2026-09-08 while verifying
-- 20260908000000_truck_status_sync.sql right after deploying it: the new
-- trigger sets trucks.status to 'Active' whenever a delivery enters a
-- transit status, but the live trucks_status_check constraint never
-- allowed 'Active' at all -- confirmed directly (a raw update to 'Active'
-- failed the same way). Since the trigger is AFTER UPDATE on
-- delivery_requests, its failure rolled back the whole transaction,
-- including the delivery_requests status write itself -- meaning Start
-- Pickup (and any other transition into OUT_FOR_PICKUP/ARRIVED_PICKUP/
-- OUT_FOR_DROPOFF/ARRIVED_DROPOFF) hard-failed for any delivery with an
-- assigned truck, live, until this fix.
--
-- Pre-existing, not newly introduced: AddTruckModal.jsx's own status
-- dropdown already offered "Active" (displayed "On Delivery") as a
-- manually-selectable option -- it would have failed the identical way,
-- just never exercised until this trigger started hitting it on every
-- delivery status change. Confirmed via the app's own code (not guessed)
-- that exactly four values are ever written to trucks.status anywhere:
-- 'Available', 'Active', 'Inactive', 'Maintenance' ("On Delivery" is only
-- ever a display label for 'Active', never itself stored).
alter table public.trucks drop constraint if exists trucks_status_check;
alter table public.trucks add constraint trucks_status_check
  check (status in ('Available', 'Active', 'Inactive', 'Maintenance'));
