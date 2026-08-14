#!/usr/bin/env node
// Disposable demo -- shows the 2026-08-14 Route Comparison feature
// (11_ROUTE_COMPARISON.md) with real data, end to end: generates a real
// `suggested_route` for DR-0021 (the permanent real-data demo fixture, see
// STATUS.md) by temporarily reopening it and letting the Driver app's own
// PlannedRouteMap compute+save one, then views the resulting Route
// Deviation Report as a Supervisor.
//
// DR-0021 is otherwise meant to stay COMPLETED permanently (STATUS.md) --
// this script backs up and restores its `status` exactly, and touches no
// other field.
//
// Usage: set -a; source .env; set +a; node scripts/repro-route-comparison-demo.mjs
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELIVERY_ID = 'DR-0021'
const DRIVER_EMAIL = 'ayroque01@drivewise.local'
const DRIVER_PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'
const SUPERVISOR_EMAIL = 'atdrilon01@marveltrucking.local'
const SUPERVISOR_PASSWORD = 'Temp122wpjir8wy317hoa7r1pkyurx!'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  console.log('--- backing up DR-0021 status ---')
  const { data: before, error: beforeErr } = await admin
    .from('delivery_requests')
    .select('status, suggested_route')
    .eq('id', DELIVERY_ID)
    .single()
  if (beforeErr) throw new Error(`Could not read DR-0021: ${beforeErr.message}`)
  console.log('original status:', before.status, '| already has suggested_route:', Boolean(before.suggested_route))

  try {
    if (!before.suggested_route) {
      console.log('--- temporarily reopening DR-0021 (ASSIGNED) so PlannedRouteMap will render ---')
      const { error: reopenErr } = await admin
        .from('delivery_requests')
        .update({ status: 'ASSIGNED' })
        .eq('id', DELIVERY_ID)
      if (reopenErr) throw new Error(`Reopen failed: ${reopenErr.message}`)

      const driverBrowser = await chromium.launch()
      const driverPage = await driverBrowser.newPage({ viewport: { width: 500, height: 900 } })
      const pageErrors = []
      driverPage.on('pageerror', (err) => pageErrors.push(err.message))

      await driverPage.goto(BASE, { waitUntil: 'load' })
      await driverPage.fill('input[name="email"]', DRIVER_EMAIL)
      await driverPage.fill('input[name="password"]', DRIVER_PASSWORD)
      await driverPage.click('button[type="submit"]')
      await driverPage.waitForURL('**/driver/**', { timeout: 15000 })
      await driverPage.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })

      console.log('--- opening Upcoming tab and selecting DR-0021 ---')
      await driverPage.locator('button', { hasText: 'Upcoming' }).first().click()
      await driverPage.getByText(DELIVERY_ID, { exact: false }).first().click()
      await driverPage.waitForTimeout(1000)
      await driverPage.screenshot({ path: 'scripts/repro-route-comparison-driver.png' })

      console.log('--- waiting for PlannedRouteMap to compute + save suggested_route ---')
      let saved = false
      for (let i = 0; i < 20; i += 1) {
        const { data: row } = await admin.from('delivery_requests').select('suggested_route').eq('id', DELIVERY_ID).single()
        if (row?.suggested_route) {
          saved = true
          break
        }
        await driverPage.waitForTimeout(1500)
      }
      await driverPage.screenshot({ path: 'scripts/repro-route-comparison-driver-2.png' })
      console.log('page errors:', pageErrors)
      console.log('suggested_route saved:', saved)
      await driverBrowser.close()

      if (!saved) throw new Error('suggested_route was never saved -- aborting before touching the Supervisor view')
    } else {
      console.log('--- DR-0021 already has a suggested_route, skipping the Driver-side generation step ---')
    }

    console.log('--- restoring DR-0021 status to', before.status, '---')
    const { error: restoreErr } = await admin.from('delivery_requests').update({ status: before.status }).eq('id', DELIVERY_ID)
    if (restoreErr) throw new Error(`Restore failed: ${restoreErr.message}`)

    console.log('--- viewing the Route Deviation Report as Supervisor ---')
    const anon = createClient(SUPABASE_URL, ANON_KEY)
    const { error: supAuthErr } = await anon.auth.signInWithPassword({ email: SUPERVISOR_EMAIL, password: SUPERVISOR_PASSWORD })
    if (supAuthErr) throw new Error(`Supervisor login check failed: ${supAuthErr.message}`)

    const supBrowser = await chromium.launch()
    const supPage = await supBrowser.newPage({ viewport: { width: 1280, height: 900 } })
    const supErrors = []
    supPage.on('pageerror', (err) => supErrors.push(err.message))

    await supPage.goto(BASE, { waitUntil: 'load' })
    await supPage.fill('input[name="email"]', SUPERVISOR_EMAIL)
    await supPage.fill('input[name="password"]', SUPERVISOR_PASSWORD)
    await supPage.click('button[type="submit"]')
    await supPage.waitForURL('**/supervisor/**', { timeout: 15000 })
    await supPage.goto(`${BASE}/supervisor/deliveries`, { waitUntil: 'load', timeout: 30000 })

    await supPage.locator('button', { hasText: 'Completed Deliveries' }).first().click()
    await supPage.waitForTimeout(500)
    await supPage.getByText(DELIVERY_ID, { exact: true }).first().click()
    await supPage.waitForTimeout(500)
    await supPage.screenshot({ path: 'scripts/repro-route-comparison-sup-1-details.png' })

    const routeTab = supPage.locator('button', { hasText: 'Route Deviation Report' }).first()
    const routeTabVisible = await routeTab.isVisible().catch(() => false)
    console.log('Route Deviation Report tab visible:', routeTabVisible)

    if (routeTabVisible) {
      await routeTab.click()
      await supPage.waitForTimeout(1500)
      await supPage.screenshot({ path: 'scripts/repro-route-comparison-sup-2-route-tab.png' })
    }

    console.log('page errors (supervisor):', supErrors)
    await supBrowser.close()

    console.log(routeTabVisible ? 'PASS' : 'FAIL')
    if (!routeTabVisible) process.exit(1)
  } finally {
    console.log('--- final safety check: confirming DR-0021 status is back to', before.status, '---')
    const { data: after } = await admin.from('delivery_requests').select('status').eq('id', DELIVERY_ID).single()
    if (after?.status !== before.status) {
      console.log(`--- MISMATCH, forcing status back to ${before.status} ---`)
      await admin.from('delivery_requests').update({ status: before.status }).eq('id', DELIVERY_ID)
    } else {
      console.log('DR-0021 status confirmed restored:', after.status)
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
