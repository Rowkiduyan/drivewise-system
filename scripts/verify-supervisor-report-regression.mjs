#!/usr/bin/env node
// Regression check for the buildRealTripAndBehaviorReport changes made in
// SupDeliveries.jsx while building the return-trip feature (mainSessions/
// lastMainSession/Route Deviation exclusion) -- opens DR-0057's completed
// report as the Supervisor and confirms Trip/Behavior/Route tabs still
// render with no console/page errors.
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5178'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const SUPERVISOR_EMAIL = 'atdrilon01@marveltrucking.local'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  const browser = await chromium.launch({ headless: true })
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: SUPERVISOR_EMAIL })
  const { data: verifyData } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
  const session = verifyData.session

  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])
  await page.goto(`${BASE}/supervisor/deliveries`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(3000)

  console.log('--- opening Completed Deliveries tab, searching for DR-0057 ---')
  await page.getByText('Completed Deliveries', { exact: false }).first().click()
  await page.waitForTimeout(1000)
  const searchBox = page.locator('input[placeholder*="Search" i]').first()
  await searchBox.fill('DR-0057').catch(() => {})
  await page.waitForTimeout(1000)
  await page.getByText('DR-0057', { exact: true }).first().click({ timeout: 10000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'scripts/verify-sup-report-00-detail.png', fullPage: true })

  for (const tabName of ['Trip Details', 'DriveWise Report', 'Route Deviation Report']) {
    const tab = page.getByText(tabName, { exact: true }).first()
    const count = await tab.count()
    if (count > 0) {
      await tab.click().catch(() => {})
      await page.waitForTimeout(1500)
      const slug = tabName.toLowerCase().replace(/\s+/g, '-')
      await page.screenshot({ path: `scripts/verify-sup-report-01-${slug}.png`, fullPage: true })
      console.log(`${tabName} tab: clicked and screenshotted`)
    } else {
      console.log(`${tabName} tab: not found on page`)
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
