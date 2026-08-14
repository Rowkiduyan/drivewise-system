import { useEffect, useState } from 'react'

// Module-level so the same address text is only looked up once across every
// component/render that needs it, not once per render or per mount.
const cache = new Map()

const PH_BBOX = '116.9,4.6,126.6,21.1'

// Forward-geocodes a free-text address via Photon (OpenStreetMap-based, no
// API key) -- the same geocoder CustomerRequestDelivery.jsx's booking form
// already uses for its search/map-picker. Used as a more reliable source of
// coordinates than handing raw address text straight to Google's
// DirectionsService and trusting whatever it guesses: confirmed live that
// Google's own geocoder can confidently mis-resolve an address it doesn't
// recognize well (e.g. "Trees Residences, 5th District, Quezon City"
// resolved to the Batasang Pambansa complex, ~9km off, flagged only by an
// easy-to-miss `partial_match: true`), while Photon found the real place.
// Reserved for text that has no already-captured coordinate of its own --
// multi-stop entries never do (no autocomplete/map picker on the booking
// form for them), and pickup/dropoff don't either whenever the customer
// typed an address and submitted without ever clicking a suggestion or
// using the map picker (CustomerRequestDelivery.jsx's LocationInput only
// captures lat/lng from those two interactions, not from free-typed text --
// see its own submit-time fallback call to this function).
export async function photonGeocode(address) {
  if (cache.has(address)) return cache.get(address)
  let coords = null
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&bbox=${PH_BBOX}`)
    if (res.ok) {
      const data = await res.json()
      const feature = data?.features?.[0]
      if (feature) coords = { lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0] }
    }
  } catch {
    // Leave coords null -- callers already treat a null coord as "fall back
    // to raw address text," same as an unparseable parseCoords() result.
  }
  cache.set(address, coords)
  return coords
}

// Resolves a list of free-text addresses (e.g. a multi-stop delivery's
// `stops[].location`) into real coordinates, all in parallel. `isReady`
// stays false until every lookup in the current `locations` list has
// settled (success or failure) -- callers that feed these into a
// DirectionsService route should wait for it, so a route isn't computed
// with some stops resolved and others still using raw text.
export function useResolvedStopCoords(locations) {
  const key = (locations || []).join('|')
  // `resolved.key` tracks which `key` the stored coordsByLocation actually
  // answers -- isReady compares it against the current key rather than a
  // separate boolean, so every state write happens inside a .then()
  // callback (not synchronously in the effect body itself, which the
  // codebase avoids -- react-hooks/set-state-in-effect).
  const [resolved, setResolved] = useState({ key: '', coordsByLocation: {} })

  useEffect(() => {
    let cancelled = false
    const list = locations || []
    const finish = (coordsByLocation) => {
      if (!cancelled) setResolved({ key, coordsByLocation })
    }
    if (list.length === 0) {
      Promise.resolve().then(() => finish({}))
    } else {
      Promise.all(list.map((loc) => photonGeocode(loc).then((coords) => [loc, coords]))).then((pairs) =>
        finish(Object.fromEntries(pairs)),
      )
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { coordsByLocation: resolved.coordsByLocation, isReady: resolved.key === key }
}
