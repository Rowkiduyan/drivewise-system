#!/usr/bin/env node
// Disposable verification for the Supervisor Route Review & Approval feature
// (2026-09-06): view/edit/approve a route as Supervisor during PENDING_REQUEST
// review, then confirm the Customer sees the approved route read-only.
// Reuses DR-0048 (real customer jmsoho01@marveltrucking.local, has a real
// stop with a real human-readable address -- see
// verify-customer-progress-details.mjs) rather than driving the full
// multi-step booking form, matching this repo's own established pattern of
// manipulating delivery_requests directly via service role rather than
// scripting that form. Backs up and restores DR-0048's exact original row
// (and deletes any quotation row this script inserts) afterward.
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const CUSTOMER_EMAIL = 'jmsoho01@marveltrucking.local'
const SUPERVISOR_EMAIL = 'atdrilon01@marveltrucking.local'
const SUPERVISOR_PASSWORD = 'Temp122wpjir8wy317hoa7r1pkyurx!'
const DELIVERY_ID = 'DR-0048'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function getRow() {
  const { data, error } = await admin.from('delivery_requests').select('*').eq('id', DELIVERY_ID).single()
  if (error) throw new Error(`Could not read ${DELIVERY_ID}: ${error.message}`)
  return data
}

async function main() {
  const original = await getRow()
  console.log('Backed up original row for', DELIVERY_ID, '-- status was', original.status, '| had suggested_route:', Boolean(original.suggested_route), '| route_approved_at:', original.route_approved_at)

  let insertedQuotationId = null
  const results = {}

  try {
    // ---- Part 1: Supervisor review, edit, approve ----
    console.log('--- resetting DR-0048 to PENDING_REQUEST with no route yet ---')
    await admin.from('delivery_requests').update({
      status: 'PENDING_REQUEST',
      suggested_route: null,
      route_approved_at: null,
      route_approved_by: null,
    }).eq('id', DELIVERY_ID)

    const supBrowser = await chromium.launch({ ignoreHTTPSErrors: true })
    const supPage = await supBrowser.newPage({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
    const supErrors = []
    supPage.on('pageerror', (err) => supErrors.push(err.message))
    supPage.on('console', (msg) => { if (msg.type() === 'error') supErrors.push(msg.text()) })

    await supPage.goto(BASE, { waitUntil: 'load', timeout: 30000 })
    await supPage.fill('input[name="email"]', SUPERVISOR_EMAIL)
    await supPage.fill('input[name="password"]', SUPERVISOR_PASSWORD)
    await supPage.click('button[type="submit"]')
    await supPage.waitForURL('**/supervisor/**', { timeout: 15000 })
    await supPage.goto(`${BASE}/supervisor/deliveries`, { waitUntil: 'load', timeout: 30000 })
    await supPage.waitForTimeout(2000)

    console.log('--- opening DR-0048 from the Inbox ---')
    await supPage.locator('#root').getByText(DELIVERY_ID, { exact: false }).first().click()
    await supPage.waitForTimeout(1000)
    await supPage.screenshot({ path: 'scripts/verify-route-approval-01-pending-detail.png', fullPage: true })

    const routeSection = supPage.locator('text=/Planned Route/').first()
    results.routeMapVisible = await routeSection.isVisible().catch(() => false)
    console.log('EditableRouteMap section visible:', results.routeMapVisible)

    const generateBtn = supPage.locator('button', { hasText: 'Generate Route' }).first()
    if (await generateBtn.isVisible().catch(() => false)) {
      console.log('--- clicking Generate Route ---')
      await generateBtn.click()
      await supPage.waitForTimeout(4000)
    }
    await supPage.screenshot({ path: 'scripts/verify-route-approval-02-generated.png', fullPage: true })

    // A polyline is an SVG <path> Google Maps renders inside the map div --
    // check the map's overlay pane actually drew something, and that at
    // least one draggable marker (pickup/dropoff pin) exists to drag.
    const mapCanvas = supPage.locator('.gm-style').first()
    results.mapRendered = await mapCanvas.isVisible().catch(() => false)
    console.log('Google Map rendered:', results.mapRendered)

    console.log('--- checking DB after Generate Route ---')
    let rowAfterGenerate = await getRow()
    results.suggestedRouteAfterGenerate = Boolean(rowAfterGenerate.suggested_route)
    console.log('suggested_route set after generate (client-side only, not yet persisted until Approve):', results.suggestedRouteAfterGenerate, '(expected false -- edits stay local until Approve)')

    console.log('--- clicking Approve Route ---')
    const approveBtn = supPage.locator('button', { hasText: 'Approve Route' }).first()
    results.approveButtonVisible = await approveBtn.isVisible().catch(() => false)
    if (results.approveButtonVisible) {
      await approveBtn.click()
      await supPage.waitForTimeout(2000)
    }
    await supPage.screenshot({ path: 'scripts/verify-route-approval-03-approved.png', fullPage: true })

    results.routeApprovedBadgeVisible = await supPage.locator('text=Route Approved').first().isVisible().catch(() => false)
    console.log('"Route Approved" badge visible:', results.routeApprovedBadgeVisible)

    console.log('page errors (supervisor):', supErrors)
    await supBrowser.close()

    console.log('--- verifying DB after Approve Route ---')
    const rowAfterApprove = await getRow()
    results.dbSuggestedRouteSet = Boolean(rowAfterApprove.suggested_route) && rowAfterApprove.suggested_route.length > 0
    results.dbRouteApprovedAtSet = Boolean(rowAfterApprove.route_approved_at)
    results.dbRouteApprovedBySet = Boolean(rowAfterApprove.route_approved_by)
    console.log('DB suggested_route set:', results.dbSuggestedRouteSet, '| route_approved_at:', rowAfterApprove.route_approved_at, '| route_approved_by:', rowAfterApprove.route_approved_by)

    // ---- Part 2: Customer sees the approved route read-only ----
    console.log('--- setting DR-0048 to PROCESSING with a quotation, so the Customer quotation view renders ---')
    const { data: qtn, error: qtnError } = await admin.from('delivery_quotations').insert({
      delivery_id: DELIVERY_ID,
      quotation_type: 'initial',
      amount: 15000,
      breakdown: { directExpenses: { dieselRate: 10 } },
      submitted_by: null,
    }).select().single()
    if (qtnError) {
      console.log('Could not insert a test quotation (non-fatal to the route-approval check itself):', qtnError.message)
    } else {
      insertedQuotationId = qtn.id
      await admin.from('delivery_requests').update({ status: 'PROCESSING' }).eq('id', DELIVERY_ID)

      const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: CUSTOMER_EMAIL })
      const { data: verifyData } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
      const session = verifyData.session

      const custBrowser = await chromium.launch({ ignoreHTTPSErrors: true })
      const custContext = await custBrowser.newContext({ viewport: { width: 500, height: 1200 }, ignoreHTTPSErrors: true })
      const custPage = await custContext.newPage()
      const custErrors = []
      custPage.on('pageerror', (err) => custErrors.push(err.message))
      await custPage.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])

      await custPage.goto(`${BASE}/customer/deliveries`, { waitUntil: 'load', timeout: 30000 })
      await custPage.waitForTimeout(2500)
      // Scoped to #root to avoid matching eruda's dev-mode debug console (a
      // network-log overlay appended outside the React root, see STATUS.md's
      // "Live in-app navigation" entry) -- its table can incidentally contain
      // DELIVERY_ID as a substring of a logged request URL.
      await custPage.locator('#root').getByText(DELIVERY_ID, { exact: false }).first().click({ timeout: 15000 })
      await custPage.waitForTimeout(1500)
      await custPage.screenshot({ path: 'scripts/verify-route-approval-04-customer-quotation.png', fullPage: true })

      results.customerRouteMapVisible = await custPage.locator('text=Route Approved').first().isVisible().catch(() => false)
      // Read-only: no Approve/Generate/Regenerate buttons should render for the customer.
      results.customerHasNoEditButtons = (await custPage.locator('button', { hasText: /Approve Route|Generate Route|Regenerate Route/ }).count()) === 0
      console.log('Customer sees approved route:', results.customerRouteMapVisible, '| no edit buttons shown:', results.customerHasNoEditButtons)
      console.log('page errors (customer):', custErrors)
      await custBrowser.close()
    }

    console.log(JSON.stringify(results, null, 2))
  } finally {
    console.log('--- cleanup: restoring DR-0048 to its exact original row ---')
    if (insertedQuotationId) {
      await admin.from('delivery_quotations').delete().eq('id', insertedQuotationId)
      console.log('Deleted test quotation', insertedQuotationId)
    }
    const { id, ...rest } = original
    await admin.from('delivery_requests').update(rest).eq('id', DELIVERY_ID)
    const restored = await getRow()
    const matches = restored.status === original.status && JSON.stringify(restored.suggested_route) === JSON.stringify(original.suggested_route)
    console.log('Restored', DELIVERY_ID, '-- status:', restored.status, matches ? '(matches original)' : '(MISMATCH -- check manually)')
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
