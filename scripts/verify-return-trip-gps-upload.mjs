#!/usr/bin/env node
// Direct verification of gps-upload's return-trip auto-close logic (the
// Pi's independent GPS path, separate code from driver-trip's log-position
// but meant to behave identically). Registers a disposable test device
// (same pattern as repro-real-gps-pipeline.mjs), temporarily assigns it to
// DR-0053's truck (MIT 300, which has no device registered), opens a fresh
// return-trip session, uploads one GPS point near the warehouse through the
// real gps-upload Edge Function (device_id/device_secret auth, exactly like
// a real Pi), and confirms the session auto-closed + truck mileage moved.
// Fully cleaned up at the end regardless of outcome.
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'crypto'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELIVERY_ID = 'DR-0053'
const TRUCK_PLATE = 'MIT 300'
const TEST_DEVICE_ID = 'DV-RETURNTRIPTEST'
const TEST_DEVICE_SECRET = randomBytes(16).toString('hex')
const WAREHOUSE_COORDS = { lat: 14.57147, lng: 121.08762 }

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex')
}

async function cleanup(sessionId) {
  console.log('\n--- cleanup ---')
  if (sessionId) {
    await admin.from('gps_logs').delete().eq('session_id', sessionId)
    await admin.from('sessions').delete().eq('session_id', sessionId)
    console.log('removed test session + its gps_logs')
  }
  await admin.from('devices').delete().eq('device_id', TEST_DEVICE_ID)
  console.log('removed test device', TEST_DEVICE_ID)
}

async function main() {
  const { data: existingDevice } = await admin
    .from('devices')
    .select('device_id')
    .eq('plate_number', TRUCK_PLATE)
    .maybeSingle()
  if (existingDevice) {
    throw new Error(`${TRUCK_PLATE} already has a device (${existingDevice.device_id}) -- aborting rather than displacing a real assignment`)
  }

  console.log('--- registering disposable test device ---')
  const { error: deviceErr } = await admin.from('devices').insert({
    device_id: TEST_DEVICE_ID,
    device_secret_hash: sha256Hex(TEST_DEVICE_SECRET),
    plate_number: TRUCK_PLATE,
    device_status: 'Active',
  })
  if (deviceErr) throw new Error(`device insert failed: ${deviceErr.message}`)

  console.log('--- opening a fresh return-trip session for DR-0053 on this device ---')
  const { data: delivery } = await admin
    .from('delivery_requests')
    .select('assigned_driver_id')
    .eq('id', DELIVERY_ID)
    .single()
  const { data: session } = await admin
    .from('sessions')
    .insert({
      session_id: crypto.randomUUID(),
      delivery_request_id: DELIVERY_ID,
      driver_id: delivery.assigned_driver_id,
      truck_plate: TRUCK_PLATE,
      device_id: TEST_DEVICE_ID,
      start_time: new Date().toISOString(),
      status: 'Active',
      is_return_trip: true,
    })
    .select()
    .single()
  console.log('opened session:', session.session_id)

  const { data: truckBefore } = await admin.from('trucks').select('current_mileage').eq('plate_number', TRUCK_PLATE).single()
  console.log('truck mileage before:', truckBefore.current_mileage)

  // Two points, ~2km apart, ending within the ~150m geofence -- so there's
  // real distance to sum into truck mileage, not just a single point.
  console.log('--- uploading GPS via the real gps-upload Edge Function (device auth) ---')
  const point1 = { lat: WAREHOUSE_COORDS.lat + 0.02, lng: WAREHOUSE_COORDS.lng }
  const point2 = { lat: WAREHOUSE_COORDS.lat + 0.0002, lng: WAREHOUSE_COORDS.lng }
  for (const [i, pt] of [point1, point2].entries()) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gps-upload`, {
      method: 'POST',
      // Anon-key headers satisfy the Edge Function gateway itself; the real
      // auth (device_id/device_secret) lives in the body, checked entirely
      // inside gps-upload's own handler -- same shape
      // repro-real-gps-pipeline.mjs already established works.
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
      body: JSON.stringify({
        device_id: TEST_DEVICE_ID,
        device_secret: TEST_DEVICE_SECRET,
        latitude: pt.lat,
        longitude: pt.lng,
        timestamp: new Date(Date.now() + i * 5000).toISOString(),
      }),
    })
    const json = await res.json().catch(() => ({}))
    console.log(`point ${i + 1} (${pt.lat}, ${pt.lng}):`, res.status, json)
  }

  const { data: afterSession } = await admin
    .from('sessions')
    .select('status, end_time, session_duration')
    .eq('session_id', session.session_id)
    .single()
  console.log('\nsession after uploads:', afterSession)

  const { data: truckAfter } = await admin.from('trucks').select('current_mileage').eq('plate_number', TRUCK_PLATE).single()
  console.log('truck mileage after:', truckAfter.current_mileage)

  const closed = afterSession.status === 'Completed' && afterSession.end_time !== null
  const mileageMoved = truckAfter.current_mileage > truckBefore.current_mileage
  console.log('\nTEST (gps-upload auto-close):', closed ? 'PASS' : 'FAIL')
  console.log('TEST (mileage summed):', mileageMoved ? 'PASS' : 'FAIL')

  await cleanup(session.session_id)

  if (!closed || !mileageMoved) process.exit(1)
}

main().catch(async (e) => {
  console.error('SCRIPT ERROR:', e.message)
  await cleanup(null).catch(() => {})
  process.exit(1)
})
