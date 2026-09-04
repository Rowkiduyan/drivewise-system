#!/usr/bin/env node
// Disposable verification for the phone-GPS-to-Supervisor-Dashboard broadcast
// feature (2026-09-03): opens the Driver's Live Navigation for DR-0051 (D002,
// truck AAA 1111, already has a real Active session) with a mocked phone
// geolocation, opens the Supervisor Dashboard in a second browser context,
// and checks whether the truck's row/marker reports "Phone GPS" as its
// position source instead of the default "Pi GPS".
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const SUPERVISOR_EMAIL = 'atdrilon01@marveltrucking.local'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
// A real Metro Manila coordinate, distinct from wherever the last real
// gps_logs row for this session happens to be, so a visible marker move (if
// screenshotted) would be obvious.
const PHONE_LAT = 14.6091
const PHONE_LNG = 121.0223

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  const browser = await chromium.launch({ ignoreHTTPSErrors: true })

  // ---------------- Driver context: real login, mocked phone GPS ----------------
  const driverContext = await browser.newContext({
    viewport: { width: 480, height: 900 },
    ignoreHTTPSErrors: true,
    permissions: ['geolocation'],
    geolocation: { latitude: PHONE_LAT, longitude: PHONE_LNG },
  })
  const driverPage = await driverContext.newPage()
  const driverErrors = []
  driverPage.on('pageerror', (err) => driverErrors.push(err.message))
  driverPage.on('console', (msg) => console.log('DRIVER:', msg.type(), msg.text()))
  await driverPage.goto(BASE, { waitUntil: 'load', timeout: 30000 })
  await driverPage.fill('input[name="email"]', DRIVER_EMAIL)
  await driverPage.fill('input[name="password"]', DRIVER_PASSWORD)
  await driverPage.click('button[type="submit"]')
  await driverPage.waitForURL('**/driver/**', { timeout: 15000 })
  await driverPage.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
  await driverPage.waitForTimeout(6000) // let isMonitoring resolve, watchPosition fire, and the broadcast channel join

  // ---------------- Supervisor context: magic-link sign-in ----------------
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: SUPERVISOR_EMAIL })
  const { data: verifyData } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
  const session = verifyData.session
  const supContext = await browser.newContext({ viewport: { width: 1500, height: 1100 }, ignoreHTTPSErrors: true })
  const supPage = await supContext.newPage()
  const supErrors = []
  supPage.on('pageerror', (err) => supErrors.push(err.message))
  supPage.on('console', (msg) => console.log('SUPERVISOR:', msg.type(), msg.text()))
  await supPage.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])
  await supPage.goto(`${BASE}/supervisor/dashboard`, { waitUntil: 'load', timeout: 30000 })
  await supPage.waitForTimeout(5000) // let the Supervisor's phone-gps-<deliveryId> channel actually subscribe

  // Broadcasts have no replay/queueing -- the driver's very first tick (sent
  // before this Supervisor page even existed) is gone. A real phone's GPS
  // chip re-fires watchPosition continuously (roughly once a second)
  // regardless of movement, which self-heals this in production; Playwright's
  // *mocked* geolocation only fires once for a static value, so nudge it here
  // to simulate that natural next real-GPS tick now that the Supervisor is
  // actually listening.
  await driverContext.setGeolocation({ latitude: PHONE_LAT + 0.0008, longitude: PHONE_LNG + 0.0008 })
  await supPage.waitForTimeout(4000)

  const results = {}
  results.phoneGpsLabelVisible = await supPage.locator('text=📱 Phone GPS').first().isVisible().catch(() => false)
  results.markerTitleHasPhoneGps = await supPage
    .locator('div[title*="AAA 1111"]')
    .first()
    .getAttribute('title')
    .catch(() => null)
  results.driverPageErrors = driverErrors
  results.supervisorPageErrors = supErrors
  await supPage.screenshot({ path: 'scripts/verify-phone-gps-01-supervisor.png', fullPage: true })

  console.log(JSON.stringify(results, null, 2))
  await browser.close()
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
