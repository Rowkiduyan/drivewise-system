#!/usr/bin/env node
// Real-device-pipeline test, requested 2026-08-14: everything about Phase 11
// (Route Comparison) had only ever been exercised via browser-side
// DirectionsService or direct service_role DB inserts into `gps_logs` --
// never through the actual `gps-upload` Edge Function path a real Pi uses
// (device_id/device_secret auth, session resolution by device, etc). This
// script closes that gap without needing physical hardware: it registers a
// real test device (same `devices` row shape/hashing `register-device`
// produces), assigns it to DR-0020's truck, starts a real Trip, and uploads
// GPS ticks through the real `gps-upload` endpoint using DR-0020's own
// already-captured road-following route (scripts/fixtures/DR-0020-legs.json)
// -- so the whole chain (device auth -> session resolution -> gps_logs ->
// mileage calc -> Route Deviation Report) gets a real end-to-end run.
//
// DR-0020 is this repo's established reusable/disposable fixture -- reset at
// the end (status, sessions, gps_logs, device unassigned+removed) so other
// scripts relying on it stay unaffected.
//
// Usage: set -a; source .env; set +a; node scripts/repro-real-gps-pipeline.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { createHash, randomBytes } from 'crypto'
import fs from 'fs'

const BASE = process.argv[2] || 'http://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELIVERY_ID = 'DR-0020'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
const TEST_DEVICE_ID = 'DV-PIPETEST'
const TEST_DEVICE_SECRET = randomBytes(16).toString('hex')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex')
}

