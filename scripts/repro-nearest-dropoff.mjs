#!/usr/bin/env node
// Disposable diagnostic -- verifies the 2026-08-14 "Dynamic Nearest-Dropoff
// Ordering" feature (02B_MULTI_STOP_DELIVERIES.md). Reuses the DR-0020
// fixture (driver D002 / ayroque01@drivewise.local, helper H003 /
// tdtdurden01@marveltrucking.local, 2 stops, known coordinates -- see
// scripts/README.md and set-dr0020-location.sh for the point list).
//
// Test A (frontend): with the driver's live position placed near Stop 2,
// the status banner's "current dropoff" text should point at Stop 2, not
// the main Dropoff address (the old fixed customer-entered order would
// always have shown Dropoff first). Moving the position near Dropoff
// instead should flip the target back.
//
// Test B (backend): completing Stop 2 FIRST (Helper's complete-stop,
// stopIndex=1) must return isFinal:false, since Dropoff and Stop 1 are
// still incomplete -- the OLD positional logic (stopIndex === stops.length-1)
// would have wrongly returned isFinal:true here. Completing Dropoff next
// must also return isFinal:false (Stop 1 still open). Completing Stop 1
// last must return isFinal:true and the delivery must land on DELIVERED.
//
// Helper auth: no password is recorded anywhere for H003, so this gets a
// real session via Supabase's admin generateLink (magic link) + verify --
// service_role only, never touches/resets the account's actual password.
//
// Usage: set -a; source .env; set +a; node scripts/repro-nearest-dropoff.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELIVERY_ID = 'DR-0020'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
const HELPER_EMAIL = 'tdtdurden01@marveltrucking.local'
const HELPER_ID = 'H003'

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY -- source .env first.')
  process.exit(1)
}

