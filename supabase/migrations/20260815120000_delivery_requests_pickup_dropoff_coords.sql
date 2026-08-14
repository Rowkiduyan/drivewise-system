-- Real pickup/dropoff coordinates, captured at booking time from the
-- Customer app's location picker (CustomerRequestDelivery.jsx's
-- LocationInput/LocationPickerModal, which already resolve a Photon
-- lat/lon but previously discarded them, keeping only the address text).
-- Nullable: a manually-typed address with no suggestion/map-pin selected
-- has no coordinate; the map/nav features fall back to parseCoords() on
-- the address text in that case (unchanged, still needed for the
-- DR-0020-style "lat, lng" text fixture).
alter table public.delivery_requests
  add column pickup_lat numeric,
  add column pickup_lng numeric,
  add column dropoff_lat numeric,
  add column dropoff_lng numeric;
