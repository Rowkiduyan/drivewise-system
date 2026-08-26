-- driver_default_assignments: each Driver's default truck and helpers, set by
-- the Supervisor from the Delivery Crew profile page (SupCrewProfile.jsx's
-- "Truck & Crew Assignment" card). Previously frontend-only state that was
-- lost on refresh.
--
-- Keyed by the driver's driver_records.id (e.g. D009) — the same record-id
-- convention delivery_requests.assigned_driver_id / assigned_helper_ids use,
-- so SupDeliveries can consume these defaults without extra lookups.
-- truck_id references trucks so deleting a truck clears the link (set null)
-- instead of breaking the row. Helper record ids (e.g. H002) are kept as an
-- array — helpers are validated client-side against the live roster.

create table public.driver_default_assignments (
  driver_record_id text primary key,
  truck_id uuid references public.trucks(id) on delete set null,
  helper_record_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.driver_default_assignments enable row level security;

-- Same open-to-authenticated model as the trucks table: the Supervisor's
-- portal reads and writes this directly from the client.
create policy "authenticated can manage driver default assignments"
  on public.driver_default_assignments
  for all to authenticated
  using (true)
  with check (true);
