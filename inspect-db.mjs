import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const url = env.VITE_SUPABASE_URL.replace(/\/$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function listTables() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`REST root failed: ${res.status}`);
  const spec = await res.json();
  return Object.keys(spec.definitions || spec).sort();
}

async function tableInfo(name) {
  const count = await supabase.from(name).select('*', { count: 'exact', head: true });
  const sample = await supabase.from(name).select('*').limit(3);
  const err = count.error || sample.error;
  if (err) return { name, error: err.message || err.code || JSON.stringify(err) };
  const columns = sample.data && sample.data[0] ? Object.keys(sample.data[0]) : [];
  return { name, rows: count.count ?? 0, columns, sample: sample.data ?? [] };
}

const tables = await listTables();
console.log(`Exposed tables/views (${tables.length}):`);
console.log(tables.join('\n'));

for (const t of tables) {
  const info = await tableInfo(t);
  console.log(`\n=== ${info.name} ===`);
  if (info.error) { console.log(`  ERROR: ${info.error}`); continue; }
  console.log(`  rows: ${info.rows}`);
  console.log(`  columns: ${info.columns.join(', ')}`);
  for (const row of info.sample) {
    const compact = JSON.stringify(row);
    console.log(`  - ${compact.length > 400 ? compact.slice(0, 400) + '...' : compact}`);
  }
}
