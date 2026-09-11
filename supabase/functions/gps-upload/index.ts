// Supabase Edge Function: gps-upload
// Phase 5 (05_GPS_PIPELINE.md). Called by the Raspberry Pi every second while
// its Trip is in progress (Active or Paused) â€” not by any browser client.
// The Pi authenticates itself with device_id/device_secret (its only
// credentials; it never knows session_id, delivery_request_id, driver_id, or
// truck_plate â€” see 00_IMPLEMENTATION_RULES.md) and sends a raw lat/lon
// reading. The backend alone resolves which session/delivery_request the
// reading belongs to.
//
// Deploy:   npx supabase functions deploy gps-upload
// Secrets:  SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY
//           are provided automatically to every deployed Edge Function.
//
// Required service_role grants (SUPABASE_GOTCHAS.md #2/#7) -- confirmed
// present as of 2026-08-11 (see DATABASE.md) for select on devices/sessions/
// delivery_requests and select/insert/update/delete on gps_logs; `update` on
// sessions and select/update on trucks were added 2026-09-11
// (14_RETURN_TRIP_MONITORING.md's return-trip auto-close + mileage write,
// mirroring driver-trip's own grants for the same tables):
//   grant select on public.devices to service_role;
//   grant select, update on public.sessions to service_role;
//   grant select on public.delivery_requests to service_role;
//   grant select, insert, update, delete on public.gps_logs to service_role;
//   grant select, update on public.trucks to service_role;

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ENDED_STATUSES = ["DELIVERED", "COMPLETED", "CANCELLED"];

// Phase 14 (14_RETURN_TRIP_MONITORING.md) -- same constants/geofence/timeout
// rule driver-trip's log-position applies to the phone's GPS path, mirrored
// here for the Pi's independent path. WAREHOUSE_COORDS duplicated from
// lib/suggestedRoute.js (server code can't import the frontend's lib/ tree)
// -- same per-Edge-Function duplication convention already used for
// distanceKm/haversine below.
const WAREHOUSE_COORDS = { lat: 14.57147, lng: 121.08762 };
const RETURN_TRIP_GEOFENCE_METERS = 150;
const RETURN_TRIP_MAX_MS = 3 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Haversine distance in kilometers -- duplicated from driver-trip/index.ts,
// same per-Edge-Function convention as every other small pure helper in
// this codebase (each function is deployed independently, no shared lib/
// tree across supabase/functions/*).
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Must match admin-users' register-device hashing exactly â€” plain
// lowercase-hex SHA-256, no salt (same format the 2026-08-08 backfill used).
async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.device_id === "string" ? body.device_id : "";
  const deviceSecret = typeof body.device_secret === "string" ? body.device_secret : "";
  const latitude = typeof body.latitude === "number" ? body.latitude : null;
  const longitude = typeof body.longitude === "number" ? body.longitude : null;
  const timestamp = typeof body.timestamp === "string" ? body.timestamp : "";

  if (!deviceId || !deviceSecret || latitude === null || longitude === null || !timestamp) {
    return json(
      { error: "device_id, device_secret, latitude, longitude, and timestamp are required" },
      400,
    );
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: device, error: deviceError } = await adminClient
    .from("devices")
    .select("device_id, device_secret_hash")
    .eq("device_id", deviceId)
    .maybeSingle();

  // Same generic error for "no such device" and "wrong secret" â€” never
  // reveal which one it was, the same way a password login wouldn't.
  if (deviceError || !device || !device.device_secret_hash) {
    return json({ error: "Authentication failed" }, 401);
  }

  const incomingHash = await sha256Hex(deviceSecret);
  if (incomingHash !== device.device_secret_hash) {
    return json({ error: "Authentication failed" }, 401);
  }

  // At most one Trip in progress per device â€” the most recent session row
  // tells us whether it's Active, Paused (Completed but Trip not ended), or
  // there's no Trip in progress at all.
  const { data: latestSession, error: sessionError } = await adminClient
    .from("sessions")
    .select("session_id, status, delivery_request_id, is_return_trip, start_time, truck_plate")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    return json({ error: sessionError.message }, 400);
  }

  if (!latestSession || !latestSession.delivery_request_id) {
    return json({ error: "No trip in progress for this device" }, 400);
  }

  let sessionIdToStore: string | null = null;

  if (latestSession.status === "Active") {
    sessionIdToStore = latestSession.session_id;
  } else {
    // Session is closed (Paused). Only keep uploading if the Trip itself
    // hasn't ended yet.
    const { data: delivery, error: deliveryError } = await adminClient
      .from("delivery_requests")
      .select("status")
      .eq("id", latestSession.delivery_request_id)
      .maybeSingle();

    if (deliveryError || !delivery) {
      return json({ error: "No trip in progress for this device" }, 400);
    }

    if (ENDED_STATUSES.includes(delivery.status)) {
      return json({ error: "No trip in progress for this device" }, 400);
    }

    sessionIdToStore = null;
  }

  const { error: insertError } = await adminClient.from("gps_logs").insert({
    session_id: sessionIdToStore,
    delivery_request_id: latestSession.delivery_request_id,
    latitude,
    longitude,
    timestamp,
  });

  if (insertError) {
    return json({ error: insertError.message }, 400);
  }

  // 14_RETURN_TRIP_MONITORING.md: same auto-close rule driver-trip's
  // log-position applies to the phone's GPS path, mirrored here since
  // either can be the live GPS source for the return leg. Best-effort --
  // never turns a successful upload into an error response.
  if (latestSession.status === "Active" && latestSession.is_return_trip) {
    const withinGeofence =
      distanceKm(latitude, longitude, WAREHOUSE_COORDS.lat, WAREHOUSE_COORDS.lng) * 1000 <=
      RETURN_TRIP_GEOFENCE_METERS;
    const timedOut =
      Date.now() - new Date(latestSession.start_time).getTime() > RETURN_TRIP_MAX_MS;

    if (withinGeofence || timedOut) {
      const endTime = new Date();
      const sessionDuration = Math.round(
        (endTime.getTime() - new Date(latestSession.start_time).getTime()) / 1000,
      );

      const { data: gpsLogs } = await adminClient
        .from("gps_logs")
        .select("latitude, longitude")
        .eq("session_id", latestSession.session_id)
        .order("timestamp", { ascending: true });

      let distanceKmDriven = 0;
      for (let i = 1; i < (gpsLogs?.length ?? 0); i++) {
        const prev = gpsLogs![i - 1];
        const curr = gpsLogs![i];
        distanceKmDriven += distanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      }

      if (latestSession.truck_plate && distanceKmDriven > 0) {
        const { data: truck } = await adminClient
          .from("trucks")
          .select("current_mileage")
          .eq("plate_number", latestSession.truck_plate)
          .maybeSingle();

        if (truck) {
          await adminClient
            .from("trucks")
            .update({ current_mileage: (truck.current_mileage ?? 0) + distanceKmDriven })
            .eq("plate_number", latestSession.truck_plate);
        }
      }

      await adminClient
        .from("sessions")
        .update({
          end_time: endTime.toISOString(),
          session_duration: sessionDuration,
          status: "Completed",
        })
        .eq("session_id", latestSession.session_id);
    }
  }

  return json({ ok: true });
});
