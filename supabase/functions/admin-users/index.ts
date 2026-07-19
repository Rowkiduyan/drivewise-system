// Supabase Edge Function: admin-users
// Handles operations that require the service_role key (creating an
// account, deactivating an account, resetting another user's password).
// This key must only ever live in this function's environment secrets —
// never in client code.
//
// Deploy:   npx supabase functions deploy admin-users
// Secrets:  SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY
//           are provided automatically to every deployed Edge Function.
//           RESEND_API_KEY and RESEND_FROM_EMAIL must be set manually
//           (npx supabase secrets set ...) for credential emails to send —
//           without them, create-user/reset-password still succeed but
//           return tempPassword directly instead of emailing it.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");

const ADMIN_ROLES = ["Admin"];
const ASSIGNABLE_ROLES = ["Supervisor", "Admin", "Driver", "Helper", "Customer"];
const LOGIN_EMAIL_DOMAIN = "marveltrucking.local";

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

// Builds the local part of a generated login email from a full name:
// first-name initial + middle-name initial(s), if any + surname, e.g.
// "John Michael Doe" -> "jmdoe", "John Doe" -> "jdoe". A single-word name
// (no surname) is used as-is.
function loginEmailLocalPart(fullName: string) {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return "user";
  }

  if (tokens.length === 1) {
    return tokens[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  const first = tokens[0];
  const surname = tokens[tokens.length - 1];
  const middles = tokens.slice(1, -1);
  const initials = [first[0], ...middles.map((middle) => middle[0])].join("");

  return `${initials}${surname}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function nextLoginEmail(adminClient: ReturnType<typeof createClient>, fullName: string) {
  const localPrefix = loginEmailLocalPart(fullName);

  const { data, error } = await adminClient
    .from("users")
    .select("login_email")
    .like("login_email", `${localPrefix}%@${LOGIN_EMAIL_DOMAIN}`)
    .order("login_email", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const lastEmail = data?.[0]?.login_email as string | undefined;
  const lastNumber = lastEmail
    ? Number.parseInt(lastEmail.slice(localPrefix.length, lastEmail.indexOf("@")), 10) || 0
    : 0;

  return `${localPrefix}${String(lastNumber + 1).padStart(2, "0")}@${LOGIN_EMAIL_DOMAIN}`;
}

// Sends the login email + temp password to the account's contact email via
// Resend. Returns { sent: false, error } instead of throwing so a delivery
// failure never rolls back an already-created account or password reset —
// the caller falls back to returning the password directly in that case.
async function sendCredentialsEmail(to: string, loginEmail: string, tempPassword: string, heading: string) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return { sent: false, error: "Email delivery is not configured (missing RESEND_API_KEY/RESEND_FROM_EMAIL)." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject: "Your DriveWise account credentials",
      html: `
        <p>${heading}</p>
        <p><strong>Login email:</strong> ${loginEmail}</p>
        <p><strong>Temporary password:</strong> ${tempPassword}</p>
        <p>Sign in at the DriveWise login page with these credentials, then change your password.</p>
      `,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    return { sent: false, error: message || `Resend responded with ${response.status}` };
  }

  return { sent: true as const };
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
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";

    if (!fullName || !email || !ASSIGNABLE_ROLES.includes(role)) {
      return json({ error: "A valid name, email, and role are required" }, 400);
    }

    const tempPassword = generateTempPassword();
    const loginEmail = await nextLoginEmail(adminClient, fullName);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: loginEmail,
      password: tempPassword,
      email_confirm: true,
    });

    if (createError) {
      return json({ error: createError.message }, 400);
    }

    const { error: insertError } = await adminClient.from("users").insert({
      id: created.user.id,
      full_name: fullName,
      role,
      email,
      login_email: loginEmail,
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

    const emailResult = await sendCredentialsEmail(
      email,
      loginEmail,
      tempPassword,
      `A DriveWise account was created for you as ${role}.`,
    );

    return json({
      ok: true,
      user: { id: created.user.id, full_name: fullName, role, email, login_email: loginEmail },
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
      tempPassword: emailResult.sent ? undefined : tempPassword,
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
    const { data: userRow, error: userRowError } = await adminClient
      .from("users")
      .select("email, login_email")
      .eq("id", userId)
      .single();

    if (userRowError || !userRow) {
      return json({ error: userRowError?.message || "User not found" }, 400);
    }

    const tempPassword = generateTempPassword();

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (error) {
      return json({ error: error.message }, 400);
    }

    const emailResult = await sendCredentialsEmail(
      userRow.email,
      userRow.login_email,
      tempPassword,
      "Your DriveWise password has been reset.",
    );

    return json({
      ok: true,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
      tempPassword: emailResult.sent ? undefined : tempPassword,
    });
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
