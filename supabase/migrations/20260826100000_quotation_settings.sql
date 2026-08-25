-- quotation_settings: single-row store for the Supervisors' configurable
-- pricing rules used by the dynamic quotation-default generator
-- (SupDeliveries.jsx's buildQuotationDefaults). One JSON blob keeps the
-- schema flexible as categories/rules evolve; the UI owns validation.

create table public.quotation_settings (
  id smallint primary key default 1 check (id = 1),
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

alter table public.quotation_settings enable row level security;

-- Only Admins/Supervisors read or change the pricing rules. Bare
-- current_user_role() call (SECURITY DEFINER) per the established
-- Realtime-safe policy pattern -- see RLS.md / SUPABASE_GOTCHAS.md #9.
create policy "admins and supervisors manage quotation settings"
  on public.quotation_settings
  for all to authenticated
  using (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]))
  with check (public.current_user_role() = ANY (ARRAY['Admin'::text, 'Supervisor'::text]));

grant select, insert, update, delete on public.quotation_settings to authenticated;

-- Seed the single row so supervisors can UPDATE from day one.
insert into public.quotation_settings (id, rules) values (1, '{}'::jsonb)
on conflict (id) do nothing;
