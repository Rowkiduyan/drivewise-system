// Supabase Edge Function: admin-users
// Handles operations that require the service_role key (creating an
// account, deactivating an account, resetting another user's password).
// This key must only ever live in this function's environment secrets —
// never in client code.
//
// Deploy:   npx supabase functions deploy admin-users
// Secrets:  none to set manually — SUPABASE_URL, SUPABASE_ANON_KEY, and
//           SUPABASE_SERVICE_ROLE_KEY are provided automatically to every
//           deployed Edge Function.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ADMIN_ROLES = ["Admin"];
const ASSIGNABLE_ROLES = ["Supervisor", "Admin", "Driver", "Helper", "Customer"];

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

function generateTempPassword() {
  const buffer = new Uint32Array(4);
  crypto.getRandomValues(buffer);
  return `Temp${Array.from(buffer)
    .map((value) => value.toString(36))
    .join("")}!`;
}

function deriveNameFromEmail(email: string) {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) {
    return "New User";
  }
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(" ");
}

function splitFullName(fullName: string) {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return {
    firstName: firstName || fullName,
    lastName: rest.join(" "),
  };
}

async function nextDriverRecordId(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from("driver_records")
    .select("id")
    .like("id", "D%")
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const lastId = data?.[0]?.id as string | undefined;
  const lastNumber = lastId ? Number.parseInt(lastId.slice(1), 10) || 0 : 0;

  return `D${String(lastNumber + 1).padStart(3, "0")}`;
}

// Creates a driver_records row for authId if one doesn't already exist.
// Reused by create-user (new Driver accounts) and ensure-driver-record
// (an existing account promoted to Driver later) so repeatedly toggling a
// user's role to Driver never produces more than one row per auth_id.
async function ensureDriverRecord(
  adminClient: ReturnType<typeof createClient>,
  authId: string,
  fullName: string,
  email: string,
) {
  const { data: existing, error: existingError } = await adminClient
    .from("driver_records")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return { id: existing.id as string, created: false };
  }

  const driverId = await nextDriverRecordId(adminClient);
  const { firstName, lastName } = splitFullName(fullName);

  const { error: insertError } = await adminClient.from("driver_records").insert({
    id: driverId,
    auth_id: authId,
    first_name: firstName,
    middle_name: null,
    last_name: lastName,
    email,
    position: "Driver",
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { id: driverId, created: true };
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

  const { data: callerData, error: callerError } =
    await callerClient.auth.getUser(callerToken);

  if (callerError || !callerData.user) {
    return json({ error: "Invalid session" }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerRow, error: callerRowError } = await adminClient
    .from("users")
    .select("role")
    .eq("id", callerData.user.id)
    .single();

  if (callerRowError || !callerRow || !ADMIN_ROLES.includes(callerRow.role)) {
    return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json();
  const { action } = body;

  if (action === "create-user") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";

    if (!email || !ASSIGNABLE_ROLES.includes(role)) {
      return json({ error: "A valid email and role are required" }, 400);
    }

    const tempPassword = generateTempPassword();

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createError) {
      return json({ error: createError.message }, 400);
    }

    const fullName = deriveNameFromEmail(email);

    const { error: insertError } = await adminClient.from("users").insert({
      id: created.user.id,
      full_name: fullName,
      role,
      email,
    });

    if (insertError) {
      // Roll back the auth user so we don't leave an orphaned account with no users row.
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: insertError.message }, 400);
    }

    if (role === "Driver") {
      try {
        await ensureDriverRecord(adminClient, created.user.id, fullName, email);
      } catch (driverError) {
        // Roll back the users row and auth user so we don't leave a Driver
        // account with no matching driver_records row.
        await adminClient.from("users").delete().eq("id", created.user.id);
        await adminClient.auth.admin.deleteUser(created.user.id);
        const message = driverError instanceof Error ? driverError.message : "Unable to create driver record";
        return json({ error: message }, 400);
      }
    }

    return json({
      ok: true,
      user: { id: created.user.id, full_name: fullName, role, email },
      tempPassword,
    });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";

  if (!userId) {
    return json({ error: "userId is required" }, 400);
  }

  if (action === "deactivate") {
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: "876000h", // effectively indefinite (~100 years)
    });

    if (error) {
      return json({ error: error.message }, 400);
    }

    return json({ ok: true });
  }

  if (action === "reset-password") {
    const tempPassword = generateTempPassword();

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (error) {
      return json({ error: error.message }, 400);
    }

    return json({ ok: true, tempPassword });
  }

  if (action === "ensure-driver-record") {
    const { data: userRow, error: userRowError } = await adminClient
      .from("users")
      .select("full_name, email")
      .eq("id", userId)
      .single();

    if (userRowError || !userRow) {
      return json({ error: userRowError?.message || "User not found" }, 400);
    }

    try {
      const result = await ensureDriverRecord(adminClient, userId, userRow.full_name, userRow.email);
      return json({ ok: true, ...result });
    } catch (driverError) {
      const message = driverError instanceof Error ? driverError.message : "Unable to create driver record";
      return json({ error: message }, 400);
    }
  }

  return json({ error: "Unknown action" }, 400);
});
