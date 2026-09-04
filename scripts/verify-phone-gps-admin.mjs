#!/usr/bin/env node
// Disposable verification for the phone-GPS-to-Admin-Dashboard broadcast
// parity added 2026-09-04 (mirrors verify-phone-gps-supervisor.mjs exactly,
// against AdminDashboard.jsx instead of SupDashboard.jsx). Opens the
// Driver's Live Navigation for DR-0051 (D002, truck AAA 1111, real Active
// session) with a mocked phone geolocation, opens the Admin Dashboard in a
// second browser context, and checks whether the truck's row/marker reports
// "Phone GPS" as its position source instead of the default "Pi GPS".
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const ADMIN_EMAIL = 'admin@drivewise.com'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
const PHONE_LAT = 14.6091
const PHONE_LNG = 121.0223

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  const browser = await chromium.launch({ ignoreHTTPSErrors: true })

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
  await driverPage.waitForTimeout(6000)

  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL })
  const { data: verifyData } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
  const session = verifyData.session
  const adminContext = await browser.newContext({ viewport: { width: 1500, height: 1100 }, ignoreHTTPSErrors: true })
  const adminPage = await adminContext.newPage()
  const adminErrors = []
  adminPage.on('pageerror', (err) => adminErrors.push(err.message))
  adminPage.on('console', (msg) => console.log('ADMIN:', msg.type(), msg.text()))
  await adminPage.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])
  await adminPage.goto(`${BASE}/admin/dashboard`, { waitUntil: 'load', timeout: 30000 })
  await adminPage.waitForTimeout(5000)

  // Same test-only gotcha as the Supervisor script: Playwright's mocked
  // geolocation only fires once for a static value, so nudge it now that
  // the Admin page is actually listening.
  await driverContext.setGeolocation({ latitude: PHONE_LAT + 0.0008, longitude: PHONE_LNG + 0.0008 })
  await adminPage.waitForTimeout(4000)

  const results = {}
  results.phoneGpsLabelVisible = await adminPage.locator('text=📱 Phone GPS').first().isVisible().catch(() => false)
  results.markerTitleHasPhoneGps = await adminPage
    .locator('div[title*="AAA 1111"]')
    .first()
    .getAttribute('title')
    .catch(() => null)
  results.driverPageErrors = driverErrors
  results.adminPageErrors = adminErrors
  await adminPage.screenshot({ path: 'scripts/verify-phone-gps-admin-01.png', fullPage: true })

  console.log(JSON.stringify(results, null, 2))
  await browser.close()
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