const POINTS = {
  pickup: { lat: 14.5906, lng: 120.9822 },
  dropoff: { lat: 14.6091, lng: 121.0223 },
  stop1: { lat: 14.5995, lng: 120.9842 },
  stop2: { lat: 14.6050, lng: 121.0000 },
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

// A real, minimal 1x1 red-pixel JPEG.
const TEST_PHOTO_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='

async function main() {
  console.log('--- resetting DR-0020 to a clean multi-stop OUT_FOR_DROPOFF state ---')
  await admin
    .from('delivery_requests')
    .update({
      assigned_helper_ids: [HELPER_ID],
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

  if (!session) {
    console.log('--- no Active session, starting a fresh trip as the driver ---')
    await admin.from('delivery_requests').update({ status: 'ASSIGNED' }).eq('id', DELIVERY_ID)
    const { data: authData, error: authError } = await anon.auth.signInWithPassword({
      email: DRIVER_EMAIL,
      password: DRIVER_PASSWORD,
    })
    if (authError) throw new Error(`Driver login failed: ${authError.message}`)
    const driverToken = authData.session.access_token
    const startRes = await fetch(`${SUPABASE_URL}/functions/v1/driver-trip`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${driverToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start-trip', deliveryRequestId: DELIVERY_ID }),
    })
    const startJson = await startRes.json()
    if (!startRes.ok) throw new Error(`start-trip failed: ${JSON.stringify(startJson)}`)
    session = { session_id: startJson.session.session_id }
    await admin.from('delivery_requests').update({
      status: 'OUT_FOR_DROPOFF',
      stops: [{ location: `${POINTS.stop1.lat}, ${POINTS.stop1.lng}` }, { location: `${POINTS.stop2.lat}, ${POINTS.stop2.lng}` }],
    }).eq('id', DELIVERY_ID)
  }
  const sessionId = session.session_id
  console.log('session_id:', sessionId)

  async function setPosition(point, withSession) {
    const row = {
      delivery_request_id: DELIVERY_ID,
      latitude: point.lat,
      longitude: point.lng,
      timestamp: new Date().toISOString(),
    }
    if (withSession) row.session_id = sessionId
    const { error } = await admin.from('gps_logs').insert(row)
    if (error) throw new Error(`gps_logs insert failed: ${error.message}`)
  }

  // ---------------------------------------------------------------------
  // Test A -- Driver nav routes to whichever remaining dropoff is nearest.
  // Asserted by capturing DirectionsService's actual `destination` request
  // field (patched in, same technique as gps-route-capture.mjs), not by
  // matching rendered text -- the on-screen address is reverse-geocoded
  // async (useResolvedAddress) and can flip from raw "lat, lng" to a real
  // street name at an unpredictable moment, which would make a text-match
  // assertion flaky regardless of whether the underlying logic is correct.
  // ---------------------------------------------------------------------
  console.log('\n=== TEST A: driver nav nearest-dropoff routing ===')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.addInitScript(() => {
    window.__lastDestination = null
    const poll = setInterval(() => {
      if (window.google && window.google.maps && window.google.maps.DirectionsService && !window.__dsPatched) {
        window.__dsPatched = true
        const OrigDS = window.google.maps.DirectionsService
        class PatchedDS extends OrigDS {
          route(req, cb) {
            if (req && req.destination) window.__lastDestination = req.destination
            return super.route(req, cb)
          }
        }
        window.google.maps.DirectionsService = PatchedDS
        clearInterval(poll)
      }
    }, 20)
  })

  await page.goto(BASE, { waitUntil: 'load' })
  await page.fill('input[name="email"]', DRIVER_EMAIL)
  await page.fill('input[name="password"]', DRIVER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/driver/**', { timeout: 15000 })

  const near = (a, b) => a && b && Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lng - b.lng) < 0.001

  console.log('--- placing position near Stop 2 (14.6050, 121.0000) ---')
  await setPosition(POINTS.stop2, true)
  await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => window.__lastDestination, null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2000) // let the livePosition seed-fetch's follow-up recompute land too
  await page.screenshot({ path: 'scripts/repro-nearest-a1.png' })
  const destNearStop2 = await page.evaluate(() => window.__lastDestination)
  const matchesStop2 = near(destNearStop2, POINTS.stop2)
  console.log('destination while nearest to Stop 2:', destNearStop2, '-> matches Stop 2:', matchesStop2)

  console.log('--- placing position near Dropoff (14.6091, 121.0223) ---')
  await page.evaluate(() => { window.__lastDestination = null })
  await setPosition(POINTS.dropoff, true)
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => window.__lastDestination, null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'scripts/repro-nearest-a2.png' })
  const destNearDropoff = await page.evaluate(() => window.__lastDestination)
  const matchesDropoff = near(destNearDropoff, POINTS.dropoff)
  console.log('destination while nearest to Dropoff:', destNearDropoff, '-> matches Dropoff:', matchesDropoff)
  console.log('page errors:', pageErrors)

  await browser.close()

  const testAPass = pageErrors.length === 0 && matchesStop2 && matchesDropoff
  console.log(testAPass ? 'TEST A: PASS' : 'TEST A: FAIL')

  // ---------------------------------------------------------------------
  // Test B -- backend isFinal reflects completion state, not array position
  // ---------------------------------------------------------------------
  console.log('\n=== TEST B: backend isFinal (completion-state-based, not positional) ===')
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: HELPER_EMAIL,
  })
  if (linkError) throw new Error(`generateLink failed: ${linkError.message}`)
  const hashedToken = linkData.properties.hashed_token
  const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'magiclink',
  })
  if (verifyError) throw new Error(`verifyOtp failed: ${verifyError.message}`)
  const helperToken = verifyData.session.access_token
  console.log('helper session acquired via magic link (password untouched)')

  async function callHelperAction(action, extra) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${helperToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, deliveryId: DELIVERY_ID, fileBase64: TEST_PHOTO_BASE64, contentType: 'image/jpeg', ...extra }),
    })
    const json = await res.json()
    return { ok: res.ok, json }
  }

  console.log('--- completing Stop 2 (index 1) FIRST -- Dropoff and Stop 1 still open ---')
  await setPosition(POINTS.stop2, false)
  const stop2Result = await callHelperAction('complete-stop', { stopIndex: 1 })
  console.log('complete-stop(1) ->', stop2Result.ok ? 'ok' : 'error', 'isFinal:', stop2Result.json.isFinal, stop2Result.json.error || '')

  console.log('--- completing Dropoff next -- Stop 1 still open ---')
  await setPosition(POINTS.dropoff, false)
  const dropoffResult = await callHelperAction('complete-dropoff')
  console.log('complete-dropoff ->', dropoffResult.ok ? 'ok' : 'error', 'isFinal:', dropoffResult.json.isFinal, dropoffResult.json.error || '')

  console.log('--- completing Stop 1 (index 0) LAST -- nothing else remains ---')
  await setPosition(POINTS.stop1, false)
  const stop1Result = await callHelperAction('complete-stop', { stopIndex: 0 })
  console.log('complete-stop(0) ->', stop1Result.ok ? 'ok' : 'error', 'isFinal:', stop1Result.json.isFinal, stop1Result.json.error || '')

  const { data: finalRow } = await admin.from('delivery_requests').select('status').eq('id', DELIVERY_ID).maybeSingle()
  console.log('final delivery_requests.status:', finalRow?.status)

  const testBPass =
    stop2Result.ok && stop2Result.json.isFinal === false &&
    dropoffResult.ok && dropoffResult.json.isFinal === false &&
    stop1Result.ok && stop1Result.json.isFinal === true &&
    finalRow?.status === 'DELIVERED'
  console.log(testBPass ? 'TEST B: PASS' : 'TEST B: FAIL')

  // ---------------------------------------------------------------------
  // Cleanup -- close the session, revert DR-0020 to a clean reusable state
  // ---------------------------------------------------------------------
  console.log('\n--- cleanup ---')
  const { data: authData2 } = await anon.auth.signInWithPassword({ email: DRIVER_EMAIL, password: DRIVER_PASSWORD })
  await fetch(`${SUPABASE_URL}/functions/v1/driver-trip`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${authData2.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'end-trip', deliveryRequestId: DELIVERY_ID }),
  }).catch(() => {})
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

  console.log('\n--- OVERALL ---')
  console.log(testAPass && testBPass ? 'ALL PASS' : 'SOME FAILED')
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
