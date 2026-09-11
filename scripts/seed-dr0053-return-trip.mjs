#!/usr/bin/env node
// Demo seed for Phase 14 (Return-Trip Monitoring): opens a real Active
// is_return_trip Session on an already-DELIVERED delivery (DR-0053, D002's
// most recent real delivered trip) so logging in as D002 immediately shows
// the "Returning to Base" workspace, without re-running a whole delivery
// end-to-end. Mirrors exactly what driver-trip's end-trip action itself
// would insert. Does NOT touch delivery_requests.status (already DELIVERED)
// or any existing session row -- purely additive, and
// scripts/cleanup-dr0053-return-trip.mjs reverses it.
// Usage: set -a; source .env; set +a; node scripts/seed-dr0053-return-trip.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const DELIVERY_ID = 'DR-0053'
const DRIVER_ID = 'D002'

async function main() {
  const { data: delivery, error: deliveryErr } = await admin
    .from('delivery_requests')
    .select('id, status, assigned_driver_id, assigned_truck_plate')
    .eq('id', DELIVERY_ID)
    .single()
  if (deliveryErr) throw new Error(deliveryErr.message)
  if (delivery.status !== 'DELIVERED') {
    throw new Error(`Expected DELIVERED, got ${delivery.status} -- aborting`)
  }
  if (delivery.assigned_driver_id !== DRIVER_ID) {
    throw new Error(`Expected assigned to ${DRIVER_ID}, got ${delivery.assigned_driver_id} -- aborting`)
  }

  const { data: existingActive } = await admin
    .from('sessions')
    .select('session_id, is_return_trip')
    .eq('delivery_request_id', DELIVERY_ID)
    .eq('status', 'Active')
    .maybeSingle()
  if (existingActive) {
    throw new Error(`${DELIVERY_ID} already has an Active session (${existingActive.session_id}, is_return_trip=${existingActive.is_return_trip}) -- aborting rather than creating a second one`)
  }

  let deviceId = null
  if (delivery.assigned_truck_plate) {
    const { data: device } = await admin
      .from('devices')
      .select('device_id')
      .eq('plate_number', delivery.assigned_truck_plate)
      .maybeSingle()
    deviceId = device?.device_id ?? null
  }

  const sessionId = crypto.randomUUID()
  const { data: inserted, error: insertErr } = await admin
    .from('sessions')
    .insert({
      session_id: sessionId,
      delivery_request_id: DELIVERY_ID,
      driver_id: DRIVER_ID,
      truck_plate: delivery.assigned_truck_plate,
      device_id: deviceId,
      start_time: new Date().toISOString(),
      status: 'Active',
      is_return_trip: true,
    })
    .select()
    .single()
  if (insertErr) throw new Error(insertErr.message)

  console.log('Seeded return-trip session:', inserted)
  console.log(`\nLog in as D002 (${DRIVER_ID}) and open the Driver portal -- ${DELIVERY_ID} should now show "Returning to Base".`)
  console.log(`When done, run: node scripts/cleanup-dr0053-return-trip.mjs`)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
