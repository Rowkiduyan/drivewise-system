// Single source of truth for @react-google-maps/api's useJsApiLoader options.
// The loader is a singleton keyed by `id` (default "script-loader") and throws
// "Loader must not be called again with different options" if any two
// useJsApiLoader call sites in the app pass different option objects --
// so every call site must import this rather than building its own.
// 'geometry' is needed by DriverDeliveries.jsx's LiveNavigationMap
// (computeDistanceBetween / isLocationOnEdge). 'places' is needed by
// CustomerRequestDelivery.jsx's LocationPickerModal (Places Autocomplete
// search -- see 02_BOOKING_AND_TRIP_CREATION.md's "Google Maps Platform
// Setup", which already enables Places API (New) on this same key).
export const GOOGLE_MAPS_LIBRARIES = ['geometry', 'places']

export const GOOGLE_MAPS_LOADER_OPTIONS = {
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  libraries: GOOGLE_MAPS_LIBRARIES,
}
