// Luzon-only service area enforcement for the customer booking flow.
//
// The service area is defined as a set of latitude/longitude polygons
// (GeoJSON-style rings in [lat, lng] order) covering the main Luzon island
// plus the islands administratively grouped with it (Mindoro, Marinduque,
// Catanduanes, Polillo). Every location-selection path (map click, pin drag,
// search suggestion, submit-time geocode) validates against these polygons,
// so a coordinate outside Luzon can never be selected or saved.

const LUZON_MAINLAND = [
  // Northwest tip (Pagudpud) east along the north coast to Santa Ana
  [18.57, 120.63], [18.52, 120.95], [18.47, 121.2], [18.42, 121.55],
  [18.47, 121.85], [18.51, 122.0], [18.48, 122.15],
  // East coast south through Cagayan, Isabela, Aurora
  [18.3, 122.1], [17.9, 122.08], [17.6, 122.25], [17.3, 122.4],
  [17.03, 122.43], [16.88, 122.38], [16.5, 122.32], [16.28, 122.12],
  [16.08, 122.15], [15.85, 121.8], [15.75, 121.58], [15.62, 121.48],
  [15.53, 121.4],
  // Down to Infanta/Real, then the Quezon coast and Bondoc Peninsula
  [14.95, 121.55], [14.74, 121.65], [14.6, 121.55], [14.4, 121.68],
  [14.19, 121.73], [14.27, 121.93], [14.05, 122.02], [13.92, 122.1],
  [13.78, 122.22], [13.55, 122.38], [13.37, 122.52], [13.31, 122.55],
  [13.45, 122.35], [13.7, 122.12], [13.88, 121.98], [13.96, 121.79],
  [13.93, 121.64], [13.9, 121.42], [13.79, 121.15], [13.74, 121.06], [13.72, 120.92],
  // Batangas, Calatagan, Cavite, around Manila Bay, Bataan
  [13.67, 120.87], [13.73, 120.61], [14.11, 120.63], [14.42, 120.59],
  [14.47, 120.9], [14.6, 120.97], [14.8, 120.92], [14.86, 120.64],
  [14.72, 120.46], [14.55, 120.4], [14.44, 120.49],
  // Zambales coast north, Bolinao, around Lingayen Gulf, Ilocos coast back north
  [14.66, 120.26], [14.81, 120.27], [14.98, 120.06], [15.32, 119.98],
  [15.55, 119.94], [15.78, 119.84], [15.95, 119.83], [16.15, 119.9],
  [16.32, 119.77], [16.1, 120.05], [16.02, 120.21], [16.14, 120.4],
  [16.62, 120.31], [17.0, 120.38], [17.57, 120.39], [18.05, 120.45],
  [18.25, 120.55]
]

// Bicol peninsula (Camarines Norte/Sur, Albay, Sorsogon). Modeled as a second
// mainland ring overlapping the first near the Quezon border — overlap is
// harmless since a point is valid when it falls inside ANY service-area ring.
const BICOL_PENINSULA = [
  // Lamon Bay south shore (Quezon border area)
  [13.99, 122.29], [13.91, 122.44], [13.97, 122.57], [13.9, 122.65],
  // Down the Ragay Gulf east shore
  [13.78, 122.86], [13.69, 122.92], [13.55, 122.98], [13.42, 123.1],
  [13.3, 123.23],
  [13.18, 123.42], [12.93, 123.53], [12.97, 123.65], [12.66, 123.87],
  [12.5, 124.07],
  // Sorsogon east coast north through Albay
  [12.76, 124.14], [13.03, 124.16], [13.14, 123.74], [13.36, 123.73],
  [13.47, 123.63], [13.7, 123.4],
  // Caramoan peninsula, San Miguel Bay, Camarines Norte coast
  [13.77, 123.72], [13.82, 123.27], [13.79, 122.89], [14.14, 123.02],
  [14.13, 122.49], [14.27, 122.05]
]

const MINDORO = [
  [13.54, 120.94], [13.41, 121.22], [13.05, 121.5], [12.95, 121.48],
  [12.58, 121.5], [12.29, 121.28], [12.35, 121.09], [12.6, 120.89],
  [12.91, 120.79], [13.23, 120.59], [13.41, 120.76]
]

