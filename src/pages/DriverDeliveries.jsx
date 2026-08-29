import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  EyeOff,
  Loader2,
  MapPin,
  Navigation,
  Pause,
  Play,
  Repeat,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Wallet,
  Activity,
  X,
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  LocateFixed,
  Coffee,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
} from "react-leaflet";
import {
  GoogleMap,
  Marker as GoogleMapMarker,
  Polyline as GoogleMapPolyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import DriverLayout from "../layout/DriverLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import { useResolvedAddress } from "../lib/reverseGeocode.js";
import { useResolvedStopCoords } from "../lib/forwardGeocode.js";
import {
  formatManilaTimestamp,
  formatManilaShortTime,
  manilaTodayISO,
  MANILA_TIMEZONE,
  getManilaHour,
} from "../lib/manilaTime.js";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const startIcon = L.divIcon({
  className: "",
  html: '<div style="background:#2563eb;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)">S</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const endIcon = L.divIcon({
  className: "",
  html: '<div style="background:#059669;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)">E</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Driver-facing workflow: Assigned -> Heading to Pickup -> Out for Delivery -> Delivered.
// "Delivered" is the last thing the driver does — handing over the cargo finishes their job.
// Customer confirmation ("Completed") happens afterward on its own and never blocks the driver;
// it only ever appears on already-archived deliveries, never as a step the driver has to act on.
const statusConfig = {
  ASSIGNED: {
    label: "Assigned",
    badge: "bg-indigo-100 text-indigo-700",
    nextLabel: "Start Pickup",
    nextIcon: Play,
    nextStage: "FOR_PICKUP",
    nextColor: "bg-indigo-600 hover:bg-indigo-700",
    banner: "Ready to head to the pickup location?",
    bannerIcon: Play,
    confirmTitle: "Start heading to pickup?",
    confirmDescription:
      "This marks the delivery as in progress and begins navigation to the pickup location. You haven’t collected the cargo yet.",
  },
  // Confirm Pickup and Complete Delivery moved to the Helper (2026-08-12,
  // 02B_MULTI_STOP_DELIVERIES.md) — photo-required completion of the whole
  // Pickup -> Dropoff -> Stops chain is now HelperDeliveries.jsx's job. The
  // Driver's UI just reflects these two stages read-only (no nextStage/
  // nextLabel means no action button renders — see the banner-only render
  // path below).
  FOR_PICKUP: {
    label: "Heading to Pickup",
    badge: "bg-cyan-100 text-cyan-700",
    nextLabel: null,
    nextIcon: null,
    nextStage: null,
    nextColor: null,
    banner: "Waiting for the helper to confirm pickup.",
    bannerIcon: MapPin,
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    badge: "bg-blue-100 text-blue-700",
    nextLabel: null,
    nextIcon: null,
    nextStage: null,
    nextColor: null,
    banner: "Waiting for the helper to complete the delivery chain.",
    bannerIcon: Navigation,
  },
  DELIVERED: {
    label: "Delivered",
    badge: "bg-teal-100 text-teal-700",
    nextLabel: null,
    nextIcon: null,
    nextStage: null,
    nextColor: null,
    banner: null,
    bannerIcon: null,
  },
  COMPLETED: {
    label: "Completed",
    badge: "bg-green-100 text-green-700",
    nextLabel: null,
    nextIcon: null,
    nextStage: null,
    nextColor: null,
    banner: null,
    bannerIcon: null,
  },
};

// Short, stacked-friendly labels — the tab bar is a 3-up grid on every screen size
// (never a horizontally-scrolling row), so labels need to read fine at that width.
const REPORT_TABS = [
  { id: "trip", label: "Trip", icon: Route },
  { id: "behavior", label: "Behavior", icon: Activity },
  { id: "route", label: "Route", icon: MapPin },
];

const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: "Prolonged Eye Closure",
  pattern_eye_closure_yawn: "Eye Closure + Yawn",
  pattern_repeated_eye_closure: "Repeated Eye Closure",
  face_not_detected: "Eyes Not Detected",
};

const ALERT_TYPE_ICONS = {
  prolonged_eye_closure: EyeOff,
  pattern_eye_closure_yawn: AlertTriangle,
  pattern_repeated_eye_closure: Repeat,
  face_not_detected: CameraOff,
};

// Driver-facing audio alert (06_DROWSINESS_ALERT_PIPELINE.md). Two clips,
// escalating by how clustered the alerts are: the first four alerts in any
// rolling 30-minute window use the normal chime; the moment a 5th alert
// lands within that same 30-minute window, it and every alert after it
// (until the window clears) use the more urgent clip instead.
const USUAL_ALERT_SRC = encodeURI("/Usual Alert.mp3");
const MULTIPLE_ALERT_SRC = encodeURI("/5+ Multiple Alert.mp3");
const ALERT_CLUSTER_WINDOW_MS = 30 * 60 * 1000;
const ALERT_CLUSTER_THRESHOLD = 5;

// Browsers block <audio>.play() with no prior user interaction on the page.
// Playing muted-and-immediately-paused at Start Trip (the driver's first
// interaction) unlocks both clips so a later real alert can just play.
function unlockAlertAudio(audioEl) {
  if (!audioEl) return;
  const wasMuted = audioEl.muted;
  audioEl.muted = true;
  audioEl
    .play()
    .then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.muted = wasMuted;
    })
    .catch(() => {
      audioEl.muted = wasMuted;
    });
}

// Plays the clip twice in a row — one pass isn't attention-grabbing enough
// for a drowsiness alert, per feedback while testing this feature live.
function playAlertClip(audioEl) {
  if (!audioEl) return;
  const attemptPlay = () =>
    audioEl.play().catch((err) => {
      console.warn("Drowsiness alert audio failed to play:", err);
    });
  const playSecondTime = () => {
    audioEl.removeEventListener("ended", playSecondTime);
    audioEl.currentTime = 0;
    attemptPlay();
  };
  audioEl.addEventListener("ended", playSecondTime, { once: true });
  audioEl.currentTime = 0;
  attemptPlay();
}

const RISK_BADGE_CLASSES = {
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
};

const RISK_ICONS = {
  red: ShieldAlert,
  amber: AlertTriangle,
  emerald: ShieldCheck,
};

function getRiskLevel(alertCount) {
  if (alertCount >= 4) return { tone: "red", label: "High Risk" };
  if (alertCount >= 2) return { tone: "amber", label: "Moderate" };
  return { tone: "emerald", label: "Safe" };
}

function RiskBadge({ tone, label }) {
  const Icon = RISK_ICONS[tone] || ShieldCheck;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${RISK_BADGE_CLASSES[tone] || RISK_BADGE_CLASSES.emerald}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function formatAlertDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

// Pinned to Asia/Manila (see lib/manilaTime.js) -- previously regex-
// extracted the raw digit characters straight out of the UTC-stored ISO
// string with no timezone conversion at all, displaying the UTC clock
// reading mislabeled as local time (8 hours behind real Manila time).
function formatAlertTimestamp(value) {
  return formatManilaTimestamp(value);
}

// Today's date as "YYYY-MM-DD" in Asia/Manila (see lib/manilaTime.js).
// Delivery pickup/dropoff dates are calendar dates entered by the customer
// (e.g. "2026-08-07"), so grouping must compare against the Manila-local
// date -- using Date.toISOString() (UTC) shifts the comparison a day ahead
// during the Manila morning. Previously used the *browser's* local date
// instead of Manila's explicitly, correct only by coincidence when the
// browser happens to already be set to Manila time.
function localTodayISO() {
  return manilaTodayISO();
}

// Time-only ("2:45pm") variant of formatAlertTimestamp, for the live
// monitoring feed where a full date would be redundant — every alert shown
// there happened moments ago, today.
function formatTimeOnly(value) {
  return formatManilaShortTime(value);
}

// `plannedLegs` is an array of `{path: [[lat,lng],...], color}` -- one entry
// per leg of the chain (Pickup -> Dropoff -> Stops for real data; a single
// synthetic leg for the legacy mock fixtures, see CompletedDeliveryReport's
// route tab). Mirrors SupDeliveries.jsx's own RouteDeviationMap extension
// (11_ROUTE_COMPARISON.md) -- kept as a separate copy per this codebase's
// existing per-portal duplication convention, not shared/imported.
// ACTUAL_ROUTE_COLOR deliberately near-black/neutral, not another hue from
// NAV_LEG_COLORS -- per user feedback, reusing a leg color for "actual"
// (previously the same blue as a planned leg, distinguished only by
// dashed-vs-solid) read as too similar at a glance.
const ACTUAL_ROUTE_COLOR = "#0F172A";
function RouteDeviationMap({
  plannedLegs,
  actualRoute,
  pickupCoords,
  dropoffCoords,
}) {
  const allPoints = [...plannedLegs.flatMap((leg) => leg.path), ...actualRoute];
  const lats = allPoints.map((p) => p[0]);
  const lngs = allPoints.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const center = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];

  return (
    <div
      className="rounded-lg border border-slate-200 overflow-hidden"
      style={{ height: 420 }}
    >
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full"
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {plannedLegs.map((leg, i) => (
          <Polyline
            key={i}
            positions={leg.path}
            pathOptions={{ color: leg.color, weight: 4, dashArray: "8 6" }}
          />
        ))}
        {/* White halo underneath the actual-route line for contrast against
            busy tiles and the colorful planned legs. */}
        <Polyline
          positions={actualRoute}
          pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.9 }}
        />
        <Polyline
          positions={actualRoute}
          pathOptions={{ color: ACTUAL_ROUTE_COLOR, weight: 4 }}
        />
        {pickupCoords && (
          <Marker position={pickupCoords} icon={startIcon}>
            <Popup>Pickup Location</Popup>
          </Marker>
        )}
        {dropoffCoords && (
          <Marker position={dropoffCoords} icon={endIcon}>
            <Popup>Drop-off Location</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

const GOOGLE_MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
// ~100m in degrees at this latitude -- isLocationOnEdge wants a tolerance in
// degrees, not meters. Rough conversion, not geodesically exact, which is
// fine for a "has the driver visibly left the route" check.
const NAV_REROUTE_TOLERANCE_DEGREES = 0.0009;
const NAV_STEP_ADVANCE_METERS = 35;
// Was 12000 -- shortened per explicit user request 2026-08-15 (felt too
// unresponsive during real-hardware testing, stacking on top of the
// DirectionsService round-trip itself). Still a real throttle, not 0, so an
// off-route driver doesn't spam DirectionsService on every single GPS tick.
const NAV_REROUTE_DEBOUNCE_MS = 5000;
// A DirectionsService request that never resolves at all (a real network
// failure on a weak/flaky connection, not just an error response) leaves
// neither the success nor failure branch of computeRoute() ever running --
// there's no built-in timeout on the SDK's own call. Past this many ms with
// no response, the request is treated as failed so the retry loop below can
// take over, instead of the UI sitting on "Computing route..." forever.
const ROUTE_REQUEST_TIMEOUT_MS = 15000;
// How long to wait before automatically retrying a failed/timed-out route
// computation -- previously routeError's "retrying shortly" message had
// nothing behind it; nothing ever actually retried.
const ROUTE_RETRY_DELAY_MS = 5000;
// Street-level nav zoom (Waze/Google Nav "Start" view) -- 16 read as a
// regular browsing zoom, not a close-in driving view. User feedback
// 2026-08-12 after live-testing the tilt/rotation fixes; bumped in steps
// (16 -> 18 -> 19 -> 21) per further feedback that it still read as too
// zoomed out. Google Maps silently clamps to whatever max zoom its imagery
// actually supports for a given location (typically ~20-21, sometimes less
// outside dense city centers), so this is close to the real usable ceiling
// most places already.
const NAV_ZOOM = 21;
// One color per leg of the Pickup -> Dropoff -> Stop 1 -> ... chain (cycles
// if a chain somehow has more legs than colors), per 02C_ROUTE_STYLING's
// per-leg design -- index 0 is reserved for the to-pickup leg specifically
// (its own separate DirectionsService call, always exactly one leg), so the
// post-pickup chain's legs start at index 1 (pickup->dropoff = blue, not red,
// so it's visually distinct from the to-pickup leg that preceded it).
const NAV_LEG_COLORS = [
  "#DC2626",
  "#2563EB",
  "#059669",
  "#7C3AED",
  "#EA580C",
  "#DB2777",
];

// Fixed depot/warehouse address every Trip starts from, per user instruction
// -- PlannedRouteMap's whole-trip guide now leads with this Warehouse ->
// Pickup leg (in addition to Pickup -> Dropoffs/Stops), so the map/
// suggested_route matches the full real GPS trace, not just the Pickup-
// onward portion. Kept as a plain address string (not lat/lng) -- passed
// straight to DirectionsService, same as any other address in this file.
const WAREHOUSE_ADDRESS =
  "140 M. Suarez Avenue, Brgy. San Miguel, Pasig, Metro Manila";
// WAREHOUSE_ADDRESS's own real geocoded position (captured from a live
// DirectionsService response, `suggested_route`'s warehouse->pickup leg's
// first point -- see scripts/repro-route-comparison-demo.mjs) -- reconciled
// 2026-08-14 with `activeNavOrigin` below, which previously hardcoded a
// *different* depot lat/lng ({lat: 14.5506, lng: 121.0471}) representing
// the same real place under a different, never-reconciled guess. Anywhere
// that needs actual coordinates (not a DirectionsService-geocodable string)
// should use this constant instead of a second magic-number literal.
const WAREHOUSE_COORDS = { lat: 14.57147, lng: 121.08762 };

function stripHtml(html) {
  return String(html || "").replace(/<[^>]+>/g, "");
}

function isCurrentNavTarget(coords, legEnd) {
  if (!coords || !legEnd) return false;
  return (
    Math.abs(coords.lat - legEnd.lat()) < 0.0005 &&
    Math.abs(coords.lng - legEnd.lng()) < 0.0005
  );
}

// A proper map-pin silhouette (the classic "location" teardrop glyph, 24x24
// viewBox) for Dropoff/Stop markers, instead of a plain filled circle -- per
// user feedback, a circle alone didn't read as "you're supposed to drop off
// here" the way a pin shape immediately does. Pickup deliberately keeps the
// plain circle (see the Pickup <Marker> above) since it isn't a "drop
// something off" point conceptually. anchor/labelOrigin are set explicitly
// because a custom SVG path's natural anchor is (0,0), not its visual
// center/tip the way SymbolPath.CIRCLE's is -- without these the marker
// would sit shifted and its numeric label would float off the pin entirely.
const DROPOFF_PIN_PATH =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z";
function dropoffPinIcon(fillColor, isCurrent) {
  return {
    path: DROPOFF_PIN_PATH,
    fillColor,
    fillOpacity: isCurrent ? 1 : 0.65,
    strokeColor: "#fff",
    strokeWeight: 1.5,
    scale: isCurrent ? 1.7 : 1.25,
    anchor: new window.google.maps.Point(12, 22),
    labelOrigin: new window.google.maps.Point(12, 9),
  };
}

// Pickup/Dropoff markers specifically (not the numbered Stop pins above,
// which keep the plain teardrop) -- per user feedback, even the pin-vs-circle
// distinction above still didn't read clearly enough against the rest of the
// map's markers (numbered stop pins, the live-position arrow). These render
// as a full custom image (not a google.maps.Symbol, which only supports one
// flat-color path) specifically so each can carry its own multi-part glyph
// -- a package outline for "cargo picked up here", a checkered flag for
// "trip ends here" -- the same shorthand delivery/nav apps use, rather than
// relying on color or a single letter label to carry the meaning.
function svgMarkerIcon(svg, size) {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(size, size * 1.2),
    anchor: new window.google.maps.Point(size / 2, size * 1.2),
  };
}

function pickupMarkerIcon() {
  return svgMarkerIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="41" viewBox="0 0 34 41">
      <path d="M17 1C8.4 1 1.5 7.9 1.5 16.4 1.5 27.6 17 40 17 40s15.5-12.4 15.5-23.6C32.5 7.9 25.6 1 17 1z" fill="#0284c7" stroke="#fff" stroke-width="2"/>
      <g fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
        <path d="M9 12.5 17 8.5l8 4v9l-8 4-8-4v-9z"/>
        <path d="M9 12.5 17 16.5l8-4"/>
        <path d="M17 16.5V25.5"/>
      </g>
    </svg>`,
    34,
  );
}

function dropoffMarkerIcon() {
  return svgMarkerIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="41" viewBox="0 0 34 41">
      <path d="M17 1C8.4 1 1.5 7.9 1.5 16.4 1.5 27.6 17 40 17 40s15.5-12.4 15.5-23.6C32.5 7.9 25.6 1 17 1z" fill="#059669" stroke="#fff" stroke-width="2"/>
      <path d="M13 8v18" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M13 8.5h11l-3.4 3.75L24 16H13z" fill="#fff"/>
    </svg>`,
    34,
  );
}

