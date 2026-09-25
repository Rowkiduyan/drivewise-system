#!/usr/bin/env node
// Disposable verification for the Customer portal's "Progress Details"
// tracker (2026-09-26 stage-alignment rewrite): the customer's stages now
// mirror the supervisor's buildProgressData one-for-one, with the pickup/
// drop-off chain messages nested inside the matching Pickup/Drop-off stages
// (previously they lived under a single "Out for Delivery" stage).
// Uses DR-0048 (a real customer's real delivery, has a real stop with a
// real human-readable address, unlike the coordinate-string test fixtures)
// -- backs up and restores its exact original row afterward.
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const CUSTOMER_EMAIL = 'jmsoho01@marveltrucking.local'
const DELIVERY_ID = 'DR-0048'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function getRow() {
  const { data } = await admin.from('delivery_requests').select('*').eq('id', DELIVERY_ID).single()
  return data
}

async function main() {
  const original = await getRow()
  console.log('Backed up original row for', DELIVERY_ID, '-- status was', original.status)

  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: CUSTOMER_EMAIL })
  const { data: verifyData } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
  const session = verifyData.session

  const browser = await chromium.launch({ ignoreHTTPSErrors: true })
  const context = await browser.newContext({ viewport: { width: 500, height: 1000 }, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  await page.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])

  const results = {}

  async function openAndExpand() {
    await page.goto(`${BASE}/customer/deliveries`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'scripts/verify-customer-progress-debug-list.png', fullPage: true })
    await page.locator(`text=${DELIVERY_ID}`).first().click({ timeout: 10000 })
    await page.waitForTimeout(1500)
    const progressBtn = page.locator('text=Progress Details').first()
    if (await progressBtn.isVisible().catch(() => false)) {
      await progressBtn.click()
      await page.waitForTimeout(500)
    }
  }

  try {
    // ---- Stage 0: pickup not yet done -- no chain message may appear yet
    // (bug found on review: previously showed "on its way to pickup
    // location" even while the stage above was still greyed out), and the
    // stage list itself must already read like the supervisor's: same
    // eight-stage labels, no leftovers from the old six-step customer list.
    await admin.from('delivery_requests').update({
      status: 'OUT_FOR_PICKUP',
      pickup_photo_url: null,
      pickup_completed_at: null,
      dropoff_photo_url: null,
      dropoff_completed_at: null,
      dropoff_arrived_at: null,
      stops: (original.stops || []).map((s) => ({ ...s, completed: false, completedAt: null, photoUrl: null })),
    }).eq('id', DELIVERY_ID)
    await openAndExpand()
    results.stage0_noPrematureOnWayToPickup = (await page.locator('text=/on its way to/').count()) === 0
    results.stage0_noPrematurePickupChain = (await page.locator('text=/completed the pickup/').count()) === 0
    results.stage0_pickupStageIsCurrent = await page.locator('text-is=Pickup').first().isVisible().catch(() => false)
    results.stage0_completedStagesUseSupervisorLabels = await page.locator('text-is=Delivery Crew Assigned').first().isVisible().catch(() => false)
    results.stage0_noOldScheduledForPickupStep = (await page.locator('text=/Scheduled for Pickup/').count()) === 0
    await page.screenshot({ path: 'scripts/verify-customer-progress-00-before-pickup.png', fullPage: true })

    // ---- Stage 0b: zero-stop delivery -- primary dropoff should read
    // "on its way to X." with NO "(First Drop-Off Location)" qualifier
    // (bug found on review: was unconditionally appending "First..."). ----
    await admin.from('delivery_requests').update({
      status: 'OUT_FOR_DROPOFF',
      pickup_photo_url: 'https://example.com/fake-pickup.jpg',
      pickup_completed_at: new Date().toISOString(),
      dropoff_photo_url: null,
      dropoff_completed_at: null,
      dropoff_arrived_at: null,
      stops: [],
    }).eq('id', DELIVERY_ID)
    await openAndExpand()
    results.stage0b_onWayToDropoffNoOrdinal = await page.locator('text=/on its way to [^(]+\\./').first().isVisible().catch(() => false)
    results.stage0b_noFirstDropoffWording = (await page.locator('text=/First Drop-Off/').count()) === 0
    await page.screenshot({ path: 'scripts/verify-customer-progress-00b-zero-stops.png', fullPage: true })

    // ---- Stage 1: pickup just completed, dropoff/stop pending ----
    await admin.from('delivery_requests').update({
      status: 'OUT_FOR_DROPOFF',
      pickup_photo_url: 'https://example.com/fake-pickup.jpg',
      pickup_completed_at: new Date().toISOString(),
      dropoff_photo_url: null,
      dropoff_completed_at: null,
      dropoff_arrived_at: null,
      stops: (original.stops || []).map((s) => ({ ...s, completed: false, completedAt: null, photoUrl: null })),
    }).eq('id', DELIVERY_ID)
    await openAndExpand()
    results.stage1_pickupDoneLine = await page.locator('text=/completed the pickup from/').first().isVisible().catch(() => false)
    results.stage1_onWayToFirstDropoff = await page.locator('text=/on its way to.*First Drop-Off/').first().isVisible().catch(() => false)
    await page.screenshot({ path: 'scripts/verify-customer-progress-01-pickup-done.png', fullPage: true })

    // ---- Stage 2: primary dropoff also completed, stop still pending ----
    await admin.from('delivery_requests').update({
      dropoff_photo_url: 'https://example.com/fake-dropoff.jpg',
      dropoff_completed_at: new Date().toISOString(),
    }).eq('id', DELIVERY_ID)
    await openAndExpand()
    results.stage2_dropoffDoneLine = await page.locator('text=/completed the drop-off at.*First Drop-Off/').first().isVisible().catch(() => false)
    results.stage2_onWayToSecondDropoff = await page.locator('text=/on its way to.*Second Drop-Off/').first().isVisible().catch(() => false)
    await page.screenshot({ path: 'scripts/verify-customer-progress-02-dropoff-done.png', fullPage: true })

    // ---- Stage 3: the stop (final item) also completed ----
    await admin.from('delivery_requests').update({
      stops: (original.stops || []).map((s) => ({
        ...s,
        completed: true,
        completedAt: new Date().toISOString(),
        photoUrl: 'https://example.com/fake-stop.jpg',
      })),
    }).eq('id', DELIVERY_ID)
    await openAndExpand()
    results.stage3_dropoffDoneLine = await page.locator('text=/completed the drop-off at.*Second Drop-Off/').first().isVisible().catch(() => false)
    results.stage3_noDanglingOnWay = (await page.locator('text=/on its way to/').count()) === 0
    await page.screenshot({ path: 'scripts/verify-customer-progress-03-all-done.png', fullPage: true })

    results.pageErrors = pageErrors
    console.log(JSON.stringify(results, null, 2))
  } finally {
    await browser.close()
    // Restore the exact original row.
    const { id, ...rest } = original
    await admin.from('delivery_requests').update(rest).eq('id', DELIVERY_ID)
    const restored = await getRow()
    console.log('Restored', DELIVERY_ID, '-- status is now', restored.status, restored.status === original.status ? '(matches original)' : '(MISMATCH!)')
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
