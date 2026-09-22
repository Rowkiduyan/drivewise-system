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
const ASSIGNABLE_ROLES = [
  "Supervisor",
  "Admin",
  "Driver",
  "Helper",
  "Customer",
];
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

// Proof-of-pickup/dropoff/stop photos, uploaded by the Helper as each item in
// the Pickup -> Dropoff -> Stops chain is completed (see
// 02B_MULTI_STOP_DELIVERIES.md). Same public-bucket pattern as
// PROFILE_PICTURE_BUCKET, keyed by delivery id + item instead of user id.
// Bucket must exist and be public (see DATABASE.md "Storage buckets").
const DELIVERY_PROOF_BUCKET = "delivery-proof-photos";
// Not cropped/resized client-side to a fixed small square the way profile
// pictures are (a package or doorway isn't square), so this cap is larger
// than MAX_PROFILE_PICTURE_BYTES — still a backstop, not a normal ceiling.
const MAX_PROOF_PHOTO_BYTES = 2 * 1024 * 1024;

// Proximity gate on Confirm Pickup/Complete Dropoff/Complete Stop: the Helper
// must actually be at the location to complete it. There's no Helper-owned
// GPS device (only the truck's Raspberry Pi reports position, see
// 01_SYSTEM_ARCHITECTURE.md's Raspberry Pi Responsibilities), so "current
// location" is read from the delivery's own gps_logs -- the truck's most
// recent reading, since Driver and Helper ride together. Decided
// 2026-08-13, see 02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md.
const PROOF_LOCATION_RADIUS_METERS = 200;

// Mirrors DriverDeliveries.jsx's client-side parseCoords -- some pickup/
// dropoff/stop locations are stored as a "lat, lng" pair rather than a
// street address; only those can be geofence-checked.
function parseCoords(
  value: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!value) return null;
  const m = String(value)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Checks the Helper is within PROOF_LOCATION_RADIUS_METERS of the pickup/
