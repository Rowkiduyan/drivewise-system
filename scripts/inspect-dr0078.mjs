#!/usr/bin/env node
// Read-only inspection of DR-0078: delivery, its session(s), assigned
// device's heartbeat/ping state, and any alerts logged against it.
// Usage: set -a; source .env; set +a; node scripts/inspect-dr0078.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  const { data: delivery, error: delErr } = await admin
    .from('delivery_requests')
    .select('*')
    .eq('id', 'DR-0078')
    .maybeSingle()
  if (delErr) throw new Error(delErr.message)
  if (!delivery) throw new Error('DR-0078 not found in delivery_requests')
  console.log('delivery_requests:', delivery)

  const { data: sessions, error: sessErr } = await admin
    .from('sessions')
    .select('*')
    .eq('delivery_id', delivery.id)
    .order('created_at', { ascending: false })
  if (sessErr) console.log('sessions query error (may use a different FK column):', sessErr.message)
  console.log('\nsessions:', sessions)

  if (delivery.assigned_truck_plate) {
    const { data: device, error: devErr } = await admin
      .from('devices')
      .select('device_id, plate_number, device_status, created_at, last_ping')
      .eq('plate_number', delivery.assigned_truck_plate)
      .maybeSingle()
    if (devErr) console.log('device query error:', devErr.message)
    console.log('\ndevice for assigned truck:', device)
  }

  const { data: alerts, error: alertErr } = await admin
    .from('alerts')
    .select('*')
    .in('session_id', (sessions || []).map((s) => s.session_id || s.id))
    .order('created_at', { ascending: false })
  if (alertErr) console.log('alerts query error:', alertErr.message)
  console.log('\nalerts:', alerts)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