// The Warehouse leg's own starting point (PlannedRouteMap's new Warehouse ->
// Pickup leg) -- a warehouse/building glyph, slate-colored so it reads as
// "trip origin," distinct from the blue package (Pickup) and green flag
// (Dropoff) icons above.
function warehouseMarkerIcon() {
  return svgMarkerIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="41" viewBox="0 0 34 41">
      <path d="M17 1C8.4 1 1.5 7.9 1.5 16.4 1.5 27.6 17 40 17 40s15.5-12.4 15.5-23.6C32.5 7.9 25.6 1 17 1z" fill="#475569" stroke="#fff" stroke-width="2"/>
      <g fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
        <path d="M8 15.5 17 9l9 6.5V24H8z"/>
        <path d="M8 15.5 17 22l9-6.5"/>
        <path d="M14.5 24v-5h5v5"/>
      </g>
    </svg>`,
    34,
  );
}

// Whole-trip planned-route guide, shown before the driver taps "Start
// Pickup" (replaces the old static single-point iframe embed at the call
// site below). Draws every leg of Warehouse -> Pickup -> Dropoff -> Stops in
// one view -- the Warehouse leg is always first (fixed WAREHOUSE_ADDRESS,
// per user instruction), matching where the driver's Trip actually starts
// from in real life, before the Pickup-onward chain. Dropoff/Stop order is
// the same nearest-neighbor heuristic the live nav already uses for dynamic
// dropoff ordering (`nearestDropoffOrder`), seeded from Pickup (not the
// Warehouse) since that's genuinely where the driver will be once they
// start making dropoff decisions. The first time this computes a route for
// a delivery with no
// `suggestedRoute` saved yet, it persists the result once via `driver-trip`'s
// `save-suggested-route` action -- frozen from then on (this effect skips
// recomputing entirely once `suggestedRoute` is present, both to match that
// "frozen" contract and to avoid burning a fresh Directions API call every
// time this screen is reopened before Start Pickup). Later read by the
// Supervisor's planned-vs-actual Route Deviation Report
// (11_ROUTE_COMPARISON.md). Google Maps, not Leaflet, to match the app's
// live-nav map and reuse its pickup/dropoff/stop marker icons.
function PlannedRouteMap({
  pickupAddress,
  dropoffAddress,
  pickupCoordsProp,
  dropoffCoordsProp,
  stops,
  suggestedRoute,
  deliveryRequestId,
  onSaved,
}) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const [computedLegs, setComputedLegs] = useState(null);
  const [routeError, setRouteError] = useState(false);
  const savingRef = useRef(false);
  const mapRef = useRef(null);

  const stopsKey = (stops || []).map((s) => s.location).join("|");
  const stopLocations = (stops || []).map((s) => s.location);
  const { coordsByLocation: stopCoords, isReady: stopCoordsReady } =
    useResolvedStopCoords(stopLocations);

  useEffect(() => {
    if (suggestedRoute) return;
    if (
      !isLoaded ||
      !pickupAddress ||
      !dropoffAddress ||
      !window.google ||
      savingRef.current ||
      !stopCoordsReady
    )
      return;

    // pickupCoordsProp/dropoffCoordsProp are the real coordinates captured
    // at booking time (CustomerRequestDelivery.jsx's location picker,
    // persisted as pickup_lat/lng, dropoff_lat/lng) -- these are trusted,
    // Photon-resolved points, not a re-geocode. Falling back to
    // parseCoords(address) covers only the older "lat, lng"-text fixture
    // convention (DR-0020-style). Neither should fall back to letting
    // DirectionsService blind-geocode the raw address text for pickup/
    // dropoff specifically -- confirmed live that Google's own geocoder can
    // confidently mis-resolve an ambiguous local address (e.g. a subdivision
    // name plus a council-district label it doesn't recognize) to a
    // completely unrelated place, flagged only by an easy-to-miss
    // `partial_match: true` in the response. Stops have no captured
    // coordinate of their own (no autocomplete/map picker on the booking
    // form for them) -- stopCoords (useResolvedStopCoords, resolved via
    // Photon before this effect is allowed to run, see stopCoordsReady
    // above) covers those instead, same reasoning as pickup/dropoff.
    const pickupCoords = pickupCoordsProp || parseCoords(pickupAddress);
    const orderedStops = nearestDropoffOrder(pickupCoords, [
      {
        location: dropoffAddress,
        coords: dropoffCoordsProp || parseCoords(dropoffAddress),
        key: "dropoff",
      },
      ...(stops || []).map((s) => ({
        location: s.location,
        coords: parseCoords(s.location) || stopCoords[s.location] || null,
        key: "stop",
      })),
    ]);
    if (orderedStops.length === 0) return;

    const destination = orderedStops[orderedStops.length - 1];
    // Pickup itself is now a waypoint (Warehouse is the origin), followed by
    // every ordered dropoff/stop except the last, which becomes the request's
    // own destination.
    const waypointStops = [
      { location: pickupAddress, coords: pickupCoords, key: "pickup" },
      ...orderedStops.slice(0, -1),
    ];

    new window.google.maps.DirectionsService().route(
      {
        origin: WAREHOUSE_ADDRESS,
        destination: destination.coords || destination.location,
        waypoints: waypointStops.map((s) => ({
          location: s.coords || s.location,
          stopover: true,
        })),
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: "bestguess",
        },
      },
      (result, status) => {
        if (status !== "OK" || !result) {
          setRouteError(true);
          return;
        }
        setRouteError(false);
        const fromKeys = ["warehouse", ...waypointStops.map((s) => s.key)];
        const toKeys = [...waypointStops.map((s) => s.key), destination.key];
        const payload = result.routes[0].legs.map((leg, i) => ({
          from: fromKeys[i],
          to: toKeys[i],
          path: leg.steps.flatMap((step) =>
            step.path.map((p) => [p.lat(), p.lng()]),
          ),
        }));
        setComputedLegs(payload);
        if (mapRef.current && result.routes[0].bounds) {
          mapRef.current.fitBounds(result.routes[0].bounds, 16);
        }

        if (!savingRef.current) {
          savingRef.current = true;
          supabase.functions
            .invoke("driver-trip", {
              body: {
                action: "save-suggested-route",
                deliveryRequestId,
                suggestedRoute: payload,
              },
            })
            .then(({ data, error }) => {
              if (!error && data?.suggestedRoute)
                onSaved?.(data.suggestedRoute);
            });
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLoaded,
    suggestedRoute,
    pickupAddress,
    dropoffAddress,
    stopsKey,
    stopCoordsReady,
  ]);

  const legs = suggestedRoute || computedLegs;

  // Marker positions are derived from the legs' own real (geocoded) path
  // points, not from parseCoords -- works regardless of whether pickup/
  // dropoff/stops were coordinate pairs or real addresses, since every leg's
  // path is always real lat/lng either way (from DirectionsService's own
  // geocoding, or already-real points once persisted to suggested_route).
  const warehousePos = legs?.[0]?.path?.[0];
  const pickupLeg = legs?.find((leg) => leg.to === "pickup");
  const pickupPos = pickupLeg
    ? pickupLeg.path[pickupLeg.path.length - 1]
    : null;
  const dropoffLeg = legs?.find((leg) => leg.to === "dropoff");
  const dropoffPos = dropoffLeg
    ? dropoffLeg.path[dropoffLeg.path.length - 1]
    : null;
  // Whether the real dropoff is genuinely the LAST leg of the whole route --
  // Dynamic Nearest-Dropoff Ordering (02B_MULTI_STOP_DELIVERIES.md) can
  // legitimately place it before a stop instead, and the flag icon means
  // "this is the actual end of the trip," which would be misleading then.
  const isDropoffFinal = legs?.[legs.length - 1]?.to === "dropoff";
  const stopPositions = (legs || [])
    .filter((leg) => leg.to === "stop")
    .map((leg) => leg.path[leg.path.length - 1]);

  // Re-fits whenever `legs` becomes available from a route already saved as
  // `suggestedRoute` (the DirectionsService success callback above already
  // handles the freshly-computed case directly, since fitBounds needs the
  // real google.maps.LatLngBounds from that response, not a re-derived one).
  useEffect(() => {
    if (!suggestedRoute || !mapRef.current || !window.google || !legs?.length)
      return;
    const bounds = new window.google.maps.LatLngBounds();
    legs.forEach((leg) =>
      leg.path.forEach(([lat, lng]) => bounds.extend({ lat, lng })),
    );
    mapRef.current.fitBounds(bounds, 16);
  }, [suggestedRoute, legs]);

  return (
    <section className="overflow-hidden rounded-xl border border-amber-200/70 bg-white">
      <div className="border-b border-amber-200/70 bg-amber-50 px-3 py-2">
        <h3 className="text-xs font-bold text-slate-900">Planned Route</h3>
      </div>
      <div className="h-48 w-full sm:h-56">
        {!isLoaded ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Loading map…
          </div>
        ) : routeError && !legs ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-400">
            Couldn't load a route preview right now — try reopening this screen
            in a moment.
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={GOOGLE_MAP_CONTAINER_STYLE}
            onLoad={(map) => {
              mapRef.current = map;
            }}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              gestureHandling: "greedy",
            }}
          >
            {(legs || []).map((leg, i) => (
              <GoogleMapPolyline
                key={i}
                path={leg.path.map(([lat, lng]) => ({ lat, lng }))}
                options={{
                  // Leg 0 is now genuinely the to-pickup leg (Warehouse ->
                  // Pickup), matching NAV_LEG_COLORS' own documented
                  // convention (index 0 reserved for it) -- no `+1` offset
                  // needed anymore.
                  strokeColor: NAV_LEG_COLORS[i % NAV_LEG_COLORS.length],
                  strokeOpacity: 0.9,
                  strokeWeight: 5,
                }}
              />
            ))}
            {warehousePos && (
              <GoogleMapMarker
                position={{ lat: warehousePos[0], lng: warehousePos[1] }}
                icon={warehouseMarkerIcon()}
              />
            )}
            {pickupPos && (
              <GoogleMapMarker
                position={{ lat: pickupPos[0], lng: pickupPos[1] }}
                icon={pickupMarkerIcon()}
              />
            )}
            {dropoffPos && (
              <GoogleMapMarker
                position={{ lat: dropoffPos[0], lng: dropoffPos[1] }}
                icon={
                  isDropoffFinal
                    ? dropoffMarkerIcon()
                    : dropoffPinIcon("#059669", false)
                }
              />
            )}
            {stopPositions.map((pos, i) => (
              <GoogleMapMarker
                key={i}
                position={{ lat: pos[0], lng: pos[1] }}
                label={{
                  text: String(i + 2),
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: "700",
                }}
                // isCurrent: false -- this whole-trip overview shows every
                // stop at once (unlike LiveNavigationMap's single-current-
                // target view below, where isCurrent: true is correct since
                // that pin IS the immediate target). Dynamic Nearest-Dropoff
                // Ordering (02B_MULTI_STOP_DELIVERIES.md) can legitimately
                // place a reference-only stop last/farthest in the chain --
                // that's correct routing, but it must never render with the
                // same full-prominence styling as "the current/final target,"
                // which read as if a mere stop were the real delivery
                // destination. dropoffMarkerIcon() (the green flag, above)
                // is the only marker that represents the actual dropoff.
                icon={dropoffPinIcon("#d97706", false)}
              />
            ))}
          </GoogleMap>
        )}
      </div>
    </section>
  );
}

// Live in-app turn-by-turn navigation (capstone requirement: built on the
// Google Maps JavaScript API, not a static embed). Position comes from the
// Raspberry Pi's gps_logs uploads (passed in as `livePosition`), not the
// browser's own geolocation -- see 01_SYSTEM_ARCHITECTURE.md's Route
// Comparison section. Only rendered while isDrivingStage (see call site).
// isMonitoring/nextLabel/NextIcon/nextColor/onPause/onResume/onStageAdvance
// mirror the page's own sticky bottom action bar exactly (same fields as
// statusCfg + the same three confirm-modal triggers) -- used only while
// fullscreen (see the footer below), since fullscreen covers that action bar
// entirely and the driver would otherwise have no way to Pause/advance the
// trip without backing out of fullscreen first.
function LiveNavigationMap({
  origin,
  destination,
  stops,
  needsPickup,
  pickupCoords,
  dropoffCoords,
  isDropoffFinal,
  allStops,
  livePosition,
  isPaused,
  isMonitoring,
  nextLabel,
  NextIcon,
  nextColor,
  onPause,
  onResume,
  onStageAdvance,
}) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const [directions, setDirections] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  // Which leg of a multi-stop route the driver is currently on (0 = heading
  // to the first stop/destination, ... one leg per stop plus a final leg to
  // destination). Always 0 when there are no stops. Client-side only, never
  // written back — stops are reference-only, no per-stop status
  // (02B_MULTI_STOP_DELIVERIES.md).
  const [currentLegIndex, setCurrentLegIndex] = useState(0);
  // How many real-world legs were already completed before the CURRENT
  // `directions` object's own leg numbering started at 0 -- a reroute
  // recomputes the route from the driver's live position through only the
  // remaining stops, so its legs[] always restarts at index 0 regardless of
  // how far into the trip the driver actually is. Without this offset,
  // colors/labels (which key off currentLegIndex) would jump backwards to
  // "leg 0" on every reroute instead of continuing forward -- looked like a
  // different/earlier leg's route reappearing. currentLegIndex itself stays
  // relative (it has to, since it indexes into the current directions
  // object's legs[]/steps[]); this offset makes color/label math absolute.
  const [completedLegsOffset, setCompletedLegsOffset] = useState(0);
  // Persisted across refreshes/remounts -- a driver who mutes voice guidance
  // mid-trip shouldn't have it come back on just because the page reloaded.
  const [isMuted, setIsMuted] = useState(
    () => localStorage.getItem("driverNavMuted") === "true",
  );
  const [routeError, setRouteError] = useState(false);
  // Purely a layout toggle (fixed-position overlay over the whole viewport,
  // see the section's className below) -- doesn't unmount or remount
  // anything, so the drowsiness-alert <audio> elements/Realtime subscription
  // (both live in the parent DriverDeliveries component, entirely outside
  // this component's tree) keep running unaffected while fullscreen.
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Direction of travel, in degrees, derived from consecutive GPS ticks --
  // drives the Waze/Google Maps-style rotating arrow marker below.
  const [heading, setHeading] = useState(0);
  const mapRef = useRef(null);
  // Plain ref, not state: exists only so the recenter effect below can also
  // fire once the map finishes loading, in case livePosition (from the seed
  // fetch on mount) already arrived before mapRef.current was set -- without
  // this, that race left the map stuck on initialCenter after a page
  // refresh mid-trip instead of recentering on the driver's actual position,
  // since the effect's only dependency was livePosition and a ref change
  // alone doesn't re-run an effect.
  const [isMapReady, setIsMapReady] = useState(false);
  const lastAnnouncedStepRef = useRef("");
  const lastRerouteAtRef = useRef(0);
  const previousPositionRef = useRef(null);
  // Deliberately captured once and never updated -- passing a `center` prop
  // that changes with livePosition would make @react-google-maps/api call
  // map.setCenter() on every GPS tick, which resets tilt/heading back to 0
  // as a side effect. All camera movement after mount goes exclusively
  // through moveCamera() below instead, which doesn't have that problem.
  const [initialCenter] = useState(() => origin || destination);

  // Identifies the most recent computeRoute() call -- a watchdog timeout
  // captures its own request's id and only acts if it's still the latest one
  // by the time it fires, so a slow-but-eventually-successful earlier
  // request can't clobber a later, already-succeeded one, and a timeout that
  // fires after its own request already resolved is a no-op.
  const routeRequestIdRef = useRef(0);
  // Args of the most recent call, so the retry effect below can re-issue the
  // exact same request rather than needing its own separate retry path.
  const lastRouteRequestRef = useRef(null);

  // legOffset is how many real-world legs are already behind this route
  // before its own legs[0] -- 0 for a fresh mount/destination change, or
  // completedLegsOffset + currentLegIndex when called from the reroute
  // effect (see completedLegsOffset's own comment above).
  const computeRoute = (
    routeOrigin,
    routeDestination,
    routeWaypoints,
    legOffset = 0,
  ) => {
    if (!window.google || !routeOrigin || !routeDestination) return;
    lastRouteRequestRef.current = {
      routeOrigin,
      routeDestination,
      routeWaypoints,
      legOffset,
    };
    const requestId = ++routeRequestIdRef.current;
    const timeoutId = setTimeout(() => {
      if (routeRequestIdRef.current !== requestId) return;
      setRouteError(true);
    }, ROUTE_REQUEST_TIMEOUT_MS);
    new window.google.maps.DirectionsService().route(
      {
        origin: routeOrigin,
        destination: routeDestination,
        waypoints:
          routeWaypoints && routeWaypoints.length > 0
            ? routeWaypoints
            : undefined,
        travelMode: window.google.maps.TravelMode.DRIVING,
        // Traffic-aware routing (11_ROUTE_COMPARISON.md's "Traffic-Aware
        // Suggested Routes", decided 2026-08-13) -- departureTime: now makes
        // DirectionsService route around currently-predicted congestion,
        // not just shortest distance/time. Reused for every computeRoute()
        // call, including reroute-on-deviation, so a fresh traffic read
        // happens each time a new route is actually computed, not just once
        // at mount. 'bestguess' is Google's default/recommended model absent
        // a specific reason to prefer 'optimistic'/'pessimistic'.
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: "bestguess",
        },
      },
      (result, status) => {
        // A later request has already superseded this one (e.g. the
        // watchdog above already marked it failed, or a newer reroute fired
        // first) -- a late response landing after that shouldn't overwrite
        // whatever the newer request already did.
        if (routeRequestIdRef.current !== requestId) return;
        clearTimeout(timeoutId);
        if (status === "OK" && result) {
          setDirections(result);
          setCurrentStepIndex(0);
          setCurrentLegIndex(0);
          setCompletedLegsOffset(legOffset);
          setRouteError(false);
        } else {
          setRouteError(true);
        }
      },
    );
  };

  // Actually retry a failed/timed-out route computation -- previously
  // routeError's "retrying shortly" message had nothing behind it, so a
  // driver on a flaky connection got permanently stuck on that message with
  // no recovery short of a manual reload. Re-issues the exact same request
  // every ROUTE_RETRY_DELAY_MS until one succeeds.
  useEffect(() => {
    if (!routeError || !lastRouteRequestRef.current) return undefined;
    const { routeOrigin, routeDestination, routeWaypoints, legOffset } =
      lastRouteRequestRef.current;
    const timer = setTimeout(() => {
      computeRoute(routeOrigin, routeDestination, routeWaypoints, legOffset);
    }, ROUTE_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [routeError]);

  // Stops (reference-only locations between pickup and dropoff) become
  // DirectionsService waypoints -- one extra `legs[]` entry per stop.
  // `stop.coords` is already set upstream (the parent's
  // remainingDropoffCandidates/orderedRemainingDropoffs) for whichever entry
  // is the real dropoff sitting in a waypoint slot, via `active.
  // destinationCoords` -- using it here (rather than re-deriving from
  // `stop.location` text, which discarded it) keeps that already-correct
  // coordinate instead of falling back to a blind Directions geocode.
  // Genuine stops don't have a coordinate of their own; parseCoords covers
  // the "lat, lng"-text fixture convention, and stopCoords (resolved via
  // Photon below, same reliability reasoning as PlannedRouteMap) covers a
  // real address. Only once every stop's lookup has settled (or there are
  // none) does the route actually get computed -- see stopCoordsReady below.
  const unresolvedStopLocations = (stops || [])
    .filter((s) => !s.coords)
    .map((s) => s.location);
  const { coordsByLocation: stopCoords, isReady: stopCoordsReady } =
    useResolvedStopCoords(unresolvedStopLocations);
  const waypoints = (stops || []).map((stop) => ({
    location:
      stop.coords ||
      parseCoords(stop.location) ||
      stopCoords[stop.location] ||
      stop.location,
    stopover: true,
  }));
  const stopsKey = waypoints
    .map((w) =>
      typeof w.location === "string"
        ? w.location
        : `${w.location.lat},${w.location.lng}`,
    )
    .join("|");

  // Initial route + recompute on a leg switch (pickup -> dropoff) or when the
  // dropoff leg's stops become known. Not recomputed on every GPS tick --
  // livePosition is deliberately left out of this dependency list; see the
  // deviation effect below for the one case a live position should trigger a
  // fresh route.
  useEffect(() => {
    if (!isLoaded || !destination || !stopCoordsReady) return;
    computeRoute(livePosition || origin, destination, waypoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, destination?.lat, destination?.lng, stopsKey, stopCoordsReady]);

  // Upgrade the route's origin from the Warehouse/pickup fallback to the
  // truck's real GPS position the moment one first arrives. The initial
  // effect above deliberately excludes livePosition from its own deps (to
  // avoid recomputing on every GPS tick) -- but that means if it happened to
  // run before any real gps_logs reading had landed yet (a real race: the
  // Pi/GSM link can take a while to get a fix after the page is opened), the
  // drawn route stays anchored to the fallback origin indefinitely, even
  // after live GPS starts flowing, until the driver manually reloads. Fires
  // once per destination (tracked via the ref below, reset on a leg/delivery
  // change), not on every tick -- ongoing corrections after this point are
  // already handled by the reroute-on-deviation effect further down.
  const hasUsedRealOriginRef = useRef(false);
  useEffect(() => {
    hasUsedRealOriginRef.current = false;
  }, [destination?.lat, destination?.lng]);
  useEffect(() => {
    if (
      !isLoaded ||
      !livePosition ||
      !destination ||
      !stopCoordsReady ||
      isPaused
    )
      return;
    if (hasUsedRealOriginRef.current) return;
    hasUsedRealOriginRef.current = true;
    computeRoute(livePosition, destination, waypoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLoaded,
    livePosition,
    destination?.lat,
    destination?.lng,
    stopCoordsReady,
    isPaused,
  ]);

  // Recenter/follow as new positions arrive, and derive a heading (like
  // Waze/Google Maps' navigation-mode arrow) from consecutive GPS ticks --
  // gps_logs has no heading/bearing column, only latitude/longitude, so
  // there's nothing to read a heading from directly. Skip tiny movements
  // (GPS drift while stationary) so the arrow doesn't jitter randomly.
  //
  // The camera itself is also tilted/rotated to match, not just the marker
  // icon -- this is what actually gives the Waze/Google Nav "Start" look
  // (angled 3D perspective, direction-of-travel always up on screen) rather
  // than a flat north-up view with a rotating arrow on top of it. Requires a
  // vector map (VITE_GOOGLE_MAPS_MAP_ID) -- tilt/rotation on a plain raster
  // map is unreliable. All camera changes go through one moveCamera() call
  // -- center/zoom/tilt/heading composed atomically -- not separate
  // panTo()/setTilt()/setHeading() calls, which was the earlier bug:
  // setCenter()-style calls (including the ones @react-google-maps/api's own
  // `center` prop diffing triggers) reset tilt/heading back to 0 as a side
  // effect, so the map would briefly show tilted on load then flatten out
  // the moment any center update landed.
  //
  // Marker rotation: a legacy google.maps.Marker's Symbol icon is a screen-
  // space billboard -- it does NOT rotate along with the camera's `heading`
  // the way the underlying map plane does, so setting icon.rotation to the
  // same absolute heading as the camera does not cancel out to "pointing up
  // on screen" (tried first, confirmed wrong via live testing -- the arrow
  // didn't track direction of travel). The correct Waze/Google-Nav model is
  // simpler: the arrow itself never rotates, always pointing straight up:
  // the camera is what turns to keep direction-of-travel at the top of the
  // screen, so the world rotates under a fixed forward-facing arrow instead.
  // `heading` state is still computed here and still drives the camera --
  // just no longer also fed into the marker's rotation.
  useEffect(() => {
    if (!livePosition || !mapRef.current) return;
    let nextHeading = heading;
    // Only derive a heading from a *previous* position within this mount --
    // on a fresh page load/refresh, previousPositionRef starts empty, so the
    // first tick has nothing to compare against and correctly just recenters
    // without changing heading; consecutive-tick comparisons behave the same
    // as before once a second reading arrives.
    if (previousPositionRef.current && window.google) {
      const from = new window.google.maps.LatLng(
        previousPositionRef.current.lat,
        previousPositionRef.current.lng,
      );
      const to = new window.google.maps.LatLng(
        livePosition.lat,
        livePosition.lng,
      );
      if (
        window.google.maps.geometry.spherical.computeDistanceBetween(from, to) >
        2
      ) {
        nextHeading = window.google.maps.geometry.spherical.computeHeading(
          from,
          to,
        );
        setHeading(nextHeading);
      }
    }
    previousPositionRef.current = livePosition;
    mapRef.current.moveCamera({
      center: livePosition,
      zoom: NAV_ZOOM,
      tilt: 45,
      heading: nextHeading,
    });
    // isMapReady is read here (via mapRef.current, guaranteed set once it's
    // true) purely to re-run this effect once the map finishes loading --
    // see isMapReady's own comment for the refresh-race it closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePosition, isMapReady]);

  // Manual recenter (the "Locate" button below) -- gestureHandling: 'greedy'
  // lets the driver freely drag/pan the map away from livePosition to look
  // around, and nothing else snaps it back until the next GPS tick's own
  // moveCamera() call overwrites wherever the driver left it. This lets them
  // jump back immediately instead of waiting.
  const handleRecenter = () => {
    if (!livePosition || !mapRef.current) return;
    mapRef.current.moveCamera({
      center: livePosition,
      zoom: NAV_ZOOM,
      tilt: 45,
      heading,
    });
  };

  // Advance the current turn-by-turn step once the driver is close enough to
  // this step's end point. With stops/waypoints, a route has one legs[]
  // entry per stop (plus a final leg to destination) -- once the last step
  // of the current leg is reached, advance to the next leg instead (arrived
  // at that stop) and reset the step index for it. Client-side only, per the
  // "no per-stop status tracking" decision (02B_MULTI_STOP_DELIVERIES.md).
  useEffect(() => {
    if (!isLoaded || !livePosition || !directions) return;
    const legs = directions.routes[0]?.legs || [];
    const steps = legs[currentLegIndex]?.steps || [];
    const step = steps[currentStepIndex];
    if (!step) return;
    const distance =
      window.google.maps.geometry.spherical.computeDistanceBetween(
        new window.google.maps.LatLng(livePosition.lat, livePosition.lng),
        step.end_location,
      );
    if (distance > NAV_STEP_ADVANCE_METERS) return;
    // Legitimate external-system sync (reacting to a GPS position tick
    // arriving via props from the parent's Realtime subscription), not a
    // derived-state anti-pattern -- see the rule's own guidance quoted in
    // its message.
    if (currentStepIndex < steps.length - 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentStepIndex((i) => i + 1);
    } else if (currentLegIndex < legs.length - 1) {
      setCurrentLegIndex((i) => i + 1);
      setCurrentStepIndex(0);
    }
  }, [livePosition, directions, currentStepIndex, currentLegIndex, isLoaded]);

  // Reroute if the driver has visibly left the planned path. Debounced so a
  // driver stuck off-route for a while doesn't spam DirectionsService.
  useEffect(() => {
    if (!isLoaded || !livePosition || !directions || isPaused) return;
    const overviewPath = directions.routes[0]?.overview_path;
    if (!overviewPath) return;
    const routePolyline = new window.google.maps.Polyline({
      path: overviewPath,
    });
    const onRoute = window.google.maps.geometry.poly.isLocationOnEdge(
      new window.google.maps.LatLng(livePosition.lat, livePosition.lng),
      routePolyline,
      NAV_REROUTE_TOLERANCE_DEGREES,
    );
    if (onRoute) return;
    const now = Date.now();
    if (now - lastRerouteAtRef.current < NAV_REROUTE_DEBOUNCE_MS) return;
    lastRerouteAtRef.current = now;
    // Only re-route through stops not yet reached -- waypoints[i] corresponds
    // 1:1 to legs[i] (the leg heading to that stop), so the stops already
    // passed (indices before currentLegIndex) are dropped rather than
    // re-inserted into the new route. computeRoute resets currentLegIndex to
    // 0 on success, which correctly means "0 stops remaining before this one"
    // for the new, shorter waypoints list -- legOffset carries the real
    // absolute progress forward so color/label math doesn't reset with it.
    computeRoute(
      livePosition,
      destination,
      waypoints.slice(currentLegIndex),
      completedLegsOffset + currentLegIndex,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePosition, directions, isPaused, isLoaded, currentLegIndex]);

  // Immediately silence an in-flight announcement the moment Mute is
  // pressed -- toggling isMuted alone only prevents *future* .speak() calls
  // below; the browser keeps reading out whatever utterance was already
  // queued/speaking until it finishes on its own otherwise.
  useEffect(() => {
    if (isMuted && typeof window.speechSynthesis !== "undefined") {
      window.speechSynthesis.cancel();
    }
  }, [isMuted]);

  // Announce the current step once via speech synthesis -- once per step
  // index, not on every GPS tick that happens to land within the same step.
  useEffect(() => {
    if (isMuted || !directions) return;
    const key = `${currentLegIndex}:${currentStepIndex}`;
    if (lastAnnouncedStepRef.current === key) return;
    const steps = directions.routes[0]?.legs[currentLegIndex]?.steps || [];
    const step = steps[currentStepIndex];
    if (!step || typeof window.speechSynthesis === "undefined") return;
    lastAnnouncedStepRef.current = key;
    window.speechSynthesis.speak(
      new SpeechSynthesisUtterance(stripHtml(step.instructions)),
    );
  }, [currentStepIndex, currentLegIndex, directions, isMuted]);

  const legs = directions?.routes[0]?.legs || [];
  const steps = legs[currentLegIndex]?.steps || [];
  const currentStep = steps[currentStepIndex];
  // Absolute progress across the whole trip, not just this (possibly
  // reroute-shortened) directions object -- see completedLegsOffset's comment.
  const absoluteLegIndex = completedLegsOffset + currentLegIndex;
  // "Stop 2 of 4"-style indicator -- only meaningful with stops (more than
  // one leg). Deliberately sourced from the stable `stops` prop, not
  // `legs.length - 1`: a reroute recomputes the route through only the
  // remaining stops, so legs.length shrinks each time one, which would make
  // the total count itself count down instead of staying fixed.
  const totalStopLegs = (stops || []).length;
  const isOnFinalLeg = absoluteLegIndex >= totalStopLegs;
  // The point the driver is actually en route to right now -- the endpoint
  // of whichever leg is current. Compared against each waypoint marker's
  // coords (loose tolerance -- both sides ultimately come from the same
  // geocoded address, but one's a LatLng object and the other a parsed
  // {lat,lng}) to decide which pin gets the "current target" emphasis.
  const legEnd = legs[currentLegIndex]?.end_location;

  return (
    <section
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-white"
          : "overflow-hidden rounded-xl border border-amber-200/70 bg-white"
      }
    >
      <div className="flex items-center justify-between border-b border-amber-200/70 bg-amber-50 px-3 py-2">
        <h3 className="text-xs font-bold text-slate-900">Live Navigation</h3>
        <div className="flex items-center gap-1.5">
          {isPaused && (
            <span className="rounded-full bg-amber-800 px-2 py-0.5 text-[10px] font-semibold text-white">
              Paused
            </span>
          )}
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="rounded-md p-1 text-amber-800 hover:bg-amber-100"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() =>
              setIsMuted((m) => {
                const next = !m;
                localStorage.setItem("driverNavMuted", String(next));
                return next;
              })
            }
            aria-label={
              isMuted ? "Unmute voice guidance" : "Mute voice guidance"
            }
            className="rounded-md p-1 text-amber-800 hover:bg-amber-100"
          >
            {isMuted ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Taller than the static iframe it replaces (h-36/h-44) -- this is
          now the page's primary interactive nav view (tilt, rotation,
          live marker, turn instructions), not a small at-a-glance preview,
          so it needs more room to actually be usable. In fullscreen, grows
          to fill the remaining viewport height instead of a fixed size. */}
      <div
        className={`relative ${isFullscreen ? "w-full flex-1" : "h-[28rem] w-full sm:h-[32rem]"}`}
      >
        {!isLoaded ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={GOOGLE_MAP_CONTAINER_STYLE}
            center={initialCenter}
            zoom={NAV_ZOOM}
            onLoad={(map) => {
              mapRef.current = map;
              // Initial tilt before any livePosition has arrived yet --
              // further tilt/heading changes all go through the
              // moveCamera() effect above once GPS ticks start landing.
              map.moveCamera({ tilt: 45 });
              // Triggers the recenter effect immediately if livePosition
              // (from the seed fetch on mount) already resolved before the
              // map itself finished loading -- otherwise the map stayed on
              // initialCenter after a refresh instead of the driver's actual
              // last-known position until the next live GPS tick arrived.
              setIsMapReady(true);
            }}
            options={{
              disableDefaultUI: true,
              gestureHandling: "greedy",
              mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID,
            }}
          >
            {/* Rendered as plain Polylines, not <DirectionsRenderer> --
                DirectionsRenderer calls map.fitBounds() internally to zoom
                out and fit the *entire* route on screen whenever it (re)sets
                directions, which fights the zoom/tilt moveCamera() sets
                above (this was the actual cause of the map looking flat and
                fully zoomed out to the whole route instead of a tilted,
                street-level, GPS-following view). `preserveViewport: true`
                was tried first to suppress that, but DirectionsRenderer is
                now a deprecated API (Feb 2026) whose "existing bugs...will
                not be addressed" per its own console warning, and the
                override kept recurring -- a Polyline never touches the
                camera at all, so there's nothing left to fight.
                Only the CURRENT leg is rendered, not the whole chain at
                once (per user feedback -- showing every leg/pin
                simultaneously read as cluttered; a turn-by-turn view should
                show where the driver is headed right now, not the entire
                future route). Still colored per its position in the chain
                (02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md) so the color
                still changes leg to leg as the driver progresses -- the
                to-pickup call is always a single leg, pinned to color index
                0; the post-pickup chain's legs shift one color over so they
                never repeat the to-pickup color. */}
            {legs[currentLegIndex] && (
              <GoogleMapPolyline
                path={(legs[currentLegIndex].steps || []).flatMap(
                  (step) => step.path || [],
                )}
                options={{
                  strokeColor: needsPickup
                    ? NAV_LEG_COLORS[0]
                    : NAV_LEG_COLORS[
                        (absoluteLegIndex + 1) % NAV_LEG_COLORS.length
                      ],
                  strokeOpacity: 0.9,
                  strokeWeight: 7,
                  zIndex: 1,
                }}
              />
            )}
            {/* Only the pin for wherever the driver is actually heading
                right now (matched by comparing coords to the current leg's
                end point) -- same "current leg only" reasoning as the
                polyline above, not every Pickup/Dropoff/Stop pin at once. */}
            {pickupCoords && isCurrentNavTarget(pickupCoords, legEnd) && (
              <GoogleMapMarker
                position={pickupCoords}
                icon={pickupMarkerIcon()}
                zIndex={10}
              />
            )}
            {dropoffCoords &&
              isCurrentNavTarget(dropoffCoords, legEnd) &&
              (isDropoffFinal ? (
                // The real dropoff genuinely is the last remaining stop --
                // the flag icon's "this is the end" connotation is accurate.
                <GoogleMapMarker
                  position={dropoffCoords}
                  icon={dropoffMarkerIcon()}
                  zIndex={10}
                />
              ) : (
                // Dynamic Nearest-Dropoff Ordering routed here before a
                // stop that's still left -- same subdued pin treatment as
                // the Stop markers below (distinguished by color, not
                // shape) so it doesn't read as "the end" when it isn't.
                <GoogleMapMarker
                  position={dropoffCoords}
                  icon={dropoffPinIcon("#059669", true)}
                  zIndex={10}
                />
              ))}
            {(allStops || []).map((stop, i) => {
              // parseCoords-first, stopCoords (Photon, resolved above) as
              // the real-address fallback -- without this, a stop pin
              // simply never rendered for a real street address (silently
              // returned null here), not just routed less accurately.
              const coords =
                parseCoords(stop.location) || stopCoords[stop.location];
              if (!coords || !isCurrentNavTarget(coords, legEnd)) return null;
              return (
                <GoogleMapMarker
                  key={i}
                  position={coords}
                  label={{
                    text: String(i + 2),
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: "700",
                  }}
                  icon={dropoffPinIcon("#d97706", true)}
                  zIndex={10}
                />
              );
            })}
            {livePosition && (
              <GoogleMapMarker
                position={livePosition}
                icon={{
                  path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 6,
                  fillColor: "#2563eb",
                  fillOpacity: 1,
                  strokeColor: "#fff",
                  strokeWeight: 2,
                  // Fixed, not `heading` -- see the effect above for why:
                  // the camera rotates to keep direction-of-travel pointing
                  // up on screen, so the arrow itself always stays "up" too.
                  rotation: 0,
                }}
              />
            )}
          </GoogleMap>
        )}
        {livePosition && (
          <button
            onClick={handleRecenter}
            aria-label="Center on my location"
            className="absolute bottom-3 right-3 z-10 rounded-full bg-white p-2 text-amber-900 shadow-md hover:bg-amber-50"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-1.5 border-t border-amber-200/70 px-3 py-2.5 text-[11px]">
        {totalStopLegs > 0 && (
          <p className="font-semibold text-amber-800">
            {isOnFinalLeg
              ? "Heading to Drop-off"
              : `Stop ${absoluteLegIndex + 1} of ${totalStopLegs}`}
          </p>
        )}
        {routeError ? (
          <p className="text-slate-500">
            Couldn't compute a route right now — retrying shortly.
          </p>
        ) : currentStep ? (
          <div
            dangerouslySetInnerHTML={{ __html: currentStep.instructions }}
            className="text-slate-700"
          />
        ) : (
          <p className="text-slate-500">
            {isLoaded ? "Computing route…" : "Loading map…"}
          </p>
        )}
        {currentStep && (
          <p className="text-[10px] text-slate-400">
            {currentStep.distance?.text}
          </p>
        )}
      </div>

      {/* Fullscreen covers the page's own sticky bottom action bar (Pause
          Trip/Confirm Pickup/etc) entirely, so it's reproduced here --
          otherwise there'd be no way to advance the trip without backing out
          of fullscreen first. Same structure as that action bar: Resume Trip
          alone while paused, otherwise Pause Trip (only while actually
          monitoring) next to the stage-advance button. Not fullscreen: the
          page's own sticky action bar below is already reachable, so nothing
          renders here. */}
      {isFullscreen && (
        <div className="border-t border-amber-200/70 p-2.5">
          {isPaused ? (
            <button
              onClick={onResume}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-900 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-amber-800"
            >
              <Play className="h-3.5 w-3.5" />
              Resume Trip
            </button>
          ) : (
            <div className="flex gap-1.5">
              {isMonitoring && (
                <button
                  onClick={onPause}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-[11px] font-bold text-amber-900 transition hover:bg-amber-50"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause Trip
                </button>
              )}
              {nextLabel && (
                <button
                  onClick={onStageAdvance}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-bold text-white transition ${nextColor}`}
                >
                  {NextIcon && <NextIcon className="h-3.5 w-3.5" />}
                  {nextLabel}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const COMPLETED_REPORT_DATA = {
  "DEL-004": {
    routeDeviation: {
      planned: [
        [14.56, 121.07],
        [14.557, 121.06],
        [14.555, 121.053],
        [14.553, 121.048],
        [14.55, 121.047],
      ],
      actual: [
        [14.56, 121.07],
        [14.557, 121.06],
        [14.562, 121.055],
        [14.555, 121.052],
        [14.553, 121.048],
        [14.55, 121.047],
      ],
      plannedDistance: "5.8 km",
      actualDistance: "6.4 km",
      deviationDistance: "0.6 km",
      deviationPercent: 10.3,
      aiSummary:
        "Minor route deviation detected. The driver briefly deviated north near the C5-Meralco intersection, adding approximately 0.6 km to the planned route. This appears to be a navigation correction rather than an intentional detour. No significant impact on delivery time or safety.",
      aiVerdict: "Minor Deviation",
      aiVerdictTone: "amber",
    },
    trip: {
      route: "Pasig Hub → BGC Branch",
      distance: "14.2 km",
      duration: "45 min",
      startTime: "2026-07-20T08:30:00",
      endTime: "2026-07-20T09:15:00",
      stops: [
        { location: "Pasig Hub", time: "08:30", action: "Departure" },
        { location: "C5 Road Checkpoint", time: "08:48", action: "Waypoint" },
        { location: "BGC Branch", time: "09:15", action: "Drop-off Completed" },
      ],
      timeline: [
        { label: "Departed for Pickup", time: "08:00", completed: true },
        { label: "Arrived at Pickup Location", time: "08:15", completed: true },
        { label: "Departed for Drop Off", time: "08:30", completed: true },
        {
          label: "Arrived at Drop Off Location",
          time: "09:10",
          completed: true,
        },
        { label: "Delivery Completed", time: "09:15", completed: true },
      ],
    },
    behavior: {
      totalAlerts: 2,
      avgAlertsPerTrip: 2.0,
      riskLevel: getRiskLevel(2),
      alertsByType: [
        {
          type: "prolonged_eye_closure",
          count: 1,
          label: "Prolonged Eye Closure",
        },
        {
          type: "pattern_repeated_eye_closure",
          count: 1,
          label: "Repeated Eye Closure",
        },
      ],
      sessions: [
        {
          start: "2026-07-20T08:30:00",
          end: "2026-07-20T09:15:00",
          alerts: 2,
          duration: 2700,
        },
      ],
    },
    delivery: {
      totalAlerts: 2,
      totalSessions: 1,
      avgAlertDuration: "47s",
      peakAlertTime: "08:45 AM",
      eyeClosureAlerts: [
        {
          id: "A-1",
          time: "2026-07-20T08:42:00",
          type: "prolonged_eye_closure",
          duration: 45,
          severity: "Moderate",
        },
        {
          id: "A-2",
          time: "2026-07-20T08:55:00",
          type: "pattern_repeated_eye_closure",
          duration: 50,
          severity: "High",
        },
      ],
      history: [
        {
          event: "Delivery Request Created",
          timestamp: "2026-07-18T10:00:00",
          actor: "System",
        },
        {
          event: "Quotation Approved",
          timestamp: "2026-07-18T14:30:00",
          actor: "Supervisor",
        },
        {
          event: "Crew Assigned — Carlos Mendoza + ABC 1234",
          timestamp: "2026-07-19T08:00:00",
          actor: "Supervisor",
        },
        {
          event: "Picked Up from Pasig Hub",
          timestamp: "2026-07-20T08:30:00",
          actor: "Driver",
        },
        {
          event: "Delivered to BGC Branch",
          timestamp: "2026-07-20T09:15:00",
          actor: "Driver",
        },
        {
          event: "Marked as Completed",
          timestamp: "2026-07-20T09:20:00",
          actor: "System",
        },
      ],
    },
  },
  "DEL-005": {
    routeDeviation: {
      planned: [
        [14.3, 120.96],
        [14.32, 120.97],
        [14.35, 120.985],
        [14.38, 121.0],
        [14.4, 121.015],
        [14.42, 121.031],
      ],
      actual: [
        [14.3, 120.96],
        [14.31, 120.965],
        [14.33, 120.945],
        [14.36, 120.965],
        [14.39, 121.01],
        [14.41, 121.025],
        [14.42, 121.031],
      ],
      plannedDistance: "18.2 km",
      actualDistance: "22.8 km",
      deviationDistance: "4.6 km",
      deviationPercent: 25.3,
      aiSummary:
        "Significant route deviation detected. The driver took an alternative route through General Trias residential areas instead of staying on Aguinaldo Highway, adding 4.6 km to the planned route. This deviation is notable and may indicate driver unfamiliarity with the area or a deliberate choice to avoid traffic. Recommend reviewing the trip log for this delivery to assess any impact on schedule or fuel efficiency.",
      aiVerdict: "Significant Deviation",
      aiVerdictTone: "red",
    },
    trip: {
      route: "Cavite Depot → Alabang Branch",
      distance: "22.8 km",
      duration: "55 min",
      startTime: "2026-07-19T06:00:00",
      endTime: "2026-07-19T06:55:00",
      stops: [
        { location: "Cavite Depot", time: "06:00", action: "Departure" },
        { location: "General Trias Toll", time: "06:20", action: "Waypoint" },
        {
          location: "Alabang Branch",
          time: "06:55",
          action: "Drop-off Completed",
        },
      ],
      timeline: [
        { label: "Departed for Pickup", time: "05:30", completed: true },
        { label: "Arrived at Pickup Location", time: "05:45", completed: true },
        { label: "Departed for Drop Off", time: "06:00", completed: true },
        {
          label: "Arrived at Drop Off Location",
          time: "06:48",
          completed: true,
        },
        { label: "Delivery Completed", time: "06:55", completed: true },
      ],
    },
    behavior: {
      totalAlerts: 5,
      avgAlertsPerTrip: 5.0,
      riskLevel: getRiskLevel(5),
      alertsByType: [
        {
          type: "prolonged_eye_closure",
          count: 2,
          label: "Prolonged Eye Closure",
        },
        {
          type: "pattern_eye_closure_yawn",
          count: 2,
          label: "Eye Closure + Yawn",
        },
        {
          type: "pattern_repeated_eye_closure",
          count: 1,
          label: "Repeated Eye Closure",
        },
      ],
      sessions: [
        {
          start: "2026-07-19T06:00:00",
          end: "2026-07-19T06:55:00",
          alerts: 5,
          duration: 3300,
        },
      ],
    },
    delivery: {
      totalAlerts: 5,
      totalSessions: 1,
      avgAlertDuration: "52s",
      peakAlertTime: "06:30 AM",
      eyeClosureAlerts: [
        {
          id: "A-3",
          time: "2026-07-19T06:12:00",
          type: "prolonged_eye_closure",
          duration: 60,
          severity: "High",
        },
        {
          id: "A-4",
          time: "2026-07-19T06:20:00",
          type: "pattern_eye_closure_yawn",
          duration: 45,
          severity: "Moderate",
        },
        {
          id: "A-5",
          time: "2026-07-19T06:28:00",
          type: "pattern_eye_closure_yawn",
          duration: 55,
          severity: "High",
        },
        {
          id: "A-6",
          time: "2026-07-19T06:35:00",
          type: "prolonged_eye_closure",
          duration: 50,
          severity: "Moderate",
        },
        {
          id: "A-7",
          time: "2026-07-19T06:42:00",
          type: "pattern_repeated_eye_closure",
          duration: 50,
          severity: "High",
        },
      ],
      history: [
        {
          event: "Delivery Request Created",
          timestamp: "2026-07-17T09:00:00",
          actor: "System",
        },
        {
          event: "Quotation Approved",
          timestamp: "2026-07-17T15:00:00",
          actor: "Supervisor",
        },
        {
          event: "Crew Assigned — Miguel Santos + XYZ 5678",
          timestamp: "2026-07-18T10:00:00",
          actor: "Supervisor",
        },
        {
          event: "Picked Up from Cavite Depot",
          timestamp: "2026-07-19T06:00:00",
          actor: "Driver",
        },
        {
          event: "Delivered to Alabang Branch",
          timestamp: "2026-07-19T06:55:00",
          actor: "Driver",
        },
        {
          event: "Marked as Completed",
          timestamp: "2026-07-19T07:00:00",
          actor: "System",
        },
      ],
    },
  },
};

// Resolves a single "lat, lng"-shaped location (e.g. DR-0020-style fixture
// data) into a real address inline -- its own component (not called inline
// as a plain function) so `useResolvedAddress` can be called once per row
// inside a `.map()` without violating the rules of hooks. Mirrors
// SupDeliveries.jsx's identical helper, not shared, per this codebase's
// existing per-portal convention.
function ResolvedText({ value }) {
  return useResolvedAddress(value || "");
}

// Real Delivery Report data for the Driver's own CompletedDeliveryReport
// below, 2026-08-14 -- mirrors SupDeliveries.jsx's
// buildRealTripAndBehaviorReport (same sessions/alerts/gps_logs sources,
// same haversine distance/timeline/risk-tier logic), reshaped into this
// file's own simpler report structure rather than sharing that function
// directly (per-portal duplication, same reasoning as ResolvedText/
// RouteDeviationMap above). Fields with no real backing anywhere in the
// schema (an AI route-deviation narrative, precise pickup-confirmed
// timestamps) are left out rather than fabricated, same rule that function
// already established.
function buildRealDriverTripReport(delivery, sessions, alerts, gpsLogs) {
  if (!sessions.length) return null;

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.start_time) - new Date(b.start_time),
  );
  const firstSession = sorted[0];
  const lastSession = sorted[sorted.length - 1];
  const totalDurationSec = sorted.reduce(
    (sum, s) => sum + (s.session_duration || 0),
    0,
  );

  const bySessionId = {};
  for (const row of gpsLogs) {
    if (!bySessionId[row.session_id]) bySessionId[row.session_id] = [];
    bySessionId[row.session_id].push(row);
  }
  let totalMeters = 0;
  for (const points of Object.values(bySessionId)) {
    for (let i = 1; i < points.length; i += 1) {
      totalMeters += distanceMeters(
        points[i - 1].latitude,
        points[i - 1].longitude,
        points[i].latitude,
        points[i].longitude,
      );
    }
  }

  // Real per-item completion order -- dropoff_location isn't always last in
  // the chain (02B_MULTI_STOP_DELIVERIES.md's Dynamic Nearest-Dropoff
  // Ordering), so this sorts by each item's actual completedAt rather than
  // assuming dropoff always precedes the stops.
  const dropoffEvents = [];
  if (delivery.dropoffCompletedAt) {
    dropoffEvents.push({
      label: "Dropoff Completed",
      location: delivery.deliveryAddress,
      at: delivery.dropoffCompletedAt,
    });
  }
  (delivery.stops || []).forEach((s, i) => {
    if (s.completed && s.completedAt) {
      dropoffEvents.push({
        label: `Dropoff ${i + 2} Completed`,
        location: s.location,
        at: s.completedAt,
      });
    }
  });
  dropoffEvents.sort((a, b) => new Date(a.at) - new Date(b.at));

  // Pickup's own confirmation has no stored timestamp anywhere (only
  // pickup_photo_url, essentially a boolean flag) -- shown as done without
  // a time rather than an invented one, same as the Supervisor's version.
  const timeline = [
    delivery.assignedAt && {
      label: "Assigned to Trip",
      time: delivery.assignedAt,
      completed: true,
    },
    {
      label: "Pickup Trip Started",
      time: formatAlertTimestamp(firstSession.start_time),
      completed: true,
    },
    delivery.pickupPhotoUrl && {
      label: "Pickup Confirmed",
      time: "—",
      completed: true,
    },
    ...dropoffEvents.map((e) => ({
      label: e.label,
      time: formatAlertTimestamp(e.at),
      completed: true,
    })),
    {
      label: "Delivery Completed",
      time: formatAlertTimestamp(lastSession.end_time),
      completed: true,
    },
  ].filter(Boolean);

  const stops = [
    {
      location: delivery.pickupAddress,
      time: formatAlertTimestamp(firstSession.start_time),
      action: "Pickup / Departure",
    },
    ...dropoffEvents.map((e) => ({
      location: e.location,
      time: formatAlertTimestamp(e.at),
      action: e.label,
    })),
  ];

  // History mirrors the Timeline's real events but with raw ISO timestamps
  // (History's own row re-formats via formatAlertTimestamp) -- "Pickup
  // Confirmed" is left out here specifically since it has no real timestamp
  // to show (unlike Timeline's own "—" placeholder, a History row with no
  // time at all would look broken).
  const history = [
    { event: "Pickup Trip Started", at: firstSession.start_time },
    ...dropoffEvents.map((e) => ({ event: e.label, at: e.at })),
    { event: "Delivery Completed", at: lastSession.end_time },
  ].map((e) => ({ event: e.event, timestamp: e.at, actor: "You" }));

  // "Eye Closure Alerts" -- the three real drowsiness event types, not
  // face_not_detected (camera-visibility issue, not a drowsiness signal --
  // same distinction already applied throughout this app, e.g. the
  // driver-facing audio alert gate and DriverPerformance.jsx's weekly card).
  const eyeClosureAlerts = alerts
    .filter((a) => a.event_type !== "face_not_detected")
    .map((a) => ({
      id: a.id,
      type: a.event_type,
      time: a.created_at,
      duration: a.duration,
      severity: (a.duration || 0) >= 20 ? "High" : "Moderate",
    }));
  const avgClosureSec = eyeClosureAlerts.length
    ? eyeClosureAlerts.reduce((sum, a) => sum + (a.duration || 0), 0) /
      eyeClosureAlerts.length
    : null;

  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  alerts.forEach((a) => {
    const hour = getManilaHour(a.created_at);
    if (hour != null) hourlyCounts[hour] += 1;
  });
  let peakHour = null;
  let peakCount = 0;
  hourlyCounts.forEach((count, hour) => {
    if (count > peakCount) {
      peakCount = count;
      peakHour = hour;
    }
  });

  const typeCounts = {};
  alerts.forEach((a) => {
    typeCounts[a.event_type] = (typeCounts[a.event_type] || 0) + 1;
  });
  const alertsByType = Object.keys(ALERT_TYPE_LABELS).map((type) => ({
    type,
    label: ALERT_TYPE_LABELS[type],
    count: typeCounts[type] || 0,
  }));

  // face_not_detected excluded from risk classification, not from the raw
  // alert count -- same reasoning as eyeClosureAlerts above.
  const drowsinessAlertCount = alerts.filter(
    (a) => a.event_type !== "face_not_detected",
  ).length;
  const riskLevel = getRiskLevel(drowsinessAlertCount);

  // Route Deviation (11_ROUTE_COMPARISON.md) -- only when the pre-trip
  // screen actually saved a planned route (PlannedRouteMap's one-time
  // write). No AI narrative is fabricated for it, matching this function's
  // "don't invent what has no real source" rule throughout.
  const suggestedRoute = Array.isArray(delivery.suggestedRoute)
    ? delivery.suggestedRoute
    : null;
  let routeDeviation = null;
  if (suggestedRoute && suggestedRoute.length > 0) {
    // Leg 0 is Warehouse -> Pickup (PlannedRouteMap's fixed WAREHOUSE_ADDRESS
    // origin), matching NAV_LEG_COLORS' own documented convention (index 0
    // reserved for the to-pickup leg) -- no `+1` offset needed.
    const plannedLegs = suggestedRoute.map((leg, i) => ({
      path: leg.path,
      color: NAV_LEG_COLORS[i % NAV_LEG_COLORS.length],
    }));
    const plannedMeters = suggestedRoute.reduce((sum, leg) => {
      let legMeters = 0;
      for (let i = 1; i < leg.path.length; i += 1) {
        legMeters += distanceMeters(
          leg.path[i - 1][0],
          leg.path[i - 1][1],
          leg.path[i][0],
          leg.path[i][1],
        );
      }
      return sum + legMeters;
    }, 0);
    const deviationMeters = Math.abs(totalMeters - plannedMeters);
    // Derived from the legs' own real (geocoded) path points, not
    // delivery.pickupCoords/destinationCoords -- those only resolve a
    // "lat, lng"-shaped fixture value via parseCoords and are null for a
    // real, human-entered address, which silently dropped the map's
    // pickup/dropoff pins for any normal booking. suggested_route's paths
    // are always real coordinates either way (DirectionsService geocodes
    // whatever address it was given), so this works unconditionally.
    // leg[0] is Warehouse -> Pickup, not Pickup -> Dropoff, so pickupPoint
    // is that leg's END, not its start.
    const pickupLeg = suggestedRoute.find((leg) => leg.to === "pickup");
    const pickupPoint = pickupLeg
      ? pickupLeg.path[pickupLeg.path.length - 1]
      : null;
    const dropoffLeg = suggestedRoute.find((leg) => leg.to === "dropoff");
    const dropoffPoint = dropoffLeg
      ? dropoffLeg.path[dropoffLeg.path.length - 1]
      : null;
    routeDeviation = {
      plannedLegs,
      actualRoute: sorted.flatMap((s) =>
        (bySessionId[s.session_id] || []).map((p) => [p.latitude, p.longitude]),
      ),
      pickupCoords: pickupPoint
        ? { lat: pickupPoint[0], lng: pickupPoint[1] }
        : null,
      dropoffCoords: dropoffPoint
        ? { lat: dropoffPoint[0], lng: dropoffPoint[1] }
        : null,
      plannedDistance:
        plannedMeters > 0 ? `${(plannedMeters / 1000).toFixed(1)} km` : "—",
      actualDistance:
        totalMeters > 0 ? `${(totalMeters / 1000).toFixed(1)} km` : "—",
      deviationDistance: `${(deviationMeters / 1000).toFixed(1)} km`,
      deviationPercent:
        plannedMeters > 0
          ? Math.round((deviationMeters / plannedMeters) * 100)
          : 0,
    };
  }

  return {
    trip: {
      distance: totalMeters > 0 ? `${(totalMeters / 1000).toFixed(1)} km` : "—",
      duration: formatAlertDuration(totalDurationSec),
      stops,
      timeline,
    },
    delivery: {
      totalAlerts: alerts.length,
      avgAlertDuration:
        avgClosureSec != null ? `${avgClosureSec.toFixed(1)}s` : "—",
      peakAlertTime:
        peakHour != null ? `${String(peakHour).padStart(2, "0")}:00` : "—",
      eyeClosureAlerts,
      history,
    },
    behavior: {
      totalAlerts: alerts.length,
      riskLevel,
      alertsByType,
      sessions: sorted.map((s) => ({
        start: s.start_time,
        end: s.end_time,
        alerts:
          s.total_alerts ??
          alerts.filter((a) => a.session_id === s.session_id).length,
        duration: s.session_duration,
      })),
    },
    routeDeviation,
  };
}

function CompletedDeliveryReport({ report, delivery }) {
  const resolvedPickup = useResolvedAddress(delivery?.pickupAddress || "");
  const resolvedDropoff = useResolvedAddress(delivery?.deliveryAddress || "");
  const [reportTab, setReportTab] = useState("trip");

  if (!report) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No detailed report available for this delivery.
      </div>
    );
  }

  // Real reports don't set `trip.route` (no single clean string to build --
  // see buildRealDriverTripReport) -- resolved live here instead, via the
  // same hook the rest of the app already uses for a "lat, lng"-shaped
  // address. The legacy mock fixtures already provide a nice literal
  // string, so that takes priority when present.
  const routeLabel =
    report.trip.route || `${resolvedPickup} → ${resolvedDropoff}`;
  // Route tab needs a saved planned route to compare against -- real
  // deliveries that predate PlannedRouteMap (or never had a parseable
  // pickup/dropoff) simply don't get it, same as the Supervisor's version.
  const tabs = REPORT_TABS.filter(
    (tab) => tab.id !== "route" || Boolean(report.routeDeviation),
  );

  return (
    <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Delivery Report
        </p>
      </div>

      {/* A 3-up grid, not a horizontally-scrolling row — it always fits the viewport
          instead of requiring a swipe to reach the third tab. */}
      <div
        className={`mb-4 grid gap-1.5 border-b border-amber-200/70 pb-3 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = reportTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setReportTab(tab.id)}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-semibold transition ${
                isActive
                  ? "bg-amber-900 text-white"
                  : "text-slate-600 hover:bg-amber-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {reportTab === "trip" && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <Route className="mx-auto h-3.5 w-3.5 text-slate-400" />
              <p className="mt-1 text-[10px] text-slate-500">Distance</p>
              <p className="text-xs font-bold text-slate-900">
                {report.trip.distance}
              </p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <Clock className="mx-auto h-3.5 w-3.5 text-slate-400" />
              <p className="mt-1 text-[10px] text-slate-500">Duration</p>
              <p className="text-xs font-bold text-slate-900">
                {report.trip.duration}
              </p>
            </div>
            {/* Full-width on mobile: this value can be long, and unlike desktop there's no
                hover to reveal a truncated title, so it needs room to actually be read. */}
            <div className="col-span-2 rounded-lg bg-white border border-slate-200 p-2 text-center sm:col-span-1">
              <MapPin className="mx-auto h-3.5 w-3.5 text-slate-400" />
              <p className="mt-1 text-[10px] text-slate-500">Route</p>
              <p
                className="text-xs font-bold text-slate-900 sm:truncate"
                title={routeLabel}
              >
                {routeLabel}
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">
              Trip Timeline
            </p>
            <div className="space-y-1.5">
              {report.trip.timeline.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${step.completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                    {step.label}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                    {step.time}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">
              Trip Stops
            </p>
            <div className="space-y-1.5">
              {report.trip.stops.map((stop, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${i === 0 ? "bg-sky-100 text-sky-700" : i === report.trip.stops.length - 1 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
                    >
                      <MapPin className="h-2.5 w-2.5" />
                    </span>
                    {i < report.trip.stops.length - 1 && (
                      <div className="mt-0.5 h-3 w-px bg-slate-200" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700">
                      <ResolvedText value={stop.location} />
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {stop.time} — {stop.action}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">
              Eye Closure Alerts
            </p>
            <div className="space-y-1.5">
              {report.delivery.eyeClosureAlerts.map((alert) => {
                const Icon = ALERT_TYPE_ICONS[alert.type] || EyeOff;
                const severityColor =
                  alert.severity === "High"
                    ? "text-red-600 bg-red-50"
                    : "text-amber-600 bg-amber-50";
                return (
                  <div
                    key={alert.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-100 p-2 text-[11px]"
                  >
                    <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span className="font-medium text-slate-700">
                      {formatAlertTimestamp(alert.time)}
                    </span>
                    <span className="text-slate-500">
                      {ALERT_TYPE_LABELS[alert.type] || alert.type}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {alert.duration}s
                    </span>
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityColor}`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">
              Delivery History
            </p>
            <div className="space-y-1.5">
              {report.delivery.history.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        i === report.delivery.history.length - 1
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    {i < report.delivery.history.length - 1 && (
                      <div className="mt-0.5 h-3 w-px bg-slate-200" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700">{entry.event}</p>
                    <p className="text-[10px] text-slate-400">
                      {formatAlertTimestamp(entry.timestamp)} by {entry.actor}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportTab === "behavior" && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Total Alerts</p>
              <p className="text-xs font-bold text-slate-900">
                {report.delivery.totalAlerts}
              </p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Avg Duration</p>
              <p className="text-xs font-bold text-slate-900">
                {report.delivery.avgAlertDuration}
              </p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Peak Time</p>
              <p className="text-xs font-bold text-slate-900">
                {report.delivery.peakAlertTime}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 p-2.5">
            <div>
              <p className="text-[10px] text-slate-500">Your Risk Level</p>
              <p className="text-xs font-bold text-slate-900">
                {report.behavior.totalAlerts} alerts
              </p>
            </div>
            <RiskBadge
              tone={report.behavior.riskLevel.tone}
              label={report.behavior.riskLevel.label}
            />
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">
              Alert Type Breakdown
            </p>
            <div className="space-y-2">
              {report.behavior.alertsByType.map((item) => {
                const Icon = ALERT_TYPE_ICONS[item.type] || AlertTriangle;
                const pct =
                  report.behavior.totalAlerts > 0
                    ? Math.round(
                        (item.count / report.behavior.totalAlerts) * 100,
                      )
                    : 0;
                return (
                  <div key={item.type}>
                    <div className="flex items-center gap-2 text-[11px] mb-1">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {item.label}
                      </span>
                      <span className="shrink-0 font-semibold text-slate-900">
                        {item.count}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">
              Session Log
            </p>
            <div className="space-y-1.5">
              {report.behavior.sessions.map((session, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]"
                >
                  <span className="text-slate-600">
                    {formatAlertTimestamp(session.start)} —{" "}
                    {formatAlertTimestamp(session.end)}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {session.alerts} alerts
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatAlertDuration(session.duration)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportTab === "route" && report.routeDeviation && (
        <div className="space-y-2.5">
          {(() => {
            // Two shapes feed this tab: the legacy mock fixtures (`planned`/
            // `actual`, flat single-leg arrays) and the real one built by
            // buildRealDriverTripReport (`plannedLegs`/`actualRoute`/
            // `pickupCoords`/`dropoffCoords` already in RouteDeviationMap's
            // shape). Normalized here so RouteDeviationMap only ever deals
            // with one shape -- same approach as SupDeliveries.jsx's
            // equivalent tab.
            const r = report.routeDeviation;
            const plannedLegs = r.plannedLegs || [
              { path: r.planned, color: "#059669" },
            ];
            const actualRoute = r.actualRoute || r.actual || [];
            const pickupCoords = r.pickupCoords || r.planned?.[0];
            const dropoffCoords =
              r.dropoffCoords || r.planned?.[r.planned.length - 1];
            // Only the legacy mock fixtures carry an AI narrative -- no real
            // analysis pipeline produces one, so this stays absent rather
            // than showing "AI Route Analysis: undefined" for a real trip.
            const hasAiAnalysis = Boolean(r.aiVerdict);
            const red = r.aiVerdictTone === "red";
            return (
              <>
                <RouteDeviationMap
                  plannedLegs={plannedLegs}
                  actualRoute={actualRoute}
                  pickupCoords={pickupCoords}
                  dropoffCoords={dropoffCoords}
                />

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
                    <p className="text-[10px] text-slate-500">
                      Planned Distance
                    </p>
                    <p className="text-xs font-bold text-slate-900">
                      {r.plannedDistance}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
                    <p className="text-[10px] text-slate-500">
                      Actual Distance
                    </p>
                    <p className="text-xs font-bold text-slate-900">
                      {r.actualDistance}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
                    <p className="text-[10px] text-slate-500">Deviation</p>
                    <p className="text-xs font-bold text-slate-900">
                      {r.deviationDistance}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
                    <p className="text-[10px] text-slate-500">Deviation %</p>
                    <p className="text-xs font-bold text-slate-900">
                      {r.deviationPercent}%
                    </p>
                  </div>
                </div>

                {hasAiAnalysis && (
                  <div
                    className="flex items-center gap-2.5 rounded-lg border p-2.5"
                    style={{
                      borderColor: red ? "#fecaca" : "#fde68a",
                      backgroundColor: red ? "#fef2f2" : "#fffbeb",
                    }}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${red ? "bg-red-500" : "bg-amber-500"}`}
                    >
                      <Navigation className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold ${red ? "text-red-800" : "text-amber-800"}`}
                      >
                        AI Route Analysis: {r.aiVerdict}
                      </p>
                      <p
                        className={`mt-1 text-[11px] leading-relaxed ${red ? "text-red-700" : "text-amber-700"}`}
                      >
                        {r.aiSummary}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white border border-slate-200 p-2.5">
                  {/* Multi-leg real routes get one swatch per leg (matching
                      the map's own per-leg colors); the legacy single-leg
                      mock fixtures keep the plain "Planned Route" label. */}
                  {plannedLegs.length > 1 ? (
                    plannedLegs.map((leg, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[11px]"
                      >
                        <span
                          className="inline-block h-3 w-6 shrink-0 rounded-sm"
                          style={{ background: leg.color }}
                        />
                        <span className="text-slate-600">
                          Planned — Leg {i + 1}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span
                        className="inline-block h-3 w-6 shrink-0 rounded-sm"
                        style={{
                          background: plannedLegs[0]?.color || "#059669",
                        }}
                      />
                      <span className="text-slate-600">Planned Route</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[11px]">
                    <span
                      className="inline-block h-3 w-6 shrink-0 rounded-sm"
                      style={{ background: ACTUAL_ROUTE_COLOR }}
                    />
                    <span className="text-slate-600">Actual Route</span>
                  </div>
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                    <MapPin className="h-3 w-3 shrink-0" />S = Start, E = End
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ---- Backend-backed delivery loading ------------------------------------
// The driver's deliveries come from the admin-users Edge Function's
// get-driver-deliveries action (the client can't read delivery_requests or
// the *_records tables directly — see DATABASE.md / SUPABASE_GOTCHAS #8).
// Statuses are mapped between the driver UI's simplified flow
// (ASSIGNED -> FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED) and the
// delivery_requests.status values the supervisor timeline uses.

const DB_TO_DRIVER_STATUS = {
  ASSIGNED: "ASSIGNED",
  OUT_FOR_PICKUP: "FOR_PICKUP",
  ARRIVED_PICKUP: "OUT_FOR_DELIVERY",
  OUT_FOR_DROPOFF: "OUT_FOR_DELIVERY",
  ARRIVED_DROPOFF: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
};

// Driver internal next-stage -> delivery_requests.status to write back.
const DRIVER_STATUS_TO_DB = {
  FOR_PICKUP: "OUT_FOR_PICKUP",
  OUT_FOR_DELIVERY: "OUT_FOR_DROPOFF",
  DELIVERED: "DELIVERED",
};

// Some pickup/dropoff locations are stored as a "lat, lng" coordinate pair
// rather than a street address — parse those back into coords for the maps.
function parseCoords(value) {
  if (!value) return null;
  const m = String(value)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Plain-JS haversine, no google.maps dependency -- mirrors SupDashboard.jsx's
// own distanceMeters helper exactly, reused here for the rest-stop
// recommendation's distance accumulation (12_REST_STOP_RECOMMENDATIONS.md)
// so it works regardless of whether the Maps JS API has finished loading
// yet at the point this runs (unlike google.maps.geometry.spherical, which
// LiveNavigationMap can rely on since it gates on its own isLoaded).
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Greedy nearest-neighbor ordering for dropoff-type candidates (02B_MULTI_
// STOP_DELIVERIES.md's "Dynamic Nearest-Dropoff Ordering", decided
// 2026-08-14). Each candidate is `{ location, coords }`; `coords` may be
// null for a candidate whose address doesn't parse to "lat, lng" (a real
// street address, same limitation parseCoords already has elsewhere) -- such
// a candidate can't be ranked by distance, so it's kept in its original
// relative position among the other un-rankable candidates and only ever
// picked once no coordinate-bearing candidate remains closer. Chains from
// each picked candidate's own coords for the next pick (simulating "having
// arrived there"), since only the very first pick is ever actually driven to
// before the caller re-derives this list from a real position again.
function nearestDropoffOrder(referencePos, candidates) {
  const remaining = [...candidates];
  const ordered = [];
  let fromPos = referencePos;
  while (remaining.length > 0) {
    let pickIndex = 0;
    let pickDistance = Infinity;
    remaining.forEach((candidate, i) => {
      if (!candidate.coords || !fromPos) return;
      const d = distanceMeters(
        fromPos.lat,
        fromPos.lng,
        candidate.coords.lat,
        candidate.coords.lng,
      );
      if (d < pickDistance) {
        pickDistance = d;
        pickIndex = i;
      }
    });
    const [next] = remaining.splice(pickIndex, 1);
    ordered.push(next);
    if (next.coords) fromPos = next.coords;
  }
  return ordered;
}

// Full ordered legend -- Pickup, then every Dropoff/Stop in the same
// nearest-first order a computed `legs` route actually visits them (walks
// `legs` directly rather than recomputing nearestDropoffOrder, so it stays
// correct for both a freshly computed route AND an already-frozen
// suggestedRoute). A 'stop' leg's endpoint is matched back to its address
// by nearest coordinate against the same points (parseCoords/stopCoords)
// that fed the route computation. Falls back to a plain Pickup/Dropoff pair
// when no route exists yet to derive an order from.
function buildRouteLegend(
  legs,
  pickupAddress,
  dropoffAddress,
  stops,
  stopCoords,
) {
  if (!legs) {
    return [
      {
        key: "pickup",
        badge: "P",
        badgeBg: "bg-sky-100",
        badgeText: "text-sky-700",
        address: pickupAddress,
      },
      {
        key: "dropoff",
        badge: "D",
        badgeBg: "bg-emerald-100",
        badgeText: "text-emerald-700",
        address: dropoffAddress,
      },
    ];
  }
  let stopNum = 1;
  return legs.map((leg) => {
    if (leg.to === "pickup") {
      return {
        key: "pickup",
        badge: "P",
        badgeBg: "bg-sky-100",
        badgeText: "text-sky-700",
        address: pickupAddress,
      };
    }
    if (leg.to === "dropoff") {
      return {
        key: "dropoff",
        badge: "D",
        badgeBg: "bg-emerald-100",
        badgeText: "text-emerald-700",
        address: dropoffAddress,
      };
    }
    stopNum += 1;
    const [endLat, endLng] = leg.path[leg.path.length - 1];
    let bestAddress = null;
    let bestDist = Infinity;
    for (const s of stops || []) {
      const c = parseCoords(s.location) || stopCoords[s.location];
      if (!c) continue;
      const d = (c.lat - endLat) ** 2 + (c.lng - endLng) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestAddress = s.location;
      }
    }
    return {
      key: `stop-${stopNum}`,
      badge: String(stopNum),
      badgeBg: "bg-amber-100",
      badgeText: "text-amber-700",
      address: bestAddress || `Stop ${stopNum}`,
    };
  });
}

// Rest-stop recommendation thresholds (12_REST_STOP_RECOMMENDATIONS.md,
// decided 2026-08-13): either crossing recommends a rest stop, whichever
// comes first, since Trip start -- Trip-start-only, one-shot, no reset.
const REST_STOP_DISTANCE_KM = 321.9; // 200 miles
const REST_STOP_HOURS = 2;

function formatAssignedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PH", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Shape the Edge Function payload into the shape the rest of this page
// renders (the same one the old mock data used to provide). A delivery may
// have no quotation yet (supervisor hasn't priced it), so quotation is null
// and every render site below guards on it.
// Pickup Time is a customer-selected window (start + end), e.g. "07:00 -
// 07:15" -- falls back to a single time for legacy rows with no window end.
function pickupWindowLabel(pickupTime, pickupTimeEnd) {
  return pickupTimeEnd ? `${pickupTime} - ${pickupTimeEnd}` : pickupTime;
}

function mapDelivery(d) {
  const str = (v) => (v == null ? "" : String(v));
  return {
    id: str(d.id),
    customerName: str(d.customerName) || "Customer",
    companyName: str(d.companyName),
    itemType: str(d.itemType),
    pickupDate: str(d.pickupDate),
    pickupTime: str(d.pickupTime),
    pickupTimeEnd: d.pickupTimeEnd ? str(d.pickupTimeEnd) : "",
    pickupAddress: str(d.pickupAddress),
    deliveryAddress: str(d.deliveryAddress),
    pickupLat: d.pickupLat,
    pickupLng: d.pickupLng,
    dropoffLat: d.dropoffLat,
    dropoffLng: d.dropoffLng,
    // Reference-only intermediate stops between pickup/dropoff, customer-entered
    // at booking time — feeds LiveNavigationMap's dropoff-leg waypoints only,
    // never delivery_requests.status (02B_MULTI_STOP_DELIVERIES.md).
    stops: Array.isArray(d.stops) ? d.stops : [],
    // Proof-photo state for the first two items in the chain (Pickup,
    // Dropoff) — read-only here, written by the Helper's completion actions
    // (02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md).
    pickupPhotoUrl: d.pickupPhotoUrl || null,
    dropoffPhotoUrl: d.dropoffPhotoUrl || null,
    dropoffCompletedAt: d.dropoffCompletedAt || null,
    // Frozen planned route (Pickup -> Dropoff -> Stops), if the pre-trip
    // screen already computed+saved it -- see PlannedRouteMap below and
    // 11_ROUTE_COMPARISON.md. Null until the first successful save.
    suggestedRoute: Array.isArray(d.suggestedRoute) ? d.suggestedRoute : null,
    status: DB_TO_DRIVER_STATUS[d.status] || str(d.status),
    hasOpenSession: Boolean(d.hasOpenSession),
    sessionId: d.sessionId || null,
    assignedAt: formatAssignedAt(d.assignedAt),
    quotation: d.quotation
      ? { amount: Number(d.quotation.amount), breakdown: null }
      : null,
    crew: {
      driver: d.driver
        ? {
            id: str(d.driver.id),
            name: str(d.driver.name),
            phone: str(d.driver.phone),
          }
        : { id: "", name: "You", phone: "" },
      helpers: d.helpers || [],
      truck: d.truck
        ? {
            plateNumber: str(d.truck.plateNumber),
            truckType: str(d.truck.truckType),
            capacity: str(d.truck.capacity || ""),
          }
        : { plateNumber: "—", truckType: "", capacity: "" },
    },
    pickupCoords:
      d.pickupLat != null && d.pickupLng != null
        ? { lat: d.pickupLat, lng: d.pickupLng }
        : parseCoords(d.pickupAddress),
    destinationCoords:
      d.dropoffLat != null && d.dropoffLng != null
        ? { lat: d.dropoffLat, lng: d.dropoffLng }
        : parseCoords(d.deliveryAddress),
  };
}

function toGoogleMapEmbed(coords) {
  if (!coords)
    return "https://maps.google.com/maps?q=14.5995,120.9842&z=12&output=embed";
  return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=15&output=embed`;
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status];
  if (!cfg) return null;
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cfg.badge}`}
    >
      {cfg.label}
    </span>
  );
}

function TodayBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      Today
    </span>
  );
}

// The driver's workflow, start to finish. "Delivered" is the last step the driver takes —
// any customer confirmation happens later and is a separate concern (see statusConfig above).
const DRIVER_STAGES = [
  { key: "ASSIGNED", label: "Assigned" },
  { key: "FOR_PICKUP", label: "Pickup" },
  { key: "OUT_FOR_DELIVERY", label: "Delivery" },
  { key: "DELIVERED", label: "Delivered" },
];

// Checkmark-and-connector tracker — the same pattern parcel-tracking apps use (order placed ✓ →
// shipped ✓ → out for delivery ● → delivered ○), so "where am I in this job" reads at a glance
// instead of needing an unexplained fraction.
function StageProgress({ status }) {
  const idx = DRIVER_STAGES.findIndex((stage) => stage.key === status);
  return (
    <div className="grid grid-cols-4">
      {DRIVER_STAGES.map((stage, i) => {
        const isDone = i < idx;
        const isCurrent = i === idx;
        return (
          <div key={stage.key} className="flex flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <div
                className={`h-0.5 flex-1 ${i === 0 ? "invisible" : i <= idx ? "bg-amber-900" : "bg-amber-100"}`}
              />
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  isDone
                    ? "bg-amber-900"
                    : isCurrent
                      ? "bg-amber-900 ring-2 ring-amber-200"
                      : "bg-amber-100"
                }`}
              >
                {isDone && (
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                )}
              </span>
              <div
                className={`h-0.5 flex-1 ${i === DRIVER_STAGES.length - 1 ? "invisible" : isDone ? "bg-amber-900" : "bg-amber-100"}`}
              />
            </div>
            <span
              className={`text-center text-[8px] font-semibold uppercase leading-tight ${
                isCurrent
                  ? "text-amber-900"
                  : isDone
                    ? "text-slate-400"
                    : "text-slate-300"
              }`}
            >
              {stage.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DeliveryRow({ delivery, showTime, todayISO, onSelect }) {
  // Resolves a "lat, lng"-shaped address (e.g. DR-0020-style fixture data)
  // into a real address for the list preview -- one DeliveryRow instance per
  // row already, so a single top-level hook call is safe here.
  const resolvedDeliveryAddress = useResolvedAddress(
    delivery.deliveryAddress || "",
  );
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(delivery)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(delivery)}
      className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-amber-200/70 bg-white p-3 transition hover:border-amber-300 hover:bg-amber-50/40 active:bg-amber-50"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusConfig[delivery.status]?.badge || "bg-slate-100 text-slate-700"}`}
          >
            {statusConfig[delivery.status]?.label || delivery.status}
          </span>
          <p className="truncate text-xs font-semibold text-slate-900">
            {delivery.id} &bull; {delivery.companyName}
          </p>
          {delivery.pickupDate === todayISO && <TodayBadge />}
        </div>
        <p className="truncate text-[11px] text-slate-600">
          {resolvedDeliveryAddress}
        </p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {delivery.crew.truck.plateNumber}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {delivery.pickupDate}
            {showTime
              ? ` • ${pickupWindowLabel(delivery.pickupTime, delivery.pickupTimeEnd)}`
              : ""}
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </div>
  );
}

// Proof-of-delivery photos for a completed chain (Pickup -> Dropoff ->
// Stops) — one small block per portal file rather than a shared component,
// matching this codebase's existing per-portal convention (see
// 02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md's "On a shared component" note).
// Only renders items that actually have a photo -- a delivery with stops
// still in progress has photos for the items completed so far only.
function ProofOfDeliverySection({ delivery }) {
  const items = [
    delivery.pickupPhotoUrl && {
      label: "Pickup",
      photoUrl: delivery.pickupPhotoUrl,
      completedAt: null,
    },
    delivery.dropoffPhotoUrl && {
      label: "Drop-off",
      photoUrl: delivery.dropoffPhotoUrl,
      completedAt: delivery.dropoffCompletedAt,
    },
    ...(delivery.stops || []).map(
      (stop, i) =>
        stop.completed &&
        stop.photoUrl && {
          label: `Dropoff ${i + 2}`,
          photoUrl: stop.photoUrl,
          completedAt: stop.completedAt,
        },
    ),
  ].filter(Boolean);

  return (
    <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
      <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900">
        <Camera className="h-4 w-4 text-amber-700" />
        Proof of Delivery
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No Proof of Delivery</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((item, i) => (
            <a
              key={i}
              href={item.photoUrl}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-lg border border-amber-200/70"
            >
              <img
                src={item.photoUrl}
                alt={`${item.label} proof of delivery`}
                className="h-20 w-full object-cover transition group-hover:opacity-90"
              />
              <div className="px-1.5 py-1">
                <p className="truncate text-[10px] font-semibold text-slate-900">
                  {item.label}
                </p>
                {item.completedAt && (
                  <p className="truncate text-[9px] text-slate-500">
                    {formatAssignedAt(item.completedAt)}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

// The Upcoming/Past "detail" screen — replaces the list in place (same tab) instead of a modal,
// since this is a lot of information to read inside a small overlay. Everything the old modal
// showed is still here, just laid out as page sections with a Back action instead of dialog chrome.
function DeliveryDetailView({
  delivery,
  onBack,
  isReportExpanded,
  onToggleReport,
  onSuggestedRouteSaved,
}) {
  const isArchived =
    delivery.status === "COMPLETED" || delivery.status === "DELIVERED";
  // Resolves a "lat, lng"-shaped address into a real address for the
  // Pickup/Drop-off Address block and Route Overview below -- one delivery
  // in view at a time, so top-level hook calls are safe here.
  const resolvedPickupAddress = useResolvedAddress(
    delivery.pickupAddress || "",
  );
  const resolvedDeliveryAddress = useResolvedAddress(
    delivery.deliveryAddress || "",
  );
  // Real Delivery Report data (2026-08-14), fetched per delivery from
  // sessions/alerts/gps_logs -- see buildRealDriverTripReport. Falls back to
  // the legacy COMPLETED_REPORT_DATA mock only for the handful of fake ids
  // that still use it; a real delivery with genuinely no sessions (e.g.
  // completed with no Trip ever started) gets neither, same "No detailed
  // report available" fallback CompletedDeliveryReport already had.
  const [realReport, setRealReport] = useState(null);
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!isArchived) {
        setRealReport(null);
        return;
      }
      const { data: sessionRows } = await supabase
        .from("sessions")
        .select(
          "session_id, start_time, end_time, total_alerts, session_duration",
        )
        .eq("delivery_request_id", delivery.id)
        .order("start_time", { ascending: true });
      if (!isMounted) return;
      const sessions = sessionRows || [];
      if (sessions.length === 0) {
        setRealReport(null);
        return;
      }
      const sessionIds = sessions.map((s) => s.session_id);
      const [{ data: alertRows }, { data: gpsRows }] = await Promise.all([
        supabase
          .from("alerts")
          .select("id, created_at, event_type, duration, session_id")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("gps_logs")
          .select("session_id, latitude, longitude, timestamp")
          .in("session_id", sessionIds)
          .order("timestamp", { ascending: true }),
      ]);
      if (!isMounted) return;
      setRealReport(
        buildRealDriverTripReport(
          delivery,
          sessions,
          alertRows || [],
          gpsRows || [],
        ),
      );
    }
    load();
    return () => {
      isMounted = false;
    };
    // Keyed on delivery.id specifically, same reasoning as every other
    // id-keyed effect in this file (e.g. the rest-stop accumulator) --
    // refetching on every parent re-render (a new delivery object
    // reference, same id) would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery.id, isArchived]);
  const report =
    realReport || (isArchived ? COMPLETED_REPORT_DATA[delivery.id] : null);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1 rounded-lg border border-amber-200/70 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-900">
            {delivery.id} &bull; {delivery.companyName}
          </h2>
          <p className="truncate text-xs text-slate-600">
            {delivery.customerName}
          </p>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {/* Delivery Overview */}
          <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
            <h3 className="text-xs font-bold text-slate-900">
              Delivery Overview
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] text-slate-500">Customer</p>
                <p className="font-medium text-slate-900">
                  {delivery.customerName}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Company</p>
                <p className="font-medium text-slate-900">
                  {delivery.companyName}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Product Type</p>
                <p className="font-medium text-slate-900">
                  {delivery.itemType}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Schedule</p>
                <p className="font-medium text-slate-900">
                  {delivery.pickupDate} at{" "}
                  {pickupWindowLabel(
                    delivery.pickupTime,
                    delivery.pickupTimeEnd,
                  )}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2.5 border-t border-amber-100 pt-3 text-xs">
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500">Pickup Address</p>
                  <p className="font-medium text-slate-900">
                    {resolvedPickupAddress}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500">Drop-off Address</p>
                  <p className="font-medium text-slate-900">
                    {resolvedDeliveryAddress}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Proof of Delivery — ProofOfDeliverySection self-gates on
              whichever chain items actually have a photo, so a Trip still
              in progress shows just what's been captured so far rather than
              waiting for isArchived (DELIVERED/COMPLETED). */}
          <ProofOfDeliverySection delivery={delivery} />

          {/* Delivery Fee — always visible */}
          {delivery.quotation && (
            <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-900">Delivery Fee</h3>
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-xs font-medium text-emerald-800">
                    PHP {Number(delivery.quotation.amount).toLocaleString()}
                  </p>
                </div>
                {delivery.quotation.breakdown?.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Breakdown
                    </p>
                    {delivery.quotation.breakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-slate-600">{item.label}</span>
                        <span className="font-medium text-slate-800">
                          ₱{Number(item.amount).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-amber-300 pt-1.5 text-xs font-bold">
                      <span className="text-slate-800">Total</span>
                      <span className="text-slate-800">
                        ₱{Number(delivery.quotation.amount).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* Crew & Truck */}
          <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
            <h3 className="text-xs font-bold text-slate-900">
              Crew &amp; Truck
            </h3>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-3 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-900 text-xs font-semibold text-white">
                  {delivery.crew.driver.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {delivery.crew.driver.name}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {delivery.crew.driver.phone}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Driver
                </span>
              </div>

              {delivery.crew.helpers?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Helpers ({delivery.crew.helpers.length})
                  </p>
                  <div className="space-y-1.5">
                    {delivery.crew.helpers.map((helper) => (
                      <div
                        key={helper.id}
                        className="flex items-center gap-2.5 rounded-lg border border-amber-200/70 bg-white p-2"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800">
                          {helper.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <p className="truncate text-xs font-medium text-slate-900">
                          {helper.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-amber-200/70 bg-white p-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Truck
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-900">
                    {delivery.crew.truck.plateNumber}
                  </span>
                  <span className="truncate text-slate-500">
                    &bull; {delivery.crew.truck.truckType} &bull;{" "}
                    {delivery.crew.truck.capacity}
                  </span>
                </div>
              </div>

              {delivery.assignedAt && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  Assigned: {delivery.assignedAt}
                </div>
              )}
            </div>
          </section>

          {/* Delivery Report — only for archived deliveries */}
          {isArchived && (
            <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
              <button
                onClick={onToggleReport}
                className="flex w-full items-center justify-between"
              >
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <ClipboardList className="h-4 w-4 text-amber-700" />
                  Delivery Report
                </h3>
                {isReportExpanded ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>
              <p className="mt-1 text-[11px] text-slate-500">
                Trip summary, driver behavior, and route analysis.
              </p>
              {isReportExpanded && (
                <div className="mt-3">
                  <CompletedDeliveryReport
                    report={report}
                    delivery={delivery}
                  />
                </div>
              )}
            </section>
          )}

          {/* Route Overview — for deliveries still in progress. Whole-trip
              guide (Pickup -> Dropoff -> Stops in one map), same
              PlannedRouteMap used on the active delivery's own workspace
              view -- was a static single-point embed here (no route line at
              all), same gap that view had before its own fix. PlannedRouteMap
              already renders its own titled section (matching the active
              view's layout exactly), so it isn't nested inside a second
              "Route Overview"-titled wrapper here -- that would just double
              up the header/border. */}
          {!isArchived && (
            <PlannedRouteMap
              pickupAddress={delivery.pickupAddress}
              dropoffAddress={delivery.deliveryAddress}
              pickupCoordsProp={delivery.pickupCoords}
              dropoffCoordsProp={delivery.destinationCoords}
              stops={delivery.stops}
              suggestedRoute={delivery.suggestedRoute}
              deliveryRequestId={delivery.id}
              onSaved={onSuggestedRouteSaved}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Live, in-trip drowsiness monitoring for the active delivery — shown only
// while the driver is actually driving (heading to pickup or out for
// delivery), not while merely assigned. This is the "right now" counterpart
// to the post-trip Behavior tab inside CompletedDeliveryReport: same alert
// taxonomy and risk thresholds (ALERT_TYPE_LABELS/getRiskLevel), but framed
// around "how am I doing on this trip so far" instead of a finished report.
function LiveMonitoringCard({ alerts, isExpanded, onToggleExpanded }) {
  const alertCount = alerts.length;
  const risk = getRiskLevel(alertCount);
  const lastAlert = alerts[0] || null;
  const hasElevatedRisk = risk.tone !== "emerald";

  return (
    <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <EyeOff className="h-4 w-4 shrink-0 text-amber-700" />
          Drowsiness Monitoring
        </h3>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-2">
        <div>
          <p className="text-[10px] text-slate-500">Alerts this trip</p>
          <p className="text-sm font-bold text-slate-900">{alertCount}</p>
        </div>
        <RiskBadge tone={risk.tone} label={risk.label} />
      </div>

      {lastAlert ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-[11px]">
          {(() => {
            const LastAlertIcon = ALERT_TYPE_ICONS[lastAlert.type] || EyeOff;
            return (
              <LastAlertIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            );
          })()}
          <span className="min-w-0 flex-1 truncate text-slate-700">
            Last alert: {ALERT_TYPE_LABELS[lastAlert.type] || lastAlert.type}
          </span>
          <span className="shrink-0 text-[10px] text-slate-400">
            {formatTimeOnly(lastAlert.time)}
          </span>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">
          No drowsiness alerts detected yet this trip.
        </p>
      )}

      {hasElevatedRisk && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          Multiple alerts detected recently — consider pulling over for a short
          rest.
        </div>
      )}

      {alertCount > 0 && (
        <button
          onClick={onToggleExpanded}
          className="mt-2 flex w-full items-center justify-between rounded-lg py-1 text-[11px] font-semibold text-amber-800"
        >
          {isExpanded ? "Hide" : "View"} alert history ({alertCount})
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {isExpanded && alertCount > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {alerts.map((alert) => {
            const Icon = ALERT_TYPE_ICONS[alert.type] || EyeOff;
            return (
              <div
                key={alert.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-[11px]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {ALERT_TYPE_LABELS[alert.type] || alert.type}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {formatAlertDuration(alert.duration)}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {formatTimeOnly(alert.time)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const DELIVERY_TABS = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
];

function TabButton({ label, count, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border-b-2 py-2 text-xs font-semibold transition ${
        isActive
          ? "border-amber-900 text-amber-900"
          : "border-transparent text-slate-400 hover:text-slate-600"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="ml-1 text-[10px] font-normal opacity-60">{count}</span>
      )}
    </button>
  );
}

function DriverDeliveries() {
  const [data, setData] = useState({
    active: null,
    upcoming: [],
    completed: [],
  });
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(true);
  const [deliveriesError, setDeliveriesError] = useState("");
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [search, setSearch] = useState("");
  const [expandedReport, setExpandedReport] = useState(null);
  const [activeTab, setActiveTab] = useState("today");
  const [confirmingStageAdvance, setConfirmingStageAdvance] = useState(false);
  const [confirmingPause, setConfirmingPause] = useState(false);
  const [confirmingResume, setConfirmingResume] = useState(false);
  const [toast, setToast] = useState(null);
  // Shared across every confirm-modal action below since only one can ever be
  // open at a time — see the "Loading States" convention in DESIGNS.md for
  // why every future confirm-modal button should follow this same pattern.
  const [isSubmittingTripAction, setIsSubmittingTripAction] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [isAlertHistoryExpanded, setIsAlertHistoryExpanded] = useState(false);
  const [completionNotice, setCompletionNotice] = useState(null);
  // Live nav position, sourced from the Pi's gps_logs uploads -- see the
  // Realtime subscription below. null until the first reading arrives.
  const [livePosition, setLivePosition] = useState(null);
  // Rest-stop recommendation (12_REST_STOP_RECOMMENDATIONS.md): ephemeral,
  // client-side only, Trip-start-only, one-shot -- never persisted, never
  // resets once shown, ordinary dismiss just clears the banner. Refs (not
  // state) hold the running totals since they don't need to re-render on
  // every GPS tick, only when the threshold is actually crossed.
  const [restStopRecommended, setRestStopRecommended] = useState(false);
  const [restStopDismissed, setRestStopDismissed] = useState(false);
  const priorSessionsHoursRef = useRef(0);
  const priorSessionsKmRef = useRef(0);
  const currentSessionStartRef = useRef(null);
  const currentSessionKmRef = useRef(0);
  const lastDistanceCheckPositionRef = useRef(null);
  const restStopTripIdRef = useRef(null);
  // Phone-only page-scroll slider (a real scrollbar-style thumb, not just an
  // invisible swipe pad -- see the effect and handlers further down, near
  // isDrivingStage, for how its position is tracked/dragged): thumb size and
  // offset within the track, in pixels, kept in sync with
  // #driver-scroll-container's actual scroll position.
  const scrollTrackRef = useRef(null);
  const [scrollThumb, setScrollThumb] = useState({ height: 40, top: 0 });
  const scrollDragRef = useRef(null);
  const usualAlertAudioRef = useRef(null);
  const multipleAlertAudioRef = useRef(null);
  // Mirrors liveAlerts so the Realtime handler below can read the current
  // alert history synchronously (setLiveAlerts' updater runs later, during
  // React's next render, so it can't be read back same-tick).
  const liveAlertsRef = useRef([]);
  useEffect(() => {
    liveAlertsRef.current = liveAlerts;
  }, [liveAlerts]);

  const active = data.active;
  // Resolves a "lat, lng"-shaped pickup/dropoff (e.g. DR-0020's fixture data)
  // into a human-readable address for the status/Summary card -- a no-op for
  // deliveries that already store a real street address.
  const resolvedPickupAddress = useResolvedAddress(active?.pickupAddress || "");
  const resolvedDeliveryAddress = useResolvedAddress(
    active?.deliveryAddress || "",
  );
  // Stop coordinates for the Summary card's ordered legend below (see
  // statusCardLegend) -- same Photon-based resolution PlannedRouteMap uses
  // for its own route computation, needed here too so a 'stop' leg's
  // endpoint can be matched back to its address.
  const activeStopLocations = (active?.stops || []).map((s) => s.location);
  const { coordsByLocation: activeStopCoords } =
    useResolvedStopCoords(activeStopLocations);
  // Full ordered legend for the Summary card -- Pickup, then every
  // Dropoff/Stop in the same nearest-first order Planned Route/Live
  // Navigation actually visit them, not just a fixed Pickup/Dropoff pair.
  const statusCardLegend = active
    ? buildRouteLegend(
        active.suggestedRoute,
        resolvedPickupAddress,
        resolvedDeliveryAddress,
        active.stops,
        activeStopCoords,
      )
    : [];

  // Before pickup, the relevant leg is "get to the pickup point"; after pickup, it's "get to drop-off."
  const activeNeedsPickup = active
    ? active.status === "ASSIGNED" || active.status === "FOR_PICKUP"
    : true;
  // Reconciled 2026-08-14 with WAREHOUSE_COORDS (PlannedRouteMap's own
  // warehouse-origin constant) -- previously a second, different hardcoded
  // guess at the same real depot location.
  const activeNavOrigin = active
    ? activeNeedsPickup
      ? WAREHOUSE_COORDS
      : active.pickupCoords
    : null;

  // Greedy nearest-neighbor dropoff ordering (decided 2026-08-14, see
  // 02B_MULTI_STOP_DELIVERIES.md's "Dynamic Nearest-Dropoff Ordering") --
  // completion order/permission is unchanged (the Helper can still complete
  // Dropoff or any Stop in any order, enforced nowhere client-side, see
  // admin-users/index.ts), but the DRIVER is now routed to whichever
  // still-incomplete dropoff (dropoff_location or a stop) is nearest to the
  // current position, not whichever is next in the customer-entered list.
  // Recomputed on every render off livePosition/activeNavOrigin -- since the
  // candidate list only changes when a completion actually lands (via the
  // Realtime subscription updating active.stops/active.dropoffCompletedAt),
  // this naturally re-evaluates once per completion rather than continuously
  // reordering mid-drive.
  const remainingDropoffCandidates =
    active && !activeNeedsPickup
      ? [
          ...(active.dropoffCompletedAt
            ? []
            : [
                {
                  location: active.deliveryAddress,
                  coords: active.destinationCoords,
                  key: "dropoff",
                },
              ]),
          ...(active.stops || [])
            .filter((s) => !s.completed)
            .map((s) => ({
              location: s.location,
              coords: parseCoords(s.location),
              key: "stop",
            })),
        ]
      : [];
  const orderedRemainingDropoffs =
    remainingDropoffCandidates.length > 0
      ? nearestDropoffOrder(
          livePosition || activeNavOrigin,
          remainingDropoffCandidates,
        )
      : [];
  // Whether the real dropoff is the LAST item left in the nearest-ordered
  // chain (as opposed to merely the current/nearest one) -- Dynamic
  // Nearest-Dropoff Ordering can legitimately route the driver to the real
  // dropoff before a stop, but LiveNavigationMap's flag icon means "this is
  // the actual end of the trip," which would be misleading if a stop still
  // follows. Only true once dropoff is both incomplete and the farthest
  // remaining item in the walk.
  const isDropoffFinal =
    orderedRemainingDropoffs.length > 0 &&
    orderedRemainingDropoffs[orderedRemainingDropoffs.length - 1]?.key ===
      "dropoff";

  const statusCfg = active ? statusConfig[active.status] : null;
  const todayISO = localTodayISO();
  // "active" already prioritizes an open Session over pickupDate === today
  // (see the loadDeliveries fix below) — the workspace tab must show it
  // regardless of pickupDate, or a stale-dated open Session's Pause/End
  // Trip controls become unreachable again, same bug in a different spot.
  const hasActiveDelivery = Boolean(active);
  const todayCount = hasActiveDelivery ? 1 : 0;
  const upcomingCount = data.upcoming.length;
  const pastCount = data.completed.length;

  // The nav map's target/waypoints follow the same nearest-first order --
  // route to the nearest remaining dropoff, with the rest (also nearest-
  // first from that point) threaded in as waypoints after it.
  let activeNavTarget = null;
  let activeNavStops = [];
  if (active) {
    if (activeNeedsPickup) {
      activeNavTarget = active.pickupCoords;
    } else if (orderedRemainingDropoffs.length > 0) {
      activeNavTarget =
        orderedRemainingDropoffs[0].coords || active.destinationCoords;
      activeNavStops = orderedRemainingDropoffs.slice(1);
    } else {
      activeNavTarget = active.destinationCoords;
    }
  }

  // Monitoring runs for the whole time the vehicle is being driven — both the
  // pickup leg and the delivery leg — matching how the post-trip Behavior
  // report treats it as a single session spanning the entire trip. A driver
  // past ASSIGNED with no open Session is Paused, not "not yet started" —
  // see 03B_PAUSE_AND_RESUME_TRIP.md's "Paused isn't a stored value" note.
  const isDrivingStage =
    Boolean(active) &&
    (active.status === "FOR_PICKUP" || active.status === "OUT_FOR_DELIVERY");
  const isMonitoring = isDrivingStage && active.hasOpenSession;
  const isPausedTrip = isDrivingStage && !active.hasOpenSession;

  // Keeps the page-scroll slider's thumb in sync with #driver-scroll-
  // container's real scroll position/size (DriverLayout.jsx's actual
  // scrollable content div -- the outer shell is h-dvh/overflow-hidden, so
  // window/document itself never scrolls). Recomputes on every scroll event
  // (from any scroll source, not just this thumb's own drag) and on resize,
  // so the thumb visibly tracks reality instead of a fixed/dead-looking
  // control. Exists because LiveNavigationMap's GoogleMap uses
  // gestureHandling: 'greedy', which otherwise swallows a scroll swipe
  // landing on the map.
  useEffect(() => {
    if (!isDrivingStage) return undefined;
    const container = document.getElementById("driver-scroll-container");
    const track = scrollTrackRef.current;
    if (!container || !track) return undefined;
    const updateThumb = () => {
      const trackHeight = track.clientHeight;
      const scrollableHeight = container.scrollHeight - container.clientHeight;
      const visibleRatio = container.clientHeight / container.scrollHeight;
      const thumbHeight = Math.min(
        trackHeight,
        Math.max(32, trackHeight * visibleRatio),
      );
      const scrollRatio =
        scrollableHeight > 0 ? container.scrollTop / scrollableHeight : 0;
      setScrollThumb({
        height: thumbHeight,
        top: scrollRatio * (trackHeight - thumbHeight),
      });
    };
    updateThumb();
    container.addEventListener("scroll", updateThumb);
    window.addEventListener("resize", updateThumb);
    return () => {
      container.removeEventListener("scroll", updateThumb);
      window.removeEventListener("resize", updateThumb);
    };
  }, [isDrivingStage]);

  // Dragging the thumb itself (Pointer Events, not Touch Events -- covers a
  // real phone's touchscreen AND a mouse-drag test in a resized desktop
  // browser the same way; touch-only handlers would silently do nothing for
  // a mouse drag) maps the drag distance to a proportional scroll distance,
  // same ratio a native scrollbar thumb uses.
  const handleScrollThumbPointerDown = (e) => {
    const container = document.getElementById("driver-scroll-container");
    const track = scrollTrackRef.current;
    if (!container || !track) return;
    scrollDragRef.current = {
      startY: e.clientY,
      startScrollTop: container.scrollTop,
      trackHeight: track.clientHeight,
      thumbHeight: scrollThumb.height,
      scrollableHeight: container.scrollHeight - container.clientHeight,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleScrollThumbPointerMove = (e) => {
    const drag = scrollDragRef.current;
    if (!drag) return;
    const container = document.getElementById("driver-scroll-container");
    if (!container) return;
    const trackRange = drag.trackHeight - drag.thumbHeight;
    const scrollDelta =
      trackRange > 0
        ? ((e.clientY - drag.startY) / trackRange) * drag.scrollableHeight
        : 0;
    container.scrollTop = Math.min(
      Math.max(drag.startScrollTop + scrollDelta, 0),
      drag.scrollableHeight,
    );
  };
  const handleScrollThumbPointerEnd = () => {
    scrollDragRef.current = null;
  };

  // Fallback unlock: the Start Trip button unlocks audio for the tab it was
  // pressed in, but a page reload mid-trip (or opening the trip in a new tab
  // while it's already Active) mounts fresh <audio> elements that were never
  // unlocked, and the browser then silently blocks the first real alert.
  // Unlocking on the very next tap/click while monitoring closes that gap.
  useEffect(() => {
    if (!isMonitoring) return undefined;
    const unlock = () => {
      unlockAlertAudio(usualAlertAudioRef.current);
      unlockAlertAudio(multipleAlertAudioRef.current);
      // Also primes speechSynthesis for LiveNavigationMap's turn-by-turn
      // announcements, same reasoning as the audio unlock above -- it fires
      // from a Realtime event, not a direct click, so needs priming here.
      if (typeof window.speechSynthesis !== "undefined") {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      }
      document.removeEventListener("pointerdown", unlock);
    };
    document.addEventListener("pointerdown", unlock);
    return () => document.removeEventListener("pointerdown", unlock);
  }, [isMonitoring]);

  // Tracks the active delivery's id across calls so a refresh (below) can
  // detect "the trip I was watching just finished" — needed now that the
  // Helper, not this page, is what actually completes the delivery chain
  // (Confirm Pickup, dropoff, every stop — 02B_MULTI_STOP_DELIVERIES.md), so
  // this page has no local call site for that moment anymore.
  const prevActiveIdRef = useRef(null);

  // Extracted so both the initial load and the Realtime subscription below
  // can share it — same pattern HelperDeliveries.jsx's loadDeliveries uses.
  const loadDeliveries = useCallback(async () => {
    setIsLoadingDeliveries(true);
    setDeliveriesError("");
    const { data: result, error } = await supabase.functions.invoke(
      "admin-users",
      {
        body: { action: "get-driver-deliveries" },
      },
    );
    if (error) {
      setDeliveriesError("Failed to load your deliveries. Please try again.");
      setData({ active: null, upcoming: [], completed: [] });
      setIsLoadingDeliveries(false);
      return;
    }
    const mapped = (result?.deliveries || []).map(mapDelivery);
    const today = localTodayISO();
    const nonArchived = mapped
      // CANCELLED excluded alongside DELIVERED/COMPLETED -- without this, a
      // same-day cancelled delivery can still be picked as "today's active
      // delivery" below (hasOpenSession or pickupDate === today), and
      // DB_TO_DRIVER_STATUS has no CANCELLED entry, so statusConfig[status]
      // resolves to undefined and statusCfg.banner crashes the whole page.
      .filter(
        (d) =>
          d.status !== "DELIVERED" &&
          d.status !== "COMPLETED" &&
          d.status !== "CANCELLED",
      )
      .sort((a, b) =>
        String(a.pickupDate || "").localeCompare(String(b.pickupDate || "")),
      );
    // A delivery with a genuinely open Session takes priority over "today's"
    // delivery — a stale open Session on a different pickup_date must still
    // surface as Active so its Pause/End Trip controls stay reachable. See
    // STATUS.md's 2026-08-11 incident (driver D002/DR-0015 stuck ~64h).
    const activeDelivery =
      nonArchived.find((d) => d.hasOpenSession) ||
      nonArchived.find((d) => d.pickupDate === today) ||
      null;

    const justCompleted = mapped.find(
      (d) =>
        d.id === prevActiveIdRef.current &&
        (d.status === "DELIVERED" || d.status === "COMPLETED"),
    );
    if (justCompleted) {
      setCompletionNotice({
        id: justCompleted.id,
        customerName: justCompleted.customerName,
      });
      setLiveAlerts([]);
      setIsAlertHistoryExpanded(false);
    }
    prevActiveIdRef.current = activeDelivery?.id || null;

    setData({
      active: activeDelivery,
      upcoming: nonArchived.filter(
        (d) => d.id !== (activeDelivery && activeDelivery.id),
      ),
      completed: mapped.filter(
        (d) => d.status === "DELIVERED" || d.status === "COMPLETED",
      ),
    });
    setIsLoadingDeliveries(false);
  }, []);

  useEffect(() => {
    // Initial fetch on mount, same shape as every other data-load effect in
    // this file -- not a derived-state anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDeliveries();
  }, [loadDeliveries]);

  // Live pickup: the Helper now completes Confirm Pickup/dropoff/every stop
  // in a different portal/session, so this page needs a Realtime nudge to
  // notice — any change to delivery_requests refreshes, same pattern
  // HelperDeliveries.jsx already uses for its own subscription.
  useEffect(() => {
    const channel = supabase
      .channel("driver-delivery-requests-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_requests" },
        () => {
          loadDeliveries();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDeliveries]);

  useEffect(() => {
    if (!completionNotice) return undefined;
    const timer = setTimeout(() => setCompletionNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [completionNotice]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Real-time drowsiness alerts (06_DROWSINESS_ALERT_PIPELINE.md): the Pi
  // uploads to the `alerts` table via the alert-upload Edge Function as soon
  // as a detection threshold is reached; this subscribes to new rows for the
  // active session and plays the audio alert alongside the Pi's own vibration
  // motor. Only subscribes while actually monitoring (Active session).
  useEffect(() => {
    if (!isMonitoring || !active?.sessionId) return undefined;
    let cancelled = false;

    // Seed with whatever's already in the table for this Trip — liveAlerts is
    // otherwise pure client state, so a page reload/remount mid-trip would
    // otherwise silently show 0 alerts even though the real ones are safely
    // in the database. Card says "Alerts this trip," so this seeds from every
    // Session of the Trip (delivery_request_id), not just the current one --
    // a Pause/Resume closes the old Session and opens a new one, and without
    // this a driver who paused/resumed would lose visibility into alerts
    // from before the pause the moment they reload. The live Realtime
    // subscription below stays scoped to the current session's id, which is
    // correct on its own -- new alerts only ever land against whichever
    // session is currently Active.
    async function loadExistingAlerts() {
      const { data: sessionRows, error: sessionsError } = await supabase
        .from("sessions")
        .select("session_id")
        .eq("delivery_request_id", active.id);
      if (cancelled || sessionsError || !sessionRows?.length) return;
      const { data, error } = await supabase
        .from("alerts")
        .select("id, event_type, duration, created_at")
        .in(
          "session_id",
          sessionRows.map((s) => s.session_id),
        )
        .order("created_at", { ascending: false });
      if (cancelled || error || !data) return;
      setLiveAlerts((prev) => {
        const seenIds = new Set(prev.map((a) => a.id));
        const fetched = data
          .filter((row) => !seenIds.has(String(row.id)))
          .map((row) => ({
            id: String(row.id),
            type: row.event_type,
            duration: row.duration,
            time: row.created_at,
          }));
        return [...prev, ...fetched].sort(
          (a, b) => new Date(b.time) - new Date(a.time),
        );
      });
    }
    loadExistingAlerts();

    const channel = supabase
      .channel(`alerts-session-${active.sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alerts",
          filter: `session_id=eq.${active.sessionId}`,
        },
        (payload) => {
          const row = payload.new;
          const newAlert = {
            id: String(row.id),
            type: row.event_type,
            duration: row.duration,
            time: row.created_at,
          };
          // No audio for face_not_detected -- the Pi's own vibration motor
          // already gives physical feedback for this case, and it fires
          // easily (e.g. glancing at mirrors/dashboard), unlike the other
          // three alert types which are all genuine drowsiness signals.
          if (newAlert.type !== "face_not_detected") {
            const windowStart =
              new Date(newAlert.time).getTime() - ALERT_CLUSTER_WINDOW_MS;
            const alertsInWindow =
              liveAlertsRef.current.filter(
                (a) => new Date(a.time).getTime() >= windowStart,
              ).length + 1;
            playAlertClip(
              alertsInWindow >= ALERT_CLUSTER_THRESHOLD
                ? multipleAlertAudioRef.current
                : usualAlertAudioRef.current,
            );
          }
          setLiveAlerts((prev) => [newAlert, ...prev]);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isMonitoring, active?.sessionId, active?.id]);

  // Rest-stop recommendation setup (12_REST_STOP_RECOMMENDATIONS.md): once
  // per Trip (active.id), not per Session -- resets the one-shot banner and
  // the running totals only when the driver actually switches to a
  // different delivery, never on Pause/Resume within the same one. Sums
  // each already-closed Session's own session_duration (hours) and its own
  // gps_logs' point-to-point distance (km) -- deliberately per-session, not
  // one continuous sum across session boundaries, matching the existing
  // per-Session mileage precedent (03B_PAUSE_AND_RESUME_TRIP.md/
  // 07_END_TRIP.md) rather than treating a Pause gap as driven distance.
  // Defined ahead of the GPS position effect below, which calls
  // checkRestStopThreshold() on every tick -- react-hooks/immutability
  // (correctly) flags referencing a later-declared const from an earlier
  // effect, since that effect's closure would otherwise never see updates.
  useEffect(() => {
    if (!active?.id) return undefined;
    if (restStopTripIdRef.current !== active.id) {
      restStopTripIdRef.current = active.id;
      setRestStopRecommended(false);
      setRestStopDismissed(false);
      priorSessionsHoursRef.current = 0;
      priorSessionsKmRef.current = 0;
    }
    let cancelled = false;
    async function loadPriorSessionTotals() {
      const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select("session_id, session_duration")
        .eq("delivery_request_id", active.id)
        .eq("status", "Completed");
      if (cancelled || sessionsError || !sessions?.length) return;
      const hours = sessions.reduce(
        (sum, s) => sum + (s.session_duration || 0) / 3600,
        0,
      );
      const sessionIds = sessions.map((s) => s.session_id);
      const { data: rows, error: rowsError } = await supabase
        .from("gps_logs")
        .select("session_id, latitude, longitude, timestamp")
        .in("session_id", sessionIds)
        .order("session_id", { ascending: true })
        .order("timestamp", { ascending: true });
      if (cancelled) return;
      let km = 0;
      if (!rowsError && rows?.length) {
        let prevSessionId = null;
        let prev = null;
        for (const row of rows) {
          if (row.session_id !== prevSessionId) {
            prevSessionId = row.session_id;
            prev = row;
            continue;
          }
          km +=
            distanceMeters(
              prev.latitude,
              prev.longitude,
              row.latitude,
              row.longitude,
            ) / 1000;
          prev = row;
        }
      }
      priorSessionsHoursRef.current = hours;
      priorSessionsKmRef.current = km;
    }
    loadPriorSessionTotals();
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  // Current Session's own start time (for the elapsed-hours half of the
  // threshold) -- fetched fresh per Session rather than trusting a value
  // passed down from get-driver-deliveries, since that action's shape isn't
  // guaranteed to carry it. Resets the current-session distance accumulator
  // for the new Session too.
  useEffect(() => {
    if (!isMonitoring || !active?.sessionId) return undefined;
    currentSessionStartRef.current = null;
    currentSessionKmRef.current = 0;
    lastDistanceCheckPositionRef.current = null;
    let cancelled = false;
    supabase
      .from("sessions")
      .select("start_time")
      .eq("session_id", active.sessionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data?.start_time) return;
        currentSessionStartRef.current = new Date(data.start_time).getTime();
      });
    return () => {
      cancelled = true;
    };
  }, [isMonitoring, active?.sessionId]);

  // One-shot threshold check (12_REST_STOP_RECOMMENDATIONS.md): either 200
  // miles or 2 continuous driving hours since Trip start, whichever first,
  // summed across all of this Trip's Sessions. Never re-fires once shown,
  // never resets on its own -- only a new Trip (the effect above) clears it.
  const checkRestStopThreshold = () => {
    if (restStopRecommended || !currentSessionStartRef.current) return;
    const currentHours =
      (Date.now() - currentSessionStartRef.current) / 3_600_000;
    const totalHours = priorSessionsHoursRef.current + currentHours;
    const totalKm = priorSessionsKmRef.current + currentSessionKmRef.current;
    if (totalHours >= REST_STOP_HOURS || totalKm >= REST_STOP_DISTANCE_KM) {
      setRestStopRecommended(true);
    }
  };

  // Backup timer purely for the time threshold -- the GPS-tick-driven check
  // below only fires when a new position actually lands, so a driver with a
  // GPS dropout (09_EDGE_CASES.md's "GPS unavailable" -- heartbeat/Trip keep
  // going regardless) could otherwise sit past 2 hours with no new tick to
  // trigger the check. 60s is frequent enough for a 2-hour threshold without
  // being wasteful.
  useEffect(() => {
    if (!isMonitoring) return undefined;
    const interval = setInterval(checkRestStopThreshold, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMonitoring]);

  // Live nav position (05_GPS_PIPELINE.md): the Pi uploads to gps_logs via
  // the gps-upload Edge Function roughly once per second while its Session
  // is Active. Same shape as the alerts subscription above -- seed-fetch the
  // latest reading, then subscribe for new ones. Gated on isMonitoring (not
  // just isDrivingStage): when Paused, this tears down and livePosition
  // simply stops updating, freezing LiveNavigationMap's marker/route in
  // place rather than tracking a closed session (gps_logs rows uploaded
  // during a Pause carry a different, since-closed session_id and won't
  // match this filter anyway).
  useEffect(() => {
    if (!isMonitoring || !active?.sessionId) return undefined;
    let cancelled = false;

    async function loadLatestPosition() {
      const { data, error } = await supabase
        .from("gps_logs")
        .select("latitude, longitude, created_at")
        .eq("session_id", active.sessionId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled || error || !data?.length) return;
      setLivePosition({ lat: data[0].latitude, lng: data[0].longitude });
      // Seeds the distance accumulator's reference point on mount/reload,
      // without counting a "distance" against a point that arrived before
      // this mount -- only a genuinely new tick (below) adds distance.
      lastDistanceCheckPositionRef.current = {
        lat: data[0].latitude,
        lng: data[0].longitude,
      };
      checkRestStopThreshold();
    }
    loadLatestPosition();

    const channel = supabase
      .channel(`gps-session-${active.sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gps_logs",
          filter: `session_id=eq.${active.sessionId}`,
        },
        (payload) => {
          const next = {
            lat: payload.new.latitude,
            lng: payload.new.longitude,
          };
          setLivePosition(next);
          // Rest-stop distance accumulation (12_REST_STOP_RECOMMENDATIONS.md):
          // running total for the CURRENT session only -- prior Sessions'
          // totals are summed once, separately, above.
          if (lastDistanceCheckPositionRef.current) {
            currentSessionKmRef.current +=
              distanceMeters(
                lastDistanceCheckPositionRef.current.lat,
                lastDistanceCheckPositionRef.current.lng,
                next.lat,
                next.lng,
              ) / 1000;
          }
          lastDistanceCheckPositionRef.current = next;
          checkRestStopThreshold();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // checkRestStopThreshold deliberately omitted -- a plain function
    // redefined every render, not memoized; including it would force this
    // effect to tear down/resubscribe the Realtime channel every render
    // instead of only when the Session actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMonitoring, active?.sessionId]);

  // Runs a confirm-modal action while it's in flight: blocks re-entry (a second
  // tap while the first request is still pending is a no-op instead of firing
  // a duplicate call), then always closes the modal and clears the loading
  // state whether the action succeeded or the alert()-based error path fired.
  const runTripAction = async (action, closeModal) => {
    if (isSubmittingTripAction) return;
    setIsSubmittingTripAction(true);
    try {
      await action();
    } finally {
      setIsSubmittingTripAction(false);
      closeModal();
    }
  };

  // Only ever reachable for ASSIGNED -> FOR_PICKUP (Start Pickup) now —
  // Confirm Pickup and Complete Delivery moved to the Helper (2026-08-12,
  // 02B_MULTI_STOP_DELIVERIES.md), so statusCfg.nextStage is null for every
  // other status and no button renders to call this. Kept as advanceStage
  // rather than renaming to startPickup since the confirm-modal plumbing
  // below (runTripAction, confirmingStageAdvance) is still generic.
  const advanceStage = async () => {
    if (!active || !statusCfg || !statusCfg.nextStage) return;
    const nextDbStatus = DRIVER_STATUS_TO_DB[statusCfg.nextStage];

    // Driving -- and therefore monitoring -- starts now. Called BEFORE the
    // status update below (reordered 2026-08-12, see 09_EDGE_CASES.md gap
    // notes): calling start-trip first, while delivery_requests.status is
    // still ASSIGNED (start-trip accepts ASSIGNED or OUT_FOR_PICKUP), means
    // a guardrail rejection (e.g. "you already have a paused trip in
    // progress") never leaves the delivery stuck showing an advanced
    // status with no Session behind it -- status is only ever advanced
    // once a Session genuinely exists.
    const { data: tripData, error: tripError } =
      await supabase.functions.invoke("driver-trip", {
        body: { action: "start-trip", deliveryRequestId: active.id },
      });
    if (tripError) {
      // Surface the Edge Function's actual rejection reason (e.g. "you
      // already have a paused trip in progress") instead of a generic
      // message -- a driver blocked by a real guardrail needs to know
      // *why*, since "please try again" would just fail the same way
      // again. tripError is a FunctionsHttpError whose .context is the raw
      // Response; falls back to the generic message if that shape ever
      // changes or the body isn't the expected { error } JSON.
      const serverMessage = await tripError.context
        ?.json?.()
        .then((b) => b?.error)
        .catch(() => null);
      setToast({
        message: serverMessage || "Failed to start the trip. Please try again.",
        type: "error",
      });
      return;
    }
    // Pressing Start Trip is the driver's first interaction on the page,
    // which browsers require before any audio can autoplay later — see
    // 06_DROWSINESS_ALERT_PIPELINE.md's "Driver-Facing Audio Alert" section.
    unlockAlertAudio(usualAlertAudioRef.current);
    unlockAlertAudio(multipleAlertAudioRef.current);
    const newSessionId = tripData?.session?.session_id || null;
    setLiveAlerts([]);
    setIsAlertHistoryExpanded(false);

    const { error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "update-driver-delivery",
        deliveryId: active.id,
        status: nextDbStatus,
      },
    });
    if (error) {
      // The Session is already Active at this point -- monitoring is
      // genuinely running, just the displayed stage label is one step
      // behind. A plain status-write failure (rare), not a guardrail
      // rejection, and retrying Start Pickup is safe since a Session
      // already exists.
      setToast({
        message:
          error.message || "Failed to update the delivery. Please try again.",
        type: "error",
      });
      return;
    }

    setData((prev) => ({
      ...prev,
      active: {
        ...prev.active,
        status: statusCfg.nextStage,
        hasOpenSession: true,
        sessionId: newSessionId,
      },
    }));
    setToast({
      message: "Delivery status updated successfully.",
      type: "success",
    });
  };

  const pauseTrip = async () => {
    if (!active) return;
    const { error } = await supabase.functions.invoke("driver-trip", {
      body: { action: "pause-trip", deliveryRequestId: active.id },
    });
    if (error) {
      setToast({
        message: error.message || "Failed to pause the trip. Please try again.",
        type: "error",
      });
      return;
    }
    setData((prev) => ({
      ...prev,
      active: { ...prev.active, hasOpenSession: false, sessionId: null },
    }));
    setLiveAlerts([]);
    setIsAlertHistoryExpanded(false);
    setToast({ message: "Trip paused successfully.", type: "success" });
  };

  const resumeTrip = async () => {
    if (!active) return;
    const { data: tripData, error } = await supabase.functions.invoke(
      "driver-trip",
      {
        body: { action: "resume-trip", deliveryRequestId: active.id },
      },
    );
    if (error) {
      setToast({
        message:
          error.message || "Failed to resume the trip. Please try again.",
        type: "error",
      });
      return;
    }
    const newSessionId = tripData?.session?.session_id || null;
    setData((prev) => ({
      ...prev,
      active: { ...prev.active, hasOpenSession: true, sessionId: newSessionId },
    }));
    setToast({ message: "Trip resumed successfully.", type: "success" });
  };

  const filteredHistory = data.completed.filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      d.id.toLowerCase().includes(q) ||
      d.customerName.toLowerCase().includes(q) ||
      d.companyName.toLowerCase().includes(q) ||
      d.deliveryAddress.toLowerCase().includes(q)
    );
  });

  const closeDeliveryDetail = () => {
    setSelectedDelivery(null);
    setExpandedReport(null);
  };

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    closeDeliveryDetail();
  };

  return (
    <DriverLayout title="Deliveries" background={null}>
      <audio
        ref={usualAlertAudioRef}
        src={USUAL_ALERT_SRC}
        preload="auto"
        hidden
      />
      <audio
        ref={multipleAlertAudioRef}
        src={MULTIPLE_ALERT_SRC}
        preload="auto"
        hidden
      />
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[80] flex justify-center px-4">
          <div
            className={`rounded-md border px-4 py-2 text-sm font-medium shadow-md ${
              toast.type === "success"
                ? "border-amber-300 bg-amber-100 text-amber-800"
                : "border-red-300 bg-red-100 text-red-800"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
      <div className="flex w-full min-w-0 flex-col gap-3 pb-4">
        {deliveriesError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 sm:px-4 sm:py-3 sm:text-sm">
            {deliveriesError}
          </p>
        )}

        {isLoadingDeliveries ? (
          <p className="rounded-xl border border-amber-200/70 bg-white p-5 text-center text-[11px] text-slate-500">
            Loading your deliveries…
          </p>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              {DELIVERY_TABS.map((tab) => (
                <TabButton
                  key={tab.id}
                  label={tab.label}
                  count={
                    tab.id === "today"
                      ? todayCount
                      : tab.id === "upcoming"
                        ? upcomingCount
                        : pastCount
                  }
                  isActive={activeTab === tab.id}
                  onClick={() => selectTab(tab.id)}
                />
              ))}
            </div>

            {/* Today tab — today's delivery is the driver's dedicated workspace, not a modal */}
            {activeTab === "today" &&
              (active ? (
                <>
                  <div className="flex flex-col gap-3">
                    {isPausedTrip ? (
                      <div className="flex items-center gap-1.5 rounded-xl bg-amber-800 px-3.5 py-2.5 text-[11px] font-medium text-white sm:text-xs">
                        <Pause className="h-3.5 w-3.5 shrink-0" />
                        Trip paused — GPS and drowsiness monitoring are stopped.
                        Resume when you're ready to continue driving.
                      </div>
                    ) : (
                      statusCfg.banner && (
                        <div className="flex items-center gap-1.5 rounded-xl bg-amber-900 px-3.5 py-2.5 text-[11px] font-medium text-white sm:text-xs">
                          {statusCfg.bannerIcon && (
                            <statusCfg.bannerIcon className="h-3.5 w-3.5 shrink-0" />
                          )}
                          {statusCfg.banner}
                        </div>
                      )
                    )}

                    {/* Rest-stop recommendation (12_REST_STOP_RECOMMENDATIONS.md):
                  ephemeral, dismissible, never re-shows itself once dismissed
                  or the Trip ends -- purely advisory, dismissing it never
                  touches Trip/Session state. */}
                    {isMonitoring &&
                      restStopRecommended &&
                      !restStopDismissed && (
                        <div className="flex items-center gap-1.5 rounded-xl bg-sky-800 px-3.5 py-2.5 text-[11px] font-medium text-white sm:text-xs">
                          <Coffee className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1">
                            You've been driving a while — consider taking a rest
                            stop when it's safe to.
                          </span>
                          <button
                            onClick={() => setRestStopDismissed(true)}
                            aria-label="Dismiss rest stop recommendation"
                            className="shrink-0 rounded-md p-1 hover:bg-sky-700"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                    {/* Summary — at-a-glance status, route, and key facts */}
                    <section className="rounded-xl border border-amber-200/70 bg-white p-3 shadow-sm sm:p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <TodayBadge />
                          <span className="truncate text-xs font-bold text-slate-900">
                            {statusCfg.label}
                          </span>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {active.id}
                        </span>
                      </div>

                      <div className="mt-2">
                        <StageProgress status={active.status} />
                      </div>

                      <div className="mt-3 flex items-stretch gap-2.5">
                        <div className="flex flex-col items-center justify-between">
                          {statusCardLegend.flatMap((item, i) =>
                            [
                              <span
                                key={item.key}
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${item.badgeBg} ${item.badgeText}`}
                              >
                                {item.badge}
                              </span>,
                              i < statusCardLegend.length - 1 && (
                                <div
                                  key={`${item.key}-line`}
                                  className="my-0.5 w-px flex-1 bg-amber-200"
                                />
                              ),
                            ].filter(Boolean),
                          )}
                        </div>
                        <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5">
                          {statusCardLegend.map((item) => (
                            <p
                              key={item.key}
                              className="truncate text-xs font-medium leading-tight text-slate-800"
                            >
                              {item.address}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <Truck className="h-3 w-3 shrink-0 text-amber-700" />
                            <p className="text-[9px] text-slate-500">Truck</p>
                          </div>
                          <p className="truncate text-xs font-bold text-slate-900">
                            {active.crew.truck.plateNumber}
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0 text-amber-700" />
                            <p className="text-[9px] text-slate-500">Pickup</p>
                          </div>
                          <p className="truncate text-xs font-bold text-slate-900">
                            {pickupWindowLabel(
                              active.pickupTime,
                              active.pickupTimeEnd,
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <Wallet className="h-3 w-3 shrink-0 text-amber-700" />
                            <p className="text-[9px] text-slate-500">Fee</p>
                          </div>
                          <p className="truncate text-xs font-bold text-amber-900">
                            {active.quotation
                              ? `₱${Number(active.quotation.amount).toLocaleString()}`
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </section>

                    {/* Live drowsiness monitoring — only while actually driving, right after the
                  trip-status summary since "how alert am I right now" is the next thing a
                  driver mid-trip needs, ahead of navigation details. */}
                    {isMonitoring && (
                      <LiveMonitoringCard
                        alerts={liveAlerts}
                        isExpanded={isAlertHistoryExpanded}
                        onToggleExpanded={() =>
                          setIsAlertHistoryExpanded((v) => !v)
                        }
                      />
                    )}

                    {/* Route & Navigation — always visible; recenters as the delivery progresses.
                  This is the one map/address surface on the page: the old separate "Navigate Now"
                  and "Route Overview" cards duplicated the same two addresses and two live map
                  embeds, so they're merged here into a single always-current source of truth.
                  Before the driving stage: the original static Google Maps embed (single point,
                  no live position needed yet — the driver hasn't started moving). Once driving
                  starts (isDrivingStage): swaps to LiveNavigationMap, the capstone-required live
                  turn-by-turn view built on the Google Maps JavaScript API — see
                  01_SYSTEM_ARCHITECTURE.md's Route Comparison section. */}
                    {isDrivingStage ? (
                      <LiveNavigationMap
                        origin={activeNavOrigin}
                        destination={activeNavTarget}
                        stops={activeNavStops}
                        needsPickup={activeNeedsPickup}
                        pickupCoords={active?.pickupCoords}
                        dropoffCoords={active?.destinationCoords}
                        isDropoffFinal={isDropoffFinal}
                        allStops={active?.stops}
                        livePosition={livePosition}
                        isPaused={isPausedTrip}
                        isMonitoring={isMonitoring}
                        nextLabel={statusCfg.nextLabel}
                        NextIcon={statusCfg.nextIcon}
                        nextColor={statusCfg.nextColor}
                        onPause={() => setConfirmingPause(true)}
                        onResume={() => setConfirmingResume(true)}
                        onStageAdvance={() => setConfirmingStageAdvance(true)}
                      />
                    ) : active.pickupAddress && active.deliveryAddress ? (
                      // Whole-trip guide (Pickup -> Dropoff -> Stops in one map),
                      // per user request -- replaces the old single-point static
                      // embed below, which only ever showed "here's the next
                      // stop," never the whole planned trip. Works off the raw
                      // addresses directly (PlannedRouteMap lets DirectionsService
                      // geocode them) rather than requiring a pre-parsed "lat, lng"
                      // pair, which real, human-entered addresses never are --
                      // that used to make this branch never actually fire for a
                      // real booking. Falls back to the original static embed
                      // (the branch below) only if pickup/dropoff are missing
                      // entirely.
                      <PlannedRouteMap
                        pickupAddress={active.pickupAddress}
                        dropoffAddress={active.deliveryAddress}
                        pickupCoordsProp={active.pickupCoords}
                        dropoffCoordsProp={active.destinationCoords}
                        stops={active.stops}
                        suggestedRoute={active.suggestedRoute}
                        deliveryRequestId={active.id}
                        onSaved={(route) =>
                          setData((prev) => ({
                            ...prev,
                            active: { ...prev.active, suggestedRoute: route },
                          }))
                        }
                      />
                    ) : (
                      <section className="overflow-hidden rounded-xl border border-amber-200/70 bg-white">
                        <div className="border-b border-amber-200/70 bg-amber-50 px-3 py-2">
                          <h3 className="text-xs font-bold text-slate-900">
                            {activeNeedsPickup
                              ? "Navigate to Pickup Location"
                              : "Navigate to Drop-off Location"}
                          </h3>
                        </div>
                        <iframe
                          title="Navigation Map"
                          src={toGoogleMapEmbed(activeNavTarget)}
                          className="h-36 w-full sm:h-44"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                        <div className="space-y-1.5 border-t border-amber-200/70 px-3 py-2.5 text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700">
                              P
                            </span>
                            <span className="truncate text-slate-600">
                              {active.pickupAddress}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700">
                              D
                            </span>
                            <span className="truncate text-slate-600">
                              {active.deliveryAddress}
                            </span>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Phone-only page-scroll slider, pinned to the actual left edge of
                  the viewport (fixed, not part of the Live Navigation card at all)
                  -- always reachable at a fixed spot on screen regardless of where
                  the page is currently scrolled to. A real scrollbar-style track +
                  thumb: the thumb visibly moves as the page scrolls (from any
                  source), and can itself be dragged to scroll -- not just an
                  invisible swipe pad, which read as "stuck"/non-functional since
                  nothing ever visibly moved. Exists because LiveNavigationMap's
                  GoogleMap uses gestureHandling: 'greedy' (a single-finger drag
                  anywhere on the map pans it, per its Waze-style UX), so a finger
                  swiping down to scroll the page instead grabs the map if it lands
                  there; this track/thumb has no map listeners attached at all, so
                  a drag here always falls through to normal page scrolling. Only
                  shown while the live map is actually on screen (isDrivingStage)
                  and on phone widths (sm:hidden -- mouse wheel/trackpad scroll
                  isn't caught by the map the same way desktop doesn't need this). */}
                    {isDrivingStage && (
                      <div
                        ref={scrollTrackRef}
                        // z-20, deliberately below DriverLayout's mobile nav drawer/backdrop
                        // (z-40/z-30) -- if the drawer is opened while this is showing, this
                        // should sit behind the backdrop, not float on top of it. top-20/
                        // bottom-20 keeps clear of the mobile top bar and the page's own
                        // sticky bottom action bar (Pause Trip/Confirm Pickup/etc).
                        className="fixed left-1.5 top-20 bottom-20 z-20 w-2 rounded-full bg-slate-200/80 sm:hidden"
                      >
                        <div
                          onPointerDown={handleScrollThumbPointerDown}
                          onPointerMove={handleScrollThumbPointerMove}
                          onPointerUp={handleScrollThumbPointerEnd}
                          onPointerCancel={handleScrollThumbPointerEnd}
                          style={{
                            height: scrollThumb.height,
                            transform: `translateY(${scrollThumb.top}px)`,
                            touchAction: "none",
                          }}
                          className="w-2 rounded-full bg-amber-800 shadow"
                        />
                      </div>
                    )}

                    {/* Full delivery detail — everything the old modal showed, now part of the page.
                  Addresses live only in the Route section above, so they aren't repeated here. */}
                    <div className="grid gap-3 lg:grid-cols-2">
                      {/* Delivery Overview */}
                      <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-xs font-bold text-slate-900">
                            Delivery Overview
                          </h3>
                          <StatusBadge status={active.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Customer
                            </p>
                            <p className="font-medium text-slate-900">
                              {active.customerName}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Company
                            </p>
                            <p className="font-medium text-slate-900">
                              {active.companyName}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Product Type
                            </p>
                            <p className="font-medium text-slate-900">
                              {active.itemType}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Schedule
                            </p>
                            <p className="font-medium text-slate-900">
                              {active.pickupDate} at{" "}
                              {pickupWindowLabel(
                                active.pickupTime,
                                active.pickupTimeEnd,
                              )}
                            </p>
                          </div>
                        </div>
                      </section>

                      {/* Proof of Delivery — same self-gating section as
                    DeliveryDetailView, shown here too so it's visible on the
                    active-trip dashboard without navigating into history. */}
                      <ProofOfDeliverySection delivery={active} />

                      {/* Delivery Fee — always visible */}
                      {active.quotation && (
                        <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
                          <h3 className="text-xs font-bold text-slate-900">
                            Delivery Fee
                          </h3>
                          <div className="mt-3 space-y-2.5">
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              <p className="text-xs font-medium text-emerald-800">
                                PHP{" "}
                                {Number(
                                  active.quotation.amount,
                                ).toLocaleString()}
                              </p>
                            </div>
                            {active.quotation.breakdown?.length > 0 && (
                              <div className="space-y-1.5 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Breakdown
                                </p>
                                {active.quotation.breakdown.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="flex justify-between text-xs"
                                  >
                                    <span className="text-slate-600">
                                      {item.label}
                                    </span>
                                    <span className="font-medium text-slate-800">
                                      ₱{Number(item.amount).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                                <div className="flex justify-between border-t border-amber-300 pt-1.5 text-xs font-bold">
                                  <span className="text-slate-800">Total</span>
                                  <span className="text-slate-800">
                                    ₱
                                    {Number(
                                      active.quotation.amount,
                                    ).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </section>
                      )}

                      {/* Crew & Truck — least likely to change mid-delivery, so it anchors the bottom */}
                      <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4 lg:col-span-2">
                        <h3 className="text-xs font-bold text-slate-900">
                          Crew &amp; Truck
                        </h3>
                        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                          <div className="flex items-center gap-3 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-900 text-xs font-semibold text-white">
                              {active.crew.driver.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {active.crew.driver.name}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {active.crew.driver.phone}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Driver
                            </span>
                          </div>

                          <div className="rounded-lg border border-amber-200/70 bg-white p-2.5">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Truck
                            </p>
                            <div className="flex items-center gap-2 text-xs">
                              <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-900">
                                {active.crew.truck.plateNumber}
                              </span>
                              <span className="truncate text-slate-500">
                                &bull; {active.crew.truck.truckType} &bull;{" "}
                                {active.crew.truck.capacity}
                              </span>
                            </div>
                          </div>

                          {active.crew.helpers?.length > 0 && (
                            <div className="sm:col-span-2">
                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Helpers ({active.crew.helpers.length})
                              </p>
                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {active.crew.helpers.map((helper) => (
                                  <div
                                    key={helper.id}
                                    className="flex items-center gap-2.5 rounded-lg border border-amber-200/70 bg-white p-2"
                                  >
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800">
                                      {helper.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .slice(0, 2)}
                                    </div>
                                    <p className="truncate text-xs font-medium text-slate-900">
                                      {helper.name}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {active.assignedAt && (
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 sm:col-span-2">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              Assigned: {active.assignedAt}
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </div>

                  {isPausedTrip && (
                    <div className="sticky bottom-0 z-10 -mx-4 border-t border-amber-200/70 bg-white/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12">
                      <button
                        onClick={() => setConfirmingResume(true)}
                        className="mx-auto flex w-full items-center justify-center gap-2 rounded-lg bg-amber-900 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-amber-800 sm:w-auto sm:min-w-[280px]"
                      >
                        <Play className="h-4 w-4" />
                        Resume Trip
                      </button>
                    </div>
                  )}

                  {/* Gated on isMonitoring OR nextLabel, not just nextLabel --
                FOR_PICKUP/OUT_FOR_DELIVERY (the driving stages, when
                LiveNavigationMap is on screen) both have nextLabel: null
                since Confirm Pickup/Complete Delivery moved to the Helper,
                which previously hid this entire bar including Pause Trip --
                the only way to pause was LiveNavigationMap's own duplicate
                fullscreen-footer button. */}
                  {!isPausedTrip && (isMonitoring || statusCfg.nextLabel) && (
                    <div className="sticky bottom-0 z-10 -mx-4 border-t border-amber-200/70 bg-white/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12">
                      <div className="mx-auto flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[280px] sm:flex-row">
                        {isMonitoring && (
                          <button
                            onClick={() => setConfirmingPause(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-amber-900 transition hover:bg-amber-50"
                          >
                            <Pause className="h-4 w-4" />
                            Pause Trip
                          </button>
                        )}
                        {statusCfg.nextLabel && (
                          <button
                            onClick={() => setConfirmingStageAdvance(true)}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-bold text-white transition ${statusCfg.nextColor}`}
                          >
                            <statusCfg.nextIcon className="h-4 w-4" />
                            {statusCfg.nextLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 text-xs font-semibold text-emerald-800">
                    No deliveries for today
                  </p>
                  <p className="mt-0.5 text-[11px] text-emerald-600">
                    You have no deliveries scheduled for today.
                  </p>
                  <button
                    onClick={() => setActiveTab("upcoming")}
                    className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                  >
                    View Upcoming Deliveries
                  </button>
                </div>
              ))}

            {/* Upcoming tab */}
            {activeTab === "upcoming" &&
              (selectedDelivery ? (
                <DeliveryDetailView
                  delivery={selectedDelivery}
                  onBack={closeDeliveryDetail}
                  isReportExpanded={expandedReport === selectedDelivery.id}
                  onToggleReport={() =>
                    setExpandedReport(
                      expandedReport === selectedDelivery.id
                        ? null
                        : selectedDelivery.id,
                    )
                  }
                  onSuggestedRouteSaved={(route) =>
                    setSelectedDelivery((prev) =>
                      prev ? { ...prev, suggestedRoute: route } : prev,
                    )
                  }
                />
              ) : data.upcoming.length === 0 ? (
                <p className="rounded-xl border border-amber-200/70 bg-white p-5 text-center text-[11px] text-slate-500">
                  No upcoming deliveries scheduled. New assignments will appear
                  here once your supervisor schedules them.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {data.upcoming.map((delivery) => (
                    <DeliveryRow
                      key={delivery.id}
                      delivery={delivery}
                      showTime
                      todayISO={todayISO}
                      onSelect={setSelectedDelivery}
                    />
                  ))}
                </div>
              ))}

            {/* Past tab */}
            {activeTab === "past" &&
              (selectedDelivery ? (
                <DeliveryDetailView
                  delivery={selectedDelivery}
                  onBack={closeDeliveryDetail}
                  isReportExpanded={expandedReport === selectedDelivery.id}
                  onToggleReport={() =>
                    setExpandedReport(
                      expandedReport === selectedDelivery.id
                        ? null
                        : selectedDelivery.id,
                    )
                  }
                  onSuggestedRouteSaved={(route) =>
                    setSelectedDelivery((prev) =>
                      prev ? { ...prev, suggestedRoute: route } : prev,
                    )
                  }
                />
              ) : (
                <div>
                  {data.completed.length > 0 && (
                    <div className="relative mb-2">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search history..."
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      />
                    </div>
                  )}

                  {filteredHistory.length === 0 ? (
                    <p className="rounded-xl border border-amber-200/70 bg-white p-5 text-center text-[11px] text-slate-500">
                      {data.completed.length === 0
                        ? "No past deliveries yet."
                        : "No results match your search."}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredHistory.map((delivery) => (
                        <DeliveryRow
                          key={delivery.id}
                          delivery={delivery}
                          todayISO={todayISO}
                          onSelect={setSelectedDelivery}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </>
        )}
      </div>

      {/* Confirm before advancing the delivery status — prevents an accidental tap on the
          sticky action button from silently moving the job to its next stage. */}
      {confirmingStageAdvance && statusCfg?.nextLabel && (
        <div
          // z-[60], above LiveNavigationMap's fullscreen overlay (z-50) -- a
          // confirm modal opened from that overlay's own Pause/Confirm
          // Pickup buttons must render on top of it, not tie/lose the
          // stacking order to it, or the modal could render invisibly
          // behind the fullscreen map with taps silently reaching the map
          // instead of the modal's buttons underneath.
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-stage-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-4 shadow-xl">
            <h2
              id="confirm-stage-title"
              className="text-sm font-bold text-slate-900"
            >
              {statusCfg.confirmTitle}
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              {statusCfg.confirmDescription}
            </p>
            <div className="mt-4 flex gap-1.5">
              <button
                onClick={() => setConfirmingStageAdvance(false)}
                disabled={isSubmittingTripAction}
                className="flex-1 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  runTripAction(advanceStage, () =>
                    setConfirmingStageAdvance(false),
                  )
                }
                disabled={isSubmittingTripAction}
                className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${statusCfg.nextColor}`}
              >
                {isSubmittingTripAction && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                {isSubmittingTripAction ? "Please wait…" : statusCfg.nextLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm before Pause/Resume — same compact-modal pattern as the stage-advance
          confirmation above, since both stop/start GPS and drowsiness monitoring. */}
      {confirmingPause && (
        <div
          // z-[60] -- see confirmingStageAdvance's modal above for why.
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-pause-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-4 shadow-xl">
            <h2
              id="confirm-pause-title"
              className="text-sm font-bold text-slate-900"
            >
              Pause this trip?
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              This stops GPS and drowsiness monitoring for now. The delivery
              stays assigned to you — resume whenever you're ready to continue
              driving.
            </p>
            <div className="mt-4 flex gap-1.5">
              <button
                onClick={() => setConfirmingPause(false)}
                disabled={isSubmittingTripAction}
                className="flex-1 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  runTripAction(pauseTrip, () => setConfirmingPause(false))
                }
                disabled={isSubmittingTripAction}
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-900 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingTripAction && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                {isSubmittingTripAction ? "Please wait…" : "Pause Trip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingResume && (
        <div
          // z-[60] -- see confirmingStageAdvance's modal above for why.
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-resume-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-4 shadow-xl">
            <h2
              id="confirm-resume-title"
              className="text-sm font-bold text-slate-900"
            >
              Resume this trip?
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              This restarts GPS and drowsiness monitoring and continues the same
              delivery from here.
            </p>
            <div className="mt-4 flex gap-1.5">
              <button
                onClick={() => setConfirmingResume(false)}
                disabled={isSubmittingTripAction}
                className="flex-1 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  runTripAction(resumeTrip, () => setConfirmingResume(false))
                }
                disabled={isSubmittingTripAction}
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-900 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingTripAction && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                {isSubmittingTripAction ? "Please wait…" : "Resume Trip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion confirmation — floats above the page after the driver hands
          over the cargo, and auto-dismisses after a few seconds. */}
      {completionNotice && (
        // z-[70], above both the fullscreen map (z-50) and its confirm
        // modals (z-[60]) -- same reasoning, this toast can fire right after
        // a Complete Delivery confirm triggered from fullscreen.
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl shadow-emerald-900/15">
            <div className="flex items-center gap-3 bg-emerald-600 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  Delivery Completed
                </p>
                <p className="truncate text-[11px] text-emerald-100">
                  {completionNotice.id} • handed over to the customer
                </p>
              </div>
              <button
                onClick={() => setCompletionNotice(null)}
                aria-label="Dismiss"
                className="shrink-0 rounded-full p-1 text-emerald-100 transition hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] leading-relaxed text-slate-600">
                Great job! This delivery has been marked as delivered and moved
                to your history. The customer will confirm on their end to
                finalize the trip.
              </p>
            </div>
          </div>
        </div>
      )}
    </DriverLayout>
  );
}

export default DriverDeliveries;
