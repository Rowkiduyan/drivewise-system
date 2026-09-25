// Probe: does delivery_requests_id_seq drift behind max(id)?
// Inserts one row with NO explicit id (so the DB default nextval applies),
// reports success/error, then deletes it. Read-only in effect.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync("C:/Users/Lorenz/Desktop/Codes/drivewise-system/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}
const url = env.VITE_SUPABASE_URL.replace(/\/$/, "");
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error: selErr } = await admin
  .from("delivery_requests")
  .select("id, customer_auth_id, pickup_date, pickup_time, dropoff_date, dropoff_time, pickup_location, dropoff_location, truck_type, item_type, cargo_weight")
  .order("id", { ascending: false })
  .limit(3);
if (selErr) throw new Error(selErr.message);
console.log("Top ids:", rows.map((r) => r.id).join(", "));
const seed = rows.find((r) => /^DR-\d+$/.test(r.id));
console.log("Using template:", seed.id);

const { data: inserted, error: insErr } = await admin
  .from("delivery_requests")
  .insert({
    customer_auth_id: seed.customer_auth_id,
    pickup_date: seed.pickup_date,
    pickup_time: seed.pickup_time,
    dropoff_date: seed.dropoff_date,
    dropoff_time: seed.dropoff_time,
    pickup_location: "SEQ-PROBE",
    dropoff_location: "SEQ-PROBE",
    truck_type: seed.truck_type,
    item_type: seed.item_type,
    cargo_weight: 1,
    status: "CANCELLED",
  })
  .select("id")
  .single();

if (insErr) {
  console.log("INSERT ERROR:", insErr.code, "-", insErr.message);
  process.exit(2);
}
console.log("Insert OK, generated id:", inserted.id);
const { error: delErr } = await admin.from("delivery_requests").delete().eq("id", inserted.id);
console.log("Cleanup:", delErr ? `FAILED: ${delErr.message}` : "deleted probe row");
