// Supabase Edge Function: driver-trip
// Handles Driver-initiated Trip lifecycle actions (Start/Pause/Resume/End Trip
// — only start-trip is implemented so far). Authenticates the caller's own
// session (same pattern as admin-users), then uses service_role server-side
// to read/write delivery_requests/sessions/devices/trucks/driver_records past
// RLS.
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
//   grant select on public.users to service_role;
//   grant select on public.gps_logs to service_role;  -- added 2026-08-08 for Pause Trip's mileage sum

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

  if (callerRow.role !== "Driver") {
    return json({ error: "Forbidden" }, 403);
  }

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

  const driverId = driverRow.id as string;

  const body = await req.json();
  const { action } = body;

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

    // One Active trip per driver (PROJECT_CONSTRAINTS.md). Full Active-or-
    // Paused enforcement across every delivery a driver might have is Phase 9
    // (Edge Cases) scope — this covers the direct case of an already-open
    // session, which is what actually matters for Start Trip itself.
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

  return json({ error: "Unknown action" }, 400);
});
