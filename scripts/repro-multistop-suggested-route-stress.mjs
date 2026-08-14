#!/usr/bin/env node
// Stress-tests `suggested_route` against a real multi-stop, real-address
// delivery -- everything tested so far used either DR-0020's lat/lng-style
// fixture addresses (parseable, short chain) or DR-0021's single-leg real
// address. Nothing has exercised several real street addresses across a
// wide, multi-leg chain, which is the actual production shape (a customer
// typing real addresses at booking time, not "lat, lng" pairs).
//
// Temporarily overrides DR-0020's pickup/dropoff/stops with real addresses
// spanning Metro Manila, drives the pre-trip screen so PlannedRouteMap
// computes+saves a real suggested_route, inspects the resulting payload
// (leg count, point count, byte size), then restores DR-0020's exact
// original fixture values (other scripts, e.g. simulate-dr0020.sh, depend
// on those exact lat/lng values matching the captured route fixture).
//
// Usage: set -a; source .env; set +a; node scripts/repro-multistop-suggested-route-stress.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELIVERY_ID = 'DR-0020'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'

const REAL_PICKUP = 'Rizal Park, Manila, Metro Manila, Philippines'
const REAL_DROPOFF = 'Ortigas Center, Pasig, Metro Manila, Philippines'
const REAL_STOPS = [
  { location: 'SM Mall of Asia, Pasay, Metro Manila, Philippines' },
  { location: 'Bonifacio Global City, Taguig, Metro Manila, Philippines' },
  { location: 'Eastwood City, Quezon City, Metro Manila, Philippines' },
  { location: 'Araneta City, Cubao, Quezon City, Metro Manila, Philippines' },
]

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  console.log('--- backing up DR-0020 fixture values ---')
  const { data: before, error: beforeErr } = await admin
    .from('delivery_requests')
    .select('pickup_location, dropoff_location, stops, status')
    .eq('id', DELIVERY_ID)
    .single()
  if (beforeErr) throw new Error(beforeErr.message)
  console.log('backed up:', JSON.stringify(before))

  try {
    console.log('--- overriding DR-0020 with real addresses (pickup + 4 stops + dropoff) and resetting to ASSIGNED ---')
    const { error: updateErr } = await admin
      .from('delivery_requests')
      .update({
        status: 'ASSIGNED',
        suggested_route: null,
        pickup_location: REAL_PICKUP,
        dropoff_location: REAL_DROPOFF,
        stops: REAL_STOPS,
      })
      .eq('id', DELIVERY_ID)
    if (updateErr) throw new Error(updateErr.message)

    console.log('--- driver views the pre-trip screen ---')
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
    await page.waitForTimeout(1500)

    const t0 = Date.now()
    let suggestedRoute = null
    for (let i = 0; i < 30; i += 1) {
      const { data: row } = await admin.from('delivery_requests').select('suggested_route').eq('id', DELIVERY_ID).single()
      if (row?.suggested_route) {
        suggestedRoute = row.suggested_route
        break
      }
      await page.waitForTimeout(1000)
    }
    const computeMs = Date.now() - t0
    await page.screenshot({ path: 'scripts/repro-multistop-stress-driver.png' })
    console.log('page errors:', pageErrors)
    console.log('save latency (ms):', computeMs)

    if (!suggestedRoute) throw new Error('suggested_route was never saved -- aborting')

    const legCount = suggestedRoute.length
    const pointCount = suggestedRoute.reduce((sum, leg) => sum + leg.path.length, 0)
    const byteSize = Buffer.byteLength(JSON.stringify(suggestedRoute), 'utf8')
    console.log('legs:', legCount, '(expected 6: warehouse->pickup, pickup->stopA, ..., stopD->dropoff or nearest-order equivalent)')
    console.log('total path points:', pointCount)
    console.log('payload size (bytes):', byteSize, `(${(byteSize / 1024).toFixed(1)} KB)`)
    console.log('legs detail:', suggestedRoute.map((l) => ({ from: l.from, to: l.to, points: l.path.length })))

    await browser.close()

    const pass = pageErrors.length === 0 && legCount === 6 && byteSize < 1_000_000
    console.log(pass ? 'PASS' : 'FAIL')
    if (!pass) process.exit(1)
  } finally {
    console.log('--- restoring DR-0020 to its exact original fixture values ---')
    const { error: restoreErr } = await admin
      .from('delivery_requests')
      .update({
        status: before.status,
        suggested_route: null,
        pickup_location: before.pickup_location,
        dropoff_location: before.dropoff_location,
        stops: before.stops,
      })
      .eq('id', DELIVERY_ID)
    if (restoreErr) console.error('restore warning:', restoreErr.message)
    const { data: after } = await admin.from('delivery_requests').select('pickup_location, dropoff_location, stops, status').eq('id', DELIVERY_ID).single()
    console.log('restored:', JSON.stringify(after))
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
