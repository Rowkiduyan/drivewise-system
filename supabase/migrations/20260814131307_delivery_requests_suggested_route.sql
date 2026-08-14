-- Planned-route persistence for the Route Deviation comparison
-- (src/docs/IMPLEMENTATION/11_ROUTE_COMPARISON.md). Generated once, client-side
-- via DirectionsService, from the Driver app's pre-trip screen (before Start
-- Pickup) -- corrected from that doc's original "generate at assignment time"
-- decision. Shape: an array of per-leg entries covering Pickup -> Dropoff ->
-- Stops (nearest-order), e.g.
-- [{"from": "pickup", "to": "dropoff", "path": [[lat,lng], ...]}, ...].
-- Nullable: populated post-booking, not at creation, unlike `stops`.
alter table public.delivery_requests
  add column suggested_route jsonb;
