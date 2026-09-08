-- Reverts 20260906000000_delivery_requests_route_approval.sql. The
-- Supervisor Route Review & Approval feature (2026-09-06) was removed
-- 2026-09-08 per explicit decision: the Supervisor no longer drags pins or
-- approves a route, only views what the customer's booking form generated
-- (SuggestedRouteMap, replacing EditableRouteMap.jsx). suggested_route
-- itself is unchanged and still authoritative -- only these two now-unused
-- columns are dropped.
alter table public.delivery_requests
  drop column if exists route_approved_at,
  drop column if exists route_approved_by;
