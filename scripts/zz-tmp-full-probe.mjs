// Test the EXACT newRequest shape the form sends, field by field,
// to find which field Postgres rejects.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync("C:/Users/Lorenz/Desktop/Codes/drivewise-system/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}
const url = env.VITE_SUPABASE_URL.replace(/\/$/, "");
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const authId = (await admin.from("delivery_requests").select("customer_auth_id").limit(1).single()).data.customer_auth_id;

function test(label, patch) {
  const doc = {
    customer_auth_id: authId,
    pickup_date: "2026-10-01", pickup_time: "09:00", pickup_time_end: "09:00",
    dropoff_date: "2026-10-01", dropoff_time: "17:00", dropoff_time_end: "17:00",
    delivery_mode: "SAME_DAY",
    pickup_location: "Probe", pickup_lat: 14.5995, pickup_lng: 120.9842,
    dropoff_location: "Probe", dropoff_lat: 14.5995, dropoff_lng: 120.9842,
    stops: [], truck_type: "2T_DRY", item_type: "dry_food", cargo_weight: "800",
    budget_min: null, budget_max: null, notes: null, status: "PENDING_REQUEST",
    suggested_route: null,
    ...patch,
  };
  const doc2 = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
  return admin.from("delivery_requests").insert(doc2).select("id").single();
}

const tests = [
  ["full valid payload", {}],
  ["cargo_weight empty string", { cargo_weight: "" }],
  ["cargo_weight number 800", { cargo_weight: 800 }],
  ["pickup_time_end empty", { pickup_time_end: "" }],
  ["pickup_time_end null", { pickup_time_end: null }],
  ["dropoff_time_end empty", { dropoff_time_end: "" }],
  ["budget_min string '5000.'", { budget_min: "5000." }],
  ["budget_min string '5,000'", { budget_min: "5,000" }],
  ["suggested_route array", { suggested_route: [{from:"a",to:"b"}] }],
  ["stops with objects", { stops: [{location:"x",dropoffTime:"1",dropoffTimeEnd:"2"}] }],
];

for (const [label, patch] of tests) {
  const { error } = await test(label, patch);
  if (error) console.log(`FAIL  ${label}: ${error.code} - ${(error.message || "").slice(0, 90)}`);
  else console.log(`OK   ${label}`);
}
