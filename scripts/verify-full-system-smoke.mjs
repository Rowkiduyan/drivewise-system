#!/usr/bin/env node
// Full-system smoke test, requested 2026-09-13: logs into every real portal
// (Admin/Supervisor/Driver/Helper/Customer) against the local dev server and
// visits each portal's main pages, collecting any console errors/page
// errors/failed page loads. Read-only -- no data is created or modified.
// Same magic-link sign-in pattern as verify-admin-dashboard.mjs/
// verify-critical-alerts.mjs for the portals with no documented password;
// Driver signs in with its real documented password (see scripts/README.md).
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function magicLinkSession(email) {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkErr) throw new Error(`generateLink(${email}) failed: ${linkErr.message}`)
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })
  if (verifyErr) throw new Error(`verifyOtp(${email}) failed: ${verifyErr.message}`)
  return verifyData.session
}

async function passwordSession(email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signInWithPassword(${email}) failed: ${error.message}`)
  return data.session
}

async function visitPortal(browser, { label, session, pages, screenshotPrefix }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('requestfailed', (req) => {
    // Ignore aborted map-tile/analytics requests -- noisy, not app bugs.
    const url = req.url()
    if (url.includes('googleapis.com') || url.includes('gstatic.com')) return
    failedRequests.push(`${req.failure()?.errorText || 'failed'} ${url}`)
  })
  await page.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])

  const report = { label, routes: [] };
  for (const route of pages) {
    const routeResult = { route, ok: true, note: '' }
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(4000)
      const bodyText = await page.locator('body').innerText().catch(() => '')
      routeResult.hasContent = bodyText.trim().length > 0
      if (screenshotPrefix) {
        const safeName = route.replace(/\//g, '_') || '_root'
        await page.screenshot({ path: `scripts/${screenshotPrefix}${safeName}.png`, fullPage: true }).catch(() => {})
      }
    } catch (e) {
      routeResult.ok = false
      routeResult.note = e.message
    }
    report.routes.push(routeResult)
  }
  report.consoleErrors = [...consoleErrors]
  report.pageErrors = [...pageErrors]
  report.failedRequests = [...failedRequests]
  await context.close()
  return report
}

async function main() {
  const browser = await chromium.launch({ ignoreHTTPSErrors: true })
  const reports = []

  console.log('=== Signing in to each portal (magic link / real password) ===')
  const [adminSession, supervisorSession, helperSession, customerSession, driverSession] = await Promise.all([
    magicLinkSession('admin@drivewise.com'),
    magicLinkSession('atdrilon01@marveltrucking.local'),
    magicLinkSession('tdtdurden01@marveltrucking.local'),
    magicLinkSession('jmsoho01@marveltrucking.local'),
    passwordSession('ayroque01@drivewise.local', 'Temp13dpjkd1opm3chztfhlxa0haeq!'),
  ])
  console.log('All 5 sign-ins succeeded.')

  const portals = [
    {
      label: 'Admin',
      session: adminSession,
      screenshotPrefix: 'smoke-admin-',
      pages: ['/admin/dashboard', '/admin/user-management', '/admin/device-management', '/admin/trucks', '/admin/profile'],
    },
    {
      label: 'Supervisor',
      session: supervisorSession,
      screenshotPrefix: 'smoke-sup-',
      pages: ['/supervisor/dashboard', '/supervisor/deliveries', '/supervisor/delivery-crew', '/supervisor/trucks', '/supervisor/profile'],
    },
    {
      label: 'Driver',
      session: driverSession,
      screenshotPrefix: 'smoke-driver-',
      pages: ['/driver/trips', '/driver/performance', '/driver/profile'],
    },
    {
      label: 'Helper',
      session: helperSession,
      screenshotPrefix: 'smoke-helper-',
      pages: ['/helper/trips', '/helper/profile'],
    },
    {
      label: 'Customer',
      session: customerSession,
      screenshotPrefix: 'smoke-customer-',
      pages: ['/customer/home', '/customer/deliveries', '/customer/profile'],
    },
  ]

  for (const portal of portals) {
    console.log(`\n=== Visiting ${portal.label} portal ===`)
    const report = await visitPortal(browser, portal)
    reports.push(report)
    for (const r of report.routes) {
      console.log(`  ${r.ok ? 'OK  ' : 'FAIL'} ${r.route}${r.note ? ' -- ' + r.note : ''}`)
    }
    if (report.consoleErrors.length) {
      console.log(`  console errors (${report.consoleErrors.length}):`)
      report.consoleErrors.forEach((e) => console.log('    - ' + e.slice(0, 300)))
    }
    if (report.pageErrors.length) {
      console.log(`  page errors (${report.pageErrors.length}):`)
      report.pageErrors.forEach((e) => console.log('    - ' + e.slice(0, 300)))
    }
    if (report.failedRequests.length) {
      console.log(`  failed requests (${report.failedRequests.length}):`)
      report.failedRequests.forEach((e) => console.log('    - ' + e.slice(0, 300)))
    }
  }

  await browser.close()

  console.log('\n=== SUMMARY ===')
  let anyIssues = false
  for (const r of reports) {
    const routeFails = r.routes.filter((x) => !x.ok).length
    const totalIssues = routeFails + r.consoleErrors.length + r.pageErrors.length + r.failedRequests.length
    if (totalIssues > 0) anyIssues = true
    console.log(`${r.label}: ${totalIssues === 0 ? 'CLEAN' : `${totalIssues} issue(s)`}`)
  }
  if (anyIssues) process.exitCode = 1
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message)
  process.exit(1)
})
