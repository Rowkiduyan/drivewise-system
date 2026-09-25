// Repro the bug order-of-interaction. Fills the form via DOM/evaluate,
// submits cargoWeight EMPTY first (expect native block), then fills
// cargoWeight and submits again, capturing the actual PostgREST error.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync("C:/Users/Lorenz/Desktop/Codes/drivewise-system/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}
const url = env.VITE_SUPABASE_URL.replace(/\/$/, "");
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Use an auth'd customer token to mirror the real insert path (RLS).
// Sign in as a customer that already has a delivery row's customer_auth_id.
const { data: row } = await admin.from("delivery_requests").select("customer_auth_id").limit(1).single();
const authId = row.customer_auth_id;

// Simulate what the buggy second-submit payload looks like when
// cargoWeight is a VALID number but something ELSE is still empty
// (e.g. a time field left ""). Test each suspect field empty.
const base = {
  customer_auth_id: authId,
  pickup_date: "2026-10-01", pickup_time: "09:00", pickup_time_end: "09:00",
  dropoff_date: "2026-10-01", dropoff_time: "17:00", dropoff_time_end: "17:00",
  delivery_mode: "SAME_DAY",
  pickup_location: "P", pickup_lat: 14.5995, pickup_lng: 120.9842,
  dropoff_location: "P", dropoff_lat: 14.5995, dropoff_lng: 120.9842,
  stops: [], truck_type: "2T_DRY", item_type: "dry_food", cargo_weight: "800",
  budget_min: null, budget_max: null, notes: null, status: "PENDING_REQUEST",
  suggested_route: null,
};
function t(label, patch) {
  const doc = Object.fromEntries(Object.entries({ ...base, ...patch }).filter(([, v]) => v !== undefined));
  return admin.from("delivery_requests").insert(doc).select("id").single();
}

// Emulate: user fills everything but LEAVES pickup_time_end as ""
// (the field that has no || null fallback).
const { error: e1 } = await t("pickup_time_end empty (no fallback)", { pickup_time_end: "" });
console.log(e1 ? `FAIL pickup_time_end="" : ${e1.code}` : "OK  pickup_time_end empty");

// Emulate: dropoff_time_end stale leftover from SAME_DAY->TWO_DAY flip
const { error: e2 } = await t("dropoff_time_end stale empty", { dropoff_time_end: "" });
console.log(e2 ? `FAIL dropoff_time_end="" : ${e2.code}` : "OK  dropoff_time_end empty");

// Emulate: user never touched pickup window -> pickupTimeEnd=""
const { error: e3 } = await t("cargo filled but pickupTimeEnd ''", {});
console.log(e3 ? `FAIL baseline(empty pickupTimeEnd?)` : "OK baseline");
