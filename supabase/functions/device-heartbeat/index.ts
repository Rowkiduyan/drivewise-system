// Supabase Edge Function: device-heartbeat
// Phase 4 (04_DEVICE_BOOT_AND_HEARTBEAT.md). Called by the Raspberry Pi every
// 10 seconds â€” not by any browser client. The Pi authenticates itself with
// device_id/device_secret (its only credentials; it never knows session_id,
// driver_id, or truck_plate â€” see 00_IMPLEMENTATION_RULES.md), and the only
// thing this function ever sends back is { session_active }. This is a
// status readback, not a command channel â€” see 04's "Raspberry Pi Shutdown"
// section for why that distinction matters.
//
// Deploy:   npx supabase functions deploy device-heartbeat
// Secrets:  SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY
//           are provided automatically to every deployed Edge Function.
//
// Required service_role grants (SUPABASE_GOTCHAS.md #2/#7) â€” confirm these
// exist before testing:
//   grant select, update on public.devices to service_role;
//   grant select on public.sessions to service_role;

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  if (!deviceId || !deviceSecret) {
    return json({ error: "device_id and device_secret are required" }, 400);
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

  const { error: pingError } = await adminClient
    .from("devices")
    .update({ last_ping: new Date().toISOString() })
    .eq("device_id", deviceId);

  if (pingError) {
    return json({ error: pingError.message }, 400);
  }

  const { data: activeSession, error: sessionError } = await adminClient
    .from("sessions")
    .select("session_id")
    .eq("device_id", deviceId)
    .eq("status", "Active")
    .maybeSingle();

  if (sessionError) {
    return json({ error: sessionError.message }, 400);
  }

  return json({ session_active: Boolean(activeSession) });
});
