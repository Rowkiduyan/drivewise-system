// Supabase Edge Function: admin-users
// Handles operations that require the service_role key (creating an
// account, deactivating an account, resetting another user's password,
// reading/writing per-role profile tables).
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
const CREW_VIEW_ROLES = ["Admin", "Supervisor"];
const ASSIGNABLE_ROLES = ["Supervisor", "Admin", "Driver", "Helper", "Customer"];
const LOGIN_EMAIL_DOMAIN = "marveltrucking.local";

// Profile pictures are stored in this Storage bucket, keyed by the user's
// auth id + a fixed extension (client always sends JPEG — see
// src/lib/profilePicture.js) so re-uploads overwrite the same object
// instead of accumulating orphaned files. Bucket must exist and be public
// (see DATABASE.md "Storage buckets") — service_role bypasses object RLS
// the same way it bypasses table RLS, but the bucket itself has to be
// created first.
const PROFILE_PICTURE_BUCKET = "driver-profile-pics";
// A cropped 256x256 JPEG is normally well under 100KB — this cap is a
// server-side backstop against a caller bypassing the client-side crop
// (e.g. calling the Edge Function directly) and uploading something much
// larger, not a limit anyone should hit through the normal upload flow.
const MAX_PROFILE_PICTURE_BYTES = 512 * 1024;
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Every role has its own profile table (see DATABASE.md "Per-role profile
// tables"). ROLE_TABLE/ROLE_PREFIX are the single source of truth other
// code in this file uses to find the right table and id convention.
const ROLE_TABLE: Record<string, string> = {
  Driver: "driver_records",
  Supervisor: "supervisor_records",
  Admin: "admin_records",
  Helper: "helper_records",
  Customer: "customer_records",
};

const ROLE_PREFIX: Record<string, string> = {
  Driver: "D",
  Supervisor: "S",
  Admin: "A",
  Helper: "H",
  Customer: "C",
};

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

// Builds the local part of a generated login email from structured name
// parts: first-name initial + middle-name initial(s), if any + surname,
// e.g. firstName "John", middleName "Michael", lastName "Doe" -> "jmdoe".
function loginEmailLocalPart(firstName: string, middleName: string | null | undefined, lastName: string) {
  const middleInitials = (middleName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0]);

  const raw = `${firstName[0] || ""}${middleInitials.join("")}${lastName}`;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned || "user";
}

