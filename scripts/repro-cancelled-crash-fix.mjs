// Disposable diagnostic -- verifies the 2026-08-13 CANCELLED-exclusion fix in
// DriverDeliveries.jsx's nonArchived filter. DR-0021 is currently CANCELLED
// with pickup_date temporarily set back to today (the exact crash scenario:
// a same-day cancelled delivery previously crashed the page via
// statusCfg.banner on undefined). PASS if the page loads without error and
// does NOT show DR-0021 as the active workspace delivery.
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
await page.waitForTimeout(3000)

await page.screenshot({ path: 'scripts/repro-cancelled-fix.png' })
const bodyText = await page.locator('body').textContent()
const showsDR0021 = bodyText.includes('DR-0021')

console.log('--- RESULT ---')
console.log('page errors:', pageErrors)
console.log('page mentions DR-0021 (should be false):', showsDR0021)
console.log('page text snippet:', bodyText.slice(0, 300).replace(/\s+/g, ' '))

if (pageErrors.length === 0 && !showsDR0021) {
  console.log('PASS: no crash, DR-0021 (cancelled) not shown as active')
} else {
  console.log('FAIL')
}

await browser.close()
