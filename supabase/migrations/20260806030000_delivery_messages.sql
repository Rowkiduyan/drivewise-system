-- delivery_messages: real backend conversation between a customer and a
-- supervisor about a reported delivery issue. Backs the chat UIs in
-- SupDeliveries.jsx (Issues module) and CustomerDeliveries.jsx (request
-- detail view, shown once the customer reports an issue).
--
-- Per SUPABASE_GOTCHAS #1/#2/#8: new tables need explicit grants (Postgres
-- checks GRANT before RLS) and a REVOKE from anon (Supabase auto-grants
-- anon/authenticated baseline access at table-creation time).

create table public.delivery_messages (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null references public.delivery_requests(id),
  sender text not null check (sender in ('customer', 'supervisor')),
  message text not null,
  created_at timestamptz not null default now()
);

create index delivery_messages_delivery_id_idx on public.delivery_messages (delivery_id);

revoke all on public.delivery_messages from anon;   -- GOTCHA #8
grant select, insert on public.delivery_messages to authenticated;  -- GOTCHA #1
grant select, insert, update, delete on public.delivery_messages to service_role;  -- GOTCHA #2

alter table public.delivery_messages enable row level security;

-- Customers can read (and reply to) the thread on their own delivery only.
create policy "Customers can read messages on their own deliveries"
  on public.delivery_messages for select to authenticated
  using (
    exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_id and dr.customer_auth_id = auth.uid()
    )
  );

create policy "Customers can send messages on their own deliveries"
  on public.delivery_messages for insert to authenticated
  with check (
    sender = 'customer'
    and exists (
      select 1 from public.delivery_requests dr
      where dr.id = delivery_id and dr.customer_auth_id = auth.uid()
    )
  );

-- Supervisors can read the whole thread and reply on any delivery.
create policy "Supervisors can read delivery messages"
  on public.delivery_messages for select to authenticated
  using (public.current_user_role() = 'Supervisor');

create policy "Supervisors can send delivery messages"
  on public.delivery_messages for insert to authenticated
  with check (
    sender = 'supervisor'
    and public.current_user_role() = 'Supervisor'
  );

-- Live chat: publish inserts on this table to Realtime so both sides see new
-- messages without refreshing.
alter publication supabase_realtime add table public.delivery_messages;