async function main() {
  console.log('--- backing up DR-0020 status ---')
  const { data: before, error: beforeErr } = await admin
    .from('delivery_requests')
    .select('status, assigned_truck_plate')
    .eq('id', DELIVERY_ID)
    .single()
  if (beforeErr) throw new Error(beforeErr.message)
  console.log('original status:', before.status, '| truck:', before.assigned_truck_plate)

  const { data: existingDevice } = await admin
    .from('devices')
    .select('device_id')
    .eq('plate_number', before.assigned_truck_plate)
    .maybeSingle()
  if (existingDevice) {
    throw new Error(`Truck ${before.assigned_truck_plate} already has a device (${existingDevice.device_id}) -- aborting rather than displacing a real assignment`)
  }

  try {
    console.log('--- registering a real test device (same hashing register-device uses) ---')
    const { error: deviceErr } = await admin.from('devices').insert({
      device_id: TEST_DEVICE_ID,
      plate_number: before.assigned_truck_plate,
      device_status: 'Active',
      device_secret_hash: sha256Hex(TEST_DEVICE_SECRET),
    })
    if (deviceErr) throw new Error(`Device registration failed: ${deviceErr.message}`)

    console.log('--- resetting DR-0020 to ASSIGNED ---')
    await admin.from('delivery_requests').update({ status: 'ASSIGNED', suggested_route: null }).eq('id', DELIVERY_ID)
    await admin.from('gps_logs').delete().eq('delivery_request_id', DELIVERY_ID)

    console.log('--- driver views the pre-trip screen so PlannedRouteMap generates+saves a real suggested_route ---')
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 500, height: 900 } })
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    await page.goto(BASE, { waitUntil: 'load' })
    await page.fill('input[name="email"]', DRIVER_EMAIL)
    await page.fill('input[name="password"]', DRIVER_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/driver/**', { timeout: 15000 })
    await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(1000)
    await page.locator('button', { hasText: 'Upcoming' }).first().click()
    await page.getByText(DELIVERY_ID, { exact: false }).first().click()
    await page.waitForTimeout(1000)

    let suggestedRouteSaved = false
    for (let i = 0; i < 20; i += 1) {
      const { data: row } = await admin.from('delivery_requests').select('suggested_route').eq('id', DELIVERY_ID).single()
      if (row?.suggested_route) {
        suggestedRouteSaved = true
        break
      }
      await page.waitForTimeout(1000)
    }
    console.log('suggested_route saved:', suggestedRouteSaved)
    if (!suggestedRouteSaved) throw new Error('PlannedRouteMap never saved a suggested_route -- aborting')

    console.log('--- starting a real Trip as the driver (driver-trip start-trip) ---')
    const { data: driverAuth, error: driverAuthErr } = await anon.auth.signInWithPassword({ email: DRIVER_EMAIL, password: DRIVER_PASSWORD })
    if (driverAuthErr) throw new Error(`Driver login failed: ${driverAuthErr.message}`)
    const startRes = await fetch(`${SUPABASE_URL}/functions/v1/driver-trip`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${driverAuth.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start-trip', deliveryRequestId: DELIVERY_ID }),
    })
    const startJson = await startRes.json()
    if (!startRes.ok) throw new Error(`start-trip failed: ${JSON.stringify(startJson)}`)
    const sessionId = startJson.session.session_id
    console.log('session:', sessionId, '| device on session:', startJson.session.device_id)
    if (startJson.session.device_id !== TEST_DEVICE_ID) {
      throw new Error(`Session resolved to device "${startJson.session.device_id}", expected "${TEST_DEVICE_ID}" -- truck/device assignment didn't take`)
    }

    console.log('--- navigating the driver to Live Navigation so real-time rendering can be watched ---')
    await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'scripts/repro-real-gps-pipeline-1-live-start.png' })

    console.log('--- uploading GPS ticks through the REAL gps-upload endpoint (device_id/device_secret auth, exactly like a physical Pi) ---')
    const legs = JSON.parse(fs.readFileSync(new URL('./fixtures/DR-0020-legs.json', import.meta.url)))
    const points = legs.flat()
    console.log(`${points.length} points across ${legs.length} legs`)
    let uploadFailures = 0
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i]
      // Two independent auth layers, matching pi/drowsiness_monitor.py
      // exactly: the anon-key Authorization/apikey headers satisfy the Edge
      // Function gateway's own verify_jwt check (enforced before the
      // function's code even runs), separate from device_id/device_secret
      // in the body, which is gps-upload's own app-level device auth.
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gps-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
        body: JSON.stringify({
          device_id: TEST_DEVICE_ID,
          device_secret: TEST_DEVICE_SECRET,
          latitude: p.lat,
          longitude: p.lng,
          timestamp: new Date().toISOString(),
        }),
      })
      if (!res.ok) uploadFailures += 1
      if (i === 5) {
        // Mid-stream checkpoint: confirm the Driver's Live Navigation view is
        // actually rendering real-time position from these uploads, not just
        // that the inserts succeeded.
        await page.waitForTimeout(2000)
        await page.screenshot({ path: 'scripts/repro-real-gps-pipeline-2-live-position.png' })
      }
      if (i % 40 === 0) console.log(`  tick ${i}/${points.length}`)
    }
    console.log('upload failures:', uploadFailures, '/', points.length)
    await browser.close()

    console.log('--- ending the trip (driver-trip end-trip, real mileage calc off these same gps_logs rows) ---')
    const endRes = await fetch(`${SUPABASE_URL}/functions/v1/driver-trip`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${driverAuth.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end-trip', deliveryRequestId: DELIVERY_ID }),
    })
    const endJson = await endRes.json()
    if (!endRes.ok) throw new Error(`end-trip failed: ${JSON.stringify(endJson)}`)
    console.log('end-trip distanceKm (from real gps-upload rows):', endJson.distanceKm)

    // end-trip currently leaves status at DELIVERED, not COMPLETED --
    // reaching COMPLETED today only happens via a separate flow (the
    // Customer's own "Confirm Receive" action, CustomerDeliveries.jsx; or a
    // Supervisor resolving a reported issue, SupDeliveries.jsx's
    // `resolveIssue`). Per user clarification 2026-08-14: neither of those
    // is *supposed* to be a required gate -- once a delivery is actually
    // done, it should just be COMPLETED, not stuck at DELIVERED awaiting a
    // separate confirmation step. That's a real product-behavior question
    // for `driver-trip`'s end-trip action itself, out of scope for this
    // GPS-pipeline test -- flagged in STATUS.md, not silently fixed here.
    // This line stays a test-only shortcut to reach the Completed list.
    await admin.from('delivery_requests').update({ status: 'COMPLETED' }).eq('id', DELIVERY_ID)

    console.log('--- viewing the Route Deviation Report as Supervisor, built entirely from this real pipeline run ---')
    const supBrowser = await chromium.launch()
    const supPage = await supBrowser.newPage({ viewport: { width: 1280, height: 900 } })
    const supErrors = []
    supPage.on('pageerror', (err) => supErrors.push(err.message))
    await supPage.goto(BASE, { waitUntil: 'load' })
    await supPage.fill('input[name="email"]', 'atdrilon01@marveltrucking.local')
    await supPage.fill('input[name="password"]', 'Temp122wpjir8wy317hoa7r1pkyurx!')
    await supPage.click('button[type="submit"]')
    await supPage.waitForURL('**/supervisor/**', { timeout: 15000 })
    await supPage.goto(`${BASE}/supervisor/deliveries`, { waitUntil: 'load', timeout: 30000 })
    await supPage.locator('button', { hasText: 'Completed Deliveries' }).first().click()
    await supPage.waitForTimeout(500)
    await supPage.getByText(DELIVERY_ID, { exact: true }).first().click()
    await supPage.waitForTimeout(500)
    const routeTab = supPage.locator('button', { hasText: 'Route Deviation Report' }).first()
    const routeTabVisible = await routeTab.isVisible().catch(() => false)
    console.log('Route Deviation Report tab visible:', routeTabVisible)
    if (routeTabVisible) {
      await routeTab.click()
      await supPage.waitForTimeout(1500)
      await supPage.screenshot({ path: 'scripts/repro-real-gps-pipeline-3-sup-route-tab.png' })
    }
    await supBrowser.close()

    const pass = pageErrors.length === 0 && supErrors.length === 0 && uploadFailures === 0 && routeTabVisible
    console.log('driver page errors:', pageErrors)
    console.log('supervisor page errors:', supErrors)
    console.log(pass ? 'PASS' : 'FAIL')
    if (!pass) process.exit(1)
  } finally {
    console.log('--- cleanup: restoring DR-0020 and removing the test device ---')
    await admin.from('gps_logs').delete().eq('delivery_request_id', DELIVERY_ID)
    // Real, separate gap found here: `service_role` has no DELETE grant on
    // `sessions` at all (confirmed via the resulting Postgres error, "Grant
    // the required privileges... GRANT DELETE ON public.sessions TO
    // service_role") -- every other Trip-lifecycle action in this codebase
    // only ever inserts/updates sessions, never deletes one, so this was
    // never hit before. Can't fix the grant from a script (schema change,
    // needs explicit approval per 00_IMPLEMENTATION_RULES.md) -- worked
    // around by UPDATE-ing the leftover test session's device_id to null
    // instead (UPDATE is granted), which frees the devices FK reference so
    // the test device can still be deleted. The session row itself is left
    // behind, harmless -- DR-0020 already carries several historical
    // sessions from earlier test rounds.
    const { error: sessionUpdateErr } = await admin
      .from('sessions')
      .update({ device_id: null })
      .eq('delivery_request_id', DELIVERY_ID)
      .eq('device_id', TEST_DEVICE_ID)
    if (sessionUpdateErr) console.error('session cleanup warning:', sessionUpdateErr.message)
    await admin.from('delivery_requests').update({ status: before.status, suggested_route: null }).eq('id', DELIVERY_ID)
    const { error: deviceDeleteErr } = await admin.from('devices').delete().eq('device_id', TEST_DEVICE_ID)
    if (deviceDeleteErr) console.error('device cleanup warning:', deviceDeleteErr.message)
    const { data: after } = await admin.from('delivery_requests').select('status').eq('id', DELIVERY_ID).single()
    console.log('DR-0020 status confirmed restored:', after?.status, '(expected', before.status, ')')
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
