#!/usr/bin/env node
// Visual audit pass across the whole app, requested 2026-09-14: screenshots
// every portal's main routes AND their internal tabs (not just top-level
// routes like verify-full-system-smoke.mjs does), at both desktop and
// mobile viewports for Driver/Helper (the only portals used on mobile in
// practice, per project convention -- other portals are desktop-only).
// Read-only, same magic-link/password sign-in pattern as the other verify-*
// scripts. Screenshots are for visual review, not pass/fail assertions.
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

async function newSignedInPage(browser, session, viewport) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  await page.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, session])
  return { context, page }
}

async function shoot(page, path, name) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `scripts/audit-${name}.png`, fullPage: true })
    return true
  } catch (e) {
    console.log(`  FAILED ${path} (${name}): ${e.message}`)
    return false
  }
}

async function clickTabAndShoot(page, tabText, name) {
  try {
    const tab = page.locator(`text=${tabText}`).first()
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click()
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `scripts/audit-${name}.png`, fullPage: true })
      return true
    }
    console.log(`  tab not found: ${tabText}`)
    return false
  } catch (e) {
    console.log(`  FAILED tab ${tabText} (${name}): ${e.message}`)
    return false
  }
}

async function main() {
  const browser = await chromium.launch({ ignoreHTTPSErrors: true })
  const DESKTOP = { width: 1440, height: 1000 }
  const MOBILE = { width: 390, height: 844 }

  console.log('Signing in...')
  const [adminSession, supervisorSession, helperSession, customerSession, driverSession] = await Promise.all([
    magicLinkSession('admin@drivewise.com'),
    magicLinkSession('atdrilon01@marveltrucking.local'),
    magicLinkSession('tdtdurden01@marveltrucking.local'),
    magicLinkSession('jmsoho01@marveltrucking.local'),
    passwordSession('ayroque01@drivewise.local', 'Temp13dpjkd1opm3chztfhlxa0haeq!'),
  ])
  console.log('Signed in.')

  // ===== Admin (desktop) =====
  console.log('\n=== Admin ===')
  {
    const { context, page } = await newSignedInPage(browser, adminSession, DESKTOP)
    await shoot(page, '/admin/dashboard', 'admin-dashboard')
    await shoot(page, '/admin/user-management', 'admin-users')
    await shoot(page, '/admin/device-management', 'admin-devices')
    await shoot(page, '/admin/trucks', 'admin-trucks')
    await shoot(page, '/admin/trucks/profile', 'admin-truck-profile-noquery')
    await shoot(page, '/admin/profile', 'admin-profile')
    await context.close()
  }

  // ===== Supervisor (desktop) =====
  console.log('\n=== Supervisor ===')
  {
    const { context, page } = await newSignedInPage(browser, supervisorSession, DESKTOP)
    await shoot(page, '/supervisor/dashboard', 'sup-dashboard')
    await shoot(page, '/supervisor/deliveries', 'sup-deliveries-inbox')
    await clickTabAndShoot(page, 'Assign Vehicle', 'sup-deliveries-assign')
    await clickTabAndShoot(page, 'In Transit Deliveries', 'sup-deliveries-transit')
    await clickTabAndShoot(page, 'Completed Deliveries', 'sup-deliveries-completed')
    await clickTabAndShoot(page, 'Cancellations', 'sup-deliveries-cancellations')
    await shoot(page, '/supervisor/delivery-crew', 'sup-crew')
    await shoot(page, '/supervisor/trucks', 'sup-trucks')
    await shoot(page, '/supervisor/profile', 'sup-profile')
    await context.close()
  }

  // ===== Driver (desktop + mobile) =====
  console.log('\n=== Driver ===')
  for (const [vp, tag] of [[DESKTOP, 'desktop'], [MOBILE, 'mobile']]) {
    const { context, page } = await newSignedInPage(browser, driverSession, vp)
    await shoot(page, '/driver/trips', `driver-today-${tag}`)
    await clickTabAndShoot(page, 'Upcoming', `driver-upcoming-${tag}`)
    await clickTabAndShoot(page, 'History', `driver-history-${tag}`)
    await shoot(page, '/driver/performance', `driver-performance-${tag}`)
    await shoot(page, '/driver/profile', `driver-profile-${tag}`)
    await context.close()
  }

  // ===== Helper (desktop + mobile) =====
  console.log('\n=== Helper ===')
  for (const [vp, tag] of [[DESKTOP, 'desktop'], [MOBILE, 'mobile']]) {
    const { context, page } = await newSignedInPage(browser, helperSession, vp)
    await shoot(page, '/helper/trips', `helper-today-${tag}`)
    await shoot(page, '/helper/profile', `helper-profile-${tag}`)
    await context.close()
  }

  // ===== Customer (desktop) =====
  console.log('\n=== Customer ===')
  {
    const { context, page } = await newSignedInPage(browser, customerSession, DESKTOP)
    await shoot(page, '/customer/home', 'customer-home')
    await shoot(page, '/customer/deliveries', 'customer-deliveries')
    await shoot(page, '/customer/profile', 'customer-profile')
    await context.close()
  }

  await browser.close()
  console.log('\nDone. Screenshots in scripts/audit-*.png')
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message)
  process.exit(1)
})
