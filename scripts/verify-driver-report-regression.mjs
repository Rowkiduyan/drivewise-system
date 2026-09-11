#!/usr/bin/env node
// Regression check for the buildRealDriverTripReport changes (mainSessions/
// lastMainSession/Route Deviation exclusion) made while building the
// return-trip live-nav feature -- opens a completed report for a DELIVERED
// delivery that has NO return-trip session (DR-0057), to confirm the
// Trip/Behavior/Route tabs still render correctly for the normal case.
// Usage: node scripts/verify-driver-report-regression.mjs <base-url>
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5178'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  const passwordInput = page.locator('input[type="password"]').first()
  await emailInput.fill(DRIVER_EMAIL)
  await passwordInput.fill(DRIVER_PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first().click()
  await page.waitForURL(/driver/i, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2000)

  console.log('--- opening History tab ---')
  await page.getByText('History', { exact: false }).first().click()
  await page.waitForTimeout(1500)

  console.log('--- opening DR-0057 ---')
  const row = page.getByText('DR-0057', { exact: false }).first()
  await row.click({ timeout: 10000 })
  await page.waitForTimeout(2000)
  await page.getByText('X', { exact: true }).first().click({ timeout: 2000 }).catch(() => {})

  console.log('--- expanding Delivery Report ---')
  await page.getByText('Delivery Report', { exact: false }).first().click({ timeout: 10000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/verify-report-01-trip-tab.png', fullPage: true })

  for (const tabName of ['Behavior', 'Route']) {
    const tab = page.getByText(tabName, { exact: true }).first()
    const count = await tab.count()
    if (count > 0) {
      await tab.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `scripts/verify-report-02-${tabName.toLowerCase()}-tab.png`, fullPage: true })
      console.log(`${tabName} tab: clicked and screenshotted`)
    } else {
      console.log(`${tabName} tab: not present (expected if this delivery has no suggested_route for Route)`)
    }
  }

  console.log('\n--- console errors ---')
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)')
  console.log('\n--- page errors (uncaught exceptions) ---')
  console.log(pageErrors.length ? pageErrors.join('\n') : '(none)')

  await browser.close()

  if (pageErrors.length > 0) {
    console.error('\nFAILED: uncaught page errors present.')
    process.exit(1)
  }
  console.log('\nPASSED')
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message)
  process.exit(1)
})
