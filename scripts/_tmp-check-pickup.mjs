import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ids = ["DR-0104", "DR-0105", "DR-0106", "DR-0107", "DR-0108", "DR-0114"];
const { data, error } = await supabase
  .from("delivery_requests")
  .select("id, status, pickup_location, pickup_lat, pickup_lng, dropoff_location, item_type, customer_auth_id, created_at")
  .in("id", ids);
console.log(JSON.stringify(data, null, 2));
console.log(error);
