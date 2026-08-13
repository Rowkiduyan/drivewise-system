#!/usr/bin/env node
// Captures the real multi-leg route (one leg per stop, plus a final leg to
// destination) that DriverDeliveries.jsx's LiveNavigationMap computes for a
// driver's active delivery, by patching window.google.maps.DirectionsService
// before the app loads. Prints one JSON array of legs (each leg an array of
// {lat, lng} points) to stdout — feed it to gps-route-simulate.py.
//
// Captures every point along each step's actual road-following path
// (step.path), not just each step's end_location -- using only end-points
// (one per turn/maneuver) made replayed GPS ticks visibly "jump" between far-
// apart points instead of gliding along the drawn route, especially across
// long straight segments between turns. step.path already traces the real
// road geometry, so replaying it at a short interval looks like driving.
//
// Reassigning DirectionsService.prototype.route directly is silently ignored
// by Google's SDK; replacing the whole class via a poll-and-swap works.
//
// Usage:
//   DRIVER_EMAIL=... DRIVER_PASSWORD=... node scripts/gps-route-capture.mjs [baseUrl]
//
// Requires `npx playwright install chromium` once (playwright is a devDependency).

import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5173'
const EMAIL = process.env.DRIVER_EMAIL
const PASSWORD = process.env.DRIVER_PASSWORD

if (!EMAIL || !PASSWORD) {
  console.error('Set DRIVER_EMAIL and DRIVER_PASSWORD env vars to a driver test account with an active,\nmulti-stop delivery on its dropoff leg (see scripts/README.md).')
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage()

await page.addInitScript(() => {
  window.__capturedRoute = null
  const poll = setInterval(() => {
    if (window.google && window.google.maps && window.google.maps.DirectionsService && !window.__dsPatched) {
      window.__dsPatched = true
      const OrigDS = window.google.maps.DirectionsService
      class PatchedDS extends OrigDS {
        route(req, cb) {
          return super.route(req, (result, status) => {
            if (status === 'OK' && result) {
              const legs = JSON.parse(JSON.stringify(result.routes[0].legs.map((leg) =>
                leg.steps.flatMap((s) => s.path.map((p) => ({ lat: p.lat(), lng: p.lng() })))
              )))
              if (legs.length > 1) window.__capturedRoute = legs
            }
            if (cb) cb(result, status)
          })
        }
      }
      window.google.maps.DirectionsService = PatchedDS
      clearInterval(poll)
    }
  }, 20)
})

try {
  await page.goto(BASE, { waitUntil: 'load' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/driver/**', { timeout: 15000 })

  await page.goto(`${BASE}/driver/trips`, { waitUntil: 'load', timeout: 30000 })

  const legs = await page.waitForFunction(() => window.__capturedRoute, null, { timeout: 20000 }).then((h) => h.jsonValue())
  console.log(JSON.stringify(legs))
} catch (e) {
  console.error('ERROR', e.message)
  console.error('Make sure the driver account has an Active session on a delivery past pickup (OUT_FOR_DROPOFF) with stops set.')
  process.exit(1)
} finally {
  await browser.close()
}
