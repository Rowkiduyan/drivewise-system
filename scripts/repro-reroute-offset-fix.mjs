// Disposable diagnostic (not part of scripts/README.md's permanent tooling,
// same as repro-dual-route.mjs) -- verifies the 2026-08-13 completedLegsOffset
// fix in DriverDeliveries.jsx's LiveNavigationMap: a reroute mid-leg should
// NOT revert the "Stop X of Y" label/color back to an earlier leg's value.
//
// Flow: capture the real DirectionsService route for DR-0022 (a short,
// throwaway 2-stop fixture), drive GPS ticks through leg 0 into leg 1
// (advancing currentLegIndex the normal way), read the "Stop X of Y" label,
// then inject one GPS point ~500m off the real route (forces the
// reroute-on-deviation effect), wait for it to resolve, and re-read the
// label. PASS if the label is unchanged across the forced reroute; FAIL if
// it reverts to an earlier stop number.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'

const BASE = process.argv[2] || 'http://localhost:5173'
const EMAIL = 'ayroque01@drivewise.local'
const PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
const DELIVERY_ID = 'DR-0022'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx), l.slice(idx + 1).trim()]
    }),
)
const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function supa(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function resolveSessionId() {
  const rows = await supa(`/rest/v1/sessions?delivery_request_id=eq.${DELIVERY_ID}&status=eq.Active&select=session_id`)
  return rows?.[0]?.session_id
}

async function insertGps(lat, lng, sessionId) {
  await supa('/rest/v1/gps_logs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: { delivery_request_id: DELIVERY_ID, session_id: sessionId, latitude: lat, longitude: lng, timestamp: new Date().toISOString() },
  })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 500, height: 900 } })

// Must be registered before ANY navigation -- an init script re-runs on
// every page load in this context (including the redirect after login and
// the goto to /driver/trips below), unlike page.evaluate() which only runs
// once and is wiped by the next navigation. This is what
// gps-route-capture.mjs's class-replace trick actually needs to survive
// long enough to catch LiveNavigationMap's own DirectionsService call.
await page.addInitScript(() => {
  window.__capturedLegs = null
  const wait = setInterval(() => {
    if (window.google?.maps?.DirectionsService) {
      clearInterval(wait)
      const Original = window.google.maps.DirectionsService
      window.google.maps.DirectionsService = class extends Original {
        route(request, callback) {
          return super.route(request, (result, status) => {
            if (status === 'OK' && result && !window.__capturedLegs) {
              window.__capturedLegs = result.routes[0].legs.map((leg) =>
                (leg.steps || []).flatMap((step) => step.path || []).map((p) => ({ lat: p.lat(), lng: p.lng() })),
              )
            }
            callback(result, status)
          })
        }
      }
    }
  }, 100)
})

await page.goto(BASE, { waitUntil: 'load' })
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/driver/**', { timeout: 15000 })
await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(3000)

const sessionId = await resolveSessionId()
console.log('session:', sessionId)
if (!sessionId) {
  console.error('No Active session found for DR-0022 -- aborting.')
  await browser.close()
  process.exit(1)
}

const legs = await page.waitForFunction(() => window.__capturedLegs, null, { timeout: 20000 }).then((h) => h.jsonValue())
console.log('captured legs:', legs.map((l) => l.length))
writeFileSync('scripts/repro-dr0022-legs.json', JSON.stringify(legs))

if (legs.length < 2) {
  console.error(`Expected at least 2 legs (multi-stop route), got ${legs.length} -- aborting.`)
  await browser.close()
  process.exit(1)
}

async function readStopLabel() {
  const text = await page.locator('text=/^Stop \\d+ of \\d+$|^Heading to Drop-off$/').first().textContent().catch(() => null)
  return text
}

// Drive through leg 0 quickly, then slow down approaching its end so the
// leg-advance effect (NAV_STEP_ADVANCE_METERS) has a real chance to fire.
const leg0 = legs[0]
for (const p of leg0.slice(0, -8)) {
  await insertGps(p.lat, p.lng, sessionId)
  await page.waitForTimeout(60)
}
for (const p of leg0.slice(-8)) {
  await insertGps(p.lat, p.lng, sessionId)
  await page.waitForTimeout(500)
}
await page.waitForTimeout(1000)
await page.screenshot({ path: 'scripts/repro-fix-01-leg0-end.png' })
const labelAtLeg0End = await readStopLabel()
console.log('label at end of leg 0:', labelAtLeg0End)

// Advance a bit into leg 1 so we're clearly on it, not right at the boundary.
const leg1 = legs[1]
for (const p of leg1.slice(0, Math.min(10, leg1.length))) {
  await insertGps(p.lat, p.lng, sessionId)
  await page.waitForTimeout(150)
}
await page.waitForTimeout(1000)
await page.screenshot({ path: 'scripts/repro-fix-02-leg1-before-reroute.png' })
const labelBeforeReroute = await readStopLabel()
console.log('label on leg 1, before forced reroute:', labelBeforeReroute)

// Force a reroute: inject a point ~500m off the real route (well beyond
// NAV_REROUTE_TOLERANCE_DEGREES ~100m), then wait for computeRoute()'s async
// DirectionsService round-trip to resolve (repro-dual-route.mjs observed
// ~4-5s for this in practice).
const midLeg1 = leg1[Math.min(10, leg1.length - 1)]
const offRoutePoint = { lat: midLeg1.lat + 0.0045, lng: midLeg1.lng + 0.0045 }
console.log('injecting off-route point to force reroute:', offRoutePoint)
await insertGps(offRoutePoint.lat, offRoutePoint.lng, sessionId)
await page.waitForTimeout(6000)
await page.screenshot({ path: 'scripts/repro-fix-03-after-forced-reroute.png' })
const labelAfterReroute = await readStopLabel()
console.log('label immediately after forced reroute:', labelAfterReroute)

// Steer back toward the real route and continue a bit further to confirm
// normal progression still works post-reroute.
await insertGps(midLeg1.lat, midLeg1.lng, sessionId)
await page.waitForTimeout(2000)
for (const p of leg1.slice(10, 25)) {
  await insertGps(p.lat, p.lng, sessionId)
  await page.waitForTimeout(150)
}
await page.waitForTimeout(1000)
await page.screenshot({ path: 'scripts/repro-fix-04-after-continuing.png' })
const labelAfterContinuing = await readStopLabel()
console.log('label after continuing to drive leg 1:', labelAfterContinuing)

console.log('\n--- RESULT ---')
console.log('before reroute: ', labelBeforeReroute)
console.log('after reroute:  ', labelAfterReroute)
console.log('after continuing:', labelAfterContinuing)
if (labelBeforeReroute && labelAfterReroute && labelBeforeReroute === labelAfterReroute) {
  console.log('PASS: label unchanged across forced reroute (fix confirmed working)')
} else {
  console.log('FAIL: label changed across forced reroute (bug still present)')
}

await browser.close()
