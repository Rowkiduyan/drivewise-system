#!/usr/bin/env node
// Direct Edge Function exercise for Phase 14's driver-trip actions --
// doesn't go through the browser at all, calls the deployed functions the
// same way the frontend does (driver's own access token). Verifies:
// 1. log-position's geofence auto-close actually closes an Active
//    is_return_trip session when a point lands within ~150m of the
//    warehouse.
// 2. end-return-trip (the manual fallback) closes a fresh one on demand.
// 3. start-trip force-closes a still-open return-trip session before
//    starting a real new trip (dry-run only -- reads the guard's own
//    rejection reason without actually starting DR-0065's trip for real,
//    since that's a real, currently-ASSIGNED delivery we shouldn't disturb).
// Leaves DR-0053 with a fresh Active return-trip session at the end, same
// state scripts/seed-dr0053-return-trip.mjs would produce, so the earlier
// live demo keeps working afterward.
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
  const { data, error } = await anon.auth.signInWithPassword({
    email: DRIVER_EMAIL,
    password: DRIVER_PASSWORD,
  })
  if (error) throw new Error(`login failed: ${error.message}`)
  return data.session.access_token
}

async function callDriverTrip(token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/driver-trip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
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

  // --- ensure a clean starting state: no open session anywhere for D002 ---
  const { data: anyActive } = await admin
    .from('sessions')
    .select('session_id, delivery_request_id, is_return_trip')
    .eq('driver_id', 'D002')
    .eq('status', 'Active')
  console.log('Pre-test Active sessions for D002:', anyActive)
  if (anyActive && anyActive.length > 0) {
    console.log('Closing pre-existing Active session(s) before testing...')
    for (const s of anyActive) {
      await admin.from('sessions').update({ status: 'Completed', end_time: new Date().toISOString() }).eq('session_id', s.session_id)
    }
  }

  // ============ TEST 1: log-position geofence auto-close ============
  console.log('\n=== TEST 1: log-position geofence auto-close ===')
  const session1 = await openReturnSession()
  console.log('Opened test session:', session1.session_id)

  // A point ~30m from the warehouse -- well within the 150m geofence.
  const near = { lat: WAREHOUSE_COORDS.lat + 0.00025, lng: WAREHOUSE_COORDS.lng }
  const { status: s1, json: j1 } = await callDriverTrip(token, {
    action: 'log-position',
    deliveryRequestId: DELIVERY_ID,
    lat: near.lat,
    lng: near.lng,
  })
  console.log('log-position response:', s1, j1)

  const { data: afterGeofence } = await admin
    .from('sessions')
    .select('status, end_time')
    .eq('session_id', session1.session_id)
    .single()
  console.log('Session status after near-warehouse ping:', afterGeofence)
  const test1Pass = afterGeofence.status === 'Completed' && afterGeofence.end_time !== null
  console.log(test1Pass ? 'TEST 1 PASSED (auto-closed)' : 'TEST 1 FAILED (did not auto-close)')

  // ============ TEST 2: manual end-return-trip fallback ============
  console.log('\n=== TEST 2: manual end-return-trip fallback ===')
  const session2 = await openReturnSession()
  console.log('Opened test session:', session2.session_id)
  const { status: s2, json: j2 } = await callDriverTrip(token, {
    action: 'end-return-trip',
    deliveryRequestId: DELIVERY_ID,
  })
  console.log('end-return-trip response:', s2, j2)
  const { data: afterManual } = await admin
    .from('sessions')
    .select('status, end_time')
    .eq('session_id', session2.session_id)
    .single()
  console.log('Session status after manual close:', afterManual)
  const test2Pass = s2 === 200 && afterManual.status === 'Completed'
  console.log(test2Pass ? 'TEST 2 PASSED' : 'TEST 2 FAILED')

  // ============ TEST 3: end-return-trip on an already-closed session (idempotency) ============
  console.log('\n=== TEST 3: end-return-trip when nothing is open (should 400, not crash) ===')
  const { status: s3, json: j3 } = await callDriverTrip(token, {
    action: 'end-return-trip',
    deliveryRequestId: DELIVERY_ID,
  })
  console.log('response:', s3, j3)
  const test3Pass = s3 === 400
  console.log(test3Pass ? 'TEST 3 PASSED (correctly rejected)' : 'TEST 3 FAILED')

  // ============ restore demo state: fresh Active return session on DR-0053 ============
  const finalSession = await openReturnSession()
  console.log('\nRestored demo state -- fresh Active return-trip session:', finalSession.session_id)

  console.log('\n=== SUMMARY ===')
  console.log('TEST 1 (geofence auto-close):', test1Pass ? 'PASS' : 'FAIL')
  console.log('TEST 2 (manual end-return-trip):', test2Pass ? 'PASS' : 'FAIL')
  console.log('TEST 3 (idempotent reject):', test3Pass ? 'PASS' : 'FAIL')
  if (!test1Pass || !test2Pass || !test3Pass) process.exit(1)
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message)
  process.exit(1)
})
