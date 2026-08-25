-- crew_availability: weekly working days each Driver/Helper sets for
-- themselves (field workers with no fixed hours, so days only -- no times).
-- Customers with a crew_client_specialties link can only book pickups on
-- days at least one of their specialized crew members works (enforced by
-- the specialized_crew_available_days() RPC below, consumed by
-- CustomerRequestDelivery.jsx).

create table public.crew_availability (
  id bigint generated always as identity primary key,
  crew_auth_id uuid not null references public.users(id) on delete cascade,
  -- 0=Sunday .. 6=Saturday, matching JavaScript's Date.getDay()
  day_of_week smallint not null check (day_of_week between 0 and 6),
  created_at timestamptz not null default now(),
  unique (crew_auth_id, day_of_week)
);

alter table public.crew_availability enable row level security;

-- Crew members manage their own availability directly from their profile
-- page (DriverProfile.jsx / HelperProfile.jsx).
create policy "crew can manage own availability" on public.crew_availability
  for all to authenticated
  using (crew_auth_id = auth.uid())
  with check (crew_auth_id = auth.uid());

-- Table is otherwise reachable only through the admin-users Edge Function's
-- service_role connection (list-crew attaches each member's days), same
-- access model as the *_records tables -- see SUPABASE_GOTCHAS.md #2/#7/#8.
revoke all on public.crew_availability from anon, authenticated;
grant select, insert, update, delete on public.crew_availability to authenticated;
grant select, insert, update, delete on public.crew_availability to service_role;

-- Which weekdays are covered for the calling Customer: distinct day_of_week
-- values across every Driver/Helper that has a crew_client_specialties row
-- pointing at the caller AND has set that day as a working day. Empty array
-- = no specialized crew (or none has set availability) -- callers treat that
-- as unrestricted. SECURITY DEFINER so the check runs through the join
-- without the customer needing read access to either table.
--
-- NOTE: crew_client_specialties was created directly in Supabase (no
-- migration file) -- see DATABASE.md "crew_client_specialties".
create or replace function public.specialized_crew_available_days()
returns smallint[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(distinct a.day_of_week order by a.day_of_week),
    '{}'::smallint[]
  )
  from crew_client_specialties s
  join crew_availability a on a.crew_auth_id = s.crew_auth_id
  where s.client_auth_id = auth.uid()
$$;

revoke all on function public.specialized_crew_available_days() from anon, authenticated, public;
grant execute on function public.specialized_crew_available_days() to authenticated;