// dropoff location before letting a proof-photo action through. `targetCoords`
// (the booking's real pickup_lat/lng or dropoff_lat/lng, captured at booking
// time from the Customer app's location picker) is preferred when present;
// `targetLocation` (the address text) is only a fallback via parseCoords, for
// older rows booked before those columns existed or a manually-typed address
// with no picked coordinate. Fails OPEN (returns null = "no objection") in
// two cases, both deliberate: neither target resolves to coordinates, or the
// delivery has no GPS reading yet (e.g. the Raspberry Pi was never powered on
// -- 09_EDGE_CASES.md already establishes that Trip functionality must not
// block on Pi absence). Returns an error string when it fails CLOSED (target
// resolves, GPS exists, but they're too far apart).
async function checkProofLocation(
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
  deliveryId: string,
  targetLocation: string | null | undefined,
  targetCoords?: { lat: number | null; lng: number | null } | null,
): Promise<string | null> {
  const hasRealCoords =
    targetCoords != null &&
    Number.isFinite(targetCoords.lat) &&
    Number.isFinite(targetCoords.lng);
  const target = hasRealCoords
    ? (targetCoords as { lat: number; lng: number })
    : parseCoords(targetLocation);
  if (!target) return null;

  const { data: lastFix } = await adminClient
    .from("gps_logs")
    .select("latitude, longitude")
    .eq("delivery_request_id", deliveryId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastFix) return null;

  const distance = haversineMeters(target, {
    lat: lastFix.latitude as number,
    lng: lastFix.longitude as number,
  });
  if (distance > PROOF_LOCATION_RADIUS_METERS) {
    return `You're too far from the location to complete this (about ${Math.round(distance)}m away, must be within ${PROOF_LOCATION_RADIUS_METERS}m)`;
  }
  return null;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Shared by the three Helper-owned proof-photo actions below (pickup,
// dropoff, each stop) — validates, uploads to DELIVERY_PROOF_BUCKET, returns
// a cache-busted public URL. `pathWithoutExtension` gets the content type's
// extension appended (e.g. "DR-0011/pickup" -> "DR-0011/pickup.jpg").
async function uploadProofPhoto(
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
  pathWithoutExtension: string,
  fileBase64: string,
  contentType: string,
): Promise<{ url: string } | { error: string }> {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  if (!extension) {
    return {
      error: "contentType must be image/jpeg, image/png, or image/webp",
    };
  }

  const bytes = decodeBase64(fileBase64);
  if (bytes.byteLength > MAX_PROOF_PHOTO_BYTES) {
    return { error: "Image is too large (max 2MB)" };
  }

  const path = `${pathWithoutExtension}.${extension}`;
  const { error: uploadError } = await adminClient.storage
    .from(DELIVERY_PROOF_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data: publicUrlData } = adminClient.storage
    .from(DELIVERY_PROOF_BUCKET)
    .getPublicUrl(path);
  return { url: `${publicUrlData.publicUrl}?v=${Date.now()}` };
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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

// Plaintext device_secret, shown to the Admin exactly once at registration
// time so it can be manually flashed onto the physical Raspberry Pi (see
// 04_DEVICE_BOOT_AND_HEARTBEAT.md). Only the SHA-256 hash below is stored.
function generateDeviceSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Must match the hashing the device-heartbeat Edge Function uses to verify
// this same secret on every heartbeat — plain lowercase-hex SHA-256, no salt,
// same format the 2026-08-08 backfill used for existing devices.
async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Builds the local part of a generated login email from structured name
// parts: first-name initial + middle-name initial(s), if any + surname,
// e.g. firstName "John", middleName "Michael", lastName "Doe" -> "jmdoe".
function loginEmailLocalPart(
  firstName: string,
  middleName: string | null | undefined,
  lastName: string,
) {
  const middleInitials = (middleName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0]);

  const raw = `${firstName[0] || ""}${middleInitials.join("")}${lastName}`;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned || "user";
}

async function nextLoginEmail(
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
  localPrefix: string,
) {
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
    ? Number.parseInt(
        lastEmail.slice(localPrefix.length, lastEmail.indexOf("@")),
        10,
      ) || 0
    : 0;

  return `${localPrefix}${String(lastNumber + 1).padStart(2, "0")}@${LOGIN_EMAIL_DOMAIN}`;
}

// Sends the login email + temp password to the account's contact email via
// Resend. Returns { sent: false, error } instead of throwing so a delivery
// failure never rolls back an already-created account or password reset —
// the caller falls back to returning the password directly in that case.
async function sendCredentialsEmail(
  to: string,
  loginEmail: string,
  tempPassword: string,
  heading: string,
) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return {
      sent: false,
      error:
        "Email delivery is not configured (missing RESEND_API_KEY/RESEND_FROM_EMAIL).",
    };
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
  }).catch(() => null);

  if (!response || !response.ok) {
    const message = response ? await response.text() : "Network error sending email";
    return {
      sent: false,
      error: message || `Resend responded with ${response?.status}`,
    };
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
  const address =
    body.address && typeof body.address === "object"
      ? (body.address as { street?: string; city?: string; province?: string })
      : null;

  return {
    firstName: typeof body.firstName === "string" ? body.firstName.trim() : "",
    middleName:
      typeof body.middleName === "string"
        ? body.middleName.trim() || null
        : null,
    lastName: typeof body.lastName === "string" ? body.lastName.trim() : "",
    position:
      typeof body.position === "string" ? body.position.trim() || null : null,
    clientName:
      typeof body.clientName === "string"
        ? body.clientName.trim() || null
        : null,
    email:
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "",
    contactNumber:
      typeof body.contactNumber === "string"
        ? body.contactNumber.trim() || null
        : null,
    birthdate:
      typeof body.birthdate === "string" ? body.birthdate || null : null,
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

async function nextRecordId(
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
  table: string,
  prefix: string,
) {
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
  const lastNumber = lastId
    ? Number.parseInt(lastId.slice(prefix.length), 10) || 0
    : 0;

  return `${prefix}${String(lastNumber + 1).padStart(3, "0")}`;
}

// Creates or updates the auth_id's row in the *_records table matching
// `role`. Reused by create-user (initial creation) and update-profile
// (edits, including a role change moving someone into a table they've
// never had a row in before). Never touches a *different* role's table —
// demoting/promoting a user leaves their old role's row as-is, same as
// the original driver-only behavior this generalizes.
async function upsertRoleRecord(
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
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

async function findContactEmail(
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
  role: string,
  authId: string,
) {
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
async function listUsersWithProfiles(
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
  roles?: string[],
) {
  let usersQuery = adminClient
    .from("users")
    .select("id, role, login_email, created_at, deactivated_at");
  if (roles) {
    usersQuery = usersQuery.in("role", roles);
  }

  const { data: usersRows, error: usersError } = await usersQuery;
  if (usersError) {
    throw new Error(usersError.message);
  }

  const tables = roles
    ? roles.map((role) => ROLE_TABLE[role])
    : Object.values(ROLE_TABLE);
  const profilesByAuthId = new Map<string, Record<string, unknown>>();

  for (const table of tables) {
    const { data: rows, error: rowsError } = await adminClient
      .from(table)
      .select("*");
    if (rowsError) {
      throw new Error(rowsError.message);
    }
    for (const row of rows || []) {
      profilesByAuthId.set(row.auth_id as string, row);
    }
  }

  // deno-lint-ignore no-explicit-any -- usersRows comes from the adminClient
  // `any` workaround above, same reasoning as the parameter comments.
  return (usersRows || []).map((user: any) => {
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
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
  crew: Array<Record<string, unknown>>,
) {
  const crewIds = crew.map((member) => member.id as string);
  if (crewIds.length === 0) {
    return crew.map((member) => ({
      ...member,
      client_specialties: [] as string[],
    }));
  }

  const { data: links, error: linksError } = await adminClient
    .from("crew_client_specialties")
    .select("crew_auth_id, client_auth_id")
    .in("crew_auth_id", crewIds);

  if (linksError) {
    throw new Error(linksError.message);
  }

  // deno-lint-ignore no-explicit-any -- links comes from the adminClient
  // `any` workaround above, same reasoning as the parameter comments.
  const clientIds = Array.from(
    new Set((links || []).map((link: any) => link.client_auth_id as string)),
  );
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
        clientNameById.set(
          record.auth_id as string,
          record.client_name as string,
        );
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

// Attaches each crew member's self-set weekly working days
// (crew_availability, 0=Sunday..6=Saturday) as `working_days` — fetched once
// for the whole roster alongside client specialties. Crew members edit these
// on their own profile page (DriverProfile.jsx / HelperProfile.jsx); this is
// the Supervisor's read-only view.
async function attachWorkingDays(
  // deno-lint-ignore no-explicit-any -- ReturnType<typeof createClient> with
  // no Database generic (none exists anywhere in this codebase) collapses
  // every chained .from()/.select() call to `never`; same fix already used
  // by driver-trip/index.ts's closeReturnTripSession.
  adminClient: any,
  crew: Array<Record<string, unknown>>,
) {
  const crewIds = crew.map((member) => member.id as string);
  if (crewIds.length === 0) {
    return crew.map((member) => ({ ...member, working_days: [] as number[] }));
  }

  const { data: rows, error: rowsError } = await adminClient
    .from("crew_availability")
    .select("crew_auth_id, day_of_week")
    .in("crew_auth_id", crewIds)
    .order("day_of_week", { ascending: true });

  if (rowsError) {
    throw new Error(rowsError.message);
  }

  const daysByCrewId = new Map<string, number[]>();
  for (const row of rows || []) {
    const crewId = row.crew_auth_id as string;
    const existing = daysByCrewId.get(crewId) || [];
    existing.push(row.day_of_week as number);
    daysByCrewId.set(crewId, existing);
  }

  return crew.map((member) => ({
    ...member,
    working_days: daysByCrewId.get(member.id as string) || [],
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
      ? await adminClient
          .from(table)
          .select("*")
          .eq("auth_id", authId)
          .maybeSingle()
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
      const crew = await listUsersWithProfiles(adminClient, [
        "Driver",
        "Helper",
      ]);
      const crewWithSpecialties = await attachClientSpecialties(
        adminClient,
        crew,
      );
      const crewWithAvailability = await attachWorkingDays(
        adminClient,
        crewWithSpecialties,
      );
      return json({ ok: true, crew: crewWithAvailability });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to list crew";
      return json({ error: message }, 400);
    }
  }

  // Client-specialty actions (list-clients, list-crew-clients,
  // add-crew-client, remove-crew-client) back SupCrewProfile.jsx's "Client
  // Specialties" section. "Clients" here are Customer-role users, named by
  // customer_records.client_name — see DATABASE.md "crew_client_specialties".
  // Same Admin-or-Supervisor gate as list-crew, since Supervisors manage
  // this from the crew profile page.
  const CLIENT_SPECIALTY_ACTIONS = [
    "list-clients",
    "list-crew-clients",
    "add-crew-client",
    "remove-crew-client",
    "list-specialized-clients",
  ];
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

      const clients = (data || []).map((row) => ({
        id: row.auth_id,
        name: row.client_name,
      }));
      return json({ ok: true, clients });
    }

    // Distinct customers that have at least one crew_client_specialties row
    // pointing at them — SupDeliveries.jsx uses this to flag requests from
    // clients that require specialized crews.
    if (action === "list-specialized-clients") {
      const { data, error } = await adminClient
        .from("crew_client_specialties")
        .select("client_auth_id");

      if (error) {
        return json({ error: error.message }, 400);
      }

      const specializedClientIds = Array.from(
        new Set((data || []).map((row) => row.client_auth_id as string)),
      );
      return json({ ok: true, specializedClientIds });
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

      const clientIds = (links || []).map(
        (row) => row.client_auth_id as string,
      );
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

      const clients = (records || []).map((row) => ({
        id: row.auth_id,
        name: row.client_name,
      }));
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

    // Confirm Pickup (->OUT_FOR_DROPOFF) and Complete Delivery (->DELIVERED)
    // moved to the Helper block below (photo-required chain completion, see
    // 02B_MULTI_STOP_DELIVERIES.md) — Driver starts the trip and (2026-09-08)
    // optionally announces arrival at pickup/dropoff, stamping
    // pickup_arrived_at/dropoff_arrived_at for the Supervisor's Trip Details
    // report. Skippable — Helper's Confirm Pickup/Complete Dropoff already
    // accept both the old and new precursor statuses, see HELPER_STATUS_TRANSITIONS
    // and the complete-dropoff/complete-stop guards below.
    const DRIVER_STATUS_TRANSITIONS: Record<string, string[]> = {
      ASSIGNED: ["OUT_FOR_PICKUP"],
      OUT_FOR_PICKUP: ["ARRIVED_PICKUP"],
      OUT_FOR_DROPOFF: ["ARRIVED_DROPOFF"],
    };

    const formatCrewName = (rec: Record<string, unknown>) =>
      [rec.first_name, rec.middle_name, rec.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

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

      const customerAuthIds = Array.from(
        new Set(rowsList.map((r) => r.customer_auth_id as string)),
      );
      const customerNameById = new Map<string, string>();
      if (customerAuthIds.length > 0) {
        const { data: customers } = await adminClient
          .from("customer_records")
          .select("auth_id, client_name, first_name, last_name")
          .in("auth_id", customerAuthIds);
        for (const c of customers || []) {
          const clientName = c.client_name as string | null;
          const personalName = [c.first_name, c.last_name]
            .filter(Boolean)
            .join(" ");
          customerNameById.set(
            c.auth_id as string,
            clientName || personalName || "Client",
          );
        }
      }

      const helperIds = Array.from(
        new Set(
          rowsList.flatMap((r) => (r.assigned_helper_ids as string[]) || []),
        ),
      );
      const helperById = new Map<string, Record<string, unknown>>();
      if (helperIds.length > 0) {
        const { data: helpers } = await adminClient
          .from("helper_records")
          .select("id, first_name, middle_name, last_name, contact_number")
          .in("id", helperIds);
        for (const h of helpers || []) helperById.set(h.id as string, h);
      }

      const plateNumbers = Array.from(
        new Set(
          rowsList.map((r) => r.assigned_truck_plate as string).filter(Boolean),
        ),
      );
      const truckByPlate = new Map<string, Record<string, unknown>>();
      if (plateNumbers.length > 0) {
        const { data: trucks } = await adminClient
          .from("trucks")
          .select("plate_number, truck_type, max_capacity, brand, model")
          .in("plate_number", plateNumbers);
        for (const t of trucks || [])
          truckByPlate.set(t.plate_number as string, t);
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
          quotationByDelivery.set(q.delivery_id as string, {
            amount: Number(q.amount),
          });
        }
      }

      // Lets the Driver UI tell "never started" (ASSIGNED, no session yet)
      // apart from "paused" (status already past ASSIGNED but no open
      // Session) so it knows whether to show Pause or Resume Trip — see
      // 03B_PAUSE_AND_RESUME_TRIP.md's "Paused isn't a stored value" note.
      const openSessionDeliveryIds = new Set<string>();
      // Also needed by Phase 6 (06_DROWSINESS_ALERT_PIPELINE.md): the Driver UI
      // subscribes to Realtime alerts filtered by session_id, so it needs the
      // active session's id, not just whether one is open.
      const sessionIdByDelivery = new Map<string, string>();
      if (deliveryIds.length > 0) {
        const { data: openSessions } = await adminClient
          .from("sessions")
          .select("session_id, delivery_request_id")
          .in("delivery_request_id", deliveryIds)
          .eq("status", "Active");
        for (const s of openSessions || []) {
          openSessionDeliveryIds.add(s.delivery_request_id as string);
          sessionIdByDelivery.set(
            s.delivery_request_id as string,
            s.session_id as string,
          );
        }
      }

      for (const r of rowsList) {
        const helpers = ((r.assigned_helper_ids as string[]) || []).map(
          (id) => {
            const h = helperById.get(id);
            return h
              ? {
                  id,
                  name: formatCrewName(h) || "Helper",
                  position: h.position ?? "",
                }
              : { id, name: "Helper", position: "" };
          },
        );
        const truck = r.assigned_truck_plate
          ? truckByPlate.get(r.assigned_truck_plate as string)
          : null;
        const customerName =
          customerNameById.get(r.customer_auth_id as string) || "Client";
        deliveries.push({
          id: r.id,
          customerName,
          companyName: customerName,
          itemType: r.item_type
            ? String(r.item_type).charAt(0).toUpperCase() +
              String(r.item_type).slice(1)
            : r.item_type,
          pickupDate: r.pickup_date,
          pickupTime: r.pickup_time ? String(r.pickup_time).slice(0, 5) : null,
          pickupTimeEnd: r.pickup_time_end
            ? String(r.pickup_time_end).slice(0, 5)
            : null,
          dropoffDate: r.dropoff_date,
          dropoffTime: r.dropoff_time
            ? String(r.dropoff_time).slice(0, 5)
            : null,
          dropoffTimeEnd: r.dropoff_time_end
            ? String(r.dropoff_time_end).slice(0, 5)
            : null,
          pickupAddress: r.pickup_location,
          pickupLat: r.pickup_lat,
          pickupLng: r.pickup_lng,
          deliveryAddress: r.dropoff_location,
          dropoffLat: r.dropoff_lat,
          dropoffLng: r.dropoff_lng,
          // Reference-only intermediate stops between pickup/dropoff,
          // customer-entered at booking time — read-only for the driver, used
          // to build the dropoff leg's route waypoints (02B_MULTI_STOP_DELIVERIES.md).
          stops: Array.isArray(r.stops) ? r.stops : [],
          // Proof-photo state for the first two items in the chain (Pickup,
          // Dropoff), written by the Helper-gated completion actions above —
          // read-only for the Driver, mirrors get-helper-deliveries'
          // equivalent fields (02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md).
          pickupPhotoUrl: r.pickup_photo_url || null,
          pickupCompletedAt: r.pickup_completed_at || null,
          dropoffPhotoUrl: r.dropoff_photo_url || null,
          dropoffCompletedAt: r.dropoff_completed_at || null,
          // Optional "Arrived" announcements (2026-09-08) — Driver-set,
          // read-only here; lets the UI know whether the button was already
          // tapped for this leg.
          pickupArrivedAt: r.pickup_arrived_at || null,
          dropoffArrivedAt: r.dropoff_arrived_at || null,
          // Frozen planned-route (Pickup -> Dropoff -> Stops), if the
          // pre-trip screen has already computed+saved it -- lets the
          // client skip recomputing/re-saving on a remount
          // (11_ROUTE_COMPARISON.md, `driver-trip`'s save-suggested-route).
          suggestedRoute: r.suggested_route || null,
          cargoWeight: r.cargo_weight,
          status: r.status,
          hasOpenSession: openSessionDeliveryIds.has(r.id as string),
          sessionId: sessionIdByDelivery.get(r.id as string) || null,
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
                capacity:
                  truck.max_capacity != null
                    ? `${Number(truck.max_capacity).toLocaleString()} kg`
                    : null,
              }
            : null,
          quotation: quotationByDelivery.get(r.id as string) || null,
        });
      }

      return json({ ok: true, deliveries });
    }

    if (action === "update-driver-delivery") {
      const deliveryId =
        typeof body.deliveryId === "string" ? body.deliveryId : "";
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
        return json(
          {
            error: `Cannot move a delivery from ${row.status} to ${nextStatus}`,
          },
          400,
        );
      }

      const nowIso = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        updated_at: nowIso,
      };
      if (nextStatus === "ARRIVED_PICKUP") {
        updatePayload.pickup_arrived_at = nowIso;
      } else if (nextStatus === "ARRIVED_DROPOFF") {
        updatePayload.dropoff_arrived_at = nowIso;
      }

      const { error: updateError } = await adminClient
        .from("delivery_requests")
        .update(updatePayload)
        .eq("id", deliveryId);

      if (updateError) {
        return json({ error: updateError.message }, 400);
      }

      return json({
        ok: true,
        status: nextStatus,
        ...(nextStatus === "ARRIVED_PICKUP"
          ? { pickupArrivedAt: nowIso }
          : {}),
        ...(nextStatus === "ARRIVED_DROPOFF"
          ? { dropoffArrivedAt: nowIso }
          : {}),
      });
    }
  }

  // Helper deliveries. Read-only visibility into Trip/Session state (Driver
  // still starts/pauses/resumes/ends the actual driving Session — see
  // driver-trip's end-trip auth for the one Helper-callable exception),
  // plus (2026-08-12, reopening the prior read-only-only design) write
  // actions for photo-required chain completion — see the three actions
  // below and 03_START_TRIP_AND_SESSION.md's "Helper visibility" note.
  // hasOpenSession is computed the same way get-driver-deliveries does.
  if (callerRow.role === "Helper") {
    const { data: helperRecord, error: helperRecordError } = await adminClient
      .from("helper_records")
      .select("id, first_name, middle_name, last_name, contact_number")
      .eq("auth_id", callerData.user.id)
      .maybeSingle();

    if (helperRecordError || !helperRecord) {
      return json({ error: "Unable to find your helper profile" }, 400);
    }

    if (action === "get-helper-deliveries") {
      const { data: rows, error: rowsError } = await adminClient
        .from("delivery_requests")
        .select("*")
        .contains("assigned_helper_ids", [helperRecord.id as string])
        .order("pickup_date", { ascending: true });

      if (rowsError) {
        return json({ error: rowsError.message }, 400);
      }

      const rowsList = rows || [];
      const formatCrewName = (rec: Record<string, unknown>) =>
        [rec.first_name, rec.middle_name, rec.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();

      const customerAuthIds = Array.from(
        new Set(rowsList.map((r) => r.customer_auth_id as string)),
      );
      const customerNameById = new Map<string, string>();
      if (customerAuthIds.length > 0) {
        const { data: customers } = await adminClient
          .from("customer_records")
          .select("auth_id, client_name, first_name, last_name")
          .in("auth_id", customerAuthIds);
        for (const c of customers || []) {
          const clientName = c.client_name as string | null;
          const personalName = [c.first_name, c.last_name]
            .filter(Boolean)
            .join(" ");
          customerNameById.set(
            c.auth_id as string,
            clientName || personalName || "Client",
          );
        }
      }

      const driverIds = Array.from(
        new Set(
          rowsList.map((r) => r.assigned_driver_id as string).filter(Boolean),
        ),
      );
      const driverById = new Map<string, Record<string, unknown>>();
      if (driverIds.length > 0) {
        const { data: drivers } = await adminClient
          .from("driver_records")
          .select("id, first_name, middle_name, last_name, contact_number")
          .in("id", driverIds);
        for (const d of drivers || []) driverById.set(d.id as string, d);
      }

      const helperIds = Array.from(
        new Set(
          rowsList.flatMap((r) => (r.assigned_helper_ids as string[]) || []),
        ),
      );
      const helperById = new Map<string, Record<string, unknown>>();
      if (helperIds.length > 0) {
        const { data: helpers } = await adminClient
          .from("helper_records")
          .select("id, first_name, middle_name, last_name")
          .in("id", helperIds);
        for (const h of helpers || []) helperById.set(h.id as string, h);
      }

      const plateNumbers = Array.from(
        new Set(
          rowsList.map((r) => r.assigned_truck_plate as string).filter(Boolean),
        ),
      );
      const truckByPlate = new Map<string, Record<string, unknown>>();
      if (plateNumbers.length > 0) {
        const { data: trucks } = await adminClient
          .from("trucks")
          .select("plate_number, truck_type, max_capacity")
          .in("plate_number", plateNumbers);
        for (const t of trucks || [])
          truckByPlate.set(t.plate_number as string, t);
      }

      const deliveryIds = rowsList.map((r) => r.id as string);
      const quotationByDelivery = new Map<string, { amount: number }>();
      if (deliveryIds.length > 0) {
        const { data: quotations } = await adminClient
          .from("delivery_quotations")
          .select("delivery_id, amount, created_at")
          .in("delivery_id", deliveryIds)
          .order("created_at", { ascending: true });
        for (const q of quotations || []) {
          quotationByDelivery.set(q.delivery_id as string, {
            amount: Number(q.amount),
          });
        }
      }

      // Same open-Session computation get-driver-deliveries uses above — Helper
      // visibility into Active/Paused mirrors the Driver's, read-only.
      const openSessionDeliveryIds = new Set<string>();
      // Also needed for the Helper's read-only Realtime alerts feed (see
      // 06_DROWSINESS_ALERT_PIPELINE.md's Helper visibility note): the
      // subscription filters by session_id, same as the Driver UI's.
      const sessionIdByDelivery = new Map<string, string>();
      if (deliveryIds.length > 0) {
        const { data: openSessions } = await adminClient
          .from("sessions")
          .select("session_id, delivery_request_id")
          .in("delivery_request_id", deliveryIds)
          .eq("status", "Active");
        for (const s of openSessions || []) {
          openSessionDeliveryIds.add(s.delivery_request_id as string);
          sessionIdByDelivery.set(
            s.delivery_request_id as string,
            s.session_id as string,
          );
        }
      }

      const deliveries = rowsList.map((r) => {
        const driver = r.assigned_driver_id
          ? driverById.get(r.assigned_driver_id as string)
          : null;
        const helpers = ((r.assigned_helper_ids as string[]) || []).map(
          (id) => {
            const h = helperById.get(id);
            return h
              ? { id, name: formatCrewName(h) || "Helper" }
              : { id, name: "Helper" };
          },
        );
        const truck = r.assigned_truck_plate
          ? truckByPlate.get(r.assigned_truck_plate as string)
          : null;
        const customerName =
          customerNameById.get(r.customer_auth_id as string) || "Client";
        return {
          id: r.id,
          customerName,
          companyName: customerName,
          itemType: r.item_type
            ? String(r.item_type).charAt(0).toUpperCase() +
              String(r.item_type).slice(1)
            : r.item_type,
          pickupDate: r.pickup_date,
          pickupTime: r.pickup_time ? String(r.pickup_time).slice(0, 5) : null,
          pickupAddress: r.pickup_location,
          pickupLat: r.pickup_lat,
          pickupLng: r.pickup_lng,
          deliveryAddress: r.dropoff_location,
          dropoffLat: r.dropoff_lat,
          dropoffLng: r.dropoff_lng,
          // Reference-only intermediate stops between dropoff and the end of
          // the chain, plus proof-photo state for each item in the Pickup ->
          // Dropoff -> Stops sequence the Helper completes (02B_MULTI_STOP_DELIVERIES.md).
          stops: Array.isArray(r.stops) ? r.stops : [],
          // Frozen planned route (Pickup -> Dropoff -> Stops), if the Driver
          // app's pre-trip screen already computed+saved one -- read-only
          // here, the Helper's Route Overview only ever renders it, never
          // computes/saves its own (driver-trip's save-suggested-route is
          // authorized for the assigned Driver only).
          suggestedRoute: r.suggested_route || null,
          pickupPhotoUrl: r.pickup_photo_url || null,
          pickupCompletedAt: r.pickup_completed_at || null,
          dropoffPhotoUrl: r.dropoff_photo_url || null,
          dropoffCompletedAt: r.dropoff_completed_at || null,
          // Optional "Arrived" announcements (2026-09-08) — Driver-set,
          // read-only here; lets the UI know whether the button was already
          // tapped for this leg.
          pickupArrivedAt: r.pickup_arrived_at || null,
          dropoffArrivedAt: r.dropoff_arrived_at || null,
          status: r.status,
          hasOpenSession: openSessionDeliveryIds.has(r.id as string),
          sessionId: sessionIdByDelivery.get(r.id as string) || null,
          assignedAt: r.assigned_at,
          driver: driver
            ? {
                id: r.assigned_driver_id,
                name: formatCrewName(driver) || "Driver",
                phone: driver.contact_number ?? "",
              }
            : null,
          helpers,
          truck: truck
            ? {
                plateNumber: truck.plate_number,
                truckType: truck.truck_type,
                capacity:
                  truck.max_capacity != null
                    ? `${Number(truck.max_capacity).toLocaleString()} kg`
                    : null,
              }
            : null,
          quotation: quotationByDelivery.get(r.id as string) || null,
        };
      });

      return json({ ok: true, deliveries });
    }

    // The Helper now owns photo-required completion of every item past Start
    // Pickup — Confirm Pickup, the customer's dropoff, and each stop — as one
    // continuous chain (Pickup -> Dropoff -> Stop 1 -> ... -> Stop N).
    // Completing the last item in that chain (dynamically determined below,
    // never stored) is what actually finalizes the delivery: sets
    // delivery_requests.status to DELIVERED. The Driver keeps only Start
    // Pickup and Pause/Resume Trip — see 03_START_TRIP_AND_SESSION.md's
    // Helper visibility note and 02B_MULTI_STOP_DELIVERIES.md.

    // Confirm Pickup (item 1 -> item 2 of the chain). Never final by itself.
    if (action === "update-driver-delivery") {
      const deliveryId =
        typeof body.deliveryId === "string" ? body.deliveryId : "";
      const nextStatus = typeof body.status === "string" ? body.status : "";
      const fileBase64 =
        typeof body.fileBase64 === "string" ? body.fileBase64 : "";
      const contentType =
        typeof body.contentType === "string" ? body.contentType : "";

      if (!deliveryId || !nextStatus) {
        return json({ error: "deliveryId and status are required" }, 400);
      }

      if (!fileBase64) {
        return json({ error: "A proof-of-pickup photo is required" }, 400);
      }

      const HELPER_STATUS_TRANSITIONS: Record<string, string[]> = {
        OUT_FOR_PICKUP: ["OUT_FOR_DROPOFF"],
        ARRIVED_PICKUP: ["OUT_FOR_DROPOFF"],
      };

      const { data: row, error: rowError } = await adminClient
        .from("delivery_requests")
        .select(
          "id, status, assigned_helper_ids, pickup_location, pickup_lat, pickup_lng",
        )
        .eq("id", deliveryId)
        .maybeSingle();

      if (rowError || !row) {
        return json({ error: "Delivery not found" }, 400);
      }

      if (
        !((row.assigned_helper_ids as string[]) || []).includes(
          helperRecord.id as string,
        )
      ) {
        return json({ error: "Forbidden" }, 403);
      }

      const allowed = HELPER_STATUS_TRANSITIONS[row.status as string] || [];
      if (!allowed.includes(nextStatus)) {
        return json(
          {
            error: `Cannot move a delivery from ${row.status} to ${nextStatus}`,
          },
          400,
        );
      }

      const locationError = await checkProofLocation(
        adminClient,
        deliveryId,
        row.pickup_location as string,
        {
          lat: row.pickup_lat as number | null,
          lng: row.pickup_lng as number | null,
        },
      );
      if (locationError) {
        return json({ error: locationError }, 400);
      }

      const upload = await uploadProofPhoto(
        adminClient,
        `${deliveryId}/pickup`,
        fileBase64,
        contentType,
      );
      if ("error" in upload) {
        return json({ error: upload.error }, 400);
      }

      const pickupCompletedAt = new Date().toISOString();
      const { error: updateError } = await adminClient
        .from("delivery_requests")
        .update({
          status: nextStatus,
          pickup_photo_url: upload.url,
          pickup_completed_at: pickupCompletedAt,
          updated_at: pickupCompletedAt,
        })
        .eq("id", deliveryId);

      if (updateError) {
        return json({ error: updateError.message }, 400);
      }

      return json({
        ok: true,
        status: nextStatus,
        pickupPhotoUrl: upload.url,
        pickupCompletedAt,
      });
    }

    // The customer's dropoff (item 2 of the chain) — final only when there
    // are no stops after it.
    if (action === "complete-dropoff") {
      const deliveryId =
        typeof body.deliveryId === "string" ? body.deliveryId : "";
      const fileBase64 =
        typeof body.fileBase64 === "string" ? body.fileBase64 : "";
      const contentType =
        typeof body.contentType === "string" ? body.contentType : "";
      const photoVerification =
        body.photoVerification && typeof body.photoVerification === "object"
          ? {
              status:
                body.photoVerification.status === "verified"
                  ? "verified"
                  : "uncertain",
              personDetected: body.photoVerification.personDetected === true,
              confidence: Number.isFinite(body.photoVerification.confidence)
                ? Math.max(0, Math.min(1, body.photoVerification.confidence))
                : 0,
              reviewRequired: body.photoVerification.status !== "verified",
              checkedAt:
                typeof body.photoVerification.checkedAt === "string"
                  ? body.photoVerification.checkedAt
                  : new Date().toISOString(),
              method:
                typeof body.photoVerification.method === "string"
                  ? body.photoVerification.method
                  : "unknown",
            }
          : null;

      if (!deliveryId) {
        return json({ error: "deliveryId is required" }, 400);
      }

      if (!fileBase64) {
        return json({ error: "A proof-of-delivery photo is required" }, 400);
      }

      const { data: row, error: rowError } = await adminClient
        .from("delivery_requests")
        .select(
          "id, status, assigned_helper_ids, stops, dropoff_location, dropoff_lat, dropoff_lng, dropoff_arrived_at",
        )
        .eq("id", deliveryId)
        .maybeSingle();

      if (rowError || !row) {
        return json({ error: "Delivery not found" }, 400);
      }

      if (
        !((row.assigned_helper_ids as string[]) || []).includes(
          helperRecord.id as string,
        )
      ) {
        return json({ error: "Forbidden" }, 403);
      }

      if (
        row.status !== "OUT_FOR_DROPOFF" &&
        row.status !== "ARRIVED_DROPOFF"
      ) {
        return json(
          { error: `Cannot complete the dropoff from status ${row.status}` },
          400,
        );
      }

      const locationError = await checkProofLocation(
        adminClient,
        deliveryId,
        row.dropoff_location as string,
        {
          lat: row.dropoff_lat as number | null,
          lng: row.dropoff_lng as number | null,
        },
      );
      if (locationError) {
        return json({ error: locationError }, 400);
      }

      const upload = await uploadProofPhoto(
        adminClient,
        `${deliveryId}/dropoff`,
        fileBase64,
        contentType,
      );
      if ("error" in upload) {
        return json({ error: upload.error }, 400);
      }

      const stops = Array.isArray(row.stops) ? row.stops : [];
      // Finality is "are all OTHER items in the chain already completed",
      // not a fixed list position — the driver's nav now routes to whichever
      // remaining dropoff is nearest (02B_MULTI_STOP_DELIVERIES.md's
      // "Dynamic Nearest-Dropoff Ordering", 2026-08-14), so the Helper can
      // genuinely complete Dropoff after some/all stops are already done.
      // Vacuously true when stops is empty, same as before.
      const isFinal = stops.every((s: { completed?: boolean }) => s?.completed);

      const completedAt = new Date().toISOString();
      const updates: Record<string, unknown> = {
        dropoff_photo_url: upload.url,
        dropoff_completed_at: completedAt,
        dropoff_photo_verification: photoVerification,
      };
      // Driver's "Arrived at Drop-off" tap is optional (see
      // 20260908120000_delivery_requests_arrival_timestamps.sql) and often
      // skipped — the Helper submitting the POD is proof the Driver did in
      // fact arrive, so backfill it here rather than leaving the
      // Supervisor's Trip Details "Arrival" row reading "not recorded" for a
      // trip that plainly completed. Never overwrites a real tap timestamp.
      if (!row.dropoff_arrived_at) {
        updates.dropoff_arrived_at = completedAt;
      }
      if (isFinal) {
        updates.status = "DELIVERED";
        updates.updated_at = new Date().toISOString();
      }

      const { error: updateError } = await adminClient
        .from("delivery_requests")
        .update(updates)
        .eq("id", deliveryId);

      if (updateError) {
        return json({ error: updateError.message }, 400);
      }

      return json({
        ok: true,
        isFinal,
        dropoffPhotoUrl: upload.url,
        photoVerification,
      });
    }

    // A customer-added stop (item 3+ of the chain) — final only when every
    // OTHER item in the chain (dropoff + every other stop) is already
    // completed, not when it's positionally last in the stops array (see
    // 02B_MULTI_STOP_DELIVERIES.md's "Dynamic Nearest-Dropoff Ordering",
    // 2026-08-14 — the driver's nav no longer visits stops in array order,
    // so array position no longer implies completion order either).
    if (action === "complete-stop") {
      const deliveryId =
        typeof body.deliveryId === "string" ? body.deliveryId : "";
      const stopIndex =
        typeof body.stopIndex === "number" ? body.stopIndex : -1;
      const fileBase64 =
        typeof body.fileBase64 === "string" ? body.fileBase64 : "";
      const contentType =
        typeof body.contentType === "string" ? body.contentType : "";

      if (!deliveryId || stopIndex < 0) {
        return json({ error: "deliveryId and stopIndex are required" }, 400);
      }

      if (!fileBase64) {
        return json({ error: "A proof-of-delivery photo is required" }, 400);
      }

      const { data: row, error: rowError } = await adminClient
        .from("delivery_requests")
        .select("id, status, assigned_helper_ids, stops, dropoff_completed_at")
        .eq("id", deliveryId)
        .maybeSingle();

      if (rowError || !row) {
        return json({ error: "Delivery not found" }, 400);
      }

      if (
        !((row.assigned_helper_ids as string[]) || []).includes(
          helperRecord.id as string,
        )
      ) {
        return json({ error: "Forbidden" }, 403);
      }

      if (
        row.status !== "OUT_FOR_DROPOFF" &&
        row.status !== "ARRIVED_DROPOFF"
      ) {
        return json(
          { error: `Cannot complete a stop from status ${row.status}` },
          400,
        );
      }

      const stops = Array.isArray(row.stops) ? [...row.stops] : [];
      if (stopIndex >= stops.length) {
        return json({ error: "stopIndex out of range" }, 400);
      }

      const locationError = await checkProofLocation(
        adminClient,
        deliveryId,
        stops[stopIndex]?.location as string,
      );
      if (locationError) {
        return json({ error: locationError }, 400);
      }

      const upload = await uploadProofPhoto(
        adminClient,
        `${deliveryId}/stop-${stopIndex}`,
        fileBase64,
        contentType,
      );
      if ("error" in upload) {
        return json({ error: upload.error }, 400);
      }

      stops[stopIndex] = {
        ...stops[stopIndex],
        completed: true,
        completedAt: new Date().toISOString(),
        photoUrl: upload.url,
      };

      // Final only when dropoff and every OTHER stop are already completed —
      // see the note above `complete-stop` for why this is no longer a
      // fixed list-position check.
      const isFinal =
        Boolean(row.dropoff_completed_at) &&
        stops.every(
          (s: { completed?: boolean }, i: number) =>
            i === stopIndex || s?.completed,
        );

      const updates: Record<string, unknown> = { stops };
      if (isFinal) {
        updates.status = "DELIVERED";
        updates.updated_at = new Date().toISOString();
      }

      const { error: updateError } = await adminClient
        .from("delivery_requests")
        .update(updates)
        .eq("id", deliveryId);

      if (updateError) {
        return json({ error: updateError.message }, 400);
      }

      return json({ ok: true, isFinal, stops });
    }
  }

  // get-delivery-crew lets a Customer resolve the names behind their assigned
  // crew (driver/helpers/truck) for their own delivery requests. The customer
  // session can read its own delivery_requests rows (RLS) and the trucks table,
  // but driver_records / helper_records are service_role-only (see DATABASE.md)
  // — so the names are resolved here and returned keyed by delivery id. Only
  // rows owned by the caller are ever read or returned.
  if (action === "get-delivery-crew") {
    const requestedIds: string[] = Array.isArray(body.deliveryIds)
      ? body.deliveryIds
      : [];
    if (requestedIds.length === 0) {
      return json({ ok: true, crewByDelivery: {} });
    }

    const { data: rows, error: rowsError } = await adminClient
      .from("delivery_requests")
      .select(
        "id, customer_auth_id, assigned_driver_id, assigned_helper_ids, assigned_truck_plate",
      )
      .in("id", requestedIds);

    if (rowsError) {
      return json({ error: rowsError.message }, 400);
    }

    const owned = (rows || []).filter(
      (r) => r.customer_auth_id === callerData.user.id,
    );
    if (owned.length === 0) {
      return json({ ok: true, crewByDelivery: {} });
    }

    const formatCrewName = (rec: Record<string, unknown>) =>
      [rec.first_name, rec.middle_name, rec.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    const driverIds = Array.from(
      new Set(owned.map((r) => r.assigned_driver_id as string).filter(Boolean)),
    );
    const driverById = new Map<string, Record<string, unknown>>();
    if (driverIds.length > 0) {
      const { data: drivers } = await adminClient
        .from("driver_records")
        .select("id, first_name, middle_name, last_name")
        .in("id", driverIds);
      for (const d of drivers || []) driverById.set(d.id as string, d);
    }

    const helperIds = Array.from(
      new Set(owned.flatMap((r) => (r.assigned_helper_ids as string[]) || [])),
    );
    const helperById = new Map<string, Record<string, unknown>>();
    if (helperIds.length > 0) {
      const { data: helpers } = await adminClient
        .from("helper_records")
        .select("id, first_name, middle_name, last_name")
        .in("id", helperIds);
      for (const h of helpers || []) helperById.set(h.id as string, h);
    }

    const plateNumbers = Array.from(
      new Set(
        owned.map((r) => r.assigned_truck_plate as string).filter(Boolean),
      ),
    );
    const truckByPlate = new Map<string, Record<string, unknown>>();
    if (plateNumbers.length > 0) {
      const { data: trucks } = await adminClient
        .from("trucks")
        .select("plate_number, truck_type, max_capacity")
        .in("plate_number", plateNumbers);
      for (const t of trucks || [])
        truckByPlate.set(t.plate_number as string, t);
    }

    const crewByDelivery: Record<string, unknown> = {};
    for (const r of owned) {
      if (!r.assigned_driver_id) {
        continue;
      }

      const driver = driverById.get(r.assigned_driver_id as string);
      const helpers = ((r.assigned_helper_ids as string[]) || []).map((id) => {
        const h = helperById.get(id);
        return h
          ? { id, name: formatCrewName(h) || "Helper" }
          : { id, name: "Helper" };
      });
      const truck = r.assigned_truck_plate
        ? truckByPlate.get(r.assigned_truck_plate as string)
        : null;

      crewByDelivery[r.id as string] = {
        driver: driver
          ? {
              id: r.assigned_driver_id,
              name: formatCrewName(driver) || "Driver",
            }
          : null,
        helpers,
        truck: truck
          ? {
              plateNumber: truck.plate_number,
              truckType: truck.truck_type,
              capacity:
                truck.max_capacity != null
                  ? `${Number(truck.max_capacity).toLocaleString()} kg`
                  : null,
            }
          : r.assigned_truck_plate
            ? {
                plateNumber: r.assigned_truck_plate,
                truckType: null,
                capacity: null,
              }
            : null,
      };
    }

    return json({ ok: true, crewByDelivery });
  }

  // upload-profile-picture / remove-profile-picture: any signed-in user may
  // manage their OWN picture (userId === their own auth id) — every role's
  // own Profile page calls these two actions, not just Admin's user-management
  // UI. An Admin may additionally manage any user's picture. Checked here,
  // before the blanket Admin-only gate below, since non-Admin self-service is
  // otherwise indistinguishable from the Admin-managing-another-user case.
  const PROFILE_PICTURE_ACTIONS = [
    "upload-profile-picture",
    "remove-profile-picture",
  ];
  if (PROFILE_PICTURE_ACTIONS.includes(action)) {
    const userId = typeof body.userId === "string" ? body.userId : "";

    if (!userId) {
      return json({ error: "userId is required" }, 400);
    }

    if (
      userId !== callerData.user.id &&
      !ADMIN_ROLES.includes(callerRow.role)
    ) {
      return json({ error: "Forbidden" }, 403);
    }

    if (action === "upload-profile-picture") {
      const fileBase64 =
        typeof body.fileBase64 === "string" ? body.fileBase64 : "";
      const contentType =
        typeof body.contentType === "string" ? body.contentType : "";

      if (!fileBase64) {
        return json({ error: "fileBase64 is required" }, 400);
      }

      const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
      if (!extension) {
        return json(
          { error: "contentType must be image/jpeg, image/png, or image/webp" },
          400,
        );
      }

      const { data: targetUserRow, error: targetUserError } = await adminClient
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (targetUserError || !targetUserRow) {
        return json(
          { error: targetUserError?.message || "User not found" },
          400,
        );
      }

      const table = ROLE_TABLE[targetUserRow.role];
      const bytes = decodeBase64(fileBase64);

      if (bytes.byteLength > MAX_PROFILE_PICTURE_BYTES) {
        return json(
          { error: "Image is too large (max 512KB after processing)" },
          400,
        );
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

    // remove-profile-picture: deletes the stored object (tried under every
    // extension we ever accept, since we don't otherwise know which one this
    // user's picture was uploaded as) rather than just nulling the column, so
    // removing a picture actually frees the storage instead of leaving an
    // orphaned object behind.
    const { data: targetUserRow, error: targetUserError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (targetUserError || !targetUserRow) {
      return json({ error: targetUserError?.message || "User not found" }, 400);
    }

    const table = ROLE_TABLE[targetUserRow.role];
    const paths = Object.values(EXTENSION_BY_CONTENT_TYPE).map(
      (ext) => `${userId}.${ext}`,
    );

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

  if (!ADMIN_ROLES.includes(callerRow.role)) {
    return json({ error: "Forbidden" }, 403);
  }

  // Registers a new Raspberry Pi device row and generates its device_secret
  // server-side (never in the browser) so the hash going into
  // device_secret_hash is never derived from a value the client chose. The
  // plaintext secret is returned once, the same way create-user returns
  // tempPassword once — the Admin copies it and manually configures the
  // physical Pi with it; it is never retrievable again after this response.
  if (action === "register-device") {
    const deviceId =
      typeof body.deviceId === "string"
        ? body.deviceId.trim().toUpperCase()
        : "";
    const plateNumber =
      typeof body.plateNumber === "string"
        ? body.plateNumber.trim().toUpperCase() || null
        : null;
    const status = typeof body.status === "string" ? body.status : "Active";

    if (!deviceId) {
      return json({ error: "Device ID is required" }, 400);
    }

    const deviceSecret = generateDeviceSecret();
    const deviceSecretHash = await sha256Hex(deviceSecret);

    const { error: insertError } = await adminClient.from("devices").insert({
      device_id: deviceId,
      plate_number: plateNumber,
      device_status: status,
      device_secret_hash: deviceSecretHash,
    });

    if (insertError) {
      return json({ error: insertError.message }, 400);
    }

    return json({ ok: true, device_id: deviceId, device_secret: deviceSecret });
  }

  if (action === "create-user") {
    const profile = normalizeProfile(body);
    const role = typeof body.role === "string" ? body.role.trim() : "";

    if (
      !profile.firstName ||
      !profile.lastName ||
      !profile.email ||
      !ASSIGNABLE_ROLES.includes(role)
    ) {
      return json(
        {
          error: "First name, last name, personal email, and role are required",
        },
        400,
      );
    }

    if (role === "Customer" && !profile.clientName) {
      return json(
        { error: "Client name is required for the Customer role" },
        400,
      );
    }

    const tempPassword = generateTempPassword();
    const localPrefix = loginEmailLocalPart(
      profile.firstName,
      profile.middleName,
      profile.lastName,
    );
    const loginEmail = await nextLoginEmail(adminClient, localPrefix);

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
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
      const message =
        profileError instanceof Error
          ? profileError.message
          : "Unable to create profile record";
      return json({ error: message }, 400);
    }

    const emailResult = await sendCredentialsEmail(
      profile.email,
      loginEmail,
      tempPassword,
      `A DriveWise account was created for you as ${role}.`,
    ).catch(() => ({ sent: false, error: "Email delivery failed due to a network error" }));

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
      const message =
        error instanceof Error ? error.message : "Unable to list users";
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
      return json(
        { error: "First name, last name, and personal email are required" },
        400,
      );
    }

    if (role === "Customer" && !profile.clientName) {
      return json(
        { error: "Client name is required for the Customer role" },
        400,
      );
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
      const message =
        profileError instanceof Error
          ? profileError.message
          : "Unable to save profile record";
      return json({ error: message }, 400);
    }
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

    const contactEmail = await findContactEmail(
      adminClient,
      userRow.role,
      userId,
    );

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
    ).catch(() => ({ sent: false, error: "Email delivery failed due to a network error" }));

    return json({
      ok: true,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
      tempPassword: emailResult.sent ? undefined : tempPassword,
    });
  }

  return json({ error: "Unknown action" }, 400);
});
