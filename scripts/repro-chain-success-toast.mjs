#!/usr/bin/env node
// Disposable diagnostic -- verifies the 2026-08-14 chain-completion success
// toast added to HelperDeliveries.jsx (submitChainAction previously closed
// the confirm modal silently on success with no confirmation the upload
// went through). Reuses the DR-0020 fixture.
//
// Helper auth: no password is recorded for H003, so this injects a real
// session (obtained via service_role's admin generateLink + anon verifyOtp,
// same technique as repro-nearest-dropoff.mjs) directly into the browser's
// localStorage under supabase-js's default storage key, rather than driving
// the login form -- this exercises the real app code/UI once loaded, only
// the login step itself is bypassed.
//
// Usage: set -a; source .env; set +a; node scripts/repro-chain-success-toast.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.argv[2] || 'http://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const DELIVERY_ID = 'DR-0020'
const HELPER_EMAIL = 'tdtdurden01@marveltrucking.local'
const HELPER_ID = 'H003'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'

const POINTS = {
  pickup: { lat: 14.5906, lng: 120.9822 },
  dropoff: { lat: 14.6091, lng: 121.0223 },
  stop1: { lat: 14.5995, lng: 120.9842 },
  stop2: { lat: 14.605, lng: 121 },
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function setPosition(point) {
  await admin.from('gps_logs').insert({
    delivery_request_id: DELIVERY_ID,
    latitude: point.lat,
    longitude: point.lng,
    timestamp: new Date().toISOString(),
  })
}

async function main() {
  // Stops deliberately left incomplete -- completing Dropoff here must NOT
  // be the final item (isFinal: false), so the toast reads "Dropoff
  // Confirmed" rather than "Delivery Completed", the specific non-final
  // case this test is checking.
  console.log('--- resetting DR-0020 to OUT_FOR_DROPOFF, pickup already done, dropoff+stops still open ---')
  await admin
    .from('delivery_requests')
    .update({
      assigned_helper_ids: [HELPER_ID],
      status: 'OUT_FOR_DROPOFF',
      pickup_photo_url: 'https://example.com/already-done.jpg',
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
    const { data: driverAuth, error: driverAuthErr } = await anon.auth.signInWithPassword({ email: DRIVER_EMAIL, password: DRIVER_PASSWORD })
    if (driverAuthErr) throw new Error(`Driver login failed: ${driverAuthErr.message}`)
    const startRes = await fetch(`${SUPABASE_URL}/functions/v1/driver-trip`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${driverAuth.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start-trip', deliveryRequestId: DELIVERY_ID }),
    })
    const startJson = await startRes.json()
    if (!startRes.ok) throw new Error(`start-trip failed: ${JSON.stringify(startJson)}`)
    await admin
      .from('delivery_requests')
      .update({
        status: 'OUT_FOR_DROPOFF',
        pickup_photo_url: 'https://example.com/already-done.jpg',
        stops: [{ location: `${POINTS.stop1.lat}, ${POINTS.stop1.lng}` }, { location: `${POINTS.stop2.lat}, ${POINTS.stop2.lng}` }],
      })
      .eq('id', DELIVERY_ID)
  }

  console.log('--- placing crew position at Dropoff (location gate) ---')
  await setPosition(POINTS.dropoff)

  console.log('--- acquiring a real Helper session via magic link (password untouched) ---')
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: HELPER_EMAIL })
  if (linkError) throw new Error(`generateLink failed: ${linkError.message}`)
  const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
  if (verifyError) throw new Error(`verifyOtp failed: ${verifyError.message}`)
  const helperSession = verifyData.session

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.addInitScript(
    ([key, session]) => {
      localStorage.setItem(key, JSON.stringify(session))
    },
    [STORAGE_KEY, helperSession],
  )

  await page.goto(`${BASE}/helper/trips`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'scripts/repro-chain-toast-1-loaded.png' })

  console.log('--- clicking Complete on the Dropoff chain item ---')
  const completeButton = page.locator('button:has-text("Complete")').first()
  await completeButton.waitFor({ timeout: 15000 })
  await completeButton.click()

  await page.setInputFiles('#chain-photo-input', path.join(__dirname, 'repro-test-photo.jpg'))
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'scripts/repro-chain-toast-2-photo-picked.png' })

  await page.locator('button:has-text("Complete")').last().click()
  await page
    .locator('text=Dropoff Confirmed')
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {})
  await page.screenshot({ path: 'scripts/repro-chain-toast-3-after-submit.png' })

  const toastVisible = await page.locator('text=Dropoff Confirmed').first().isVisible().catch(() => false)
  const subtextVisible = await page.locator('text=Photo uploaded successfully.').first().isVisible().catch(() => false)
  console.log('page errors:', pageErrors)
  console.log('"Dropoff Confirmed" toast visible:', toastVisible)
  console.log('subtext visible:', subtextVisible)

  await browser.close()

  const pass = pageErrors.length === 0 && toastVisible && subtextVisible
  console.log(pass ? 'PASS' : 'FAIL')

  console.log('\n--- cleanup ---')
  const { data: driverAuth2 } = await anon.auth.signInWithPassword({ email: DRIVER_EMAIL, password: DRIVER_PASSWORD })
  await fetch(`${SUPABASE_URL}/functions/v1/driver-trip`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${driverAuth2.session.access_token}`, 'Content-Type': 'application/json' },
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
  if (!pass) process.exit(1)
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
