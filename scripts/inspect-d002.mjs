#!/usr/bin/env node
// Read-only inspection: find D002's driver_id/login email and a candidate
// DELIVERED delivery to demo Phase 14 (Return-Trip Monitoring) against.
// Usage: set -a; source .env; set +a; node scripts/inspect-d002.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  const { data: driver, error: driverErr } = await admin
    .from('driver_records')
    .select('id, auth_id, first_name, last_name')
    .eq('id', 'D002')
    .maybeSingle()
  if (driverErr) throw new Error(driverErr.message)
  if (!driver) throw new Error('D002 not found in driver_records')
  console.log('driver_records:', driver)

  const { data: user, error: userErr } = await admin
    .from('users')
    .select('id, login_email, role')
    .eq('id', driver.auth_id)
    .maybeSingle()
  if (userErr) throw new Error(userErr.message)
  console.log('users:', user)

  const { data: deliveries, error: delErr } = await admin
    .from('delivery_requests')
    .select('id, status, pickup_date, assigned_truck_plate, dropoff_location')
    .eq('assigned_driver_id', 'D002')
    .order('pickup_date', { ascending: false })
    .limit(20)
  if (delErr) throw new Error(delErr.message)
  console.log('\nD002 deliveries (most recent first):')
  for (const d of deliveries || []) {
    console.log(` - ${d.id} | ${d.status} | pickup ${d.pickup_date} | truck ${d.assigned_truck_plate} | -> ${d.dropoff_location}`)
  }

  const delivered = (deliveries || []).filter((d) => d.status === 'DELIVERED')
  console.log('\nDELIVERED candidates:', delivered.map((d) => d.id))
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
