-- crew_capacity_blocked_days(): the pick-up dates over the next N days where
-- the calling Customer cannot actually be served -- fewer than one free
-- Delivery Driver OR fewer than one free Helper left that day.
--
-- "Free" for a date means: listed as working that weekday (crew_availability)
-- AND not committed to a trip covering that date (delivery_requests in an
-- active status, counted across pickup_date -> dropoff_date, the same range
-- src/lib/crewStatus.js uses). A Customer who has crew_client_specialties
-- rows is only served by their specialized crew (the Supervisor's Assign
-- Vehicle picker filters to that pool), so only that pool counts for them.
--
-- Replaces CustomerRequestDelivery.jsx's earlier rule of "any date with an
-- active booking is blocked", which greyed out a day as soon as one booking
-- existed and never looked at how many crew were actually available.
--
-- SECURITY DEFINER so a Customer can compute this without read access to
-- users / crew_availability / driver_records / helper_records (all revoked
-- from authenticated -- see SUPABASE_GOTCHAS.md #2/#7/#8).
--
-- NOTE: crew_client_specialties was created directly in Supabase (no
-- migration file) -- see DATABASE.md "crew_client_specialties".
create or replace function public.crew_capacity_blocked_days(p_horizon_days integer default 365)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (now() at time zone 'Asia/Manila')::date as start_date,
           (now() at time zone 'Asia/Manila')::date + greatest(coalesce(p_horizon_days, 0), 0) as end_date
  ),
  dates as (
    select generate_series(
      (select start_date from bounds),
      (select end_date from bounds),
      interval '1 day'
    )::date as day
  ),
  scoped as (
    -- Customers with no specialized-crew links are served by any
    -- Driver/Helper; customers with links are only served by theirs.
    select not exists (
      select 1 from crew_client_specialties where client_auth_id = auth.uid()
    ) as unrestricted
  ),
  roster as (
    select u.id, u.role, a.day_of_week
    from users u
    join crew_availability a on a.crew_auth_id = u.id
    where u.role in ('Driver', 'Helper')
      and u.deactivated_at is null
      and (
        (select unrestricted from scoped)
        or exists (
          select 1 from crew_client_specialties s
          where s.crew_auth_id = u.id and s.client_auth_id = auth.uid()
        )
      )
  ),
  driver_trips as (
    select dr.pickup_date as start_date,
           coalesce(dr.dropoff_date, dr.pickup_date) as end_date,
           r.auth_id
    from delivery_requests dr
    join driver_records r on r.id = dr.assigned_driver_id
    where dr.status in ('ASSIGNED', 'OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF')
  ),
  helper_trips as (
    select dr.pickup_date as start_date,
           coalesce(dr.dropoff_date, dr.pickup_date) as end_date,
           r.auth_id
    from delivery_requests dr
    join helper_records r on r.id = any (dr.assigned_helper_ids)
    where dr.status in ('ASSIGNED', 'OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF')
  ),
  capacity as (
    select d.day,
      (
        select count(*)
        from roster r
        where r.role = 'Driver' and r.day_of_week = extract(dow from d.day)
      ) as drivers_working,
      (
        select count(distinct t.auth_id)
        from driver_trips t
        join roster r
          on r.id = t.auth_id
         and r.role = 'Driver'
         and r.day_of_week = extract(dow from d.day)
        where t.start_date <= d.day and d.day <= t.end_date
      ) as drivers_busy,
      (
        select count(*)
        from roster r
        where r.role = 'Helper' and r.day_of_week = extract(dow from d.day)
      ) as helpers_working,
      (
        select count(distinct t.auth_id)
        from helper_trips t
        join roster r
          on r.id = t.auth_id
         and r.role = 'Helper'
         and r.day_of_week = extract(dow from d.day)
        where t.start_date <= d.day and d.day <= t.end_date
      ) as helpers_busy
    from dates d
  )
  select coalesce(
    array_agg(to_char(c.day, 'YYYY-MM-DD') order by c.day),
    '{}'::text[]
  )
  from capacity c
  where c.drivers_working - c.drivers_busy < 1
     or c.helpers_working - c.helpers_busy < 1
$$;

revoke all on function public.crew_capacity_blocked_days(integer) from anon, authenticated, public;
grant execute on function public.crew_capacity_blocked_days(integer) to authenticated;
