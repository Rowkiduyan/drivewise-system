#!/usr/bin/env node
// Disposable verification for AdminDashboard.jsx (src/pages/AdminDashboard.jsx),
// the renamed/rebuilt replacement for the old mock-data AdminAnalysis.jsx.
// Same magic-link sign-in pattern as verify-critical-alerts.mjs.
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const ADMIN_EMAIL = 'alexisyvone@gmail.com'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL })
  const { data: verifyData } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
  const session = verifyData.session

  const browser = await chromium.launch({ ignoreHTTPSErrors: true })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  await page.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])

  const results = {}
  try {
    await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(6000) // Google Maps JS + Realtime subscriptions + data fetch

    results.sidebarShowsDashboardLabel = await page.locator('text=DASHBOARD').first().isVisible().catch(() => false)
    results.pmsOverdueTileVisible = await page.locator('text=PMS Overdue').first().isVisible().catch(() => false)
    results.activeDeliveriesPanelVisible = await page.locator('text=Active Deliveries').first().isVisible().catch(() => false)
    results.liveGpsPanelVisible = await page.locator('text=Live GPS').first().isVisible().catch(() => false)
    results.driverSafetyPanelVisible = await page.locator('text=Driver Safety').first().isVisible().catch(() => false)
    // No CriticalAlertPopup should exist on this page at all (per the user:
    // that notification is strictly Supervisor-only).
    results.noCriticalAlertPopupInDom = (await page.locator('text=VERY HIGH RISK OF DROWSINESS').count()) === 0
    results.pageErrors = pageErrors
    await page.screenshot({ path: 'scripts/verify-admin-dashboard-01.png', fullPage: true })

    // Click the PMS Overdue tile -- should deep-link into /admin/trucks
    // pre-filtered, same as the Supervisor version.
    const pmsLink = page.locator('a', { hasText: 'PMS Overdue' }).first()
    if (await pmsLink.isVisible().catch(() => false)) {
      await pmsLink.click()
      await page.waitForTimeout(8000)
      results.navigatedToTrucksUrl = page.url()
      await page.screenshot({ path: 'scripts/verify-admin-dashboard-02-trucks-filtered.png', fullPage: true })
    } else {
      results.pmsTileNotClickable = true
    }

    console.log(JSON.stringify(results, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
