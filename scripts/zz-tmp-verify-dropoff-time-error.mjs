// Disposable: checks the drop-off-time-ordering error's placement in the
// booking form (2026-09-26 follow-ups: it must not shift the From/To time
// fields, and it must sit under them, not under "Drop-off 1").
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const CUSTOMER_EMAIL = 'mlreyes01@marveltrucking.local'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).trim()]
    }),
)
const PROJECT_REF = env.VITE_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1]
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function main() {
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: CUSTOMER_EMAIL })
  const { data: verify, error } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  })
  if (error) throw new Error(error.message)

  const browser = await chromium.launch({ ignoreHTTPSErrors: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, ignoreHTTPSErrors: true })
  await context.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [STORAGE_KEY, verify.session])
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto(`${BASE}/customer/deliveries/request`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('#pickupDate', { timeout: 30000 })

  // Pick Up Date (future, not blocked)
  await page.click('#pickupDate')
  await page.getByRole('button', { name: 'September 28, 2026', exact: true }).click()

  // Pick Up Window 2:00 PM -> 4:30 PM
  await page.click('#pickupTime')
  await page.locator('[data-slot="14:00"]').click()
  await page.click('#pickupTimeEnd')
  await page.locator('[data-slot="16:30"]').click()

  const before = await page.locator('#dropoffTime').boundingBox()
  const beforeTo = await page.locator('#dropoffTimeEnd').boundingBox()

  // Drop Off window 8:00 AM -> 9:15 AM (earlier than pick-up, same date)
  await page.click('#dropoffTime')
  await page.locator('[data-slot="08:00"]').click()
  await page.click('#dropoffTimeEnd')
  await page.locator('[data-slot="09:15"]').click()
  await page.waitForTimeout(300)

  const err = page.locator('p.text-red-600', { hasText: 'Drop-off cannot start before pick up finishes' })
  const errVisible = await err.isVisible()
  const errBox = errVisible ? await err.boundingBox() : null
  const after = await page.locator('#dropoffTime').boundingBox()
  const afterTo = await page.locator('#dropoffTimeEnd').boundingBox()
  const dropoff1Label = await page.locator('label[for="dropoffLocation"]').boundingBox()

  console.log('error visible:', errVisible)
  if (errVisible) console.log('error text:', (await err.innerText()).trim())
  console.log('From  y before/after:', before && before.y, '->', after && after.y, '| shifted:', before && after && Math.abs(after.y - before.y) > 1)
  console.log('To    y before/after:', beforeTo && beforeTo.y, '->', afterTo && afterTo.y, '| shifted:', beforeTo && afterTo && Math.abs(afterTo.y - beforeTo.y) > 1)
  if (errBox && before) {
    console.log('From x:', before.x, '| error x:', errBox.x, '| aligned under From/To:', Math.abs(errBox.x - before.x) <= 4)
    console.log('error top:', errBox.y, '| From bottom:', before.y + before.height, '| below fields:', errBox.y >= before.y + before.height - 1)
    if (dropoff1Label) console.log('Drop-off 1 label x:', dropoff1Label.x, '| error is right of it:', errBox.x >= dropoff1Label.x)
  }

  if (errVisible) await err.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'scripts/zz-tmp-dropoff-time-error.png' })
  console.log('page errors:', pageErrors.length ? pageErrors : 'none')
  await browser.close()
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
