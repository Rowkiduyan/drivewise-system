#!/usr/bin/env node
// Disposable diagnostic -- verifies DriverPerformance.jsx's sample-data
// fallback path (2026-08-14): a driver with zero sessions in the last 7
// days should see the small SAMPLE_SESSIONS/SAMPLE_ALERTS set plus the
// "Showing sample data" banner, not a blank/empty page. D004
// (amangel01@marveltrucking.local) has no sessions in the window as of this
// writing -- confirmed via a direct query before writing this script.
//
// No password recorded for D004, so this injects a real session via the
// same magic-link technique used in repro-nearest-dropoff.mjs, rather than
// resetting the account's actual password.
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const DRIVER_EMAIL = 'amangel01@marveltrucking.local'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: DRIVER_EMAIL })
  if (linkError) throw new Error(`generateLink failed: ${linkError.message}`)
  const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
  if (verifyError) throw new Error(`verifyOtp failed: ${verifyError.message}`)
  const driverSession = verifyData.session

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 500, height: 1400 } })
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.addInitScript(
    ([key, session]) => localStorage.setItem(key, JSON.stringify(session)),
    [STORAGE_KEY, driverSession],
  )

  await page.goto(`${BASE}/driver/performance`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'scripts/repro-performance-sample.png', fullPage: true })

  const bannerVisible = await page.locator('text=Showing sample data').first().isVisible().catch(() => false)
  const totalTripsVisible = await page.locator('text=/Total Trips/').first().isVisible().catch(() => false)

  console.log('page errors:', pageErrors)
  console.log('sample-data banner visible (should be TRUE):', bannerVisible)
  console.log('page rendered performance content:', totalTripsVisible)

  const pass = pageErrors.length === 0 && bannerVisible && totalTripsVisible
  console.log(pass ? 'PASS' : 'FAIL')
  await browser.close()
  if (!pass) process.exit(1)
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
