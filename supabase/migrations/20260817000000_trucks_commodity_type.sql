-- trucks.commodity_type: classifies a truck's cargo handling capability.
-- Backs the Commodity Type field in AddTruckModal (Chilled / Ordinary).
-- Existing rows backfill to 'Ordinary'; admins can edit any truck to 'Chilled'
-- later. Adding a column to an existing table needs no new grants/policies
-- (table-level RLS/grants on `trucks` already exist and are unchanged).
-- `commodity_type` is distinct from delivery_requests.item_type: the
-- Deliveries tab's "Commodity Type" label is computed from what is being
-- shipped (see SupDeliveries.jsx getCommodityType), this column documents
-- what the truck itself is equipped for.

alter table public.trucks
  add column commodity_type text not null default 'Ordinary';