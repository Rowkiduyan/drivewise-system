// Live repro: opens the Driver's Live Navigation for DR-0020 in a real
// browser, drives the GPS simulation directly (same fixture data as
// simulate-dr0020.sh), and screenshots partway through leg 0 -> leg 1 to
// check whether both the blue and green polylines are visibly on the map
// at the same time (reported bug) or not.
import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const BASE = process.argv[2] || 'http://localhost:5173'
const EMAIL = 'ayroque01@drivewise.local'
const PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
const DELIVERY_ID = 'DR-0020'

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

async function supa(path, { method = 'GET', role = 'service', body, headers = {} } = {}) {
  const key = role === 'service' ? SERVICE_KEY : ANON_KEY
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...headers },
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

const legs = JSON.parse(readFileSync('scripts/fixtures/DR-0020-legs.json', 'utf8'))
const leg0 = legs[0]
const leg1Start = legs[1][0]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 500, height: 900 } })

await page.goto(BASE, { waitUntil: 'load' })
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/driver/**', { timeout: 15000 })
await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(3000)

const sessionId = await resolveSessionId()
console.log('session:', sessionId)

// Drive through most of leg 0 quickly (no screenshots), then slow down
// right at the leg 0 -> leg 1 boundary and screenshot each tick.
const fastPart = leg0.slice(0, -15)
for (const p of fastPart) {
  await insertGps(p.lat, p.lng, sessionId)
  await page.waitForTimeout(80)
}

const boundary = [...leg0.slice(-15), ...legs[1].slice(0, 15)]
let i = 0
for (const p of boundary) {
  await insertGps(p.lat, p.lng, sessionId)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `scripts/repro-${String(i).padStart(2, '0')}.png` })
  i++
}

console.log('done, screenshots saved to scripts/repro-*.png')
await browser.close()
