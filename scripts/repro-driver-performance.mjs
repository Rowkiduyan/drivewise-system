#!/usr/bin/env node
// Disposable diagnostic -- verifies DriverPerformance.jsx's 2026-08-14 real-
// data wiring. D002 (ayroque01@drivewise.local) has real sessions from
// today's own testing in this repo, so this checks the REAL-DATA path
// (screenshot 1). The SAMPLE-DATA fallback path (screenshot 2) is checked
// separately by impersonating a driver with zero sessions in the window.
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 500, height: 1400 } })
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

await page.goto(BASE, { waitUntil: 'load' })
await page.fill('input[name="email"]', DRIVER_EMAIL)
await page.fill('input[name="password"]', DRIVER_PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/driver/**', { timeout: 15000 })

await page.goto(`${BASE}/driver/performance`, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'scripts/repro-performance-real.png', fullPage: true })

const sampleBannerVisible = await page.locator('text=Showing sample data').first().isVisible().catch(() => false)
const tripLogRows = await page.locator('text=/Total Trips/').first().isVisible().catch(() => false)

console.log('page errors:', pageErrors)
console.log('sample-data banner visible (should be FALSE, D002 has real sessions):', sampleBannerVisible)
console.log('page rendered performance content:', tripLogRows)

const pass = pageErrors.length === 0 && !sampleBannerVisible && tripLogRows
console.log(pass ? 'PASS' : 'FAIL')
await browser.close()
if (!pass) process.exit(1)
