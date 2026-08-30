#!/usr/bin/env node
// Captures a driving route's dense, road-following point path directly from
// the Directions REST API -- no browser/driver login needed, unlike
// gps-route-capture.mjs (which patches the JS SDK inside a real logged-in
// session). Useful for a delivery whose driver test credentials aren't
// known/documented (see scripts/README.md's DR-0020 fixture, which *does*
// have a documented driver login and so still goes through the JS SDK path).
//
// Same output shape gps-route-simulate.py expects: a JSON array of legs,
// each leg an array of {lat, lng} points, taken from each step's decoded
// polyline (not just each step's start/end) so replaying it glides along
// the road instead of jumping between sparse turn points -- same reasoning
// as gps-route-capture.mjs's own step.path capture.
//
// Usage:
//   node scripts/capture-route.mjs "<origin address>" "<destination address>" [waypoint address ...] > legs.json
//
// Reads VITE_GOOGLE_MAPS_API_KEY from .env (repo root).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readEnv(key) {
  const text = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8')
  for (const line of text.split('\n')) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim()
  }
  throw new Error(`${key} not found in .env`)
}

// Google's polyline encoding algorithm (decode direction) -- same algorithm
// @react-google-maps/api/the JS SDK uses internally to build step.path from
// each step's encoded polyline.points string.
function decodePolyline(encoded) {
  let index = 0, lat = 0, lng = 0
  const points = []
  while (index < encoded.length) {
    let result = 1, shift = 0, b
    do {
      b = encoded.charCodeAt(index++) - 63 - 1
      result += b << shift
      shift += 5
    } while (b >= 0x1f)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)

    result = 1
    shift = 0
    do {
      b = encoded.charCodeAt(index++) - 63 - 1
      result += b << shift
      shift += 5
    } while (b >= 0x1f)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)

    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 })
  }
  return points
}

const [origin, destination, ...waypoints] = process.argv.slice(2)
if (!origin || !destination) {
  console.error('Usage: node scripts/capture-route.mjs "<origin>" "<destination>" [waypoint ...]')
  process.exit(1)
}

const API_KEY = readEnv('VITE_GOOGLE_MAPS_API_KEY')
const params = new URLSearchParams({
  origin,
  destination,
  mode: 'driving',
  departure_time: 'now',
  traffic_model: 'best_guess',
  key: API_KEY,
})
if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'))

const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`)
const data = await res.json()

if (data.status !== 'OK') {
  console.error(`Directions API error: ${data.status} ${data.error_message || ''}`)
  process.exit(1)
}

const legs = data.routes[0].legs.map((leg) =>
  leg.steps.flatMap((step) => decodePolyline(step.polyline.points))
)

console.log(JSON.stringify(legs))
