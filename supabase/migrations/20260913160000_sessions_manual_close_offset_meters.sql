-- Phase 14B (14B_ARRIVED_AT_BASE_CONFIRMATION.md): records how far (in
-- meters) from WAREHOUSE_COORDS a return-trip Session was when the driver
-- manually closed it via the "Arrived at Base" fallback (end-return-trip),
-- rather than the automatic geofence/timeout close. Written for every
-- end-return-trip close (even from within the geofence, with a small
-- value), left null for every other close path (auto geofence/timeout,
-- start-trip's force-close, or not a return-trip Session at all) --
-- presence alone marks "this was a manual close," the stored value is what
-- the UI compares against RETURN_TRIP_GEOFENCE_METERS to decide whether to
-- call it out. Same lightweight-flag precedent as sessions.is_return_trip
-- (20260911150000_sessions_is_return_trip.sql).
alter table public.sessions
  add column if not exists manual_close_offset_meters numeric;