const MARINDUQUE = [
  [13.47, 121.87], [13.49, 122.03], [13.32, 122.12], [13.22, 121.98], [13.28, 121.85]
]

const CATANDUANES = [
  [14.1, 124.24], [14.04, 124.46], [13.78, 124.48], [13.56, 124.36],
  [13.47, 124.19], [13.62, 124.13], [13.92, 124.14]
]

const POLILLO = [
  [14.93, 121.88], [14.97, 122.1], [14.82, 122.16], [14.7, 122.0], [14.76, 121.84]
]

export const LUZON_SERVICE_AREA = [LUZON_MAINLAND, BICOL_PENINSULA, MINDORO, MARINDUQUE, CATANDUANES, POLILLO]

export const SERVICE_AREA_MESSAGE =
  'This location is outside our service area. Please select a location within Luzon.'

// Padded bbox of all polygons — used as Leaflet maxBounds so panning away
// from the service area naturally pulls the user back toward Luzon.
export const SERVICE_AREA_MAX_BOUNDS = [
  [11.9, 118.9],
  [19.0, 125.0]
]

// Ray-casting point-in-polygon: true if (lat, lng) is inside any ring.
// Rings are stored as [lat, lng]. Points within COASTLINE_TOLERANCE degrees
// (~200m) of any ring also count as inside, so a snapped pin or a click
// landing exactly on a modeled coastline vertex is never rejected.
const COASTLINE_TOLERANCE = 0.002

export function isInsideLuzon(lat, lng) {
  if (LUZON_SERVICE_AREA.some(ring => pointInRing(lat, lng, ring))) return true
  return nearestRingDistanceSq(lat, lng) <= COASTLINE_TOLERANCE ** 2
}

function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i]
    const [latJ, lngJ] = ring[j]
    if (
      (latI > lat) !== (latJ > lat) &&
      lng < lngI + ((lat - latI) * (lngJ - lngI)) / (latJ - latI)
    ) {
      inside = !inside
    }
  }
  return inside
}

// Squared distance from a point to the nearest polygon edge across all rings
// (shared by the coastline tolerance check and the snap-back lookup).
function nearestRingDistanceSq(lat, lng) {
  let minDistSq = Infinity
  for (const ring of LUZON_SERVICE_AREA) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const distSq = distanceToSegmentSq(lat, lng, ring[j], ring[i])
      if (distSq < minDistSq) minDistSq = distSq
    }
  }
  return minDistSq
}

function distanceToSegmentSq(lat, lng, [aLat, aLng], [bLat, bLng]) {
  const dLat = bLat - aLat
  const dLng = bLng - aLng
  const lenSq = dLat * dLat + dLng * dLng
  const t = lenSq === 0 ? 0 : clamp(((lat - aLat) * dLat + (lng - aLng) * dLng) / lenSq, 0, 1)
  const cLat = aLat + t * dLat
  const cLng = aLng + t * dLng
  return (lat - cLat) ** 2 + (lng - cLng) ** 2
}

// Nearest point on any polygon boundary — used to snap an invalid pin
// placement back to the closest valid spot inside the service area.
export function snapToLuzon(lat, lng) {
  let best = { lat: null, lng: null, distSq: Infinity }

  for (const ring of LUZON_SERVICE_AREA) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [aLat, aLng] = ring[j]
      const [bLat, bLng] = ring[i]
      const dLat = bLat - aLat
      const dLng = bLng - aLng
      const lenSq = dLat * dLat + dLng * dLng
      const t = lenSq === 0 ? 0 : clamp(((lat - aLat) * dLat + (lng - aLng) * dLng) / lenSq, 0, 1)
      const cLat = aLat + t * dLat
      const cLng = aLng + t * dLng
      const distSq = (lat - cLat) ** 2 + (lng - cLng) ** 2
      if (distSq < best.distSq) best = { lat: cLat, lng: cLng, distSq }
    }
  }
  return { lat: best.lat, lng: best.lng }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
