// Supabase Edge Function: driver-trip
// Handles Driver-initiated Trip lifecycle actions: Start/Pause/Resume/End
// Trip. Authenticates the caller's own session (same pattern as
// admin-users), then uses service_role server-side to read/write
// delivery_requests/sessions/devices/trucks/driver_records past RLS.
//
// Deploy:   npx supabase functions deploy driver-trip
// Secrets:  SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY
//           are provided automatically to every deployed Edge Function.
//
// Required service_role grants (SUPABASE_GOTCHAS.md #2/#7) — confirm these
// exist before testing. delivery_requests/devices/trucks/driver_records were
// added directly in Supabase by other modules and may never have been
// granted to service_role the way users/*_records were for admin-users:
//   grant select, update on public.delivery_requests to service_role;
//   grant select, insert, update on public.sessions to service_role;
//   grant select on public.devices to service_role;
//   grant select, update on public.trucks to service_role;  -- update added 2026-08-08 for Pause Trip's mileage write
//   grant select on public.driver_records to service_role;
//   grant select on public.helper_records to service_role;  -- added 2026-08-12, end-trip is now also Helper-callable
//   grant select on public.users to service_role;
//   grant select, insert on public.gps_logs to service_role;  -- select added 2026-08-08 for Pause Trip's mileage sum; insert already present (shared with gps-upload's own service_role client, grants are per-table not per-function) -- used by log-position (2026-09-09) to persist phone GPS
//   grant select, insert, update on public.reroute_events to service_role;  -- log-reroute inserts, tag-reroute-reason updates

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Phase 14 (14_RETURN_TRIP_MONITORING.md): once a delivery is DELIVERED, an
// automatic "return to base" Session keeps drowsiness/GPS monitoring alive
// for the drive back. WAREHOUSE_COORDS duplicated from
// lib/suggestedRoute.js's own WAREHOUSE_ADDRESS geocode -- same
// per-Edge-Function duplication convention this codebase already uses for
// distanceKm/haversine (server code can't import the frontend's lib/ tree).
const WAREHOUSE_COORDS = { lat: 14.57147, lng: 121.08762 };
const RETURN_TRIP_GEOFENCE_METERS = 150;
const RETURN_TRIP_MAX_MS = 3 * 60 * 60 * 1000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Haversine distance in kilometers between two lat/lon points.
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Closes an Active is_return_trip Session unconditionally -- shared by the
// geofence/timeout auto-close (log-position), the forced close when the
// driver starts a genuinely new trip (start-trip), and the manual "I've
// Arrived at Base" fallback (end-return-trip). Mirrors end-trip/pause-trip's
// own distance-from-gps_logs -> add-to-truck-mileage logic exactly -- return
//-trip distance is real distance driven, so it's summed into
// trucks.current_mileage the same way (14_RETURN_TRIP_MONITORING.md's
// truck-mileage open question, defaulted to "yes, count it").
// deno-lint-ignore no-explicit-any -- matches this file's existing style of
// leaving the Supabase client itself untyped (no Database generic anywhere
// in this codebase); re-typing it via `ReturnType<typeof createClient>`
// here collapses every chained .from()/.select() call below to `never`.
async function closeReturnTripSession(
  adminClient: any,
  session: { session_id: string; start_time: string; truck_plate: string | null },
) {
  const endTime = new Date();
  const sessionDuration = Math.round(
    (endTime.getTime() - new Date(session.start_time).getTime()) / 1000,
  );

  const { data: gpsLogs } = await adminClient
    .from("gps_logs")
    .select("latitude, longitude")
    .eq("session_id", session.session_id)
    .order("timestamp", { ascending: true });

  let distanceKmDriven = 0;
  for (let i = 1; i < (gpsLogs?.length ?? 0); i++) {
    const prev = gpsLogs![i - 1];
    const curr = gpsLogs![i];
    distanceKmDriven += distanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
  }

  if (session.truck_plate && distanceKmDriven > 0) {
    const { data: truck } = await adminClient
      .from("trucks")
      .select("current_mileage")
      .eq("plate_number", session.truck_plate)
      .maybeSingle();

    if (truck) {
      await adminClient
        .from("trucks")
        .update({ current_mileage: (truck.current_mileage ?? 0) + distanceKmDriven })
        .eq("plate_number", session.truck_plate);
    }
  }

  await adminClient
    .from("sessions")
    .update({
      end_time: endTime.toISOString(),
      session_duration: sessionDuration,
      status: "Completed",
    })
    .eq("session_id", session.session_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.replace("Bearer ", "");

  if (!callerToken) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  // Client scoped to the caller's own token, only used to identify them.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser(callerToken);

  if (callerError || !callerData.user) {
    return json({ error: "Invalid session" }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerRow, error: callerRowError } = await adminClient
    .from("users")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  if (callerRowError || !callerRow) {
    return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json();
  const { action } = body;

  // Every action here is Driver-only except end-trip, which the Helper who
  // completes the final item of the Pickup -> Dropoff -> Stops chain also
  // needs to call (closes the Session, computes mileage) — see admin-users'
  // complete-dropoff/complete-stop and 02B_MULTI_STOP_DELIVERIES.md.
  const isHelperEndTrip = callerRow.role === "Helper" && action === "end-trip";

  if (callerRow.role !== "Driver" && !isHelperEndTrip) {
    return json({ error: "Forbidden" }, 403);
  }

  let driverId = "";
  let helperId = "";

  if (isHelperEndTrip) {
    const { data: helperRow, error: helperRowError } = await adminClient
      .from("helper_records")
      .select("id")
      .eq("auth_id", callerData.user.id)
      .single();

    if (helperRowError || !helperRow) {
      return json({ error: "Helper profile not found" }, 400);
    }

    helperId = helperRow.id as string;
  } else {
    // Every action here needs the caller's driver_records.id (not their auth
    // uuid) — delivery_requests.assigned_driver_id and sessions.driver_id both
    // use that text id, matching the rest of this schema's convention.
    const { data: driverRow, error: driverRowError } = await adminClient
      .from("driver_records")
      .select("id")
      .eq("auth_id", callerData.user.id)
      .single();

    if (driverRowError || !driverRow) {
      return json({ error: "Driver profile not found" }, 400);
    }

    driverId = driverRow.id as string;
  }

  // Persists a phone-GPS reading into gps_logs -- the phone's browser
  // geolocation was previously live-display-only (LiveNavigationMap's own
  // marker, plus an ephemeral Realtime broadcast to the Supervisor
  // Dashboard, see the "GPS source split" memory/05_GPS_PIPELINE.md), never
  // written to the database. Changed 2026-09-09 per explicit user request:
  // phone GPS is now the PRIMARY persisted source (mileage, Route
  // Comparison, and the proof-of-location check all read gps_logs, so they
  // only ever saw Pi data before this) -- the Pi's own gps-upload path is
  // unchanged and still writes here too, now acting as the fallback for
  // whenever a phone isn't actively broadcasting (no permission, tab
  // closed, etc.), not the primary source it used to be.
  if (action === "log-position") {
    const deliveryRequestId = typeof body.deliveryRequestId === "string" ? body.deliveryRequestId : "";
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!deliveryRequestId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ error: "deliveryRequestId, lat, and lng are required" }, 400);
    }

    const { data: delivery, error: deliveryError } = await adminClient
      .from("delivery_requests")
      .select("id, assigned_driver_id")
      .eq("id", deliveryRequestId)
      .maybeSingle();

    if (deliveryError || !delivery) {
      return json({ error: "Delivery request not found" }, 400);
    }

    if (delivery.assigned_driver_id !== driverId) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    // Mirrors gps-upload's own GPS-during-Pause rule (05_GPS_PIPELINE.md):
    // session_id set only while a Session is genuinely Active, null while
    // Paused -- attributed via delivery_request_id either way.
    const { data: activeSession } = await adminClient
      .from("sessions")
      .select("session_id, is_return_trip, start_time, truck_plate")
      .eq("delivery_request_id", deliveryRequestId)
      .eq("status", "Active")
      .maybeSingle();

    const { error: insertError } = await adminClient.from("gps_logs").insert({
      delivery_request_id: deliveryRequestId,
      session_id: activeSession?.session_id ?? null,
      latitude: lat,
      longitude: lng,
      timestamp: new Date().toISOString(),
    });

    if (insertError) {
      return json({ error: insertError.message }, 400);
    }

    // 14_RETURN_TRIP_MONITORING.md: auto-close the return-trip leg once the
    // phone's GPS shows the driver back near the warehouse, or it's been
    // open too long regardless of position (safety net for a driver who
    // takes a different route home / GPS drift). Never blocks the response
    // either way -- this is best-effort housekeeping riding on a reading
    // that already succeeded.
    if (activeSession?.is_return_trip) {
      const withinGeofence =
        distanceKm(lat, lng, WAREHOUSE_COORDS.lat, WAREHOUSE_COORDS.lng) * 1000 <=
        RETURN_TRIP_GEOFENCE_METERS;
      const timedOut =
        Date.now() - new Date(activeSession.start_time).getTime() > RETURN_TRIP_MAX_MS;
      if (withinGeofence || timedOut) {
        await closeReturnTripSession(adminClient, {
          session_id: activeSession.session_id,
          start_time: activeSession.start_time,
          truck_plate: activeSession.truck_plate,
        });
      }
    }

    return json({ ok: true });
  }

  // Persists a reroute LiveNavigationMap already computed automatically the
  // moment the driver's GPS position read as >100m off the planned
  // suggested_route polyline (DriverDeliveries.jsx, isLocationOnEdge check) --
  // this action does not decide whether to reroute, it only records that one
  // already happened, so the post-trip Route Deviation verdict
  // (classifyRouteDeviation, suggestedRoute.js) can tell "the app itself gave
  // the driver this new path" apart from unexplained deviation. `reason` is
  // optional here (null until the driver later, optionally, tags it via
  // tag-reroute-reason while reviewing their own completed trip) -- capturing
  // a reason was deliberately kept out of the live-driving moment entirely.
  if (action === "log-reroute") {
    const deliveryRequestId = typeof body.deliveryRequestId === "string" ? body.deliveryRequestId : "";
    const rawPath = Array.isArray(body.newPath) ? body.newPath : null;
    // Same Number.isFinite guard log-position already applies to its own
    // lat/lng -- a malformed point (e.g. a transient Maps SDK NaN) would
    // otherwise insert silently and then just never match anything in
    // classifyRouteDeviation's distance math, quietly defeating the whole
    // point of logging it.
    const newPath =
      rawPath &&
      rawPath.every(
        (p: unknown) =>
          Array.isArray(p) &&
          p.length === 2 &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1]),
      )
        ? rawPath
        : null;

    if (!deliveryRequestId || !newPath || newPath.length === 0) {
      return json({ error: "deliveryRequestId and a valid newPath are required" }, 400);
    }

    // Independent lookups (the session query only needs deliveryRequestId,
    // not the delivery row) -- run concurrently rather than one-after-the-
    // other.
    const [
      { data: delivery, error: deliveryError },
      { data: activeSession },
    ] = await Promise.all([
      adminClient
        .from("delivery_requests")
        .select("id, assigned_driver_id")
        .eq("id", deliveryRequestId)
        .maybeSingle(),
      adminClient
        .from("sessions")
        .select("session_id")
        .eq("delivery_request_id", deliveryRequestId)
        .eq("status", "Active")
        .maybeSingle(),
    ]);

    if (deliveryError || !delivery) {
      return json({ error: "Delivery request not found" }, 400);
    }

    if (delivery.assigned_driver_id !== driverId) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    const { error: insertError } = await adminClient.from("reroute_events").insert({
      delivery_request_id: deliveryRequestId,
      session_id: activeSession?.session_id ?? null,
      occurred_at: new Date().toISOString(),
      new_path: newPath,
    });

    if (insertError) {
      return json({ error: insertError.message }, 400);
    }

    return json({ ok: true });
  }

  // Driver-only, optional, after-the-fact annotation: tags an already-logged
  // reroute_events row with why it happened (Road closed/Accident/Wrong turn/
  // Other), from the driver reviewing their own completed (or in-progress)
  // trip's report -- never surfaced as a live-driving prompt. Ownership is
  // checked via the row's own delivery_request_id, same pattern as every
  // other action here.
  const REROUTE_REASONS = ["road_closed", "accident", "wrong_turn", "other"];
  if (action === "tag-reroute-reason") {
    const rerouteEventId = body.rerouteEventId;
    const reason = typeof body.reason === "string" ? body.reason : "";

    if (rerouteEventId == null || !REROUTE_REASONS.includes(reason)) {
      return json({ error: "rerouteEventId and a valid reason are required" }, 400);
    }

    // Single embedded-resource query over the existing FK, instead of
    // fetching the reroute_events row and its parent delivery_requests row
    // as two sequential round-trips.
    const { data: rerouteEvent, error: rerouteEventError } = await adminClient
      .from("reroute_events")
      .select("id, delivery_requests(assigned_driver_id)")
      .eq("id", rerouteEventId)
      .maybeSingle();

    // Cast needed purely for TS -- this codebase has no generated Database
    // type, so the untyped client infers a to-one embedded resource as an
    // array; at runtime PostgREST returns a single object for a to-one FK
    // (confirmed by this exact access already working correctly here).
    const rerouteDelivery = rerouteEvent?.delivery_requests as
      | { assigned_driver_id: string }
      | undefined;
    if (
      rerouteEventError ||
      !rerouteEvent ||
      rerouteDelivery?.assigned_driver_id !== driverId
    ) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    const { error: updateError } = await adminClient
      .from("reroute_events")
      .update({ reason })
      .eq("id", rerouteEventId);

    if (updateError) {
      return json({ error: updateError.message }, 400);
    }

    return json({ ok: true });
  }

  if (action === "start-trip") {
    const deliveryRequestId = typeof body.deliveryRequestId === "string" ? body.deliveryRequestId : "";

    if (!deliveryRequestId) {
      return json({ error: "deliveryRequestId is required" }, 400);
    }

    const { data: delivery, error: deliveryError } = await adminClient
      .from("delivery_requests")
      .select("id, status, assigned_driver_id, assigned_truck_plate")
      .eq("id", deliveryRequestId)
      .single();

    if (deliveryError || !delivery) {
      return json({ error: "Delivery request not found" }, 400);
    }

    if (delivery.assigned_driver_id !== driverId) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    // The Driver portal's "Start Pickup" button advances delivery_requests.status
    // to OUT_FOR_PICKUP (via admin-users' update-driver-delivery) before calling
    // this action, so ASSIGNED is no longer the only valid starting status by the
    // time this runs — accept the milestone it just moved to as well. The
    // "one active session per device/driver" checks below are what actually
    // guard against a duplicate/late start-trip call, not this status check.
    if (delivery.status !== "ASSIGNED" && delivery.status !== "OUT_FOR_PICKUP") {
      return json(
        { error: `Cannot start trip: delivery status is ${delivery.status}, expected ASSIGNED or OUT_FOR_PICKUP` },
        400,
      );
    }

    // 14_RETURN_TRIP_MONITORING.md: "starting a real trip ends the
    // return-trip leg" -- close any still-open return-trip Session for this
    // driver first, so it doesn't collide with the "one Active trip per
    // driver" check right below (that check can't itself tell a return-trip
    // Session apart from a real one).
    const { data: openReturnSession } = await adminClient
      .from("sessions")
      .select("session_id, start_time, truck_plate")
      .eq("driver_id", driverId)
      .eq("status", "Active")
      .eq("is_return_trip", true)
      .maybeSingle();

    if (openReturnSession) {
      await closeReturnTripSession(adminClient, openReturnSession);
    }

    // One Active trip per driver (PROJECT_CONSTRAINTS.md).
    const { data: existingActive, error: existingActiveError } = await adminClient
      .from("sessions")
      .select("session_id")
      .eq("driver_id", driverId)
      .eq("status", "Active")
      .maybeSingle();

    if (existingActiveError) {
      return json({ error: existingActiveError.message }, 400);
    }

    if (existingActive) {
      return json({ error: "You already have an active trip in progress" }, 409);
    }

    // Full Active-or-Paused enforcement (PROJECT_CONSTRAINTS.md's "one Active
    // or Paused Trip per driver at a time", 09_EDGE_CASES.md). The check
    // above already rules out an Active session on *any* delivery for this
    // driver, so by this point we know there is none anywhere — what's left
    // is a *Paused* Trip elsewhere: a different delivery_requests row already
    // assigned to this driver whose milestone status is past ASSIGNED (so a
    // Session existed and was later closed) but not yet DELIVERED/COMPLETED/
    // CANCELLED. "Paused" is never a stored value (03B_PAUSE_AND_RESUME_TRIP.md)
    // — this is the same past-ASSIGNED-with-no-open-Session definition
    // get-driver-deliveries' hasOpenSession already uses, just applied here
    // to every OTHER delivery instead of only this one.
    const { data: otherInProgress, error: otherInProgressError } = await adminClient
      .from("delivery_requests")
      .select("id")
      .eq("assigned_driver_id", driverId)
      .neq("id", deliveryRequestId)
      .in("status", ["OUT_FOR_PICKUP", "ARRIVED_PICKUP", "OUT_FOR_DROPOFF", "ARRIVED_DROPOFF"])
      .limit(1);

    if (otherInProgressError) {
      return json({ error: otherInProgressError.message }, 400);
    }

    if (otherInProgress && otherInProgress.length > 0) {
      return json(
        { error: "You already have a paused trip in progress — resume or end it before starting a new one" },
        409,
      );
    }

    // Determine the Raspberry Pi assigned to the truck (devices.plate_number
    // -> trucks.plate_number — no separate assignment table, see
    // 02_BOOKING_AND_TRIP_CREATION.md). A truck without a linked device is a
    // fleet-setup gap, not something that should block the driver from
    // starting — device_id is just left null in that case.
    let deviceId: string | null = null;
    if (delivery.assigned_truck_plate) {
      const { data: device, error: deviceError } = await adminClient
        .from("devices")
        .select("device_id")
        .eq("plate_number", delivery.assigned_truck_plate)
        .maybeSingle();

      if (deviceError) {
        return json({ error: deviceError.message }, 400);
      }

      deviceId = device?.device_id ?? null;
    }

    const { data: session, error: sessionError } = await adminClient
      .from("sessions")
      .insert({
        session_id: crypto.randomUUID(),
        delivery_request_id: delivery.id,
        driver_id: driverId,
        truck_plate: delivery.assigned_truck_plate,
        device_id: deviceId,
        start_time: new Date().toISOString(),
        status: "Active",
      })
      .select()
      .single();

    if (sessionError) {
      // Postgres unique_violation on sessions_one_active_per_device — the
      // resolved device already has an Active session (a different delivery
      // on the same truck/device somehow already in progress).
      if (sessionError.code === "23505") {
        return json({ error: "This truck's device is already in an active session for a different delivery" }, 409);
      }
      return json({ error: sessionError.message }, 400);
    }

    // delivery_requests.status is deliberately NOT changed here — Active is a
    // Session-state concept, not a shipment-milestone value (see
    // DATABASE.md's delivery_requests notes and 03_START_TRIP_AND_SESSION.md).
    return json({ ok: true, session });
  }

  if (action === "save-suggested-route") {
    const deliveryRequestId = typeof body.deliveryRequestId === "string" ? body.deliveryRequestId : "";
    const suggestedRoute = Array.isArray(body.suggestedRoute) ? body.suggestedRoute : null;

    if (!deliveryRequestId) {
      return json({ error: "deliveryRequestId is required" }, 400);
    }

    if (!suggestedRoute) {
      return json({ error: "suggestedRoute is required" }, 400);
    }

    const { data: delivery, error: deliveryError } = await adminClient
      .from("delivery_requests")
      .select("id, assigned_driver_id, suggested_route")
      .eq("id", deliveryRequestId)
      .single();

    if (deliveryError || !delivery) {
      return json({ error: "Delivery request not found" }, 400);
    }

    if (delivery.assigned_driver_id !== driverId) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    // Frozen once a suggested_route already exists -- a second call (e.g.
    // the pre-trip screen remounting before the first write's response
    // lands) silently no-ops instead of overwriting it. The Supervisor
    // review/approval step this used to key off (route_approved_at) was
    // removed 2026-09-08 (see STATUS.md); mere presence is the only signal
    // left, same as this action's original design before that feature
    // existed.
    if (delivery.suggested_route) {
      return json({ ok: true, suggestedRoute: delivery.suggested_route });
    }

    const { error: updateError } = await adminClient
      .from("delivery_requests")
      .update({ suggested_route: suggestedRoute })
      .eq("id", deliveryRequestId);

    if (updateError) {
      return json({ error: updateError.message }, 400);
    }

    return json({ ok: true, suggestedRoute });
  }

  if (action === "pause-trip") {
    const deliveryRequestId = typeof body.deliveryRequestId === "string" ? body.deliveryRequestId : "";

    if (!deliveryRequestId) {
      return json({ error: "deliveryRequestId is required" }, 400);
    }

    const { data: delivery, error: deliveryError } = await adminClient
      .from("delivery_requests")
      .select("id, assigned_driver_id")
      .eq("id", deliveryRequestId)
      .single();

    if (deliveryError || !delivery) {
      return json({ error: "Delivery request not found" }, 400);
    }

    if (delivery.assigned_driver_id !== driverId) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    const { data: session, error: sessionFetchError } = await adminClient
      .from("sessions")
      .select("session_id, start_time, truck_plate")
      .eq("delivery_request_id", deliveryRequestId)
      .eq("status", "Active")
      .maybeSingle();

    if (sessionFetchError) {
      return json({ error: sessionFetchError.message }, 400);
    }

    if (!session) {
      return json({ error: "No active session found for this delivery" }, 400);
    }

    const endTime = new Date();
    const sessionDuration = Math.round((endTime.getTime() - new Date(session.start_time).getTime()) / 1000);

    // Distance driven this Session, from its GPS route (05_GPS_PIPELINE.md):
    // sum of point-to-point distances between consecutive gps_logs rows,
    // chronologically. No telemetry exists yet, so this is 0 for now.
    const { data: gpsLogs, error: gpsLogsError } = await adminClient
      .from("gps_logs")
      .select("latitude, longitude")
      .eq("session_id", session.session_id)
      .order("timestamp", { ascending: true });

    if (gpsLogsError) {
      return json({ error: gpsLogsError.message }, 400);
    }

    let distanceKmDriven = 0;
    for (let i = 1; i < (gpsLogs?.length ?? 0); i++) {
      const prev = gpsLogs![i - 1];
      const curr = gpsLogs![i];
      distanceKmDriven += distanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }

    if (session.truck_plate && distanceKmDriven > 0) {
      const { data: truck, error: truckError } = await adminClient
        .from("trucks")
        .select("current_mileage")
        .eq("plate_number", session.truck_plate)
        .maybeSingle();

      if (truckError) {
        return json({ error: truckError.message }, 400);
      }

      if (truck) {
        const { error: truckUpdateError } = await adminClient
          .from("trucks")
          .update({ current_mileage: (truck.current_mileage ?? 0) + distanceKmDriven })
          .eq("plate_number", session.truck_plate);

        if (truckUpdateError) {
          return json({ error: truckUpdateError.message }, 400);
        }
      }
    }

    // Whether the rest-stop-recommendation banner (12_REST_STOP_RECOMMENDATIONS.md,
    // ephemeral client-side state) was showing at the moment this Pause was
    // pressed -- recorded here (2026-09-08) so the Supervisor's Trip Details
    // report can show it per-pause. Optional; defaults false if the client
    // doesn't send it (older app builds, or the banner wasn't showing).
    const restStopRecommended = body.restStopRecommended === true;

    const { data: updatedSession, error: updateError } = await adminClient
      .from("sessions")
      .update({
        end_time: endTime.toISOString(),
        session_duration: sessionDuration,
        status: "Completed",
        rest_stop_recommended: restStopRecommended,
      })
      .eq("session_id", session.session_id)
      .select()
      .single();

    if (updateError) {
      return json({ error: updateError.message }, 400);
    }

    // delivery_requests.status is deliberately NOT changed here — same
    // two-axis rule as Start Trip (see 03B_PAUSE_AND_RESUME_TRIP.md).
    return json({ ok: true, session: updatedSession, distanceKm: distanceKmDriven });
  }

  if (action === "resume-trip") {
    const deliveryRequestId = typeof body.deliveryRequestId === "string" ? body.deliveryRequestId : "";

    if (!deliveryRequestId) {
      return json({ error: "deliveryRequestId is required" }, 400);
    }

    const { data: delivery, error: deliveryError } = await adminClient
      .from("delivery_requests")
      .select("id, assigned_driver_id, assigned_truck_plate")
      .eq("id", deliveryRequestId)
      .single();

    if (deliveryError || !delivery) {
      return json({ error: "Delivery request not found" }, 400);
    }

    if (delivery.assigned_driver_id !== driverId) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    const { data: existingOpenSession, error: existingOpenSessionError } = await adminClient
      .from("sessions")
      .select("session_id")
      .eq("delivery_request_id", deliveryRequestId)
      .eq("status", "Active")
      .maybeSingle();

    if (existingOpenSessionError) {
      return json({ error: existingOpenSessionError.message }, 400);
    }

    if (existingOpenSession) {
      return json({ error: "This delivery already has an active session" }, 409);
    }

    // Scope decision (see STATUS.md, 2026-08-08): the backend accepts an
    // optional truck override for the documented truck-swap-after-breakdown
    // case, but no truck-picker UI exists yet — this defaults to the Trip's
    // current truck until that override is actually wired up.
    const truckPlate =
      typeof body.truckPlate === "string" && body.truckPlate ? body.truckPlate : delivery.assigned_truck_plate;

    if (truckPlate !== delivery.assigned_truck_plate) {
      const { error: deliveryUpdateError } = await adminClient
        .from("delivery_requests")
        .update({ assigned_truck_plate: truckPlate })
        .eq("id", deliveryRequestId);

      if (deliveryUpdateError) {
        return json({ error: deliveryUpdateError.message }, 400);
      }
    }

    // Resolved fresh via devices.plate_number, not reused from the prior
    // Session — picks up both a truck swap and a fleet-level device
    // reassignment since the last Session (03B_PAUSE_AND_RESUME_TRIP.md).
    let deviceId: string | null = null;
    if (truckPlate) {
      const { data: device, error: deviceError } = await adminClient
        .from("devices")
        .select("device_id")
        .eq("plate_number", truckPlate)
        .maybeSingle();

      if (deviceError) {
        return json({ error: deviceError.message }, 400);
      }

      deviceId = device?.device_id ?? null;
    }

    if (deviceId) {
      const { data: deviceActiveSession, error: deviceActiveSessionError } = await adminClient
        .from("sessions")
        .select("session_id")
        .eq("device_id", deviceId)
        .eq("status", "Active")
        .maybeSingle();

      if (deviceActiveSessionError) {
        return json({ error: deviceActiveSessionError.message }, 400);
      }

      if (deviceActiveSession) {
        return json({ error: "This truck's device is already in an active session for a different delivery" }, 409);
      }
    }

    const { data: session, error: sessionError } = await adminClient
      .from("sessions")
      .insert({
        session_id: crypto.randomUUID(),
        delivery_request_id: delivery.id,
        driver_id: driverId,
        truck_plate: truckPlate,
        device_id: deviceId,
        start_time: new Date().toISOString(),
        status: "Active",
      })
      .select()
      .single();

    if (sessionError) {
      if (sessionError.code === "23505") {
        return json({ error: "This truck's device is already in an active session for a different delivery" }, 409);
      }
      return json({ error: sessionError.message }, 400);
    }

    return json({ ok: true, session });
  }

  if (action === "end-trip") {
    const deliveryRequestId = typeof body.deliveryRequestId === "string" ? body.deliveryRequestId : "";

    if (!deliveryRequestId) {
      return json({ error: "deliveryRequestId is required" }, 400);
    }

    const { data: delivery, error: deliveryError } = await adminClient
      .from("delivery_requests")
      .select("id, assigned_driver_id, assigned_helper_ids")
      .eq("id", deliveryRequestId)
      .single();

    if (deliveryError || !delivery) {
      return json({ error: "Delivery request not found" }, 400);
    }

    const isOwner = isHelperEndTrip
      ? ((delivery.assigned_helper_ids as string[]) || []).includes(helperId)
      : delivery.assigned_driver_id === driverId;

    if (!isOwner) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    const { data: session, error: sessionFetchError } = await adminClient
      .from("sessions")
      .select("session_id, start_time, truck_plate")
      .eq("delivery_request_id", deliveryRequestId)
      .eq("status", "Active")
      .maybeSingle();

    if (sessionFetchError) {
      return json({ error: sessionFetchError.message }, 400);
    }

    if (!session) {
      return json({ error: "No active session found for this delivery" }, 400);
    }

    const endTime = new Date();
    const sessionDuration = Math.round((endTime.getTime() - new Date(session.start_time).getTime()) / 1000);

    // Distance driven this Session, from its GPS route (05_GPS_PIPELINE.md):
    // sum of point-to-point distances between consecutive gps_logs rows,
    // chronologically. No telemetry exists yet, so this is 0 for now.
    const { data: gpsLogs, error: gpsLogsError } = await adminClient
      .from("gps_logs")
      .select("latitude, longitude")
      .eq("session_id", session.session_id)
      .order("timestamp", { ascending: true });

    if (gpsLogsError) {
      return json({ error: gpsLogsError.message }, 400);
    }

    let distanceKmDriven = 0;
    for (let i = 1; i < (gpsLogs?.length ?? 0); i++) {
      const prev = gpsLogs![i - 1];
      const curr = gpsLogs![i];
      distanceKmDriven += distanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }

    if (session.truck_plate && distanceKmDriven > 0) {
      const { data: truck, error: truckError } = await adminClient
        .from("trucks")
        .select("current_mileage")
        .eq("plate_number", session.truck_plate)
        .maybeSingle();

      if (truckError) {
        return json({ error: truckError.message }, 400);
      }

      if (truck) {
        const { error: truckUpdateError } = await adminClient
          .from("trucks")
          .update({ current_mileage: (truck.current_mileage ?? 0) + distanceKmDriven })
          .eq("plate_number", session.truck_plate);

        if (truckUpdateError) {
          return json({ error: truckUpdateError.message }, 400);
        }
      }
    }

    const { data: updatedSession, error: updateError } = await adminClient
      .from("sessions")
      .update({
        end_time: endTime.toISOString(),
        session_duration: sessionDuration,
        status: "Completed",
      })
      .eq("session_id", session.session_id)
      .select()
      .single();

    if (updateError) {
      return json({ error: updateError.message }, 400);
    }

    // The one deliberate exception to "Trip actions never touch
    // delivery_requests.status" (see 07_END_TRIP.md, DATABASE.md's
    // delivery_requests notes) — DELIVERED is an existing shipment-milestone
    // value, not a new Session-state value, so wiring End Trip to it doesn't
    // mix the two concerns the way an Active/Paused value would.
    const { error: deliveryUpdateError } = await adminClient
      .from("delivery_requests")
      .update({ status: "DELIVERED" })
      .eq("id", deliveryRequestId);

    if (deliveryUpdateError) {
      return json({ error: deliveryUpdateError.message }, 400);
    }

    // 14_RETURN_TRIP_MONITORING.md: fully automatic return-trip monitoring
    // -- the instant the delivery is DELIVERED, open a new Active Session on
    // the same device so the Pi's heartbeat-gated detection/vibration/alert
    // upload (04_DEVICE_BOOT_AND_HEARTBEAT.md) and the phone's own GPS
    // watch (once the frontend follows this Session, see DriverDeliveries.jsx)
    // both keep running for the drive back. Best-effort: End Trip's core
    // job (close the real Session, mark DELIVERED) already succeeded above,
    // so a failure here is logged, not surfaced as an End Trip error -- the
    // driver's cargo handoff isn't blocked by this monitoring convenience.
    {
      const { error: returnSessionError } = await adminClient.from("sessions").insert({
        session_id: crypto.randomUUID(),
        delivery_request_id: deliveryRequestId,
        driver_id: updatedSession?.driver_id ?? null,
        truck_plate: updatedSession?.truck_plate ?? session.truck_plate ?? null,
        device_id: updatedSession?.device_id ?? null,
        start_time: endTime.toISOString(),
        status: "Active",
        is_return_trip: true,
      });
      if (returnSessionError) {
        console.error("Failed to open return-trip session:", returnSessionError.message);
      }
    }

    return json({ ok: true, session: updatedSession, distanceKm: distanceKmDriven });
  }

  // Manual fallback for 14_RETURN_TRIP_MONITORING.md's automatic return-trip
  // Session, for the rare case the geofence never fires (driver parks just
  // outside the ~150m radius, etc.) -- a convenience, not a replacement for
  // the automatic geofence/timeout close in log-position/gps-upload/
  // start-trip. Driver-only, ownership-checked the same way as every other
  // action here.
  if (action === "end-return-trip") {
    const deliveryRequestId = typeof body.deliveryRequestId === "string" ? body.deliveryRequestId : "";

    if (!deliveryRequestId) {
      return json({ error: "deliveryRequestId is required" }, 400);
    }

    const { data: delivery, error: deliveryError } = await adminClient
      .from("delivery_requests")
      .select("id, assigned_driver_id")
      .eq("id", deliveryRequestId)
      .maybeSingle();

    if (deliveryError || !delivery || delivery.assigned_driver_id !== driverId) {
      return json({ error: "This delivery is not assigned to you" }, 403);
    }

    const { data: returnSession, error: returnSessionFetchError } = await adminClient
      .from("sessions")
      .select("session_id, start_time, truck_plate")
      .eq("delivery_request_id", deliveryRequestId)
      .eq("status", "Active")
      .eq("is_return_trip", true)
      .maybeSingle();

    if (returnSessionFetchError) {
      return json({ error: returnSessionFetchError.message }, 400);
    }

    if (!returnSession) {
      return json({ error: "No active return-trip session found for this delivery" }, 400);
    }

    await closeReturnTripSession(adminClient, returnSession);

    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
