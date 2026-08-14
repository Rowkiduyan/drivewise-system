#!/usr/bin/env node
// One-time DEMO DATA seed, explicitly requested by the user -- NOT a repro/
// diagnostic script like this folder's other `repro-*.mjs` files. Replaces
// DR-0021's real gps_logs (a ~16m stationary hardware bench-test trace, see
// STATUS.md/scripts/repro-route-comparison-demo.mjs) with a fabricated but
// road-following "actual route" that visibly deviates from the real saved
// `suggested_route`, so the Route Deviation Report has something worth
// looking at for a demo. This is fake data on a known test fixture, done at
// the user's explicit request -- not presented as a real trip.
//
// Route is generated via the real Google Directions API (a genuine
// road-following path, not synthetic noise) from Pickup to Dropoff with an
// injected detour waypoint, so it looks like a real (if suboptimal) drive
// rather than a straight line or random jitter.
//
// Usage: set -a; source .env; set +a; node scripts/seed-dr0021-fake-actual-route.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELIVERY_ID = 'DR-0021'
const BASE = process.argv[2] || 'http://localhost:5173'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// The Maps API key is browser-referrer-restricted (correctly, for security)
// -- can't call the Directions REST API directly from Node. Instead, drive
// the real app in a real browser (same as every other script in this repo)
// and call `window.google.maps.DirectionsService` from inside the page,
// where the key's referrer check actually passes.
async function fetchRouteViaBrowser(pickup, dropoff, detour) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } })
  await page.goto(BASE, { waitUntil: 'load' })
  await page.fill('input[name="email"]', DRIVER_EMAIL)
  await page.fill('input[name="password"]', DRIVER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/driver/**', { timeout: 15000 })
  // Any page with the Maps JS SDK loaded works -- Upcoming's PlannedRouteMap
  // already triggers useJsApiLoader, so this just needs one to mount.
  await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => window.google && window.google.maps && window.google.maps.DirectionsService, { timeout: 20000 })

  const result = await page.evaluate(
    ([pickup, dropoff, detour]) =>
      new Promise((resolve, reject) => {
        new window.google.maps.DirectionsService().route(
          {
            origin: { lat: pickup[0], lng: pickup[1] },
            destination: { lat: dropoff[0], lng: dropoff[1] },
            waypoints: [{ location: detour, stopover: false }],
            travelMode: window.google.maps.TravelMode.DRIVING,
          },
          (res, status) => {
            if (status !== 'OK' || !res) {
              reject(new Error(`DirectionsService failed: ${status}`))
              return
            }
            const points = res.routes[0].legs.flatMap((leg) =>
              leg.steps.flatMap((step) => step.path.map((p) => ({ lat: p.lat(), lng: p.lng() }))),
            )
            resolve(points)
          },
        )
      }),
    [pickup, dropoff, detour],
  )
  await browser.close()
  return result
}

async function main() {
  const { data: delivery, error: deliveryErr } = await admin
    .from('delivery_requests')
    .select('suggested_route')
    .eq('id', DELIVERY_ID)
    .single()
  if (deliveryErr) throw new Error(deliveryErr.message)
  const suggestedRoute = delivery.suggested_route
  if (!Array.isArray(suggestedRoute)) throw new Error('DR-0021 has no suggested_route saved -- run the route comparison demo first')

  const pickupLeg = suggestedRoute.find((leg) => leg.to === 'pickup')
  const dropoffLeg = suggestedRoute.find((leg) => leg.to === 'dropoff')
  const pickup = pickupLeg.path[pickupLeg.path.length - 1]
  const dropoff = dropoffLeg.path[dropoffLeg.path.length - 1]
  console.log('pickup:', pickup, 'dropoff:', dropoff)

  // Detour waypoint: offset south of the direct pickup->dropoff line, forces
  // a real (DirectionsService-computed) deviation instead of a straight line.
  const detour = { lat: 14.5715, lng: 121.0055 }

  console.log('--- fetching a real, detoured road route via the app itself (browser DirectionsService) ---')
  const points = await fetchRouteViaBrowser(pickup, dropoff, detour)
  console.log('fake actual route points:', points.length)

  // Longest session (~37 min) -- realistic spacing for a real pickup-to-
  // dropoff drive, matching real gps_logs' roughly-1s cadence scaled to fit.
  const { data: sessions, error: sessionsErr } = await admin
    .from('sessions')
    .select('session_id, start_time, end_time')
    .eq('delivery_request_id', DELIVERY_ID)
    .order('start_time')
  if (sessionsErr) throw new Error(sessionsErr.message)
  const session = sessions.reduce((longest, s) => {
    const dur = new Date(s.end_time) - new Date(s.start_time)
    const longestDur = longest ? new Date(longest.end_time) - new Date(longest.start_time) : -1
    return dur > longestDur ? s : longest
  }, null)
  console.log('using session:', session.session_id, session.start_time, '->', session.end_time)

  const startMs = new Date(session.start_time).getTime()
  const endMs = new Date(session.end_time).getTime()
  const rows = points.map((p, i) => ({
    delivery_request_id: DELIVERY_ID,
    session_id: session.session_id,
    latitude: p.lat,
    longitude: p.lng,
    timestamp: new Date(startMs + ((endMs - startMs) * i) / (points.length - 1)).toISOString(),
  }))

  console.log('--- deleting existing (real, ~16m stationary) gps_logs for DR-0021 ---')
  const { error: deleteErr } = await admin.from('gps_logs').delete().eq('delivery_request_id', DELIVERY_ID)
  if (deleteErr) throw new Error(deleteErr.message)

  console.log('--- inserting', rows.length, 'fake actual-route points ---')
  // Insert in chunks -- some PostgREST configs cap request body size.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error: insertErr } = await admin.from('gps_logs').insert(chunk)
    if (insertErr) throw new Error(insertErr.message)
  }

  console.log('DONE. DR-0021 now has a fabricated but road-following actual route for demo purposes.')
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
