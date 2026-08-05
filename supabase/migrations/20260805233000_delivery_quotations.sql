-- delivery_quotations: stores Supervisor-submitted quotations for a delivery
-- request. Backs the supervisor "Submit Quotation" flow (see SupDeliveries.jsx)
-- and the customer-side quotation display (see CustomerDeliveries.jsx).
--
-- The full cost breakdown (Direct/Indirect expenses + calculated totals,
-- Income 15%, Proposed Rate) is stored as one JSONB `breakdown` column, matching
-- the shape already produced by the frontend's QuotationExpenseForm.
--
-- Per SUPABASE_GOTCHAS #1/#2/#8: new tables need explicit grants (Postgres
-- checks GRANT before RLS) and a REVOKE from anon (Supabase auto-grants
-- anon/authenticated baseline access at table-creation time).

-- current_user_role() is the documented helper (RLS.md) used by the existing
-- users policies. Re-declaring it keeps this migration self-contained; the
-- definition matches the one already in the database.
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.users where id = auth.uid();
$$;

create sequence if not exists public.delivery_quotations_id_seq;

create table public.delivery_quotations (
  id text primary key,                          -- defaults to QTN-<0001, 0002, ...>
  delivery_id text not null references public.delivery_requests(id),
  quotation_type text not null default 'initial',-- 'initial' | 'updated'
  amount numeric not null,                      -- Proposed Rate
  breakdown jsonb not null default '{}'::jsonb, -- directExpenses/indirectExpenses/calculated
  notes text,
  valid_until date,
  submitted_by uuid references public.users(id),-- the supervisor who submitted it
  created_at timestamptz not null default now()
);

alter table public.delivery_quotations
  alter column id set default ('QTN-' || lpad(nextval('public.delivery_quotations_id_seq')::text, 4, '0'));

create index delivery_quotations_delivery_id_idx on public.delivery_quotations (delivery_id);

revoke all on public.delivery_quotations from anon;                  -- GOTCHA #8: undo Supabase's default anon grant
revoke all on sequence public.delivery_quotations_id_seq from anon;  -- same for the new sequence
grant select, insert, update on public.delivery_quotations to authenticated;       -- GOTCHA #1: base table grant before RLS
grant select, insert, update, delete on public.delivery_quotations to service_role; -- GOTCHA #2: service_role is per-table
grant usage on sequence public.delivery_quotations_id_seq to authenticated;
grant usage on sequence public.delivery_quotations_id_seq to service_role;

alter table public.delivery_quotations enable row level security;

create policy "Supervisors can submit quotations"
  on public.delivery_quotations for insert to authenticated
  with check (public.current_user_role() = 'Supervisor');

create policy "Supervisors can read quotations"
  on public.delivery_quotations for select to authenticated
  using (public.current_user_role() = 'Supervisor');

create policy "Supervisors can update quotations"
  on public.delivery_quotations for update to authenticated
  using (public.current_user_role() = 'Supervisor')
  with check (public.current_user_role() = 'Supervisor');

create policy "Customers can read quotations for their own requests"
  on public.delivery_quotations for select to authenticated
  using (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_id
        and dr.customer_auth_id = auth.uid()
    )
  );

-- ---- delivery_requests: supervisor access ---------------------------------
-- The supervisor needs to see the inbox (SELECT all requests) and move a
-- request forward when they submit a quotation (UPDATE status). Existing
-- customer policies stay untouched.

create policy "Supervisors can read all delivery requests"
  on public.delivery_requests for select to authenticated
  using (public.current_user_role() = 'Supervisor');

create policy "Supervisors can update delivery requests"
  on public.delivery_requests for update to authenticated
  using (public.current_user_role() = 'Supervisor')
  with check (public.current_user_role() = 'Supervisor');

-- RLS is row-level only (GOTCHA #5): the policy above lets a Supervisor update
-- the whole row. This BEFORE UPDATE trigger narrows that to the status column
-- (and updated_at) so a Supervisor can't silently rewrite customer data fields.
create or replace function public.enforce_supervisor_status_only_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() = 'Supervisor' and new.customer_auth_id <> auth.uid() then
    if new.pickup_date is distinct from old.pickup_date
       or new.pickup_time is distinct from old.pickup_time
       or new.dropoff_date is distinct from old.dropoff_date
       or new.dropoff_time is distinct from old.dropoff_time
       or new.pickup_location is distinct from old.pickup_location
       or new.dropoff_location is distinct from old.dropoff_location
       or new.truck_type is distinct from old.truck_type
       or new.item_type is distinct from old.item_type
       or new.other_item_type is distinct from old.other_item_type
       or new.cargo_weight is distinct from old.cargo_weight
       or new.budget_min is distinct from old.budget_min
       or new.budget_max is distinct from old.budget_max
       or new.notes is distinct from old.notes
       or new.customer_auth_id is distinct from old.customer_auth_id then
      raise exception 'Supervisors may only update the status of a delivery request';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_supervisor_status_only_update
  before update on public.delivery_requests
  for each row
  execute function public.enforce_supervisor_status_only_update();
