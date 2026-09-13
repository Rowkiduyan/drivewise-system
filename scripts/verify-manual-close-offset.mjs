#!/usr/bin/env node
// One-off live verification for 14B_ARRIVED_AT_BASE_CONFIRMATION.md: confirms
// end-return-trip actually computes and stores manual_close_offset_meters
// when given lat/lng, both far from and near the warehouse. Restores DR-0053
// to its normal fresh-Active-return-session demo state at the end.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
const DELIVERY_ID = 'DR-0053'
const WAREHOUSE_COORDS = { lat: 14.57147, lng: 121.08762 }

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function getDriverToken() {
  const { data, error } = await anon.auth.signInWithPassword({ email: DRIVER_EMAIL, password: DRIVER_PASSWORD })
  if (error) throw new Error(`login failed: ${error.message}`)
  return data.session.access_token
}

async function callDriverTrip(token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/driver-trip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function openReturnSession() {
  const { data: delivery } = await admin
    .from('delivery_requests')
    .select('id, assigned_driver_id, assigned_truck_plate')
    .eq('id', DELIVERY_ID)
    .single()
  const { data: device } = await admin
    .from('devices')
    .select('device_id')
    .eq('plate_number', delivery.assigned_truck_plate)
    .maybeSingle()
  const { data: session } = await admin
    .from('sessions')
    .insert({
      session_id: crypto.randomUUID(),
      delivery_request_id: DELIVERY_ID,
      driver_id: delivery.assigned_driver_id,
      truck_plate: delivery.assigned_truck_plate,
      device_id: device?.device_id ?? null,
      start_time: new Date().toISOString(),
      status: 'Active',
      is_return_trip: true,
    })
    .select()
    .single()
  return session
}

async function main() {
  const token = await getDriverToken()

  const { data: anyActive } = await admin
    .from('sessions')
    .select('session_id')
    .eq('driver_id', 'D002')
    .eq('status', 'Active')
  if (anyActive && anyActive.length > 0) {
    for (const s of anyActive) {
      await admin.from('sessions').update({ status: 'Completed', end_time: new Date().toISOString() }).eq('session_id', s.session_id)
    }
  }

  console.log('=== TEST A: far from warehouse (~5km) ===')
  const sessionA = await openReturnSession()
  const far = { lat: WAREHOUSE_COORDS.lat + 0.045, lng: WAREHOUSE_COORDS.lng } // ~5km
  const { status: sA, json: jA } = await callDriverTrip(token, {
    action: 'end-return-trip',
    deliveryRequestId: DELIVERY_ID,
    lat: far.lat,
    lng: far.lng,
  })
  console.log('response:', sA, jA)
  const { data: afterA } = await admin.from('sessions').select('status, manual_close_offset_meters').eq('session_id', sessionA.session_id).single()
  console.log('stored:', afterA)
  const passA = afterA.status === 'Completed' && afterA.manual_close_offset_meters > 4000 && afterA.manual_close_offset_meters < 6000
  console.log(passA ? 'PASS: far offset stored correctly (~5km)' : 'FAIL')

  console.log('\n=== TEST B: near warehouse (~30m) ===')
  const sessionB = await openReturnSession()
  const near = { lat: WAREHOUSE_COORDS.lat + 0.00025, lng: WAREHOUSE_COORDS.lng } // ~28m
  const { status: sB, json: jB } = await callDriverTrip(token, {
    action: 'end-return-trip',
    deliveryRequestId: DELIVERY_ID,
    lat: near.lat,
    lng: near.lng,
  })
  console.log('response:', sB, jB)
  const { data: afterB } = await admin.from('sessions').select('status, manual_close_offset_meters').eq('session_id', sessionB.session_id).single()
  console.log('stored:', afterB)
  const passB = afterB.status === 'Completed' && afterB.manual_close_offset_meters !== null && afterB.manual_close_offset_meters < 150
  console.log(passB ? 'PASS: near offset stored correctly (<150m)' : 'FAIL')

  console.log('\n=== TEST C: no lat/lng, no gps_logs -> null ===')
  const sessionC = await openReturnSession()
  const { status: sC, json: jC } = await callDriverTrip(token, {
    action: 'end-return-trip',
    deliveryRequestId: DELIVERY_ID,
  })
  console.log('response:', sC, jC)
  const { data: afterC } = await admin.from('sessions').select('status, manual_close_offset_meters').eq('session_id', sessionC.session_id).single()
  console.log('stored:', afterC)
  const passC = afterC.status === 'Completed' && afterC.manual_close_offset_meters === null
  console.log(passC ? 'PASS: no position -> null (no fabricated number)' : 'FAIL')

  console.log('\n--- restoring DR-0053 demo state: fresh Active return-trip session ---')
  const finalSession = await openReturnSession()
  console.log('Restored:', finalSession.session_id)

  console.log('\n=== SUMMARY ===')
  console.log('A (far):', passA ? 'PASS' : 'FAIL')
  console.log('B (near):', passB ? 'PASS' : 'FAIL')
  console.log('C (null fallback):', passC ? 'PASS' : 'FAIL')
  if (!passA || !passB || !passC) process.exitCode = 1
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message)
  process.exit(1)
})
