// Test delivery_requests insert with the EXACT payload shape the form sends.
// Probes each field type to find which one the DB rejects.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync("C:/Users/Lorenz/Desktop/Codes/drivewise-system/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}
const url = env.VITE_SUPABASE_URL.replace(/\/$/, "");
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Find a real customer auth id from existing rows
const { data: rows, error: selErr } = await admin.from("delivery_requests").select("customer_auth_id").limit(3);
if (selErr) throw new Error(selErr.message);
const authId = rows[0]?.customer_auth_id;
console.log("Using customer_auth_id:", authId);

const payloads = [
  { label: "cargo_weight as number 800", cargo_weight: 800 },
  { label: "cargo_weight as string '800'", cargo_weight: "800" },
  { label: "cargo_weight as empty string", cargo_weight: "" },
];

// We only vary cargo_weight; other fields held at valid values.
for (const p of payloads) {
  const doc = {
    customer_auth_id: authId,
    pickup_date: "2026-10-01",
    pickup_time: "09:00",
    dropoff_date: "2026-10-01",
    dropoff_time: "17:00",
    pickup_location: "Probe",
    dropoff_location: "Probe",
    truck_type: "2T_DRY",
    item_type: "dry_food",
    cargo_weight: p.cargo_weight,
    budget_min: null,
    budget_max: null,
    notes: null,
    status: "PENDING_REQUEST",
  };
  // Strip undefined so DB defaults apply
  const doc2 = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
  const { error: insErr } = await admin.from("delivery_requests").insert(doc2).select("id").single();
  if (insErr) {
    console.log(`FAIL  ${p.label}: ${insErr.code} - ${insErr.message}`);
  } else {
    console.log(`OK   ${p.label}`);
  }
}
