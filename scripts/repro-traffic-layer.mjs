#!/usr/bin/env node
// Disposable diagnostic -- verifies the 2026-08-30 "Visual traffic layer
// added to Live Navigation" change (STATUS.md): confirms <TrafficLayer />
// actually instantiates and attaches to the map inside LiveNavigationMap
// (DriverDeliveries.jsx), and that doing so throws no console/page errors.
//
// Can't assert real congestion coloring shows up (that depends on Google's
// live traffic data for these exact roads at request time, which nothing
// here can force or mock) -- this only proves the layer object is created
// and wired to the live map instance without erroring, same limitation
// called out in STATUS.md's entry for this change.
//
// Reuses the DR-0020 fixture (driver D002 / ayroque01@drivewise.local --
// see scripts/README.md).
//
// Usage: set -a; source .env; set +a; node scripts/repro-traffic-layer.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELIVERY_ID = 'DR-0020'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY -- source .env first.')
  process.exit(1)
}

const POINTS = {
  pickup: { lat: 14.5906, lng: 120.9822 },
  stop1: { lat: 14.5995, lng: 120.9842 },
  stop2: { lat: 14.6050, lng: 121.0000 },
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  console.log('--- resetting DR-0020 to a clean OUT_FOR_DROPOFF state ---')
  await admin
    .from('delivery_requests')
    .update({
      status: 'OUT_FOR_DROPOFF',
      pickup_photo_url: null,
      dropoff_photo_url: null,
      dropoff_completed_at: null,
      stops: [{ location: `${POINTS.stop1.lat}, ${POINTS.stop1.lng}` }, { location: `${POINTS.stop2.lat}, ${POINTS.stop2.lng}` }],
    })
    .eq('id', DELIVERY_ID)

  await admin.from('gps_logs').delete().eq('delivery_request_id', DELIVERY_ID)

  let { data: session } = await admin
    .from('sessions')
    .select('session_id')
    .eq('delivery_request_id', DELIVERY_ID)
    .eq('status', 'Active')
    .maybeSingle()

  const { data: authData, error: authError } = await anon.auth.signInWithPassword({
    email: DRIVER_EMAIL,
    password: DRIVER_PASSWORD,
  })
  if (authError) throw new Error(`Driver login failed: ${authError.message}`)
  const driverToken = authData.session.access_token

  if (!session) {
    // Driver D002 currently has an unrelated Paused trip open on a different
    // delivery (DR-0028) -- driver-trip's start-trip guard (Phase 9 gap #1)
    // rejects a new trip whenever ANY of the driver's other deliveries is
    // Paused, not just this one, and that other delivery's in-progress state
    // isn't ours to touch/end. Inserting the Active session directly via
    // service_role sidesteps that endpoint's guard entirely -- same
    // test-only shortcut scripts/simulate-dr0040.sh already uses.
    console.log('--- no Active session, inserting one directly via service_role (start-trip is blocked by an unrelated Paused delivery on this driver) ---')
    const { data: inserted, error: insertError } = await admin
      .from('sessions')
      .insert({
        session_id: crypto.randomUUID(),
        delivery_request_id: DELIVERY_ID,
        driver_id: 'D002',
        status: 'Active',
        start_time: new Date().toISOString(),
      })
      .select('session_id')
      .single()
    if (insertError) throw new Error(`session insert failed: ${insertError.message}`)
    session = inserted
  }
  const sessionId = session.session_id
  console.log('session_id:', sessionId)

  await admin.from('gps_logs').insert({
    delivery_request_id: DELIVERY_ID,
    session_id: sessionId,
    latitude: POINTS.pickup.lat,
    longitude: POINTS.pickup.lng,
    timestamp: new Date().toISOString(),
  })

  console.log('\n=== checking TrafficLayer mounts on the live nav map, no errors ===')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('console', (msg) => {
    // Excludes the benign "Vector Map...Falling back to Raster" warning --
    // fires in any headless/no-GPU Chromium regardless of TrafficLayer
    // (comes from the mapId option), not something this change introduced.
    if (msg.type() === 'error' && !msg.text().includes('Falling back to Raster')) consoleErrors.push(msg.text())
  })

  // Patches google.maps.TrafficLayer so we can observe whether React actually
  // instantiates it and calls setMap() with a real map instance -- can't just
  // check for a DOM node, TrafficLayer renders as private overlay tiles with
  // no stable selector. Same "replace the whole class once it appears on
  // window.google.maps" technique gps-route-capture.mjs already uses for
  // DirectionsService, since reassigning just the prototype method is
  // silently ignored by the SDK.
  await page.addInitScript(() => {
    window.__trafficLayerCreated = false
    window.__trafficLayerAttachedMap = null
    const poll = setInterval(() => {
      if (window.google && window.google.maps && window.google.maps.TrafficLayer && !window.__tlPatched) {
        window.__tlPatched = true
        const OrigTL = window.google.maps.TrafficLayer
        class PatchedTL extends OrigTL {
          constructor(...args) {
            super(...args)
            window.__trafficLayerCreated = true
          }
          setMap(map) {
            window.__trafficLayerAttachedMap = map
            return super.setMap(map)
          }
        }
        window.google.maps.TrafficLayer = PatchedTL
        clearInterval(poll)
      }
    }, 20)
  })

  await page.goto(BASE, { waitUntil: 'load' })
  await page.fill('input[name="email"]', DRIVER_EMAIL)
  await page.fill('input[name="password"]', DRIVER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/driver/**', { timeout: 15000 })

  await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => window.__trafficLayerCreated === true, null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500) // let any late console errors land
  await page.screenshot({ path: 'scripts/repro-traffic-layer.png' })

  const created = await page.evaluate(() => window.__trafficLayerCreated)
  const attachedMap = await page.evaluate(() => window.__trafficLayerAttachedMap !== null)

  console.log('TrafficLayer instantiated:', created)
  console.log('TrafficLayer.setMap() called with a real map:', attachedMap)
  console.log('page errors:', pageErrors)
  console.log('console errors:', consoleErrors)

  await browser.close()

  const pass = created && attachedMap && pageErrors.length === 0 && consoleErrors.length === 0
  console.log(pass ? '\nPASS: TrafficLayer mounted cleanly, no errors.' : '\nFAIL: see details above.')

  console.log('\n--- cleanup ---')
  await admin.from('sessions').update({ status: 'Completed', end_time: new Date().toISOString() }).eq('session_id', sessionId)
  await admin.from('gps_logs').delete().eq('delivery_request_id', DELIVERY_ID)
  await admin
    .from('delivery_requests')
    .update({
      status: 'OUT_FOR_PICKUP',
      pickup_photo_url: null,
      dropoff_photo_url: null,
      dropoff_completed_at: null,
      stops: [{ location: `${POINTS.stop1.lat}, ${POINTS.stop1.lng}` }, { location: `${POINTS.stop2.lat}, ${POINTS.stop2.lng}` }],
    })
    .eq('id', DELIVERY_ID)
  console.log('DR-0020 reset back to a clean reusable state.')

  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
