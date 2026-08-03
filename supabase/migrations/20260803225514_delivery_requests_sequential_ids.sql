-- delivery_requests.id now defaults to a sequential DR-<0001, 0002, ...> id
-- instead of a client-generated DR-<timestamp>. The database sequence is
-- global (IDs unique across all customers) and race-free.
-- Per SUPABASE_GOTCHAS: sequences created via the dashboard/Postgres are
-- auto-granted to anon/authenticated, so revoke from anon and re-grant USAGE
-- to the roles that must execute the insert default.

create sequence if not exists public.delivery_requests_id_seq;

alter table public.delivery_requests
  alter column id set default ('DR-' || lpad(nextval('public.delivery_requests_id_seq')::text, 4, '0'));

revoke all on sequence public.delivery_requests_id_seq from anon;
grant usage on sequence public.delivery_requests_id_seq to authenticated;
grant usage on sequence public.delivery_requests_id_seq to service_role;
