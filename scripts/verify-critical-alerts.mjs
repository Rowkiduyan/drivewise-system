#!/usr/bin/env node
// Disposable verification for CriticalAlertPopup (src/components/CriticalAlertPopup.jsx),
// wired into SupDashboard.jsx's useFleetOps Realtime subscriptions.
// Reuses DR-0051's already-real Active session (from the earlier phone-GPS
// test fixture) rather than fabricating one -- it already has a saved
// suggested_route (needed for the deviation check) and an Active session
// (needed for both checks).
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'https://localhost:5174'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const SUPERVISOR_EMAIL = 'atdrilon01@marveltrucking.local'
const DELIVERY_ID = 'DR-0051'
const SESSION_ID = 'b96a1a26-a6ec-410a-8883-1153e6f3f526'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

async function main() {
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: SUPERVISOR_EMAIL })
  const { data: verifyData } = await anon.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'magiclink' })
  const session = verifyData.session

  const browser = await chromium.launch({ ignoreHTTPSErrors: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('console', (msg) => console.log('BROWSER:', msg.type(), msg.text()))
  page.on('requestfailed', (req) => console.log('REQFAIL:', req.url(), req.failure()?.errorText))
  await page.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])
  // Spy on AudioContext (CriticalAlertPopup's synthesized tone, no more
  // <audio> element) -- count oscillator .start() calls as "attempted playback".
  await page.addInitScript(() => {
    window.__oscillatorStarts = 0
    const OrigCtx = window.AudioContext || window.webkitAudioContext
    if (!OrigCtx) return
    const PatchedCtx = function (...args) {
      const ctx = new OrigCtx(...args)
      const origCreateOscillator = ctx.createOscillator.bind(ctx)
      ctx.createOscillator = () => {
        const osc = origCreateOscillator()
        const origStart = osc.start.bind(osc)
        osc.start = (...startArgs) => {
          window.__oscillatorStarts += 1
          return origStart(...startArgs)
        }
        return osc
      }
      return ctx
    }
    PatchedCtx.prototype = OrigCtx.prototype
    window.AudioContext = PatchedCtx
    window.webkitAudioContext = PatchedCtx
  })

  const results = {}
  let insertedAlertIds = []
  let insertedGpsLogId = null

  // Clean fixture-drift baseline: this session accumulates leftover alerts
  // across repeated test runs (e.g. earlier interrupted runs), which throws
  // off the app's exact-count-of-5 trigger (SupDashboard.jsx). Clear it first
  // so this run's own 4-then-5 sequence lands on a real count of 5.
  const { count: preexistingCount } = await admin
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', SESSION_ID)
  if (preexistingCount > 0) {
    await admin.from('alerts').delete().eq('session_id', SESSION_ID)
    console.log(`Cleared ${preexistingCount} leftover alert(s) for this session before testing.`)
  }

  try {
    await page.goto(`${BASE}/supervisor/dashboard`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(5000) // let Google Maps JS (geometry lib) AND the Realtime channel subscription both finish
    // Unlock audio the same way a real Supervisor's first click would.
    await page.mouse.click(700, 500)
    await page.waitForTimeout(500)

    // ---------------- Drowsiness: 4 alerts should NOT trigger, 5th SHOULD ----------------
    for (let i = 0; i < 4; i++) {
      const { data } = await admin.from('alerts').insert({
        event_type: 'prolonged_eye_closure',
        duration: 3.5,
        session_id: SESSION_ID,
      }).select().single()
      insertedAlertIds.push(data.id)
      await page.waitForTimeout(400) // avoid bursting 4 INSERT events into the same tick
    }
    await page.waitForTimeout(2000)
    results.popupVisibleAfter4Alerts = await page.locator('text=Very High Risk of Drowsiness').first().isVisible().catch(() => false)
    await page.screenshot({ path: 'scripts/verify-alert-01-after-4.png', fullPage: true })

    const { data: fifthAlert } = await admin.from('alerts').insert({
      event_type: 'prolonged_eye_closure',
      duration: 4.0,
      session_id: SESSION_ID,
    }).select().single()
    insertedAlertIds.push(fifthAlert.id)
    await page.waitForTimeout(3000)
    results.popupVisibleAfter5Alerts = await page.locator('text=Very High Risk of Drowsiness').first().isVisible().catch(() => false)
    results.popupMessageText = await page.locator('text=Very High Risk of Drowsiness').first().locator('xpath=../..').innerText().catch(() => null)
    // Audio actually attempted playback -- via the AudioContext spy above,
    // since CriticalAlertPopup now synthesizes a tone instead of playing an
    // <audio> element.
    results.audioAttemptedPlayback = await page.evaluate(() => window.__oscillatorStarts > 0).catch(() => false)
    await page.screenshot({ path: 'scripts/verify-alert-02-after-5-popup.png', fullPage: true })

    // ---------------- Hyperlink: click "View Delivery" ----------------
    const viewDeliveryLink = page.locator('text=View Delivery').first()
    if (await viewDeliveryLink.isVisible().catch(() => false)) {
      await viewDeliveryLink.click({ timeout: 10000 })
      await page.waitForTimeout(6000) // deliveries page's own fetch is heavier than the dashboard's
      results.navigatedToDeliveriesUrl = page.url()
      results.deliveryDetailShowsCorrectId = await page.locator(`text=${DELIVERY_ID}`).first().isVisible().catch(() => false)
      await page.screenshot({ path: 'scripts/verify-alert-03-hyperlink-navigation.png', fullPage: true })
    } else {
      results.viewDeliveryLinkNeverAppeared = true
    }

    // ---------------- Route deviation ----------------
    await page.goto(`${BASE}/supervisor/dashboard`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(3000)
    await page.mouse.click(700, 500)
    await page.waitForTimeout(500)

    // A point ~1.1km from the route's own points (well past the ~500m
    // SUP_ROUTE_DEVIATION_TOLERANCE_DEGREES threshold).
    const { data: gpsRow } = await admin.from('gps_logs').insert({
      delivery_request_id: DELIVERY_ID,
      session_id: SESSION_ID,
      latitude: 14.5806,
      longitude: 121.0972,
      timestamp: new Date().toISOString(),
    }).select().single()
    insertedGpsLogId = gpsRow.id
    await page.waitForTimeout(2500)
    results.deviationPopupVisible = await page.locator('text=Very High Possibility of Route Deviation').first().isVisible().catch(() => false)
    await page.screenshot({ path: 'scripts/verify-alert-04-deviation-popup.png', fullPage: true })

    results.pageErrors = pageErrors
    console.log(JSON.stringify(results, null, 2))
  } finally {
    await browser.close()
    if (insertedAlertIds.length) {
      await admin.from('alerts').delete().in('id', insertedAlertIds)
    }
    if (insertedGpsLogId) {
      await admin.from('gps_logs').delete().eq('id', insertedGpsLogId)
    }
    console.log(`Cleaned up ${insertedAlertIds.length} test alerts and ${insertedGpsLogId ? 1 : 0} test gps_logs row.`)
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
