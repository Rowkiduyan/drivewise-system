import { useEffect, useState } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { GOOGLE_MAPS_LOADER_OPTIONS } from './googleMapsLoaderOptions.js'

// Module-level so the same coordinate string is only looked up once across
// every card/component that displays it (Driver, Helper, and any future
// caller), not once per render or per component instance.
const cache = new Map()

const COORDS_RE = /^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/

function looksLikeCoords(value) {
  return typeof value === 'string' && COORDS_RE.test(value.trim())
}

// Geocoding via the Maps JavaScript API's Geocoder class, not the raw
// Geocoding REST endpoint -- the REST endpoint rejects HTTP-referrer-
// restricted keys ("API keys with referer restrictions cannot be used with
// this API"), and this app's key is deliberately referrer-restricted
// (02_BOOKING_AND_TRIP_CREATION.md's Google Maps Platform Setup). The JS
// SDK's Geocoder is the browser-safe equivalent and works fine with the same
// restricted key already used for the map/Places/Directions calls -- calling
// `useJsApiLoader` here (with the app's shared, single options object, see
// googleMapsLoaderOptions.js) loads it if a page hasn't already.
function geocodeViaJsSdk(lat, lng) {
  return new Promise((resolve) => {
    new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
      resolve(status === 'OK' && results?.[0]?.formatted_address ? results[0].formatted_address : null)
    })
  })
}

// Resolves a "lat, lng" pickup/dropoff location (the shape a manually
// created test delivery like DR-0020 stores -- see
// scripts/set-dr0020-location.sh) into a human-readable address. A real
// customer booking's pickup_location/dropoff_location is already a real
// street address (Places Autocomplete on the booking form), so this is a
// no-op passthrough for those -- only coordinate-shaped strings trigger a
// lookup.
export function useResolvedAddress(rawAddress) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)
  const isCoords = looksLikeCoords(rawAddress)
  const cached = isCoords ? cache.get(rawAddress) : undefined
  const [resolved, setResolved] = useState(cached || rawAddress)

  useEffect(() => {
    if (!isCoords || !isLoaded || cache.has(rawAddress)) return
    const [lat, lng] = rawAddress.split(',').map((part) => parseFloat(part.trim()))
    let cancelled = false
    geocodeViaJsSdk(lat, lng).then((address) => {
      if (!address) return
      cache.set(rawAddress, address)
      if (!cancelled) setResolved(address)
    })
    return () => {
      cancelled = true
    }
  }, [rawAddress, isCoords, isLoaded])

  if (!isCoords) return rawAddress
  return cached || resolved
}
