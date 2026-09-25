// Test what Postgres numeric rejects with cargo_weight-like values.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync("C:/Users/Lorenz/Desktop/Codes/drivewise-system/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}
const admin = createClient(env.VITE_SUPABASE_URL.replace(/\/$/, ""), env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const authId = (await admin.from("delivery_requests").select("customer_auth_id").limit(1).single()).data.customer_auth_id;

const base = {
  customer_auth_id: authId, pickup_date:"2026-10-01", pickup_time:"09:00", pickup_time_end:"09:00",
  dropoff_date:"2026-10-01", dropoff_time:"17:00", dropoff_time_end:"17:00",
  delivery_mode:"SAME_DAY", pickup_location:"P", pickup_lat:14.5995, pickup_lng:120.9842,
  dropoff_location:"P", dropoff_lat:14.5995, dropoff_lng:120.9842,
  stops:[], truck_type:"2T_DRY", item_type:"dry_food", budget_min:null, budget_max:null,
  notes:null, status:"PENDING_REQUEST", suggested_route:null,
};

// Values a user might type into a type=number input (decimals, large, scientific, leading dot, negative)
const cargoCases = ["800", "800.0", "800.5", "1e5", ".5", "0", "-5", "1_000", " 800 ", "1,500", "99999999999999999999"];
for (const v of cargoCases) {
  const doc = Object.fromEntries(Object.entries({...base, cargo_weight: v}).filter(([,x])=>x!==undefined));
  const { error } = await admin.from("delivery_requests").insert(doc).select("id").single();
  console.log((error ? `FAIL ` : `OK   `) + `cargo_weight=${JSON.stringify(v)}: ${error ? error.code : ""}`);
}
