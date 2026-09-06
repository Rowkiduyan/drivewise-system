-- Supervisor route approval (2026-09-06, Supervisor Route Review & Approval
-- feature). suggested_route (20260814131307) moves from "generated once by
-- the Driver's pre-trip screen" to "generated at customer request-creation
-- time (CustomerRequestDelivery.jsx), reviewable/editable by the Supervisor
-- during PENDING_REQUEST review (SupDeliveries.jsx's EditableRouteMap),
-- before a quotation is ever submitted." suggested_route itself is
-- unchanged (still the one column the Driver/Customer/Route-Comparison code
-- reads) -- these two columns record whether/when a Supervisor froze it.
--
-- Not added to enforce_supervisor_status_only_update's guarded-column list
-- (20260805233000_delivery_quotations.sql) -- same precedent as
-- received_confirmed/received_confirmed_at/completed_at
-- (20260806010000_delivery_requests_customer_confirmation.sql): a Supervisor
-- already has blanket UPDATE via RLS, and these are exactly the kind of
-- Supervisor-authored field that trigger isn't meant to block.
alter table public.delivery_requests
  add column route_approved_at timestamptz,
  add column route_approved_by uuid references public.users(id);
