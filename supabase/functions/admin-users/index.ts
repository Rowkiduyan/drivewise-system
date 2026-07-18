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

  return json({ error: "Unknown action" }, 400);
});
