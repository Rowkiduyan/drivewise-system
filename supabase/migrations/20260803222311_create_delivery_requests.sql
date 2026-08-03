-- delivery_requests: stores Customer-submitted delivery requests.
-- Backs the customer "Request Delivery" form and the customer Deliveries
-- list (see CustomerRequestDelivery.jsx / CustomerDeliveries.jsx).
-- Per SUPABASE_GOTCHAS #1/#2/#8: new tables need explicit grants (Postgres
-- checks GRANT before RLS) and a REVOKE from anon (Supabase auto-grants
-- anon/authenticated baseline access at table-creation time).

create table public.delivery_requests (
  id text primary key,                          -- client-generated, e.g. DR-<timestamp>
  customer_auth_id uuid not null references public.users(id),
  pickup_date date not null,
  pickup_time time not null,
  dropoff_date date not null,
  dropoff_time time not null,
  pickup_location text not null,
  dropoff_location text not null,
  truck_type text not null,                      -- deliveryOptions.js truckTypes value (e.g. 2T_DRY)
  item_type text not null,                       -- deliveryOptions.js itemTypes value (e.g. dry_food)
  other_item_type text,                          -- only when item_type = 'other'
  cargo_weight numeric not null,
  budget_min numeric,
  budget_max numeric,
  notes text,
  status text not null default 'PENDING_REQUEST',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index delivery_requests_customer_auth_id_idx on public.delivery_requests (customer_auth_id);

revoke all on public.delivery_requests from anon;                 -- GOTCHA #8: undo Supabase's default anon grant
grant select, insert, update on public.delivery_requests to authenticated;  -- GOTCHA #1: base table grant before RLS
grant select, insert, update, delete on public.delivery_requests to service_role;  -- GOTCHA #2: service_role is per-table

alter table public.delivery_requests enable row level security;

create policy "Customers can create their own delivery requests"
  on public.delivery_requests for insert to authenticated
  with check (customer_auth_id = auth.uid());

create policy "Customers can read their own delivery requests"
  on public.delivery_requests for select to authenticated
  using (customer_auth_id = auth.uid());

create policy "Customers can update their own delivery requests"
  on public.delivery_requests for update to authenticated
  using (customer_auth_id = auth.uid())
  with check (customer_auth_id = auth.uid());
