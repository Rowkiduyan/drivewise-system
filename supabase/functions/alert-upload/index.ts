// Supabase Edge Function: alert-upload
// Phase 6 (06_DROWSINESS_ALERT_PIPELINE.md). Called by the Raspberry Pi
// immediately whenever a drowsiness detection threshold is reached. The Pi
// authenticates itself with device_id/device_secret (its only credentials;
// it never knows session_id, delivery_request_id, driver_id, or
// truck_plate â€” see 00_IMPLEMENTATION_RULES.md) and sends event_type +
// duration. The backend alone resolves which session the alert belongs to.
//
// Deploy:   npx supabase functions deploy alert-upload
// Secrets:  SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY
//           are provided automatically to every deployed Edge Function.
//
// Required service_role grant (SUPABASE_GOTCHAS.md #2/#7) â€” run before
// deploying, see DATABASE.md's alerts entry:
//   grant select, insert on public.alerts to service_role;

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_EVENT_TYPES = [
  "prolonged_eye_closure",
  "pattern_eye_closure_yawn",
  "pattern_repeated_eye_closure",
  "face_not_detected",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
  const eventType = typeof body.event_type === "string" ? body.event_type : "";
  const duration = typeof body.duration === "number" ? body.duration : null;

  if (!deviceId || !deviceSecret || !eventType || duration === null) {
    return json(
      { error: "device_id, device_secret, event_type, and duration are required" },
      400,
    );
  }

  if (!VALID_EVENT_TYPES.includes(eventType)) {
    return json({ error: "Invalid event_type" }, 400);
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

  // Only active sessions may generate alerts (06_DROWSINESS_ALERT_PIPELINE.md).
  const { data: activeSession, error: sessionError } = await adminClient
    .from("sessions")
    .select("session_id")
    .eq("device_id", deviceId)
    .eq("status", "Active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    return json({ error: sessionError.message }, 400);
  }

  if (!activeSession) {
    return json({ error: "No active session found for this device" }, 400);
  }

  const { error: insertError } = await adminClient.from("alerts").insert({
    session_id: activeSession.session_id,
    event_type: eventType,
    duration,
  });

  if (insertError) {
    return json({ error: insertError.message }, 400);
  }

  return json({ ok: true });
});