async function nextLoginEmail(adminClient: ReturnType<typeof createClient>, localPrefix: string) {
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

type ProfileInput = {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  position?: string | null;
  clientName?: string | null;
  email: string;
  contactNumber?: string | null;
  birthdate?: string | null;
  address?: { street?: string; city?: string; province?: string } | null;
};

function normalizeProfile(body: Record<string, unknown>): ProfileInput {
  const address = body.address && typeof body.address === "object"
    ? body.address as { street?: string; city?: string; province?: string }
    : null;

  return {
    firstName: typeof body.firstName === "string" ? body.firstName.trim() : "",
    middleName: typeof body.middleName === "string" ? body.middleName.trim() || null : null,
    lastName: typeof body.lastName === "string" ? body.lastName.trim() : "",
    position: typeof body.position === "string" ? body.position.trim() || null : null,
    clientName: typeof body.clientName === "string" ? body.clientName.trim() || null : null,
    email: typeof body.email === "string" ? body.email.trim().toLowerCase() : "",
    contactNumber: typeof body.contactNumber === "string" ? body.contactNumber.trim() || null : null,
    birthdate: typeof body.birthdate === "string" ? body.birthdate || null : null,
    address,
  };
}

// client_name only exists on customer_records — only include it for that
// role so inserts/updates against the other four tables don't reference a
// nonexistent column.
function profileRow(role: string, profile: ProfileInput) {
  return {
    first_name: profile.firstName,
    middle_name: profile.middleName,
    last_name: profile.lastName,
    position: profile.position,
    email: profile.email,
    contact_number: profile.contactNumber,
    birthdate: profile.birthdate,
    address: profile.address,
    ...(role === "Customer" ? { client_name: profile.clientName } : {}),
  };
}

async function nextRecordId(adminClient: ReturnType<typeof createClient>, table: string, prefix: string) {
  const { data, error } = await adminClient
    .from(table)
    .select("id")
    .like("id", `${prefix}%`)
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const lastId = data?.[0]?.id as string | undefined;
  const lastNumber = lastId ? Number.parseInt(lastId.slice(prefix.length), 10) || 0 : 0;

  return `${prefix}${String(lastNumber + 1).padStart(3, "0")}`;
}

// Creates or updates the auth_id's row in the *_records table matching
// `role`. Reused by create-user (initial creation) and update-profile
// (edits, including a role change moving someone into a table they've
// never had a row in before). Never touches a *different* role's table —
// demoting/promoting a user leaves their old role's row as-is, same as
// the original driver-only behavior this generalizes.
async function upsertRoleRecord(
  adminClient: ReturnType<typeof createClient>,
  role: string,
  authId: string,
  profile: ProfileInput,
) {
  const table = ROLE_TABLE[role];
  const prefix = ROLE_PREFIX[role];

  const { data: existing, error: existingError } = await adminClient
    .from(table)
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    const { error: updateError } = await adminClient
      .from(table)
      .update(profileRow(role, profile))
      .eq("auth_id", authId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { id: existing.id as string, created: false };
  }

  const id = await nextRecordId(adminClient, table, prefix);
  const { error: insertError } = await adminClient.from(table).insert({
    id,
    auth_id: authId,
    ...profileRow(role, profile),
    profile_picture: null,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { id, created: true };
}

async function findContactEmail(adminClient: ReturnType<typeof createClient>, role: string, authId: string) {
  const table = ROLE_TABLE[role];
  const { data, error } = await adminClient
    .from(table)
    .select("email")
    .eq("auth_id", authId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.email as string | undefined;
}

// Shared by list-users (all five roles, Admin-only) and list-crew
// (Driver/Helper only, Admin or Supervisor) — merges `users` rows with
// their matching *_records row by auth_id, since the client can't read
// the *_records tables directly (service_role only, see DATABASE.md).
async function listUsersWithProfiles(adminClient: ReturnType<typeof createClient>, roles?: string[]) {
  let usersQuery = adminClient.from("users").select("id, role, login_email, created_at, deactivated_at");
  if (roles) {
    usersQuery = usersQuery.in("role", roles);
  }

  const { data: usersRows, error: usersError } = await usersQuery;
  if (usersError) {
    throw new Error(usersError.message);
  }

  const tables = roles ? roles.map((role) => ROLE_TABLE[role]) : Object.values(ROLE_TABLE);
  const profilesByAuthId = new Map<string, Record<string, unknown>>();

  for (const table of tables) {
    const { data: rows, error: rowsError } = await adminClient.from(table).select("*");
    if (rowsError) {
      throw new Error(rowsError.message);
    }
    for (const row of rows || []) {
      profilesByAuthId.set(row.auth_id as string, row);
    }
  }

  return (usersRows || []).map((user) => {
    const profile = profilesByAuthId.get(user.id as string) || {};
    return {
      id: user.id,
      role: user.role,
      login_email: user.login_email,
      created_at: user.created_at,
      deactivated_at: user.deactivated_at ?? null,
      record_id: profile.id ?? null,
      first_name: profile.first_name ?? null,
      middle_name: profile.middle_name ?? null,
      last_name: profile.last_name ?? null,
      position: profile.position ?? null,
      client_name: profile.client_name ?? null,
      email: profile.email ?? null,
      contact_number: profile.contact_number ?? null,
      birthdate: profile.birthdate ?? null,
      address: profile.address ?? null,
      profile_picture: profile.profile_picture ?? null,
    };
  });
}

// Attaches each crew member's assigned client names (crew_client_specialties
// joined to customer_records.client_name) as `client_specialties` — fetched
// once for the whole roster rather than per-row, since list-crew renders a
// full table (see SupDeliveryCrew.jsx).
async function attachClientSpecialties(
  adminClient: ReturnType<typeof createClient>,
  crew: Array<Record<string, unknown>>,
) {
  const crewIds = crew.map((member) => member.id as string);
  if (crewIds.length === 0) {
    return crew.map((member) => ({ ...member, client_specialties: [] as string[] }));
  }

  const { data: links, error: linksError } = await adminClient
    .from("crew_client_specialties")
    .select("crew_auth_id, client_auth_id")
    .in("crew_auth_id", crewIds);

  if (linksError) {
    throw new Error(linksError.message);
  }

  const clientIds = Array.from(new Set((links || []).map((link) => link.client_auth_id as string)));
  const clientNameById = new Map<string, string>();

  if (clientIds.length > 0) {
    const { data: records, error: recordsError } = await adminClient
      .from("customer_records")
      .select("auth_id, client_name")
      .in("auth_id", clientIds);

    if (recordsError) {
      throw new Error(recordsError.message);
    }

    for (const record of records || []) {
      if (record.client_name) {
        clientNameById.set(record.auth_id as string, record.client_name as string);
      }
    }
  }

  const namesByCrewId = new Map<string, string[]>();
  for (const link of links || []) {
    const name = clientNameById.get(link.client_auth_id as string);
    if (!name) {
      continue;
    }
    const crewId = link.crew_auth_id as string;
    const existing = namesByCrewId.get(crewId) || [];
    existing.push(name);
    namesByCrewId.set(crewId, existing);
  }

  return crew.map((member) => ({
    ...member,
    client_specialties: namesByCrewId.get(member.id as string) || [],
  }));
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

  if (callerRowError || !callerRow) {
    return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json();
  const { action } = body;

  // get-own-profile lets any signed-in user read their own row — merges
  // `users` with the caller's own `*_records` row by auth_id, the same way
  // listUsersWithProfiles does for the admin listing pages. Not gated on
  // role since everyone is allowed to see their own profile.
  if (action === "get-own-profile") {
    const authId = callerData.user.id;
    const role = callerRow.role;
    const table = ROLE_TABLE[role];

    const { data: userRow, error: userRowError } = await adminClient
      .from("users")
      .select("login_email, created_at")
      .eq("id", authId)
      .single();

    if (userRowError || !userRow) {
      return json({ error: userRowError?.message || "User not found" }, 400);
    }

    const { data: recordRow, error: recordError } = table
      ? await adminClient.from(table).select("*").eq("auth_id", authId).maybeSingle()
      : { data: null, error: null };

    if (recordError) {
      return json({ error: recordError.message }, 400);
    }

    return json({
      ok: true,
      profile: {
        id: authId,
        role,
        login_email: userRow.login_email,
        first_name: recordRow?.first_name ?? null,
        middle_name: recordRow?.middle_name ?? null,
        last_name: recordRow?.last_name ?? null,
        position: recordRow?.position ?? null,
        email: recordRow?.email ?? null,
        contact_number: recordRow?.contact_number ?? null,
        birthdate: recordRow?.birthdate ?? null,
        address: recordRow?.address ?? null,
        profile_picture: recordRow?.profile_picture ?? null,
      },
    });
  }

  // list-crew is the one action Supervisors (not just Admin) can call —
  // gated separately so it doesn't fall under the blanket Admin-only
  // check below.
  if (action === "list-crew") {
    if (!CREW_VIEW_ROLES.includes(callerRow.role)) {
      return json({ error: "Forbidden" }, 403);
    }

    try {
      const crew = await listUsersWithProfiles(adminClient, ["Driver", "Helper"]);
      const crewWithSpecialties = await attachClientSpecialties(adminClient, crew);
      return json({ ok: true, crew: crewWithSpecialties });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to list crew";
      return json({ error: message }, 400);
    }
  }

  // Client-specialty actions (list-clients, list-crew-clients,
  // add-crew-client, remove-crew-client) back SupCrewProfile.jsx's "Client
  // Specialties" section. "Clients" here are Customer-role users, named by
  // customer_records.client_name — see DATABASE.md "crew_client_specialties".
  // Same Admin-or-Supervisor gate as list-crew, since Supervisors manage
  // this from the crew profile page.
  const CLIENT_SPECIALTY_ACTIONS = ["list-clients", "list-crew-clients", "add-crew-client", "remove-crew-client"];
  if (CLIENT_SPECIALTY_ACTIONS.includes(action)) {
    if (!CREW_VIEW_ROLES.includes(callerRow.role)) {
      return json({ error: "Forbidden" }, 403);
    }

    if (action === "list-clients") {
      const { data, error } = await adminClient
        .from("customer_records")
        .select("auth_id, client_name")
        .not("client_name", "is", null)
        .order("client_name", { ascending: true });

      if (error) {
        return json({ error: error.message }, 400);
      }

      const clients = (data || []).map((row) => ({ id: row.auth_id, name: row.client_name }));
      return json({ ok: true, clients });
    }

    if (action === "list-crew-clients") {
      const authId = typeof body.authId === "string" ? body.authId : "";
      if (!authId) {
        return json({ error: "authId is required" }, 400);
      }

      const { data: links, error: linksError } = await adminClient
        .from("crew_client_specialties")
        .select("client_auth_id")
        .eq("crew_auth_id", authId);

      if (linksError) {
        return json({ error: linksError.message }, 400);
      }

      const clientIds = (links || []).map((row) => row.client_auth_id as string);
      if (clientIds.length === 0) {
        return json({ ok: true, clients: [] });
      }

      const { data: records, error: recordsError } = await adminClient
        .from("customer_records")
        .select("auth_id, client_name")
        .in("auth_id", clientIds);

      if (recordsError) {
        return json({ error: recordsError.message }, 400);
      }

      const clients = (records || []).map((row) => ({ id: row.auth_id, name: row.client_name }));
      return json({ ok: true, clients });
    }

    const authId = typeof body.authId === "string" ? body.authId : "";
    const clientId = typeof body.clientId === "string" ? body.clientId : "";

    if (!authId || !clientId) {
      return json({ error: "authId and clientId are required" }, 400);
    }

    if (action === "add-crew-client") {
      const { error } = await adminClient
        .from("crew_client_specialties")
        .upsert(
          { crew_auth_id: authId, client_auth_id: clientId },
          { onConflict: "crew_auth_id,client_auth_id" },
        );

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json({ ok: true });
    }

    if (action === "remove-crew-client") {
      const { error } = await adminClient
        .from("crew_client_specialties")
        .delete()
        .eq("crew_auth_id", authId)
        .eq("client_auth_id", clientId);

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json({ ok: true });
    }
  }

  // Driver deliveries: resolve the delivery_requests assigned to the caller
  // with the crew, customer, truck, and quotation details a Driver client
  // can't read directly (the *_records tables, delivery_quotations, and the
  // customer's display name are all service_role-only / not readable by a
  // Driver session — see DATABASE.md and SUPABASE_GOTCHAS.md #8). Both
  // actions look the caller's D00x record id up server-side from
  // driver_records, so the client never sends its own crew id.
  //
  // Status updates go through update-driver-delivery (service_role) rather
  // than a direct client UPDATE, so no RLS policy or column-guard trigger is
  // needed on delivery_requests for Drivers — the transition table below is
  // the guard, and it only allows the forward steps the driver UI performs.
  if (callerRow.role === "Driver") {
    const { data: driverRecord, error: driverRecordError } = await adminClient
      .from("driver_records")
      .select("id, first_name, middle_name, last_name, contact_number")
      .eq("auth_id", callerData.user.id)
      .maybeSingle();

    if (driverRecordError || !driverRecord) {
      return json({ error: "Unable to find your driver profile" }, 400);
    }

    const DRIVER_STATUS_TRANSITIONS: Record<string, string[]> = {
      ASSIGNED: ["OUT_FOR_PICKUP"],
      OUT_FOR_PICKUP: ["OUT_FOR_DROPOFF"],
      ARRIVED_PICKUP: ["OUT_FOR_DROPOFF"],
      OUT_FOR_DROPOFF: ["DELIVERED"],
      ARRIVED_DROPOFF: ["DELIVERED"],
    };

    const formatCrewName = (rec: Record<string, unknown>) =>
      [rec.first_name, rec.middle_name, rec.last_name].filter(Boolean).join(" ").trim();

    if (action === "get-driver-deliveries") {
      const { data: rows, error: rowsError } = await adminClient
        .from("delivery_requests")
        .select("*")
        .eq("assigned_driver_id", driverRecord.id as string)
        .order("pickup_date", { ascending: true });

      if (rowsError) {
        return json({ error: rowsError.message }, 400);
      }

      const deliveries: Array<Record<string, unknown>> = [];
      const rowsList = rows || [];

      const customerAuthIds = Array.from(new Set(rowsList.map((r) => r.customer_auth_id as string)));
      const customerNameById = new Map<string, string>();
      if (customerAuthIds.length > 0) {
        const { data: customers } = await adminClient
          .from("customer_records")
          .select("auth_id, client_name, first_name, last_name")
          .in("auth_id", customerAuthIds);
        for (const c of customers || []) {
          const clientName = c.client_name as string | null;
          const personalName = [c.first_name, c.last_name].filter(Boolean).join(" ");
          customerNameById.set(c.auth_id as string, clientName || personalName || "Client");
        }
      }

      const helperIds = Array.from(new Set(rowsList.flatMap((r) => (r.assigned_helper_ids as string[]) || [])));
      const helperById = new Map<string, Record<string, unknown>>();
      if (helperIds.length > 0) {
        const { data: helpers } = await adminClient
          .from("helper_records")
          .select("id, first_name, middle_name, last_name, contact_number")
          .in("id", helperIds);
        for (const h of helpers || []) helperById.set(h.id as string, h);
      }

      const plateNumbers = Array.from(new Set(rowsList.map((r) => r.assigned_truck_plate as string).filter(Boolean)));
      const truckByPlate = new Map<string, Record<string, unknown>>();
      if (plateNumbers.length > 0) {
        const { data: trucks } = await adminClient
          .from("trucks")
          .select("plate_number, truck_type, max_capacity, brand, model")
          .in("plate_number", plateNumbers);
        for (const t of trucks || []) truckByPlate.set(t.plate_number as string, t);
      }

      const deliveryIds = rowsList.map((r) => r.id as string);
      const quotationByDelivery = new Map<string, { amount: number }>();
      if (deliveryIds.length > 0) {
        // ordered ascending so the last row per delivery is the latest quotation
        const { data: quotations } = await adminClient
          .from("delivery_quotations")
          .select("delivery_id, amount, created_at")
          .in("delivery_id", deliveryIds)
          .order("created_at", { ascending: true });
        for (const q of quotations || []) {
          quotationByDelivery.set(q.delivery_id as string, { amount: Number(q.amount) });
        }
      }

      for (const r of rowsList) {
        const helpers = ((r.assigned_helper_ids as string[]) || []).map((id) => {
          const h = helperById.get(id);
          return h ? { id, name: formatCrewName(h) || "Helper", position: h.position ?? "" } : { id, name: "Helper", position: "" };
        });
        const truck = r.assigned_truck_plate ? truckByPlate.get(r.assigned_truck_plate as string) : null;
        const customerName = customerNameById.get(r.customer_auth_id as string) || "Client";
        deliveries.push({
          id: r.id,
          customerName,
          companyName: customerName,
          itemType: r.item_type ? String(r.item_type).charAt(0).toUpperCase() + String(r.item_type).slice(1) : r.item_type,
          pickupDate: r.pickup_date,
          pickupTime: r.pickup_time ? String(r.pickup_time).slice(0, 5) : null,
          dropoffDate: r.dropoff_date,
          dropoffTime: r.dropoff_time ? String(r.dropoff_time).slice(0, 5) : null,
          pickupAddress: r.pickup_location,
          deliveryAddress: r.dropoff_location,
          cargoWeight: r.cargo_weight,
          status: r.status,
          assignedAt: r.assigned_at,
          driver: {
            id: driverRecord.id,
            name: formatCrewName(driverRecord) || "You",
            phone: driverRecord.contact_number ?? "",
          },
          helpers,
          truck: truck
            ? {
                plateNumber: truck.plate_number,
                truckType: truck.truck_type,
                capacity: truck.max_capacity != null ? `${Number(truck.max_capacity).toLocaleString()} kg` : null,
              }
            : null,
          quotation: quotationByDelivery.get(r.id as string) || null,
        });
      }

      return json({ ok: true, deliveries });
    }

    if (action === "update-driver-delivery") {
      const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
      const nextStatus = typeof body.status === "string" ? body.status : "";

      if (!deliveryId || !nextStatus) {
        return json({ error: "deliveryId and status are required" }, 400);
      }

      const { data: row, error: rowError } = await adminClient
        .from("delivery_requests")
        .select("id, status, assigned_driver_id")
        .eq("id", deliveryId)
        .maybeSingle();

      if (rowError || !row) {
        return json({ error: "Delivery not found" }, 400);
      }

      if (row.assigned_driver_id !== (driverRecord.id as string)) {
        return json({ error: "Forbidden" }, 403);
      }

      const allowed = DRIVER_STATUS_TRANSITIONS[row.status as string] || [];
      if (!allowed.includes(nextStatus)) {
        return json({ error: `Cannot move a delivery from ${row.status} to ${nextStatus}` }, 400);
      }

      const { error: updateError } = await adminClient
        .from("delivery_requests")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", deliveryId);

      if (updateError) {
        return json({ error: updateError.message }, 400);
      }

      return json({ ok: true, status: nextStatus });
    }
  }

  // get-delivery-crew lets a Customer resolve the names behind their assigned
  // crew (driver/helpers/truck) for their own delivery requests. The customer
  // session can read its own delivery_requests rows (RLS) and the trucks table,
  // but driver_records / helper_records are service_role-only (see DATABASE.md)
  // — so the names are resolved here and returned keyed by delivery id. Only
  // rows owned by the caller are ever read or returned.
  if (action === "get-delivery-crew") {
    const requestedIds: string[] = Array.isArray(body.deliveryIds) ? body.deliveryIds : [];
    if (requestedIds.length === 0) {
      return json({ ok: true, crewByDelivery: {} });
    }

    const { data: rows, error: rowsError } = await adminClient
      .from("delivery_requests")
      .select("id, customer_auth_id, assigned_driver_id, assigned_helper_ids, assigned_truck_plate")
      .in("id", requestedIds);

    if (rowsError) {
      return json({ error: rowsError.message }, 400);
    }

    const owned = (rows || []).filter((r) => r.customer_auth_id === callerData.user.id);
    if (owned.length === 0) {
      return json({ ok: true, crewByDelivery: {} });
    }

    const formatCrewName = (rec: Record<string, unknown>) =>
      [rec.first_name, rec.middle_name, rec.last_name].filter(Boolean).join(" ").trim();

    const driverIds = Array.from(new Set(owned.map((r) => r.assigned_driver_id as string).filter(Boolean)));
    const driverById = new Map<string, Record<string, unknown>>();
    if (driverIds.length > 0) {
      const { data: drivers } = await adminClient
        .from("driver_records")
        .select("id, first_name, middle_name, last_name")
        .in("id", driverIds);
      for (const d of drivers || []) driverById.set(d.id as string, d);
    }

    const helperIds = Array.from(new Set(owned.flatMap((r) => (r.assigned_helper_ids as string[]) || [])));
    const helperById = new Map<string, Record<string, unknown>>();
    if (helperIds.length > 0) {
      const { data: helpers } = await adminClient
        .from("helper_records")
        .select("id, first_name, middle_name, last_name")
        .in("id", helperIds);
      for (const h of helpers || []) helperById.set(h.id as string, h);
    }

    const plateNumbers = Array.from(new Set(owned.map((r) => r.assigned_truck_plate as string).filter(Boolean)));
    const truckByPlate = new Map<string, Record<string, unknown>>();
    if (plateNumbers.length > 0) {
      const { data: trucks } = await adminClient
        .from("trucks")
        .select("plate_number, truck_type, max_capacity")
        .in("plate_number", plateNumbers);
      for (const t of trucks || []) truckByPlate.set(t.plate_number as string, t);
    }

    const crewByDelivery: Record<string, unknown> = {};
    for (const r of owned) {
      if (!r.assigned_driver_id) {
        continue;
      }

      const driver = driverById.get(r.assigned_driver_id as string);
      const helpers = ((r.assigned_helper_ids as string[]) || []).map((id) => {
        const h = helperById.get(id);
        return h ? { id, name: formatCrewName(h) || "Helper" } : { id, name: "Helper" };
      });
      const truck = r.assigned_truck_plate ? truckByPlate.get(r.assigned_truck_plate as string) : null;

      crewByDelivery[r.id as string] = {
        driver: driver ? { id: r.assigned_driver_id, name: formatCrewName(driver) || "Driver" } : null,
        helpers,
        truck: truck
          ? {
              plateNumber: truck.plate_number,
              truckType: truck.truck_type,
              capacity: truck.max_capacity != null ? `${Number(truck.max_capacity).toLocaleString()} kg` : null,
            }
          : r.assigned_truck_plate
            ? { plateNumber: r.assigned_truck_plate, truckType: null, capacity: null }
            : null,
      };
    }

    return json({ ok: true, crewByDelivery });
  }

  if (!ADMIN_ROLES.includes(callerRow.role)) {
    return json({ error: "Forbidden" }, 403);
  }

  if (action === "create-user") {
    const profile = normalizeProfile(body);
    const role = typeof body.role === "string" ? body.role.trim() : "";

    if (!profile.firstName || !profile.lastName || !profile.email || !ASSIGNABLE_ROLES.includes(role)) {
      return json({ error: "First name, last name, personal email, and role are required" }, 400);
    }

    if (role === "Customer" && !profile.clientName) {
      return json({ error: "Client name is required for the Customer role" }, 400);
    }

    const tempPassword = generateTempPassword();
    const localPrefix = loginEmailLocalPart(profile.firstName, profile.middleName, profile.lastName);
    const loginEmail = await nextLoginEmail(adminClient, localPrefix);

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
      role,
      login_email: loginEmail,
    });

    if (insertError) {
      // Roll back the auth user so we don't leave an orphaned account with no users row.
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: insertError.message }, 400);
    }

    try {
      await upsertRoleRecord(adminClient, role, created.user.id, profile);
    } catch (profileError) {
      // Roll back the users row and auth user so we don't leave an account with no profile row.
      await adminClient.from("users").delete().eq("id", created.user.id);
      await adminClient.auth.admin.deleteUser(created.user.id);
      const message = profileError instanceof Error ? profileError.message : "Unable to create profile record";
      return json({ error: message }, 400);
    }

    const emailResult = await sendCredentialsEmail(
      profile.email,
      loginEmail,
      tempPassword,
      `A DriveWise account was created for you as ${role}.`,
    );

    return json({
      ok: true,
      user: {
        id: created.user.id,
        role,
        login_email: loginEmail,
        first_name: profile.firstName,
        middle_name: profile.middleName,
        last_name: profile.lastName,
        email: profile.email,
      },
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
      tempPassword: emailResult.sent ? undefined : tempPassword,
    });
  }

  if (action === "list-users") {
    try {
      const users = await listUsersWithProfiles(adminClient);
      return json({ ok: true, users });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to list users";
      return json({ error: message }, 400);
    }
  }

  if (action === "update-profile") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const profile = normalizeProfile(body);

    if (!userId || !ASSIGNABLE_ROLES.includes(role)) {
      return json({ error: "userId and a valid role are required" }, 400);
    }

    if (!profile.firstName || !profile.lastName || !profile.email) {
      return json({ error: "First name, last name, and personal email are required" }, 400);
    }

    if (role === "Customer" && !profile.clientName) {
      return json({ error: "Client name is required for the Customer role" }, 400);
    }

    const { data: currentRow, error: currentRowError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (currentRowError || !currentRow) {
      return json({ error: currentRowError?.message || "User not found" }, 400);
    }

    if (currentRow.role !== role) {
      const { error: roleUpdateError } = await adminClient
        .from("users")
        .update({ role })
        .eq("id", userId);

      if (roleUpdateError) {
        return json({ error: roleUpdateError.message }, 400);
      }
    }

    try {
      const result = await upsertRoleRecord(adminClient, role, userId, profile);
      return json({ ok: true, role, ...result });
    } catch (profileError) {
      const message = profileError instanceof Error ? profileError.message : "Unable to save profile record";
      return json({ error: message }, 400);
    }
  }

  // Admin-only, same as update-profile — an Admin can set their own picture
  // (calling with their own userId) or any managed user's. The client
  // always crops/re-encodes to JPEG first (src/lib/profilePicture.js), so
  // this only ever writes one object per user, keyed by userId + ".jpg".
  if (action === "upload-profile-picture") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : "";
    const contentType = typeof body.contentType === "string" ? body.contentType : "";

    if (!userId || !fileBase64) {
      return json({ error: "userId and fileBase64 are required" }, 400);
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    if (!extension) {
      return json({ error: "contentType must be image/jpeg, image/png, or image/webp" }, 400);
    }

    const { data: targetUserRow, error: targetUserError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (targetUserError || !targetUserRow) {
      return json({ error: targetUserError?.message || "User not found" }, 400);
    }

    const table = ROLE_TABLE[targetUserRow.role];
    const bytes = decodeBase64(fileBase64);

    if (bytes.byteLength > MAX_PROFILE_PICTURE_BYTES) {
      return json({ error: "Image is too large (max 512KB after processing)" }, 400);
    }

    const path = `${userId}.${extension}`;
    const { error: uploadError } = await adminClient.storage
      .from(PROFILE_PICTURE_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });

    if (uploadError) {
      return json({ error: uploadError.message }, 400);
    }

    const { data: publicUrlData } = adminClient.storage
      .from(PROFILE_PICTURE_BUCKET)
      .getPublicUrl(path);

    // Cache-bust: the storage path never changes across re-uploads (same
    // userId + extension, upsert: true), so without this every consumer
    // (sidebar, manage dialog) would keep showing a browser-cached copy of
    // the old picture after a new one is uploaded.
    const profilePictureUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await adminClient
      .from(table)
      .update({ profile_picture: profilePictureUrl })
      .eq("auth_id", userId);

    if (updateError) {
      return json({ error: updateError.message }, 400);
    }

    return json({ ok: true, profile_picture: profilePictureUrl });
  }

  // Admin-only, same gate as upload-profile-picture. Deletes the stored
  // object (tried under every extension we ever accept, since we don't
  // otherwise know which one this user's picture was uploaded as) rather
  // than just nulling the column, so removing a picture actually frees the
  // storage instead of leaving an orphaned object behind.
  if (action === "remove-profile-picture") {
    const userId = typeof body.userId === "string" ? body.userId : "";

    if (!userId) {
      return json({ error: "userId is required" }, 400);
    }

    const { data: targetUserRow, error: targetUserError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (targetUserError || !targetUserRow) {
      return json({ error: targetUserError?.message || "User not found" }, 400);
    }

    const table = ROLE_TABLE[targetUserRow.role];
    const paths = Object.values(EXTENSION_BY_CONTENT_TYPE).map((ext) => `${userId}.${ext}`);

    const { error: removeError } = await adminClient.storage
      .from(PROFILE_PICTURE_BUCKET)
      .remove(paths);

    if (removeError) {
      return json({ error: removeError.message }, 400);
    }

    const { error: updateError } = await adminClient
      .from(table)
      .update({ profile_picture: null })
      .eq("auth_id", userId);

    if (updateError) {
      return json({ error: updateError.message }, 400);
    }

    return json({ ok: true });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";

  if (!userId) {
    return json({ error: "userId is required" }, 400);
  }

  // Deactivating doesn't ban via the Supabase Admin API — Supabase has no
  // way to schedule a ban to start in the future, and the intent here is a
  // grace period (see DATABASE.md "users" — deactivated_at), not an
  // instant lockout. This just timestamps the row; Login.jsx and every
  // portal layout's useDeactivationGuard compare that timestamp against
  // now to decide whether the account still has access.
  if (action === "deactivate") {
    const { error } = await adminClient
      .from("users")
      .update({ deactivated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      return json({ error: error.message }, 400);
    }

    return json({ ok: true });
  }

  if (action === "reactivate") {
    const { error } = await adminClient
      .from("users")
      .update({ deactivated_at: null })
      .eq("id", userId);

    if (error) {
      return json({ error: error.message }, 400);
    }

    return json({ ok: true });
  }

  if (action === "reset-password") {
    const { data: userRow, error: userRowError } = await adminClient
      .from("users")
      .select("role, login_email")
      .eq("id", userId)
      .single();

    if (userRowError || !userRow) {
      return json({ error: userRowError?.message || "User not found" }, 400);
    }

    const contactEmail = await findContactEmail(adminClient, userRow.role, userId);

    if (!contactEmail) {
      return json({ error: "No contact email on file for this user" }, 400);
    }

    const tempPassword = generateTempPassword();

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (error) {
      return json({ error: error.message }, 400);
    }

    const emailResult = await sendCredentialsEmail(
      contactEmail,
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

  return json({ error: "Unknown action" }, 400);
});
