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

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
      .select("session_id")
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

    return json({ ok: true, session: updatedSession, distanceKm: distanceKmDriven });
  }

  return json({ error: "Unknown action" }, 400);
});
