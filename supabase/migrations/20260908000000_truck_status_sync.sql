-- Automatically sync truck.status with delivery lifecycle.
--
-- When a delivery enters a transit status (OUT_FOR_PICKUP, ARRIVED_PICKUP,
-- OUT_FOR_DROPOFF, ARRIVED_DROPOFF, DELIVERED), the assigned truck is set to "Active"
-- (displayed as "On Delivery" in the UI).  The truck stays "Active" through
-- DELIVERED (the truck may still be returning from the dropoff).
--
-- The truck reverts to "Available" only on COMPLETED (customer confirmed) or
-- CANCELLED — and only if no other in-progress delivery is using the same truck.

create or replace function public.sync_truck_status_on_delivery_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_truck_id uuid;
  v_plate    text;
  v_in_transit_count integer;
begin
  -- Only act when status actually changes (or on INSERT).
  if TG_OP = 'UPDATE' and new.status = old.status then
    return new;
  end if;

  v_plate := new.assigned_truck_plate;

  -- No truck assigned — nothing to do.
  if v_plate is null then
    return new;
  end if;

  -- Look up the truck id by plate number.
  select id into v_truck_id
    from public.trucks
   where plate_number = v_plate;

  if v_truck_id is null then
    return new;
  end if;

  -- Transit statuses that mean the truck is actively on a delivery.
  if new.status in ('OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF') then
    update public.trucks set status = 'Active' where id = v_truck_id;

  elsif new.status in ('COMPLETED', 'CANCELLED') then
    -- Only revert if no other in-progress delivery still uses this truck.
    select count(*) into v_in_transit_count
      from public.delivery_requests
     where assigned_truck_plate = v_plate
       and status in ('OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF')
       and id <> new.id;

    if v_in_transit_count = 0 then
      update public.trucks set status = 'Available' where id = v_truck_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger sync_truck_status_on_delivery_change
  after insert or update of status on public.delivery_requests
  for each row
  execute function public.sync_truck_status_on_delivery_change();
