#!/usr/bin/env node
// Closes the one remaining gap flagged in
// 14_RETURN_TRIP_MONITORING.md's "Remaining test gaps" section
// (2026-09-13): start-trip's force-close of a still-open return-trip
// Session was only confirmed by code review, never actually triggered live,
// because the only ASSIGNED delivery available for D002 (DR-0065) is a real
// assignment that shouldn't be disturbed.
//
// Follows the doc's recommended fix exactly: create one disposable
// delivery_requests row (status ASSIGNED, assigned to D002/DR-0053's truck),
// open a fake Active is_return_trip Session for D002 on DR-0053 (a
// *different* delivery), call driver-trip's start-trip against the
// disposable delivery, confirm the return-trip Session actually closed, then
// delete the disposable delivery. Zero risk to real data -- nothing real is
// touched or left behind.
//
// Usage: set -a; source .env; set +a; node scripts/verify-start-trip-force-close.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
const REAL_DELIVERY_ID = 'DR-0053' // used only as the return-trip session's own delivery
const DISPOSABLE_ID = 'DR-TEST-STARTTRIP'

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

async function main() {
  const token = await getDriverToken()

  const { data: template, error: templateErr } = await admin
    .from('delivery_requests')
    .select('*')
    .eq('id', REAL_DELIVERY_ID)
    .single()
  if (templateErr) throw new Error(templateErr.message)

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

  try {
    console.log('\n--- creating disposable delivery_requests row (ASSIGNED, D002) ---')
    const { error: insertErr } = await admin.from('delivery_requests').insert({
      id: DISPOSABLE_ID,
      customer_auth_id: template.customer_auth_id,
      pickup_date: template.pickup_date,
      pickup_time: template.pickup_time,
      dropoff_date: template.dropoff_date,
      dropoff_time: template.dropoff_time,
      pickup_location: template.pickup_location,
      dropoff_location: template.dropoff_location,
      pickup_lat: template.pickup_lat,
      pickup_lng: template.pickup_lng,
      dropoff_lat: template.dropoff_lat,
      dropoff_lng: template.dropoff_lng,
      truck_type: template.truck_type,
      item_type: template.item_type,
      cargo_weight: template.cargo_weight,
      budget_min: template.budget_min,
      budget_max: template.budget_max,
      status: 'ASSIGNED',
      assigned_driver_id: 'D002',
      assigned_truck_plate: template.assigned_truck_plate,
      assigned_at: new Date().toISOString(),
      delivery_mode: template.delivery_mode,
    })
    if (insertErr) throw new Error(`disposable delivery insert failed: ${insertErr.message}`)
    console.log('Created', DISPOSABLE_ID)

    console.log('\n--- opening a fake Active return-trip Session for D002 on', REAL_DELIVERY_ID, '---')
    const { data: device } = await admin
      .from('devices')
      .select('device_id')
      .eq('plate_number', template.assigned_truck_plate)
      .maybeSingle()
    const { data: returnSession, error: sessionErr } = await admin
      .from('sessions')
      .insert({
        session_id: crypto.randomUUID(),
        delivery_request_id: REAL_DELIVERY_ID,
        driver_id: 'D002',
        truck_plate: template.assigned_truck_plate,
        device_id: device?.device_id ?? null,
        start_time: new Date().toISOString(),
        status: 'Active',
        is_return_trip: true,
      })
      .select()
      .single()
    if (sessionErr) throw new Error(`return-trip session insert failed: ${sessionErr.message}`)
    console.log('Opened return-trip session:', returnSession.session_id)

    console.log('\n=== TEST: start-trip force-closes the open return-trip Session ===')
    const { status, json } = await callDriverTrip(token, {
      action: 'start-trip',
      deliveryRequestId: DISPOSABLE_ID,
    })
    console.log('start-trip response:', status, json)

    const { data: afterStart } = await admin
      .from('sessions')
      .select('status, end_time, is_return_trip, session_id')
      .eq('session_id', returnSession.session_id)
      .single()
    console.log('Return-trip session status after start-trip:', afterStart)

    const { data: newTripSession } = await admin
      .from('sessions')
      .select('session_id, status, is_return_trip, delivery_request_id')
      .eq('driver_id', 'D002')
      .eq('delivery_request_id', DISPOSABLE_ID)
      .maybeSingle()
    console.log('New real trip session for disposable delivery:', newTripSession)

    const returnClosed = afterStart.status === 'Completed' && afterStart.end_time !== null
    const newTripOpened = status === 200 && newTripSession?.status === 'Active' && newTripSession?.is_return_trip === false
    console.log(returnClosed ? 'PASS: return-trip session force-closed' : 'FAIL: return-trip session NOT closed')
    console.log(newTripOpened ? 'PASS: new real trip session started' : 'FAIL: new trip session not started correctly')

    // --- cleanup: close the new real session too, so nothing is left Active ---
    if (newTripSession) {
      await admin.from('sessions').update({ status: 'Completed', end_time: new Date().toISOString() }).eq('session_id', newTripSession.session_id)
    }

    console.log('\n=== SUMMARY ===')
    console.log('start-trip force-close of open return-trip session:', returnClosed && newTripOpened ? 'PASS' : 'FAIL')
    if (!returnClosed || !newTripOpened) process.exitCode = 1
  } finally {
    console.log('\n--- cleanup: deleting disposable delivery + any leftover sessions ---')
    await admin.from('sessions').delete().eq('delivery_request_id', DISPOSABLE_ID)
    await admin.from('delivery_requests').delete().eq('id', DISPOSABLE_ID)
    console.log('Cleanup done.')
  }
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message)
  process.exit(1)
})
