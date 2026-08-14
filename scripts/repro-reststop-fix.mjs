// Disposable diagnostic -- verifies the 2026-08-14 rest-stop recommendation
// feature (12_REST_STOP_RECOMMENDATIONS.md). DR-0023 has a fake prior
// Completed session with session_duration=7560s (2.1hr, already over the
// 2-hour threshold) plus a fresh real Active session -- the banner should
// appear on load, driven purely by priorSessionsHoursRef summing that
// closed session's duration, no need to wait 2 real hours.
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const EMAIL = 'ayroque01@drivewise.local'
const PASSWORD = 'Temp13dpjkd1opm3chztfhlxa0haeq!'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 500, height: 900 } })
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

await page.goto(BASE, { waitUntil: 'load' })
await page.fill('input[name="email"]', EMAIL)
await page.fill('input[name="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/driver/**', { timeout: 15000 })
await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(4000)

await page.screenshot({ path: 'scripts/repro-reststop.png' })
const bannerVisible = await page
  .locator('text=/consider taking a rest stop/i')
  .first()
  .isVisible()
  .catch(() => false)

console.log('--- RESULT ---')
console.log('page errors:', pageErrors)
console.log('rest-stop banner visible:', bannerVisible)

// Also test dismiss actually hides it.
let hiddenAfterDismiss = false
if (bannerVisible) {
  await page.locator('button[aria-label="Dismiss rest stop recommendation"]').click()
  await page.waitForTimeout(300)
  hiddenAfterDismiss = !(await page.locator('text=/consider taking a rest stop/i').first().isVisible().catch(() => false))
  console.log('hidden after dismiss:', hiddenAfterDismiss)
}

if (pageErrors.length === 0 && bannerVisible && hiddenAfterDismiss) {
  console.log('PASS')
} else {
  console.log('FAIL')
}

await browser.close()
