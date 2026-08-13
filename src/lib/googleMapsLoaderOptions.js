// Single source of truth for @react-google-maps/api's useJsApiLoader options.
// The loader is a singleton keyed by `id` (default "script-loader") and throws
// "Loader must not be called again with different options" if any two
// useJsApiLoader call sites in the app pass different option objects --
// so every call site must import this rather than building its own.
// 'geometry' is needed by DriverDeliveries.jsx's LiveNavigationMap
// (computeDistanceBetween / isLocationOnEdge).
export const GOOGLE_MAPS_LIBRARIES = ['geometry']

export const GOOGLE_MAPS_LOADER_OPTIONS = {
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  libraries: GOOGLE_MAPS_LIBRARIES,
}
