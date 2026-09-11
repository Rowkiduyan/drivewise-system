#!/usr/bin/env node
// Live browser verification for Phase 14's return-trip live navigation
// upgrade: logs in as D002 (whose DR-0053 has a seeded Active is_return_trip
// session, see scripts/seed-dr0053-return-trip.mjs), opens the Driver
// portal, confirms the "Returning to Base" live-nav card actually renders,
// captures a screenshot, and reports any browser console errors.
// Usage: node scripts/verify-return-trip-nav.mjs <base-url>
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

  console.log(`--- navigating to ${BASE} ---`)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })

  console.log('--- logging in as D002 ---')
  await page.getByPlaceholder(/email/i).fill(DRIVER_EMAIL).catch(() => {})
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  const passwordInput = page.locator('input[type="password"]').first()
  await emailInput.fill(DRIVER_EMAIL)
  await passwordInput.fill(DRIVER_PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first().click()

  await page.waitForURL(/driver/i, { timeout: 20000 }).catch(async () => {
    console.log('URL did not change to /driver, current URL:', page.url())
  })
  await page.waitForTimeout(3000)

  console.log('current URL:', page.url())
  await page.screenshot({ path: 'scripts/verify-return-trip-01-after-login.png', fullPage: true })

  const returningText = page.getByText(/Returning to Base/i)
  const found = await returningText.count()
  console.log('"Returning to Base" text occurrences found:', found)

  if (found > 0) {
    await page.waitForTimeout(4000) // let the map/route finish loading
    await page.screenshot({ path: 'scripts/verify-return-trip-02-nav-card.png', fullPage: true })
  }

  console.log('\n--- console errors ---')
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)')
  console.log('\n--- page errors (uncaught exceptions) ---')
  console.log(pageErrors.length ? pageErrors.join('\n') : '(none)')

  await browser.close()

  if (found === 0) {
    console.error('\nFAILED: "Returning to Base" was not found on the page.')
    process.exit(1)
  }
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
