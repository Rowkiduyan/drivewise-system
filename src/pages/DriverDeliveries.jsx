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
  RefreshCw,
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
  TrafficLayer,
  useJsApiLoader,
} from "@react-google-maps/api";
import DriverLayout from "../layout/DriverLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import { useResolvedAddress } from "../lib/reverseGeocode.js";
import { useResolvedStopCoords } from "../lib/forwardGeocode.js";
import {
  WAREHOUSE_COORDS,
  distanceMeters,
  nearestDropoffOrder,
  computeSuggestedRoute,
  flattenLegPath,
  fetchRerouteEvents,
} from "../lib/suggestedRoute.js";
import {
  REROUTE_REASON_OPTIONS,
  REROUTE_REASON_LABELS,
} from "../lib/rerouteReasons.js";
import {
  formatManilaTimestamp,
  formatManilaShortTime,
  manilaTodayISO,
  MANILA_TIMEZONE,
} from "../lib/manilaTime.js";
import { COMPLETED_REPORT_DATA, buildRealDriverTripReport } from "../lib/driverReportData.js";

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
  // Added 2026-09-08 -- previously missing, so a CANCELLED delivery had to
  // be excluded from every tab entirely (see the comment above
  // `nonArchived` in loadDeliveries) rather than shown anywhere, since
  // statusConfig[status] resolving to undefined crashed the page. Now shown
  // under Past alongside Delivered/Completed, distinguished by this badge.
  CANCELLED: {
    label: "Cancelled",
    badge: "bg-rose-100 text-rose-700",
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
      // isolation: "isolate" walls off Leaflet's internal panes/controls
      // (z-index up to 1000 by default -- .leaflet-top/.leaflet-control-
      // container) into their own stacking context, so they can never
      // paint over sibling/ancestor UI outside this div regardless of its
      // z-index -- e.g. DriverLayout's fixed mobile header (z-40), which
      // this map was bleeding over before this fix. Same underlying
      // mechanism as LogoutButton.jsx's z-[1000] fix, contained at the
      // source here instead of escalating every competing z-index.
      style={{ height: 420, isolation: "isolate" }}
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
// Snap-to-route threshold (user-reported 2026-09-15: walking beside a road
// during a live test showed the arrow on the sidewalk, not the road) --
// ordinary phone GPS accuracy (commonly 5-15m) is easily enough to land the
// raw coordinate off the actual road/route line. Purely display-only, see
// snapToPolyline's own comment for the full reasoning; kept well under
// NAV_REROUTE_TOLERANCE_DEGREES's own ~100m threshold so a driver who has
// genuinely left the route (about to trigger a real reroute) shows their
// real position, not one incorrectly glued to a line they're not on.
const NAV_SNAP_TO_ROUTE_METERS = 40;
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

// Snaps a raw GPS point to the nearest point on a route polyline, so the
// live-nav arrow renders on the road/route itself instead of at the literal
// raw coordinate (user-reported 2026-09-15, see NAV_SNAP_TO_ROUTE_METERS's
// own comment). Purely a display concern -- the return value is only ever
// used for the marker's rendered position and the camera's follow-center;
// gps_logs, distance/mileage accumulation, the step-advance check, and the
// reroute-on-deviation check all keep comparing against the real, raw
// position, so a genuine deviation is still genuinely detected and still
// genuinely triggers a real reroute (snapping the display would otherwise
// quietly mask that the driver has actually left the route).
//
// Local flat-earth projection (meters-per-degree at this latitude), not
// real haversine math per segment -- accurate to centimeters over the
// sub-kilometer span a single route leg covers, which is all this needs.
// `path` entries may be plain {lat,lng} (this app's own stored route
// shape) or google.maps.LatLng instances (DirectionsService's live result,
// lat/lng as methods, not properties) -- normalized inline either way.
// Returns null (meaning "show the raw position instead") when the closest
// point on the path is farther than maxMeters away.
function snapToPolyline(point, path, maxMeters) {
  if (!point || !path || path.length < 2) return null;
  const latToMeters = 111320;
  const lngToMeters = 111320 * Math.cos((point.lat * Math.PI) / 180);
  const toLocalXY = (p) => {
    const lat = typeof p.lat === "function" ? p.lat() : p.lat;
    const lng = typeof p.lng === "function" ? p.lng() : p.lng;
    return { x: (lng - point.lng) * lngToMeters, y: (lat - point.lat) * latToMeters };
  };
  let closest = null;
  let closestDistSq = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = toLocalXY(path[i - 1]);
    const b = toLocalXY(path[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? (-a.x * dx + -a.y * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    const distSq = cx * cx + cy * cy;
    if (distSq < closestDistSq) {
      closestDistSq = distSq;
      closest = { x: cx, y: cy };
    }
  }
  if (!closest || Math.sqrt(closestDistSq) > maxMeters) return null;
  return {
    lat: point.lat + closest.y / latToMeters,
    lng: point.lng + closest.x / lngToMeters,
  };
}

// Below this speed (m/s), a phone's own fused heading reading is typically
// noise (near-stationary jitter, not real direction of travel) -- keep
// whatever heading is already showing instead of following it.
const MIN_HEADING_SPEED_MPS = 0.5;

// Resolves the direction-of-travel arrow/camera should face for one new GPS
// fix. Prefers the phone's own `coords.heading` (fused by the OS from GPS +
// compass/motion sensors) when the device supplies one and is actually
// moving -- far steadier at walking speed than comparing two raw lat/lng
// fixes, since consecutive walking-speed fixes can be only a couple meters
// apart, well within ordinary GPS noise (5-15m), which was flipping the
// computed heading backwards (user-reported 2026-09-15 walking test).
// Deliberately does NOT read any device-orientation/compass-facing signal
// (which way the phone itself is physically pointed) -- explicit user
// request: only real direction of travel should turn the camera, not how
// the phone happens to be held.
// Falls back to the previous two-fix secant calculation when the device
// doesn't supply a usable heading (desktop browsers, older devices, or a
// low-speed/stationary reading), same >2m movement threshold as before so
// GPS drift while stopped doesn't jitter the arrow.
function resolveTravelHeading(fix, previousFix, fallbackHeading) {
  if (
    typeof fix.heading === "number" &&
    !Number.isNaN(fix.heading) &&
    typeof fix.speed === "number" &&
    fix.speed >= MIN_HEADING_SPEED_MPS
  ) {
    return fix.heading;
  }
  if (previousFix && window.google) {
    const from = new window.google.maps.LatLng(previousFix.lat, previousFix.lng);
    const to = new window.google.maps.LatLng(fix.lat, fix.lng);
    if (
      window.google.maps.geometry.spherical.computeDistanceBetween(from, to) >
      2
    ) {
      return window.google.maps.geometry.spherical.computeHeading(from, to);
    }
  }
  return fallbackHeading;
}

// Shortest angular step from `from` to `to` in degrees, in (-180, 180] --
// e.g. 350 -> 10 returns +20 (turn forward through 0/360), not -340 (the
// long way around backwards).
function shortestAngleDeltaDeg(from, to) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function lerpAngleDeg(from, to, t) {
  return from + shortestAngleDeltaDeg(from, to) * t;
}

// How much of the remaining gap to a new GPS fix's position/heading closes
// per ms of real elapsed time (framerate-independent exponential ease) --
// tuned so the glide settles well within one typical GPS tick interval
// (~1s) instead of visibly lagging behind the real position.
const CAMERA_SMOOTHING_MS = 350;

// Continuously glides the camera (and the marker/arrow, which renders at the
// same animated position) toward each new GPS fix instead of snapping to it
// the instant a fix arrives -- the same look as Google Maps' own turn-by-
// turn view, where the puck/camera never visibly teleports between raw GPS
// ticks. Runs its own requestAnimationFrame loop rather than tying the
// animation to GPS tick timing (ticks arrive irregularly): each frame eases
// the currently-displayed position/heading a fraction of the way toward
// whatever the latest real fix says, so it keeps gliding smoothly even if
// the next real fix is a bit late. `heading` eases along the shorter
// direction via lerpAngleDeg so a near-north driver doesn't see the camera
// spin the long way around. Zoom is left alone every frame (read from the
// map's own current zoom) so this never fights a driver's manual pinch --
// only the very first fix snaps zoom to NAV_ZOOM, same as the pre-animation
// behavior this replaces.
function useAnimatedNavCamera({ mapRef, isMapReady, rawPosition, heading }) {
  const [animatedPosition, setAnimatedPosition] = useState(null);
  const targetRef = useRef(null);
  const targetHeadingRef = useRef(heading);
  const animatedPosRef = useRef(null);
  const animatedHeadingRef = useRef(heading);
  const rafRef = useRef(null);
  const lastFrameAtRef = useRef(0);
  // Set false the instant the driver starts a real drag gesture (Google
  // Maps JS API only fires 'dragstart' for user-initiated panning, never
  // for a programmatic moveCamera() call, so this can't misfire from the
  // animation loop's own camera updates below). While false, the loop still
  // keeps the marker/arrow gliding to the real position every frame, it
  // just stops recentering the camera out from under the driver's fingers
  // -- previously the camera only snapped back once per GPS tick (~1/s), so
  // a manual pan had a brief window to look around; recentering every frame
  // instead made any drag attempt feel like fighting the map. Set back to
  // true by resumeFollowing (wired to the existing recenter button).
  const isFollowingRef = useRef(true);

  useEffect(() => {
    targetRef.current = rawPosition;
    targetHeadingRef.current = heading;
  }, [rawPosition, heading]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !window.google) return undefined;
    const listener = window.google.maps.event.addListener(
      mapRef.current,
      "dragstart",
      () => {
        isFollowingRef.current = false;
      },
    );
    return () => listener.remove();
  }, [mapRef, isMapReady]);

  useEffect(() => {
    if (!rawPosition) return undefined;
    const tick = (now) => {
      const dt = lastFrameAtRef.current ? now - lastFrameAtRef.current : 16;
      lastFrameAtRef.current = now;
      const target = targetRef.current;
      if (target && mapRef.current) {
        if (!animatedPosRef.current) {
          // First fix ever for this mount -- snap immediately (no previous
          // position to glide from) and zoom in to the street-level nav
          // view, matching the old isFirstPosition behavior exactly.
          animatedPosRef.current = target;
          animatedHeadingRef.current = targetHeadingRef.current;
          mapRef.current.moveCamera({
            center: target,
            zoom: NAV_ZOOM,
            tilt: 45,
            heading: animatedHeadingRef.current,
          });
        } else {
          const t = 1 - Math.exp(-dt / CAMERA_SMOOTHING_MS);
          animatedPosRef.current = {
            lat:
              animatedPosRef.current.lat +
              (target.lat - animatedPosRef.current.lat) * t,
            lng:
              animatedPosRef.current.lng +
              (target.lng - animatedPosRef.current.lng) * t,
          };
          animatedHeadingRef.current = lerpAngleDeg(
            animatedHeadingRef.current,
            targetHeadingRef.current,
            t,
          );
          if (isFollowingRef.current) {
            mapRef.current.moveCamera({
              center: animatedPosRef.current,
              zoom: mapRef.current.getZoom(),
              tilt: 45,
              heading: animatedHeadingRef.current,
            });
          }
        }
        setAnimatedPosition(animatedPosRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastFrameAtRef.current = 0;
    };
    // isMapReady read purely to (re)start the loop once mapRef.current is
    // guaranteed set -- same refresh-race reasoning as the effect this
    // replaces. rawPosition itself deliberately omitted: only whether it's
    // present/absent (not its value) should restart the loop -- each fix's
    // actual value already reaches the running loop via targetRef instead,
    // re-running this on every single GPS tick would tear down and restart
    // the rAF loop (and reset lastFrameAtRef) every tick instead of letting
    // it glide continuously across ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, isMapReady, !!rawPosition]);

  const resumeFollowing = useCallback(() => {
    isFollowingRef.current = true;
  }, []);

  return { animatedPosition, resumeFollowing };
}

// One color per leg of the Pickup -> Dropoff -> Stop 1 -> ... chain (cycles
// if a chain somehow has more legs than colors), per 02C_ROUTE_STYLING's
// per-leg design -- index 0 is reserved for the to-pickup leg specifically
// (its own separate DirectionsService call, always exactly one leg), so the
// post-pickup chain's legs start at index 1 (pickup->dropoff = blue, so it's
// visually distinct from the to-pickup leg that preceded it). Index 0 was
// red until 2026-09-09 -- changed to teal per explicit user request (red is
// reserved for real alerts/warnings elsewhere in the app, not routine
// navigation).
const NAV_LEG_COLORS = [
  "#0D9488",
  "#2563EB",
  "#059669",
  "#7C3AED",
  "#EA580C",
  "#DB2777",
];

// WAREHOUSE_ADDRESS/WAREHOUSE_COORDS moved to lib/suggestedRoute.js
// (2026-09-06, Supervisor Route Review & Approval feature) -- imported
// above. WAREHOUSE_COORDS was reconciled 2026-08-14 with `activeNavOrigin`
// below, which previously hardcoded a *different* depot lat/lng
// ({lat: 14.5506, lng: 121.0471}) representing the same real place under a
// different, never-reconciled guess.

// 14B_ARRIVED_AT_BASE_CONFIRMATION.md: same constant driver-trip/gps-upload
// use server-side for the automatic geofence auto-close -- duplicated here
// so the "Arrived at Base" confirm modal can decide client-side whether the
// driver is genuinely far enough away to warrant the warning copy.
const RETURN_TRIP_GEOFENCE_METERS = 150;

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
    // A route that already exists is trusted as-is and never recomputed --
    // the Supervisor's separate review/approval step was removed
    // 2026-09-08 (see STATUS.md), so mere presence is the only signal left,
    // same as this component's original design before that feature existed.
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
    const dropoffCoords = dropoffCoordsProp || parseCoords(dropoffAddress);

    computeSuggestedRoute({
      pickupCoords,
      pickupAddress,
      dropoffCoords,
      dropoffAddress,
      stops: (stops || []).map((s) => ({
        location: s.location,
        coords: parseCoords(s.location) || stopCoords[s.location] || null,
      })),
    })
      .then(({ legs: payload, bounds }) => {
        setRouteError(false);
        setComputedLegs(payload);
        if (mapRef.current && bounds) {
          mapRef.current.fitBounds(bounds, 16);
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
      })
      .catch(() => setRouteError(true));
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
              // Bug fix: when `legs` is already known at mount (an
              // already-saved suggestedRoute, the common case for any
              // delivery viewed more than once), the [suggestedRoute, legs]
              // effect below runs once on mount, finds mapRef.current still
              // null (this onLoad callback fires asynchronously, after the
              // underlying Google Maps instance actually finishes
              // initializing -- not synchronously with render), and bails.
              // Nothing re-triggers it afterward since setting a plain ref
              // doesn't change any dependency the effect is watching, so
              // the map never gets a center/zoom and never requests a
              // single tile -- a permanent blank grey box. Calling
              // fitBounds here too covers exactly that ordering; the effect
              // below still covers the opposite ordering (route computed
              // fresh, after the map has already loaded).
              if (legs?.length && window.google) {
                const bounds = new window.google.maps.LatLngBounds();
                legs.forEach((leg) =>
                  leg.path.forEach(([lat, lng]) => bounds.extend({ lat, lng })),
                );
                map.fitBounds(bounds, 16);
              }
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
// Google Maps JavaScript API, not a static embed). Position (passed in as
// `livePosition`) is the driver's own phone GPS, falling back to the Pi's
// gps_logs uploads only when the phone has no reading -- see
// 01_SYSTEM_ARCHITECTURE.md's Route Comparison section and
// 05_GPS_PIPELINE.md's GPS Source Split section. Supervisor tracking still
// reads gps_logs directly and is unaffected. Only rendered while
// isDrivingStage (see call site).
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
  deliveryRequestId,
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

  // Computed early (before the camera-follow effect below, which needs it)
  // rather than alongside the other `legs`/`steps` derivations further down
  // -- those stay where they are for the rest of the render, this is just
  // the one subset the camera/marker positioning needs ahead of them.
  // Snap-to-route (NAV_SNAP_TO_ROUTE_METERS's own comment has the full
  // reasoning): displayPosition is what the arrow renders at and what the
  // camera follows, falling back to the real livePosition when nothing on
  // the current leg's remaining path is close enough to snap to. Every
  // other consumer of position (gps writes, step-advance, reroute
  // detection, heading derivation below) still uses the real livePosition,
  // unaffected by this.
  const navLegs = directions?.routes[0]?.legs || [];
  const navCurrentLegPoints = (navLegs[currentLegIndex]?.steps || [])
    .slice(currentStepIndex)
    .flatMap((step) => step.path || []);
  const displayPosition = livePosition
    ? snapToPolyline(livePosition, navCurrentLegPoints, NAV_SNAP_TO_ROUTE_METERS) ||
      livePosition
    : livePosition;

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
    isReroute = false,
  ) => {
    if (!window.google || !routeOrigin || !routeDestination) return;
    lastRouteRequestRef.current = {
      routeOrigin,
      routeDestination,
      routeWaypoints,
      legOffset,
      isReroute,
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
          // Best-effort telemetry -- the reroute itself already happened
          // automatically (no driver interaction, by design); this only
          // persists what path it landed on, so the post-trip Route
          // Deviation verdict (classifyRouteDeviation) can recognize it as
          // app-initiated rather than unexplained deviation. A reason can be
          // added later, optionally, from the completed trip's own report
          // (tag-reroute-reason) -- never surfaced mid-drive. One silent
          // retry on failure (mirrors ROUTE_RETRY_DELAY_MS's reasoning below
          // for computeRoute itself) -- a dropped log here is exactly the
          // unfair-verdict bug this feature exists to fix, so it's worth one
          // more attempt before giving up.
          if (isReroute && deliveryRequestId) {
            const newPath = result.routes[0].legs.flatMap(flattenLegPath);
            const logReroute = () =>
              supabase.functions
                .invoke("driver-trip", {
                  body: { action: "log-reroute", deliveryRequestId, newPath },
                })
                // invoke() resolves with `{ error }` set on a non-2xx
                // response rather than rejecting -- only a thrown/rejected
                // promise (network failure) needs the catch below; either
                // shape of failure gets normalized to a truthy `error` here
                // so the retry below covers both.
                .then(({ error }) => ({ error }))
                .catch((error) => ({ error }));
            logReroute().then(({ error }) => {
              if (!error) return;
              setTimeout(() => {
                logReroute();
              }, ROUTE_RETRY_DELAY_MS);
            });
          }
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
    const { routeOrigin, routeDestination, routeWaypoints, legOffset, isReroute } =
      lastRouteRequestRef.current;
    const timer = setTimeout(() => {
      computeRoute(
        routeOrigin,
        routeDestination,
        routeWaypoints,
        legOffset,
        isReroute,
      );
    }, ROUTE_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  //
  // Bug fix (user-reported 2026-09-14): this used to fall back to `origin`
  // (WAREHOUSE_COORDS, passed in via activeNavOrigin whenever the driver
  // still needs pickup) whenever livePosition hadn't arrived yet -- which is
  // effectively every fresh mount, since livePosition starts at `null` and
  // only gets set once the browser's geolocation/piPosition-seed-fetch
  // actually resolves (a real, if usually brief, delay). The
  // "upgrade to real GPS" effect further down does correctly recompute once
  // a position arrives, and the watchdog request-id guard in computeRoute
  // correctly discards a stale response arriving out of order -- but for
  // however long that gap lasts, the driver was shown (and, unmuted, told
  // via voice guidance) a route starting from the warehouse, which is wrong
  // and confusing the moment they're already out and near pickup. Simply
  // not computing a route at all until livePosition is known avoids ever
  // drawing/announcing that wrong route -- the map still renders (centered
  // on initialCenter) via the isLoaded branch below, just without a route
  // until one becomes available, which the "upgrade" effect provides within
  // the same short window this used to spend on the wrong route instead.
  useEffect(() => {
    if (!isLoaded || !livePosition || !destination || !stopCoordsReady)
      return;
    computeRoute(livePosition, destination, waypoints);
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
    if (!livePosition) return;
    // Heading derivation here deliberately still compares/reads raw
    // livePosition ticks (real movement/the phone's own fused heading is
    // what a direction-of-travel arrow should reflect) -- only the camera's
    // own center follows the snapped display position, so the map itself
    // visually centers on wherever the arrow is actually drawn (see
    // displayPosition's own comment above).
    const nextHeading = resolveTravelHeading(
      livePosition,
      previousPositionRef.current,
      heading,
    );
    if (nextHeading !== heading) setHeading(nextHeading);
    previousPositionRef.current = livePosition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePosition]);

  // Smoothly glides the camera/marker toward each new fix instead of
  // snapping to it -- see useAnimatedNavCamera's own comment. Replaces the
  // old direct moveCamera() call that used to live in the effect above.
  const { animatedPosition, resumeFollowing } = useAnimatedNavCamera({
    mapRef,
    isMapReady,
    rawPosition: displayPosition,
    heading,
  });

  // Manual recenter (the "Locate" button below) -- gestureHandling: 'greedy'
  // lets the driver freely drag/pan the map away from livePosition to look
  // around; the animation loop notices the drag and stops recentering (see
  // useAnimatedNavCamera's isFollowingRef) until this button is tapped,
  // which both snaps back immediately and tells the loop to resume
  // following on its own again.
  const handleRecenter = () => {
    if (!livePosition || !mapRef.current) return;
    resumeFollowing();
    mapRef.current.moveCamera({
      center: animatedPosition || displayPosition,
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
    Promise.resolve().then(() => {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((i) => i + 1);
      } else if (currentLegIndex < legs.length - 1) {
        setCurrentLegIndex((i) => i + 1);
        setCurrentStepIndex(0);
      }
    });
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
      true,
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
            <TrafficLayer />
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
                // Bug fix (user-reported 2026-09-14, "walked the route and
                // the line wasn't disappearing behind the arrow"): this used
                // to draw every step of the current leg unconditionally, so
                // the line only ever shrank once the *entire* leg finished
                // (reaching pickup/dropoff) -- for a leg with many steps,
                // that could be a long walk/drive with the line never
                // visibly trimming. Slicing from currentStepIndex (already
                // tracked and advanced by the step-advance effect above,
                // same NAV_STEP_ADVANCE_METERS threshold) drops each step's
                // path the moment it's completed, so the drawn line
                // progressively "gets eaten" by the live position, matching
                // standard turn-by-turn nav behavior.
                path={navCurrentLegPoints}
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
                position={animatedPosition || displayPosition}
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

// Live turn-by-turn navigation for the automatic return-to-base leg
// (14_RETURN_TRIP_MONITORING.md), built 2026-09-11 per explicit user
// request after the first pass shipped only a static distance readout.
// Deliberately a SEPARATE component from LiveNavigationMap above, not a
// reuse with extra props -- that component's shape (stops/waypoints,
// pickup/dropoff pins, leg-offset math, and critically its reroute-on-
// deviation effect logging to `log-reroute`/`reroute_events`) is all about
// keeping the driver on the customer-booked `suggested_route`, which this
// leg has nothing to do with (11_ROUTE_COMPARISON.md's Route Deviation
// comparison explicitly excludes the return leg's GPS entirely). Grafting
// this onto LiveNavigationMap would mean either logging fake "reroutes"
// against a planned route that was never involved, or threading a new
// "skip the logging" flag through code that assumes it always applies --
// a parallel, single-leg-only component with no waypoints/pickup/dropoff
// concepts and no log-reroute call is the more honest shape for what's
// actually a different kind of leg. The live-position tracking, tilted/
// rotating camera, turn-by-turn voice guidance, and fullscreen mode are
// otherwise full parity with the outbound nav, same visual language.
function ReturnTripNavigationMap({ livePosition }) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const [directions, setDirections] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(
    () => localStorage.getItem("driverNavMuted") === "true",
  );
  const [routeError, setRouteError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [heading, setHeading] = useState(0);
  const mapRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const lastAnnouncedStepRef = useRef("");
  const previousPositionRef = useRef(null);
  const lastRecomputeAtRef = useRef(0);
  const hasRouteRef = useRef(false);

  // Snap-to-route, same as LiveNavigationMap's identical derivation (see
  // NAV_SNAP_TO_ROUTE_METERS's own comment) -- single leg only here, no
  // stops/waypoints to account for.
  const rtCurrentLegPoints = (directions?.routes[0]?.legs[0]?.steps || [])
    .slice(currentStepIndex)
    .flatMap((step) => step.path || []);
  const displayPosition = livePosition
    ? snapToPolyline(livePosition, rtCurrentLegPoints, NAV_SNAP_TO_ROUTE_METERS) ||
      livePosition
    : livePosition;
  // Same "captured once, camera moves via moveCamera() only after" reasoning
  // as LiveNavigationMap's initialCenter -- falls back to the warehouse
  // itself (the one fixed point known before any GPS fix has arrived).
  const [initialCenter] = useState(() => livePosition || WAREHOUSE_COORDS);

  const routeRequestIdRef = useRef(0);
  const lastRouteOriginRef = useRef(null);

  // Single origin -> fixed-warehouse leg, no waypoints/legOffset -- and no
  // log-reroute call on success (see this component's own header comment
  // for why: this leg was never part of the customer-booked suggested_route,
  // so there's nothing for that log to correct a verdict against).
  const computeRoute = (origin) => {
    if (!window.google || !origin) return;
    lastRouteOriginRef.current = origin;
    const requestId = ++routeRequestIdRef.current;
    const timeoutId = setTimeout(() => {
      if (routeRequestIdRef.current !== requestId) return;
      setRouteError(true);
    }, ROUTE_REQUEST_TIMEOUT_MS);
    new window.google.maps.DirectionsService().route(
      {
        origin,
        destination: WAREHOUSE_COORDS,
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: { departureTime: new Date(), trafficModel: "bestguess" },
      },
      (result, status) => {
        if (routeRequestIdRef.current !== requestId) return;
        clearTimeout(timeoutId);
        if (status === "OK" && result) {
          hasRouteRef.current = true;
          setDirections(result);
          setCurrentStepIndex(0);
          setRouteError(false);
        } else {
          setRouteError(true);
        }
      },
    );
  };

  // Retry a failed/timed-out request -- same recovery LiveNavigationMap has,
  // so a flaky connection doesn't strand the driver on "Couldn't compute a
  // route" with no way back short of a reload.
  useEffect(() => {
    if (!routeError || !lastRouteOriginRef.current) return undefined;
    const origin = lastRouteOriginRef.current;
    const timer = setTimeout(() => computeRoute(origin), ROUTE_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [routeError]);

  // First route, the moment a real GPS position exists (there's no
  // Warehouse/pickup-style fallback origin here -- the return leg only ever
  // starts from wherever the driver actually is).
  useEffect(() => {
    if (!isLoaded || !livePosition || hasRouteRef.current) return;
    computeRoute(livePosition);
  }, [isLoaded, livePosition]);

  // Recenter/follow + derive heading exactly like LiveNavigationMap's own
  // effect (see its comment for the full moveCamera()-vs-setCenter()
  // reasoning) -- no isPaused check, since a return-trip Session is never
  // paused (14_RETURN_TRIP_MONITORING.md's scope: fully automatic start/end,
  // no mid-leg pause concept).
  useEffect(() => {
    if (!livePosition) return;
    const nextHeading = resolveTravelHeading(
      livePosition,
      previousPositionRef.current,
      heading,
    );
    if (nextHeading !== heading) setHeading(nextHeading);
    previousPositionRef.current = livePosition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePosition]);

  // Smoothly glides the camera/marker toward each new fix -- see
  // useAnimatedNavCamera's own comment (same as LiveNavigationMap's use).
  const { animatedPosition, resumeFollowing } = useAnimatedNavCamera({
    mapRef,
    isMapReady,
    rawPosition: displayPosition,
    heading,
  });

  const handleRecenter = () => {
    if (!livePosition || !mapRef.current) return;
    resumeFollowing();
    mapRef.current.moveCamera({
      center: animatedPosition || displayPosition,
      zoom: NAV_ZOOM,
      tilt: 45,
      heading,
    });
  };

  // Turn-by-turn step advance -- single leg only (no stops), otherwise
  // identical to LiveNavigationMap's own step-advance effect.
  useEffect(() => {
    if (!isLoaded || !livePosition || !directions) return;
    const steps = directions.routes[0]?.legs[0]?.steps || [];
    const step = steps[currentStepIndex];
    if (!step) return;
    const distance =
      window.google.maps.geometry.spherical.computeDistanceBetween(
        new window.google.maps.LatLng(livePosition.lat, livePosition.lng),
        step.end_location,
      );
    if (distance > NAV_STEP_ADVANCE_METERS) return;
    Promise.resolve().then(() => {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((i) => i + 1);
      }
    });
  }, [livePosition, directions, currentStepIndex, isLoaded]);

  // Recompute once the driver has visibly left the current route -- same
  // isLocationOnEdge/debounce mechanism as LiveNavigationMap's reroute
  // effect, but this one never calls log-reroute (see header comment): this
  // leg isn't compared against any planned route, so there's no verdict for
  // that log to protect.
  useEffect(() => {
    if (!isLoaded || !livePosition || !directions) return;
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
    if (now - lastRecomputeAtRef.current < NAV_REROUTE_DEBOUNCE_MS) return;
    lastRecomputeAtRef.current = now;
    computeRoute(livePosition);
  }, [livePosition, directions, isLoaded]);

  useEffect(() => {
    if (isMuted && typeof window.speechSynthesis !== "undefined") {
      window.speechSynthesis.cancel();
    }
  }, [isMuted]);

  useEffect(() => {
    if (isMuted || !directions) return;
    const key = String(currentStepIndex);
    if (lastAnnouncedStepRef.current === key) return;
    const steps = directions.routes[0]?.legs[0]?.steps || [];
    const step = steps[currentStepIndex];
    if (!step || typeof window.speechSynthesis === "undefined") return;
    lastAnnouncedStepRef.current = key;
    window.speechSynthesis.speak(
      new SpeechSynthesisUtterance(stripHtml(step.instructions)),
    );
  }, [currentStepIndex, directions, isMuted]);

  const steps = directions?.routes[0]?.legs[0]?.steps || [];
  const currentStep = steps[currentStepIndex];
  const routeLeg = directions?.routes[0]?.legs[0];

  return (
    <section
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-white"
          : "overflow-hidden rounded-xl border border-amber-200/70 bg-white"
      }
    >
      <div className="flex items-center justify-between border-b border-amber-200/70 bg-amber-50 px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-slate-900">
            Live Navigation — Returning to Base
          </h3>
          {routeLeg && (
            <p className="text-[10px] text-slate-500">
              {routeLeg.distance?.text} · {routeLeg.duration_in_traffic?.text || routeLeg.duration?.text} to base
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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
              map.moveCamera({ tilt: 45 });
              setIsMapReady(true);
            }}
            options={{
              disableDefaultUI: true,
              gestureHandling: "greedy",
              mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID,
            }}
          >
            <TrafficLayer />
            {/* Fixed color, deliberately not NAV_LEG_COLORS -- that palette's
                whole point is distinguishing consecutive legs of the planned
                suggested_route chain, which this leg isn't part of. */}
            {directions?.routes[0]?.legs[0] && (
              <GoogleMapPolyline
                // Same fix as LiveNavigationMap's identical polyline -- see
                // its own comment for why slicing from currentStepIndex is
                // needed for the line to progressively disappear as the
                // driver passes each step, instead of only shrinking once
                // this single leg finishes entirely.
                path={rtCurrentLegPoints}
                options={{
                  strokeColor: "#0891b2",
                  strokeOpacity: 0.9,
                  strokeWeight: 7,
                  zIndex: 1,
                }}
              />
            )}
            <GoogleMapMarker
              position={WAREHOUSE_COORDS}
              icon={warehouseMarkerIcon()}
              zIndex={10}
            />
            {livePosition && (
              <GoogleMapMarker
                position={animatedPosition || displayPosition}
                icon={{
                  path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 6,
                  fillColor: "#2563eb",
                  fillOpacity: 1,
                  strokeColor: "#fff",
                  strokeWeight: 2,
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
    </section>
  );
}

// Resolves a single "lat, lng"-shaped location (e.g. DR-0020-style fixture
// data) into a real address inline -- its own component (not called inline
// as a plain function) so `useResolvedAddress` can be called once per row
// inside a `.map()` without violating the rules of hooks. Mirrors
// SupDeliveries.jsx's identical helper, not shared, per this codebase's
// existing per-portal convention.
function ResolvedText({ value }) {
  return useResolvedAddress(value || "");
}

// 3-way tone lookup for the rule-based route-deviation verdict (11_ROUTE_
// COMPARISON.md Part D) -- "green" is new (the classifier's own
// "Beneficial" case), "amber"/"red" match the legacy mock fixtures' two
// existing tones. Same tones as SupDeliveries.jsx's TONE_STYLES, kept as a
// separate copy here since this tab renders with inline hex colors rather
// than that file's Tailwind border/bg classes.
const DRIVER_ROUTE_TONE_STYLES = {
  green: {
    borderColor: "#a7f3d0",
    backgroundColor: "#ecfdf5",
    badge: "bg-emerald-500",
    heading: "text-emerald-800",
    body: "text-emerald-700",
    Icon: CheckCircle2,
  },
  amber: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    badge: "bg-amber-500",
    heading: "text-amber-800",
    body: "text-amber-700",
    Icon: Navigation,
  },
  red: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    badge: "bg-red-500",
    heading: "text-red-800",
    body: "text-red-700",
    Icon: Navigation,
  },
};
// A legacy mock fixture (mockDeliveriesData.js's "DEL-073") uses "emerald"
// for the same positive case classifyRouteDeviation calls "green" -- alias
// it so that fixture doesn't fall through to the amber default.
DRIVER_ROUTE_TONE_STYLES.emerald = DRIVER_ROUTE_TONE_STYLES.green;

export function CompletedDeliveryReport({
  report,
  delivery,
  hideBehaviorTab = false,
  theme = "amber",
  // Only the Driver can actually tag a reroute reason (driver-trip's
  // tag-reroute-reason checks assigned_driver_id) -- HelperDeliveries.jsx
  // reuses this exact component for the same trip's report (not a
  // per-portal duplicate like SupDeliveries.jsx's own copy) and passes
  // false here, so the Helper sees the reason read-only instead of tap
  // targets that would just fail silently against the backend.
  canTagRerouteReason = true,
}) {
  const resolvedPickup = useResolvedAddress(delivery?.pickupAddress || "");
  const resolvedDropoff = useResolvedAddress(delivery?.deliveryAddress || "");
  const [reportTab, setReportTab] = useState("trip");
  // Optimistic local override for a just-tagged reroute reason -- avoids
  // threading a callback prop back up to whoever owns `report` state just to
  // reflect one tap; report itself is refetched fresh the next time this
  // delivery's detail view is opened anyway.
  const [taggedReasons, setTaggedReasons] = useState({});
  const [taggingId, setTaggingId] = useState(null);
  async function tagRerouteReason(rerouteEventId, reason) {
    setTaggingId(rerouteEventId);
    const { error } = await supabase.functions.invoke("driver-trip", {
      body: { action: "tag-reroute-reason", rerouteEventId, reason },
    });
    setTaggingId(null);
    if (!error) {
      setTaggedReasons((prev) => ({ ...prev, [rerouteEventId]: reason }));
    }
  }

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
  // Route tab needs either a saved planned route to compare against (real
  // deliveries that predate PlannedRouteMap, or never had a parseable
  // pickup/dropoff, simply don't get the map/verdict part, same as the
  // Supervisor's version) OR at least a logged reroute to show/tag -- the
  // latter can exist even without the former (LiveNavigationMap still
  // navigates and reroutes on deviation regardless of whether a
  // suggested_route was ever saved).
  const hasRouteTabContent =
    Boolean(report.routeDeviation) || report.rerouteEvents?.length > 0;
  const tabs = REPORT_TABS.filter(
    (tab) =>
      (!hideBehaviorTab || tab.id !== "behavior") &&
      (tab.id !== "route" || hasRouteTabContent),
  );

  const themeClass = {
    amber: {
      card: "border-amber-200/70 bg-amber-50/50",
      tabBarBorder: "border-amber-200/70",
      tabActive: "bg-amber-900 text-white",
      tabInactive: "text-slate-600 hover:bg-amber-100",
    },
    teal: {
      card: "border-teal-200/70 bg-teal-50/40",
      tabBarBorder: "border-teal-200/70",
      tabActive: "bg-teal-900 text-white",
      tabInactive: "text-slate-600 hover:bg-teal-100",
    },
  }[theme] || {
    card: "border-amber-200/70 bg-amber-50/50",
    tabBarBorder: "border-amber-200/70",
    tabActive: "bg-amber-900 text-white",
    tabInactive: "text-slate-600 hover:bg-amber-100",
  };

  return (
    <div className={`rounded-xl border ${themeClass.card} p-3 sm:p-4`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Delivery Report
        </p>
      </div>

      {/* A 3-up grid, not a horizontally-scrolling row — it always fits the viewport
          instead of requiring a swipe to reach the third tab. */}
      <div
        className={`mb-4 grid gap-1.5 border-b ${themeClass.tabBarBorder} pb-3 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = reportTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setReportTab(tab.id)}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-semibold transition ${
                isActive ? themeClass.tabActive : themeClass.tabInactive
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

          {!hideBehaviorTab && (
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
          )}

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
                    {session.label && (
                      <span className="mr-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700">
                        {session.label}
                      </span>
                    )}
                    {/* 14B_ARRIVED_AT_BASE_CONFIRMATION.md: quiet factual note,
                        not a warning tone -- only shown when the manual close
                        happened genuinely outside the geofence. */}
                    {session.manualCloseOffsetMeters != null &&
                      session.manualCloseOffsetMeters > RETURN_TRIP_GEOFENCE_METERS && (
                        <span className="mr-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                          Closed {(session.manualCloseOffsetMeters / 1000).toFixed(1)}km from base
                        </span>
                      )}
                    {formatAlertTimestamp(session.start)} —{" "}
                    {session.end ? formatAlertTimestamp(session.end) : ""}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {session.alerts} alerts
                    </span>
                    {/* Fixed width, always rendered (even empty) -- see
                        SupDeliveries.jsx's identical span for why: omitting
                        the element entirely on a still-open session (no
                        duration yet) shrank the group, which -- being
                        right-anchored via ml-auto -- shifted "alerts"
                        sideways relative to rows that do have a duration. */}
                    <span className="w-8 shrink-0 text-right text-[10px] text-slate-400">
                      {Number.isFinite(session.duration) && session.duration > 0
                        ? formatAlertDuration(session.duration)
                        : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportTab === "route" && hasRouteTabContent && (
        <div className="space-y-2.5">
          {report.routeDeviation && (() => {
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
            const toneStyle =
              DRIVER_ROUTE_TONE_STYLES[r.aiVerdictTone] ||
              DRIVER_ROUTE_TONE_STYLES.amber;
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
                      borderColor: toneStyle.borderColor,
                      backgroundColor: toneStyle.backgroundColor,
                    }}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${toneStyle.badge}`}
                    >
                      <toneStyle.Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${toneStyle.heading}`}>
                        Route Analysis: {r.aiVerdict}
                      </p>
                      <p
                        className={`mt-1 text-[11px] leading-relaxed ${toneStyle.body}`}
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
                          Planned — Route {i + 1}
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

          {report.rerouteEvents && report.rerouteEvents.length > 0 && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-[11px] font-semibold text-slate-700">
                Route changes on this trip
              </p>
              <p className="text-[10px] leading-relaxed text-slate-500">
                The app automatically recalculated your route at these
                points — already excluded from the analysis above. Optionally
                tell us why, for your own records.
              </p>
              {report.rerouteEvents.map((event) => {
                const reason = taggedReasons[event.id] ?? event.reason;
                return (
                  <div
                    key={event.id}
                    className="rounded-md border border-slate-100 bg-slate-50 p-2"
                  >
                    <p className="text-[10px] text-slate-500">
                      Recalculated at {formatAlertTimestamp(event.occurredAt)}
                    </p>
                    {reason ? (
                      <p className="mt-0.5 text-[11px] font-medium text-slate-700">
                        Reason: {REROUTE_REASON_LABELS[reason] || reason}
                      </p>
                    ) : canTagRerouteReason ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {REROUTE_REASON_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={taggingId === event.id}
                            onClick={() =>
                              tagRerouteReason(event.id, opt.value)
                            }
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        No reason given
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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

// ARRIVED_PICKUP maps to FOR_PICKUP (not OUT_FOR_DELIVERY) -- this is the
// optional "Arrived at Pickup" announcement (2026-09-08), which only stamps
// a timestamp and must NOT visibly advance the driver's own stage
// banner/stepper (still "Heading to Pickup" / "Waiting for the helper to
// confirm pickup") until the Helper actually confirms pickup. Found live
// 2026-09-08: mapping it to OUT_FOR_DELIVERY (matching OUT_FOR_DROPOFF/
// ARRIVED_DROPOFF) made the page jump straight to "Out for Delivery" /
// "Waiting for the helper to complete the delivery chain" the instant
// Arrived was tapped, before pickup was ever confirmed -- same class of
// premature-advance bug as activeNeedsPickup's fix above, just in the
// stage-display layer instead of the nav-target layer.
const DB_TO_DRIVER_STATUS = {
  ASSIGNED: "ASSIGNED",
  OUT_FOR_PICKUP: "FOR_PICKUP",
  ARRIVED_PICKUP: "FOR_PICKUP",
  OUT_FOR_DROPOFF: "OUT_FOR_DELIVERY",
  ARRIVED_DROPOFF: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

// Shared across loadDeliveries' own bucketing (Today/Upcoming/History,
// workspaceDelivery selection) -- see mapDelivery/DB_TO_DRIVER_STATUS above.
const TERMINAL_STATUSES = new Set(["DELIVERED", "COMPLETED", "CANCELLED"]);

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

// distanceMeters/nearestDropoffOrder moved to lib/suggestedRoute.js
// (2026-09-06, Supervisor Route Review & Approval feature) -- imported
// above. Still used here for the rest-stop recommendation's distance
// accumulation (12_REST_STOP_RECOMMENDATIONS.md) and the live-nav dynamic
// dropoff reordering below.

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
    pickupCompletedAt: d.pickupCompletedAt || null,
    dropoffPhotoUrl: d.dropoffPhotoUrl || null,
    dropoffCompletedAt: d.dropoffCompletedAt || null,
    // Optional "Arrived" announcements (2026-09-08) — Driver-set, read here
    // to know whether the Arrived button was already tapped for this leg.
    pickupArrivedAt: d.pickupArrivedAt || null,
    dropoffArrivedAt: d.dropoffArrivedAt || null,
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
        : { plateNumber: "", truckType: "", capacity: "" },
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
      completedAt: delivery.pickupCompletedAt,
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
          "session_id, start_time, end_time, total_alerts, session_duration, is_return_trip, manual_close_offset_meters",
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
      const [{ data: alertRows }, { data: gpsRows }, rerouteRows] =
        await Promise.all([
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
          // Auto-reroutes LiveNavigationMap already computed mid-trip -- see
          // buildRealDriverTripReport's rerouteSegments/rerouteEvents.
          fetchRerouteEvents(delivery.id),
        ]);
      if (!isMounted) return;
      setRealReport(
        buildRealDriverTripReport(
          delivery,
          sessions,
          alertRows || [],
          gpsRows || [],
          rerouteRows,
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

// Labels are genuinely date-based again as of 2026-09-08 (previously briefly
// renamed to "Active"/"History" the same day, when the underlying logic was
// still status-priority based, not a date partition -- see STATUS.md). Now:
// `id: "today"` = every non-terminal delivery with pickupDate === today,
// PLUS workspaceDelivery unconditionally (even if its own date isn't today
// -- the stale-session-recovery case, see loadDeliveries) rendered as the
// live workspace at the top. `id: "upcoming"` = pickupDate > today only.
// `id: "past"` = finished (DELIVERED/COMPLETED/CANCELLED) OR pickupDate <
// today while unfinished, the latter shown in its own "Overdue" section so
// it doesn't read as "done."
const DELIVERY_TABS = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "History" },
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
    workspace: null,
    today: [],
    upcoming: [],
    overdue: [],
    history: [],
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
  const [confirmingArrival, setConfirmingArrival] = useState(false);
  const [confirmingArrivedAtBase, setConfirmingArrivedAtBase] = useState(false);
  const [toast, setToast] = useState(null);
  // Shared across every confirm-modal action below since only one can ever be
  // open at a time — see the "Loading States" convention in DESIGNS.md for
  // why every future confirm-modal button should follow this same pattern.
  const [isSubmittingTripAction, setIsSubmittingTripAction] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [isAlertHistoryExpanded, setIsAlertHistoryExpanded] = useState(false);
  const [completionNotice, setCompletionNotice] = useState(null);
  // Live nav position: the driver's own phone GPS is now the primary source
  // (see the watchPosition effect below), falling back to the Pi's gps_logs
  // uploads only when the phone has no reading yet (permission denied, no
  // signal, unsupported). Supervisor's own gps_logs-sourced tracking is
  // unaffected by this state directly -- but see phoneBroadcastChannelRef
  // below: phonePosition is also broadcast (ephemeral, never written to
  // gps_logs) so the Supervisor Dashboard can optionally prefer it live too,
  // per 2026-09-03 user request (easier to demo/track without needing real
  // Pi hardware in the room), same fallback shape as this effect's own.
  const [phonePosition, setPhonePosition] = useState(null);
  const [piPosition, setPiPosition] = useState(null);
  const livePosition = phonePosition || piPosition;
  // Supabase Realtime broadcast channel (not a table write -- see comment
  // above) that Supervisor's LiveFleetMap subscribes to per in-progress
  // delivery. One channel per Trip, joined only while isMonitoring (the
  // effect below), (re)sent on every phone position tick.
  const phoneBroadcastChannelRef = useRef(null);
  // Latest phone reading, mirrored into a ref so the channel-join effect can
  // resend it the moment the channel actually finishes subscribing --
  // .send() before SUBSCRIBED is a no-op, and watchPosition only re-fires on
  // a genuine position *change* (a real phone jitters enough to retrigger it
  // naturally, but this closes the gap for a near-stationary reading too).
  const latestPhonePositionRef = useRef(null);
  // Throttles how often phone GPS gets persisted to gps_logs (2026-09-09,
  // "GPS source split" extended -- phone is now the primary persisted
  // source, Pi the fallback) -- watchPosition can tick far more often than
  // once a second, but the rest of the pipeline (mileage summation, Route
  // Comparison) already assumes roughly Pi's own upload cadence
  // (GPS_UPLOAD_INTERVAL, 1s, PROJECT_CONSTRAINTS.md), so this matches that
  // instead of writing every single tick.
  const lastPersistedPositionAtRef = useRef(0);
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

  // The one delivery this driver should currently be working on -- chosen by
  // status priority (open session, then paused, then pickupDate === today),
  // NOT by which tab it's shown under. Renamed from `active` 2026-09-08 when
  // the Today/Upcoming/History tabs became genuinely date-based (see
  // loadDeliveries below) -- this object still drives the live workspace
  // (this section) and every GPS/alerts/session feature below, completely
  // independent of Today's now-real date-based list (data.today).
  const workspaceDelivery = data.workspace;
  // Resolves a "lat, lng"-shaped pickup/dropoff (e.g. DR-0020's fixture data)
  // into a human-readable address for the status/Summary card -- a no-op for
  // deliveries that already store a real street address.
  const resolvedPickupAddress = useResolvedAddress(
    workspaceDelivery?.pickupAddress || "",
  );
  const resolvedDeliveryAddress = useResolvedAddress(
    workspaceDelivery?.deliveryAddress || "",
  );
  // Stop coordinates for the Summary card's ordered legend below (see
  // statusCardLegend) -- same Photon-based resolution PlannedRouteMap uses
  // for its own route computation, needed here too so a 'stop' leg's
  // endpoint can be matched back to its address.
  const activeStopLocations = (workspaceDelivery?.stops || []).map(
    (s) => s.location,
  );
  const { coordsByLocation: activeStopCoords } =
    useResolvedStopCoords(activeStopLocations);
  // Full ordered legend for the Summary card -- Pickup, then every
  // Dropoff/Stop in the same nearest-first order Planned Route/Live
  // Navigation actually visit them, not just a fixed Pickup/Dropoff pair.
  const statusCardLegend = workspaceDelivery
    ? buildRouteLegend(
        workspaceDelivery.suggestedRoute,
        resolvedPickupAddress,
        resolvedDeliveryAddress,
        workspaceDelivery.stops,
        activeStopCoords,
      )
    : [];

  // Before pickup, the relevant leg is "get to the pickup point"; after
  // pickup, it's "get to drop-off." Keyed on pickupCompletedAt (ground
  // truth), not the mapped status -- the optional "Arrived at Pickup"
  // announcement (2026-09-08, ARRIVED_PICKUP) maps into the same
  // "OUT_FOR_DELIVERY" bucket as an actually-departed pickup (see
  // DB_TO_DRIVER_STATUS above), so a status-only check would reroute the
  // live-nav map to the drop-off the instant "Arrived" is tapped, before the
  // Helper has actually confirmed pickup/loaded cargo. By design, tapping
  // Arrived only stamps a timestamp -- it must not change what the driver is
  // navigating toward.
  const activeNeedsPickup = workspaceDelivery
    ? !workspaceDelivery.pickupCompletedAt
    : true;
  // Reconciled 2026-08-14 with WAREHOUSE_COORDS (PlannedRouteMap's own
  // warehouse-origin constant) -- previously a second, different hardcoded
  // guess at the same real depot location.
  const activeNavOrigin = workspaceDelivery
    ? activeNeedsPickup
      ? WAREHOUSE_COORDS
      : workspaceDelivery.pickupCoords
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
  // Realtime subscription updating workspaceDelivery.stops/
  // .dropoffCompletedAt), this naturally re-evaluates once per completion
  // rather than continuously reordering mid-drive.
  const remainingDropoffCandidates =
    workspaceDelivery && !activeNeedsPickup
      ? [
          ...(workspaceDelivery.dropoffCompletedAt
            ? []
            : [
                {
                  location: workspaceDelivery.deliveryAddress,
                  coords: workspaceDelivery.destinationCoords,
                  key: "dropoff",
                },
              ]),
          ...(workspaceDelivery.stops || [])
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

  const statusCfg = workspaceDelivery
    ? statusConfig[workspaceDelivery.status]
    : null;
  const todayISO = localTodayISO();
  // workspaceDelivery already prioritizes an open Session (then a paused
  // trip) over pickupDate === today (see loadDeliveries below) -- the
  // workspace must show it regardless of pickupDate, or a stale-dated open/
  // paused trip's Pause/Resume/End Trip controls become unreachable again,
  // same class of bug fixed twice already (STATUS.md 2026-08-12, 2026-09-08).
  const todayCount = data.today.length;
  const upcomingCount = data.upcoming.length;
  const pastCount = data.overdue.length + data.history.length;

  // The nav map's target/waypoints follow the same nearest-first order --
  // route to the nearest remaining dropoff, with the rest (also nearest-
  // first from that point) threaded in as waypoints after it.
  let activeNavTarget = null;
  let activeNavStops = [];
  if (workspaceDelivery) {
    if (activeNeedsPickup) {
      activeNavTarget = workspaceDelivery.pickupCoords;
    } else if (orderedRemainingDropoffs.length > 0) {
      activeNavTarget =
        orderedRemainingDropoffs[0].coords || workspaceDelivery.destinationCoords;
      activeNavStops = orderedRemainingDropoffs.slice(1);
    } else {
      activeNavTarget = workspaceDelivery.destinationCoords;
    }
  }

  // Monitoring runs for the whole time the vehicle is being driven — both the
  // pickup leg and the delivery leg — matching how the post-trip Behavior
  // report treats it as a single session spanning the entire trip. A driver
  // past ASSIGNED with no open Session is Paused, not "not yet started" —
  // see 03B_PAUSE_AND_RESUME_TRIP.md's "Paused isn't a stored value" note.
  const isDrivingStage =
    Boolean(workspaceDelivery) &&
    (workspaceDelivery.status === "FOR_PICKUP" ||
      workspaceDelivery.status === "OUT_FOR_DELIVERY");
  // 14_RETURN_TRIP_MONITORING.md: the automatic drive-back-to-warehouse leg
  // -- a DELIVERED workspaceDelivery only ever has hasOpenSession true while
  // its return-trip Session is open (see loadDeliveries' nonTerminal filter
  // above for why that inference is safe), so no separate field is needed
  // from get-driver-deliveries to tell this apart from a normal driving leg.
  const isReturnTrip =
    Boolean(workspaceDelivery) &&
    workspaceDelivery.status === "DELIVERED" &&
    workspaceDelivery.hasOpenSession;
  const isMonitoring =
    (isDrivingStage && workspaceDelivery.hasOpenSession) || isReturnTrip;
  const isPausedTrip = isDrivingStage && !workspaceDelivery.hasOpenSession;

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

  // Tracks the workspace delivery's id across calls so a refresh (below) can
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
      setData({ workspace: null, today: [], upcoming: [], overdue: [], history: [] });
      setIsLoadingDeliveries(false);
      return;
    }
    const mapped = (result?.deliveries || []).map(mapDelivery);
    const today = localTodayISO();
    // A DELIVERED delivery normally counts as terminal -- except while its
    // automatic return-trip Session is still open (14_RETURN_TRIP_MONITORING.md).
    // hasOpenSession can only be true on an already-DELIVERED row because of
    // that return-trip Session: end-trip closes the real Session and only
    // *then* flips status to DELIVERED, before it ever opens the return-trip
    // one, so there's no window where a genuine delivery-in-progress Session
    // could make this true for a DELIVERED row. That's what lets the rest of
    // this file infer "is this the return-trip leg" from
    // `status === "DELIVERED" && hasOpenSession` alone, with no separate
    // field needed from get-driver-deliveries.
    const nonTerminal = mapped
      .filter(
        (d) =>
          !TERMINAL_STATUSES.has(d.status) ||
          (d.status === "DELIVERED" && d.hasOpenSession),
      )
      .sort((a, b) =>
        String(a.pickupDate || "").localeCompare(String(b.pickupDate || "")),
      );

    // --- workspaceDelivery selection: UNCHANGED from before the
    // Today/Upcoming/History tabs became date-based (2026-09-08) -- this is
    // the one delivery the live workspace (Pause/Resume/Start Pickup/live
    // nav/GPS/drowsiness monitoring) tracks, chosen by status priority, not
    // by date, and it must stay that way regardless of how the tabs bucket
    // things for display. Deleting this pickupDate fallback would remove
    // the ONLY place "Start Pickup" is reachable from -- there is no other
    // entry point into starting a trip, so an ASSIGNED delivery with no
    // open/paused session anywhere still needs this fallback to ever become
    // actionable.
    //
    // A delivery with a genuinely open Session takes priority over "today's"
    // delivery — a stale open Session on a different pickup_date must still
    // surface here so its Pause/End Trip controls stay reachable. See
    // STATUS.md's 2026-08-11 incident (driver D002/DR-0015 stuck ~64h).
    //
    // A Paused trip needs the same date-independent priority (added
    // 2026-09-08) -- Paused isn't hasOpenSession (pause-trip closes the
    // Session entirely, see 03B_PAUSE_AND_RESUME_TRIP.md's "Paused isn't a
    // stored value" note), so it was only ever reachable via the
    // pickupDate === today fallback. A trip paused and left unresumed past
    // midnight would otherwise drop out of the workspace the next day (no
    // open Session, and pickupDate no longer today) with no way to reach
    // Resume Trip -- the same class of bug the 2026-08-12 fix solved for a
    // stale Active session, just for Paused. Matches `isPausedTrip`'s own
    // definition (isDrivingStage && no open Session) so a delivery only
    // counts as "paused" once it's actually past ASSIGNED, not merely
    // lacking a Session because it hasn't started.
    const pausedDelivery = nonTerminal.find(
      (d) =>
        !d.hasOpenSession &&
        (d.status === "FOR_PICKUP" || d.status === "OUT_FOR_DELIVERY"),
    );
    const workspaceDelivery =
      nonTerminal.find((d) => d.hasOpenSession) ||
      pausedDelivery ||
      nonTerminal.find((d) => d.pickupDate === today) ||
      null;

    // --- Date-based buckets (2026-09-08) -- purely additive, computed
    // independently of workspaceDelivery so the tabs actually mean what
    // they say: Today = pickupDate === today, Upcoming = pickupDate > today,
    // History = finished (any terminal status) OR pickupDate < today
    // (flagged as its own "Overdue" section, kept out of the finished list
    // so it doesn't read as "done" -- see the History tab's JSX). Excludes
    // workspaceDelivery's own id from all three so a delivery currently
    // pinned as the live workspace (which can have any pickupDate at all --
    // see the stale-session-recovery case above) never ALSO shows up a
    // second time in Upcoming or History's Overdue section -- it's already
    // shown, pinned, at the top of Today.
    const otherNonTerminal = workspaceDelivery
      ? nonTerminal.filter((d) => d.id !== workspaceDelivery.id)
      : nonTerminal;
    const todaysDeliveries = otherNonTerminal.filter(
      (d) => d.pickupDate === today,
    );
    const upcomingDeliveries = otherNonTerminal.filter(
      (d) => d.pickupDate > today,
    );
    const overdueDeliveries = otherNonTerminal
      .filter((d) => d.pickupDate < today)
      .sort((a, b) => {
        const dateCmp = String(b.pickupDate || "").localeCompare(String(a.pickupDate || ""));
        return dateCmp !== 0 ? dateCmp : String(b.pickupTime || "").localeCompare(String(a.pickupTime || ""));
      });
    const historyDeliveries = mapped
      .filter((d) => TERMINAL_STATUSES.has(d.status) && d.id !== workspaceDelivery?.id)
      .sort((a, b) => {
        const dateCmp = String(b.pickupDate || "").localeCompare(String(a.pickupDate || ""));
        return dateCmp !== 0 ? dateCmp : String(b.pickupTime || "").localeCompare(String(a.pickupTime || ""));
      });

    // workspaceDelivery is unconditionally part of Today's list even when
    // its own pickupDate isn't today (the stale-session-recovery case above).
    const todaysList = workspaceDelivery
      ? [workspaceDelivery, ...todaysDeliveries]
      : todaysDeliveries;

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
    // Only tracked while genuinely non-terminal, so a later unrelated refresh
    // (e.g. the Realtime subscription below firing for a change to some
    // *other* delivery entirely) can't re-match this same id and re-fire the
    // notice above for a delivery that was already terminal last call too --
    // the match above only means something the first time it happens after
    // a real ASSIGNED/... -> DELIVERED transition.
    prevActiveIdRef.current =
      workspaceDelivery && !TERMINAL_STATUSES.has(workspaceDelivery.status)
        ? workspaceDelivery.id
        : null;

    setData({
      workspace: workspaceDelivery,
      today: todaysList,
      upcoming: upcomingDeliveries,
      overdue: overdueDeliveries,
      history: historyDeliveries,
    });
    setIsLoadingDeliveries(false);
  }, []);

  useEffect(() => {
    // Initial fetch on mount, same shape as every other data-load effect in
    // this file -- not a derived-state anti-pattern.
    Promise.resolve().then(() => {
      loadDeliveries();
    });
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
    if (!isMonitoring || !workspaceDelivery?.sessionId) return undefined;
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
        .eq("delivery_request_id", workspaceDelivery.id);
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
      .channel(`alerts-session-${workspaceDelivery.sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alerts",
          filter: `session_id=eq.${workspaceDelivery.sessionId}`,
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
  }, [isMonitoring, workspaceDelivery?.sessionId, workspaceDelivery?.id]);

  // Rest-stop recommendation setup (12_REST_STOP_RECOMMENDATIONS.md): once
  // per Trip (workspaceDelivery.id), not per Session -- resets the one-shot banner and
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
    if (!workspaceDelivery?.id) return undefined;
    if (restStopTripIdRef.current !== workspaceDelivery.id) {
      restStopTripIdRef.current = workspaceDelivery.id;
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
        .eq("delivery_request_id", workspaceDelivery.id)
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
  }, [workspaceDelivery?.id]);

  // Current Session's own start time (for the elapsed-hours half of the
  // threshold) -- fetched fresh per Session rather than trusting a value
  // passed down from get-driver-deliveries, since that action's shape isn't
  // guaranteed to carry it. Resets the current-session distance accumulator
  // for the new Session too.
  useEffect(() => {
    if (!isMonitoring || !workspaceDelivery?.sessionId) return undefined;
    currentSessionStartRef.current = null;
    currentSessionKmRef.current = 0;
    lastDistanceCheckPositionRef.current = null;
    let cancelled = false;
    supabase
      .from("sessions")
      .select("start_time")
      .eq("session_id", workspaceDelivery.sessionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data?.start_time) return;
        currentSessionStartRef.current = new Date(data.start_time).getTime();
      });
    return () => {
      cancelled = true;
    };
  }, [isMonitoring, workspaceDelivery?.sessionId]);

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

  // Phone-GPS broadcast channel for the Supervisor Dashboard (2026-09-03):
  // one Realtime broadcast channel per Trip (`workspaceDelivery.id`), joined
  // only while isMonitoring -- same gating as the watchPosition effect
  // below, so the channel goes away on Pause the same way phonePosition
  // itself freezes. Broadcast, not a table write: never touches gps_logs,
  // mileage, or Route Comparison (05_GPS_PIPELINE.md's "GPS Source Split"
  // rationale) -- purely an ephemeral live-view feed a Supervisor's browser
  // can optionally join.
  useEffect(() => {
    if (!isMonitoring || !workspaceDelivery?.id) {
      phoneBroadcastChannelRef.current = null;
      return undefined;
    }
    const channel = supabase.channel(`phone-gps-${workspaceDelivery.id}`);
    channel.subscribe((status) => {
      // Resend the latest known reading once the channel is actually ready
      // -- closes the race where watchPosition's first tick (or its only
      // tick, if the phone is stationary) lands before .subscribe()
      // resolves, which would otherwise silently drop it.
      if (status === "SUBSCRIBED" && latestPhonePositionRef.current) {
        channel.send({
          type: "broadcast",
          event: "phone_position",
          payload: latestPhonePositionRef.current,
        });
      }
    });
    phoneBroadcastChannelRef.current = channel;
    return () => {
      phoneBroadcastChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [isMonitoring, workspaceDelivery?.id]);

  // Live nav position, primary source: the driver's own phone GPS. Gated on
  // isMonitoring (not just isDrivingStage) to match the fallback effect below
  // -- when Paused, this tears down and phonePosition simply stops updating,
  // freezing LiveNavigationMap's marker/route in place. On permission denial
  // or a signal loss mid-trip, the error callback clears phonePosition so the
  // combining effect below falls back to the Pi's piPosition instead of
  // freezing on a stale phone reading.
  useEffect(() => {
    if (!isMonitoring || !navigator.geolocation) return undefined;
    let watchId = null;
    let retryTimeoutId = null;
    let stopped = false;

    // Found 2026-09-09: this watch was only ever started once, with no
    // retry -- if that first attempt failed for any reason (most commonly
    // a permission prompt that was still pending, unanswered, at the exact
    // moment monitoring started), the driver was stuck on the Warehouse-
    // origin fallback route for the rest of the trip with no way to
    // recover short of a full page reload. Now retries every 5s for as
    // long as monitoring stays on, so answering a late permission prompt
    // (or a signal coming back after a brief loss) self-corrects live.
    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const next = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            // The OS's own fused GPS+compass/motion heading, when it has
            // one -- see resolveTravelHeading's comment for why this is
            // preferred over deriving heading from raw lat/lng ourselves.
            heading:
              typeof pos.coords.heading === "number" &&
              !Number.isNaN(pos.coords.heading)
                ? pos.coords.heading
                : null,
            speed:
              typeof pos.coords.speed === "number" &&
              !Number.isNaN(pos.coords.speed)
                ? pos.coords.speed
                : null,
          };
          setPhonePosition(next);
          latestPhonePositionRef.current = next;
          phoneBroadcastChannelRef.current?.send({
            type: "broadcast",
            event: "phone_position",
            payload: next,
          });
          const deliveryId = workspaceDelivery?.id;
          const now = Date.now();
          if (deliveryId && now - lastPersistedPositionAtRef.current >= 1000) {
            lastPersistedPositionAtRef.current = now;
            supabase.functions
              .invoke("driver-trip", {
                body: {
                  action: "log-position",
                  deliveryRequestId: deliveryId,
                  lat: next.lat,
                  lng: next.lng,
                },
              })
              .then(({ error }) => {
                if (error) console.warn("Failed to persist phone GPS:", error);
              })
              .catch((error) => console.warn("Failed to persist phone GPS:", error));
          }
        },
        () => {
          setPhonePosition(null);
          if (!stopped) {
            retryTimeoutId = setTimeout(() => {
              if (watchId != null) navigator.geolocation.clearWatch(watchId);
              startWatch();
            }, 5000);
          }
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
      );
    };
    startWatch();

    return () => {
      stopped = true;
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
    // workspaceDelivery?.id deliberately omitted -- read via closure inside
    // the tick callback above, same reasoning as the broadcast-channel
    // effect below: the id doesn't change while isMonitoring stays true for
    // one ongoing trip, and this watch is only meant to restart on a real
    // monitoring-state change, not on every data refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMonitoring]);

  // Live nav position, fallback source (05_GPS_PIPELINE.md): the Pi uploads
  // to gps_logs via the gps-upload Edge Function roughly once per second
  // while its Session is Active. Same shape as the alerts subscription above
  // -- seed-fetch the latest reading, then subscribe for new ones. Only ever
  // used by the combining effect below when phonePosition is unavailable;
  // this is also the exact feed the supervisor dashboard reads, unaffected
  // by any of this. Gated on isMonitoring for the same reason as the phone
  // effect above.
  useEffect(() => {
    if (!isMonitoring || !workspaceDelivery?.sessionId) return undefined;
    let cancelled = false;

    async function loadLatestPosition() {
      const { data, error } = await supabase
        .from("gps_logs")
        .select("latitude, longitude, created_at")
        .eq("session_id", workspaceDelivery.sessionId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled || error || !data?.length) return;
      setPiPosition({ lat: data[0].latitude, lng: data[0].longitude });
    }
    loadLatestPosition();

    const channel = supabase
      .channel(`gps-session-${workspaceDelivery.sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gps_logs",
          filter: `session_id=eq.${workspaceDelivery.sessionId}`,
        },
        (payload) => {
          setPiPosition({
            lat: payload.new.latitude,
            lng: payload.new.longitude,
          });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isMonitoring, workspaceDelivery?.sessionId]);

  // Resolves phonePosition/piPosition into livePosition and drives the
  // rest-stop distance accumulator (12_REST_STOP_RECOMMENDATIONS.md) off
  // whichever source is actually live -- kept in one place so a mid-trip
  // handoff between phone and Pi (e.g. phone signal drops) never double-counts
  // distance the way running accumulation in both source effects would.
  useEffect(() => {
    const next = phonePosition || piPosition;
    if (!next) return;
    // Seeds the distance accumulator's reference point on the first reading
    // (from either source) without counting a "distance" against a point
    // that arrived before this mount -- only a genuinely new tick adds
    // distance.
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
    // checkRestStopThreshold deliberately omitted -- a plain function
    // redefined every render, not memoized; including it would force this
    // effect to fire on every render instead of only when the resolved
    // position actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phonePosition, piPosition]);

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
    if (!workspaceDelivery || !statusCfg || !statusCfg.nextStage) return;
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
        body: { action: "start-trip", deliveryRequestId: workspaceDelivery.id },
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
        deliveryId: workspaceDelivery.id,
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
      workspace: {
        ...prev.workspace,
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
    if (!workspaceDelivery) return;
    const { error } = await supabase.functions.invoke("driver-trip", {
      body: {
        action: "pause-trip",
        deliveryRequestId: workspaceDelivery.id,
        // Whether the rest-stop banner was showing right at this moment —
        // recorded on the session being closed so the Supervisor's Trip
        // Details report can flag this pause as rest-stop-recommended
        // (2026-09-08). Purely additive; the banner itself is unaffected.
        restStopRecommended,
      },
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
      workspace: { ...prev.workspace, hasOpenSession: false, sessionId: null },
    }));
    setLiveAlerts([]);
    setIsAlertHistoryExpanded(false);
    setToast({ message: "Trip paused successfully.", type: "success" });
  };

  const resumeTrip = async () => {
    if (!workspaceDelivery) return;
    const { data: tripData, error } = await supabase.functions.invoke(
      "driver-trip",
      {
        body: { action: "resume-trip", deliveryRequestId: workspaceDelivery.id },
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
      workspace: { ...prev.workspace, hasOpenSession: true, sessionId: newSessionId },
    }));
    setToast({ message: "Trip resumed successfully.", type: "success" });
  };

  // Optional "Arrived at Pickup/Drop-off" announcement (2026-09-08) — stamps
  // pickup_arrived_at/dropoff_arrived_at for the Supervisor's Trip Details
  // report. Skippable, and deliberately does NOT change activeNeedsPickup or
  // the live-nav target (see that variable's own comment) — this only
  // records a timestamp, nothing about navigation/monitoring changes.
  const markArrived = async () => {
    if (!workspaceDelivery) return;
    const nextDbStatus = activeNeedsPickup ? "ARRIVED_PICKUP" : "ARRIVED_DROPOFF";
    const { data: result, error } = await supabase.functions.invoke(
      "admin-users",
      {
        body: {
          action: "update-driver-delivery",
          deliveryId: workspaceDelivery.id,
          status: nextDbStatus,
        },
      },
    );
    if (error) {
      setToast({
        message: error.message || "Failed to record arrival. Please try again.",
        type: "error",
      });
      return;
    }
    const nowIso = new Date().toISOString();
    setData((prev) => ({
      ...prev,
      workspace: {
        ...prev.workspace,
        status: DB_TO_DRIVER_STATUS[nextDbStatus],
        ...(activeNeedsPickup
          ? { pickupArrivedAt: result?.pickupArrivedAt || nowIso }
          : { dropoffArrivedAt: result?.dropoffArrivedAt || nowIso }),
      },
    }));
    setToast({ message: "Arrival recorded.", type: "success" });
  };

  // 14_RETURN_TRIP_MONITORING.md's manual "Arrived at Base" fallback --
  // the automatic geofence/timeout close (driver-trip's log-position,
  // gps-upload) already handles the normal case; this just lets the driver
  // close it themselves if they park just outside the ~150m radius. Patches
  // workspace state directly (same pattern as pauseTrip above) rather than
  // waiting for the next poll -- isReturnTrip flips false immediately, so
  // monitoring stops and the sticky footer/map branch revert right away.
  const endReturnTrip = async () => {
    if (!workspaceDelivery) return;
    const { error } = await supabase.functions.invoke("driver-trip", {
      body: {
        action: "end-return-trip",
        deliveryRequestId: workspaceDelivery.id,
        ...(livePosition ? { lat: livePosition.lat, lng: livePosition.lng } : {}),
      },
    });
    if (error) {
      setToast({
        message:
          error.message || "Failed to close out the return trip. Please try again.",
        type: "error",
      });
      return;
    }
    setData((prev) => ({
      ...prev,
      workspace: { ...prev.workspace, hasOpenSession: false, sessionId: null },
    }));
    setLiveAlerts([]);
    setIsAlertHistoryExpanded(false);
    setToast({ message: "Return trip closed out.", type: "success" });
  };
  // 14B_ARRIVED_AT_BASE_CONFIRMATION.md: gains a confirm modal (matching
  // confirmingArrival's pattern) instead of firing endReturnTrip directly --
  // the modal itself decides whether to show the "Supervisor will see this"
  // warning copy based on distance from WAREHOUSE_COORDS at tap time.
  const handleArrivedAtBase = () => setConfirmingArrivedAtBase(true);
  const distanceFromBaseMeters = livePosition
    ? distanceMeters(
        livePosition.lat,
        livePosition.lng,
        WAREHOUSE_COORDS.lat,
        WAREHOUSE_COORDS.lng,
      )
    : null;
  const isFarFromBase =
    distanceFromBaseMeters !== null &&
    distanceFromBaseMeters > RETURN_TRIP_GEOFENCE_METERS;

  const historySearchMatch = (d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      d.id.toLowerCase().includes(q) ||
      d.customerName.toLowerCase().includes(q) ||
      d.companyName.toLowerCase().includes(q) ||
      d.deliveryAddress.toLowerCase().includes(q)
    );
  };
  // Kept as two separate lists (not merged) so the History tab can render
  // Overdue as its own visually distinct section above the genuinely-
  // finished list -- a non-terminal delivery with a past date isn't "done,"
  // it still needs action, so it shouldn't read like the rest of History.
  const filteredOverdue = data.overdue.filter(historySearchMatch);
  const filteredTerminalHistory = data.history.filter(historySearchMatch);

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

            {/* Today tab (id: "today") — genuinely date-based since 2026-09-08
                (pickupDate === today), not a status-priority pin anymore. The
                one delivery this driver should currently be working on
                (workspaceDelivery -- open session, then paused, then
                pickupDate === today as a last resort, unchanged priority
                logic) still renders as a full live workspace at the top,
                unconditionally, even if its own date isn't today (the
                stale-session-recovery case) -- everything else with
                pickupDate === today shows as plain rows beneath it. */}
            {activeTab === "today" && !selectedDelivery && (
              <div className="flex flex-col gap-4">
                {workspaceDelivery && (
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
                          {workspaceDelivery.id}
                        </span>
                      </div>

                      <div className="mt-2">
                        <StageProgress status={workspaceDelivery.status} />
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
                            {workspaceDelivery.crew.truck.plateNumber}
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0 text-amber-700" />
                            <p className="text-[9px] text-slate-500">Pickup</p>
                          </div>
                          <p className="truncate text-xs font-bold text-slate-900">
                            {pickupWindowLabel(
                              workspaceDelivery.pickupTime,
                              workspaceDelivery.pickupTimeEnd,
                            )}
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <Wallet className="h-3 w-3 shrink-0 text-amber-700" />
                            <p className="text-[9px] text-slate-500">Fee</p>
                          </div>
                          <p className="truncate text-xs font-bold text-amber-900">
                            {workspaceDelivery.quotation
                              ? `₱${Number(workspaceDelivery.quotation.amount).toLocaleString()}`
                              : ""}
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
                    {isReturnTrip ? (
                      // 14_RETURN_TRIP_MONITORING.md, upgraded to full live
                      // turn-by-turn nav per explicit user request (the first
                      // pass shipped only a static distance readout) --
                      // ReturnTripNavigationMap is a deliberately separate
                      // component from LiveNavigationMap below, not that
                      // component reused with extra props, since this leg
                      // isn't part of the planned suggested_route at all (see
                      // that component's own header comment for the full
                      // reasoning, especially around log-reroute).
                      <ReturnTripNavigationMap livePosition={livePosition} />
                    ) : isDrivingStage ? (
                      <LiveNavigationMap
                        origin={activeNavOrigin}
                        destination={activeNavTarget}
                        stops={activeNavStops}
                        needsPickup={activeNeedsPickup}
                        pickupCoords={workspaceDelivery?.pickupCoords}
                        dropoffCoords={workspaceDelivery?.destinationCoords}
                        isDropoffFinal={isDropoffFinal}
                        allStops={workspaceDelivery?.stops}
                        livePosition={livePosition}
                        isPaused={isPausedTrip}
                        isMonitoring={isMonitoring}
                        nextLabel={statusCfg.nextLabel}
                        NextIcon={statusCfg.nextIcon}
                        nextColor={statusCfg.nextColor}
                        onPause={() => setConfirmingPause(true)}
                        onResume={() => setConfirmingResume(true)}
                        onStageAdvance={() => setConfirmingStageAdvance(true)}
                        deliveryRequestId={workspaceDelivery?.id}
                      />
                    ) : workspaceDelivery.pickupAddress && workspaceDelivery.deliveryAddress ? (
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
                        pickupAddress={workspaceDelivery.pickupAddress}
                        dropoffAddress={workspaceDelivery.deliveryAddress}
                        pickupCoordsProp={workspaceDelivery.pickupCoords}
                        dropoffCoordsProp={workspaceDelivery.destinationCoords}
                        stops={workspaceDelivery.stops}
                        suggestedRoute={workspaceDelivery.suggestedRoute}
                        deliveryRequestId={workspaceDelivery.id}
                        onSaved={(route) =>
                          setData((prev) => ({
                            ...prev,
                            workspace: { ...prev.workspace, suggestedRoute: route },
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
                              {workspaceDelivery.pickupAddress}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700">
                              D
                            </span>
                            <span className="truncate text-slate-600">
                              {workspaceDelivery.deliveryAddress}
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
                          <StatusBadge status={workspaceDelivery.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Customer
                            </p>
                            <p className="font-medium text-slate-900">
                              {workspaceDelivery.customerName}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Company
                            </p>
                            <p className="font-medium text-slate-900">
                              {workspaceDelivery.companyName}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Product Type
                            </p>
                            <p className="font-medium text-slate-900">
                              {workspaceDelivery.itemType}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500">
                              Schedule
                            </p>
                            <p className="font-medium text-slate-900">
                              {workspaceDelivery.pickupDate} at{" "}
                              {pickupWindowLabel(
                                workspaceDelivery.pickupTime,
                                workspaceDelivery.pickupTimeEnd,
                              )}
                            </p>
                          </div>
                        </div>
                      </section>

                      {/* Proof of Delivery — same self-gating section as
                    DeliveryDetailView, shown here too so it's visible on the
                    live workspace without navigating into history. */}
                      <ProofOfDeliverySection delivery={workspaceDelivery} />

                      {/* Delivery Fee — always visible */}
                      {workspaceDelivery.quotation && (
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
                                  workspaceDelivery.quotation.amount,
                                ).toLocaleString()}
                              </p>
                            </div>
                            {workspaceDelivery.quotation.breakdown?.length > 0 && (
                              <div className="space-y-1.5 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Breakdown
                                </p>
                                {workspaceDelivery.quotation.breakdown.map((item, idx) => (
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
                                      workspaceDelivery.quotation.amount,
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
                              {workspaceDelivery.crew.driver.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {workspaceDelivery.crew.driver.name}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {workspaceDelivery.crew.driver.phone}
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
                                {workspaceDelivery.crew.truck.plateNumber}
                              </span>
                              <span className="truncate text-slate-500">
                                &bull; {workspaceDelivery.crew.truck.truckType} &bull;{" "}
                                {workspaceDelivery.crew.truck.capacity}
                              </span>
                            </div>
                          </div>

                          {workspaceDelivery.crew.helpers?.length > 0 && (
                            <div className="sm:col-span-2">
                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Helpers ({workspaceDelivery.crew.helpers.length})
                              </p>
                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {workspaceDelivery.crew.helpers.map((helper) => (
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

                          {workspaceDelivery.assignedAt && (
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 sm:col-span-2">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              Assigned: {workspaceDelivery.assignedAt}
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

                  {/* 14_RETURN_TRIP_MONITORING.md's own footer -- deliberately
                separate from the Pause/Arrived/Advance bar below, since none
                of those apply to the return leg (no Pause Trip -- the return
                leg starts/ends automatically, not something to pause; no
                pickup/dropoff arrival to confirm). Just the optional manual
                fallback for the rare case the geofence never fires. */}
                  {isReturnTrip && (
                    <div className="sticky bottom-0 z-10 -mx-4 border-t border-amber-200/70 bg-white/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12">
                      <button
                        onClick={handleArrivedAtBase}
                        className="mx-auto flex w-full items-center justify-center gap-2 rounded-lg bg-amber-900 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-amber-800 sm:w-auto sm:min-w-[280px]"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Arrived at Base
                      </button>
                    </div>
                  )}

                  {/* Gated on isMonitoring OR nextLabel, not just nextLabel --
                FOR_PICKUP/OUT_FOR_DELIVERY (the driving stages, when
                LiveNavigationMap is on screen) both have nextLabel: null
                since Confirm Pickup/Complete Delivery moved to the Helper,
                which previously hid this entire bar including Pause Trip --
                the only way to pause was LiveNavigationMap's own duplicate
                fullscreen-footer button. isReturnTrip gets its own dedicated
                footer above instead -- none of Pause/Arrived/Advance apply
                to the return leg. */}
                  {!isPausedTrip && !isReturnTrip && (isMonitoring || statusCfg.nextLabel) && (
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
                        {isMonitoring &&
                          (activeNeedsPickup
                            ? !workspaceDelivery.pickupArrivedAt
                            : !workspaceDelivery.dropoffArrivedAt) && (
                            <button
                              onClick={() => setConfirmingArrival(true)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300 bg-white px-4 py-2.5 text-xs font-bold text-sky-900 transition hover:bg-sky-50"
                            >
                              <MapPin className="h-4 w-4" />
                              {activeNeedsPickup
                                ? "Arrived at Pickup"
                                : "Arrived at Drop-off"}
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
                )}

                {/* Every other pickupDate === today delivery, as plain rows --
                    the "hijack" complaint this date-based restructure fixes:
                    a genuinely same-day delivery no longer disappears into
                    Upcoming just because a different (possibly stale-dated)
                    delivery occupies the live workspace above. */}
                {data.today.filter((d) => d.id !== workspaceDelivery?.id)
                  .length > 0 && (
                  <div className="space-y-1.5">
                    {workspaceDelivery && (
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Also today
                      </p>
                    )}
                    {data.today
                      .filter((d) => d.id !== workspaceDelivery?.id)
                      .map((delivery) => (
                        <DeliveryRow
                          key={delivery.id}
                          delivery={delivery}
                          showTime
                          todayISO={todayISO}
                          onSelect={setSelectedDelivery}
                        />
                      ))}
                  </div>
                )}

                {!workspaceDelivery && data.today.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-amber-500" />
                    <p className="mt-2 text-xs font-semibold text-amber-800">
                      Nothing scheduled for today
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-600">
                      No delivery in progress, and nothing scheduled for today.
                    </p>
                    <button
                      onClick={() => setActiveTab("upcoming")}
                      className="mt-3 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-700"
                    >
                      View Upcoming Deliveries
                    </button>
                  </div>
                )}
              </div>
            )}
            {activeTab === "today" && selectedDelivery && (
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
            )}

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
                // Purely pickupDate > today now (2026-09-08) -- already
                // pre-filtered in loadDeliveries, no Overdue/Scheduled split
                // needed here anymore. A non-terminal delivery whose date has
                // already passed shows under the History tab's own "Overdue"
                // section instead (data.overdue) -- Upcoming only ever means
                // "not yet due."
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
                  {(data.overdue.length > 0 || data.history.length > 0) && (
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

                  {filteredOverdue.length === 0 &&
                  filteredTerminalHistory.length === 0 ? (
                    <p className="rounded-xl border border-amber-200/70 bg-white p-5 text-center text-[11px] text-slate-500">
                      {data.overdue.length === 0 && data.history.length === 0
                        ? "No delivery history yet."
                        : "No results match your search."}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Overdue: pickup_date already passed but status never
                          reached DELIVERED/COMPLETED/CANCELLED -- kept
                          visually separate from the finished list below so
                          it doesn't read as "done." Moved here from Upcoming
                          2026-09-08 when the tabs became date-based -- its
                          date has passed, so it belongs in History by date,
                          but it isn't finished, so it gets its own heading. */}
                      {filteredOverdue.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-red-600">
                            Not Started
                          </p>
                          {filteredOverdue.map((delivery) => (
                            <DeliveryRow
                              key={delivery.id}
                              delivery={delivery}
                              showTime
                              todayISO={todayISO}
                              onSelect={setSelectedDelivery}
                            />
                          ))}
                        </div>
                      )}
                      {filteredTerminalHistory.length > 0 && (
                        <div className="space-y-1.5">
                          {filteredOverdue.length > 0 && (
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Finished
                            </p>
                          )}
                          {filteredTerminalHistory.map((delivery) => (
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

      {confirmingArrival && (
        <div
          // z-[60] -- see confirmingStageAdvance's modal above for why.
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-arrival-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-sky-200/70 bg-white p-4 shadow-xl">
            <h2
              id="confirm-arrival-title"
              className="text-sm font-bold text-slate-900"
            >
              {activeNeedsPickup
                ? "Record arrival at pickup?"
                : "Record arrival at drop-off?"}
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              This just notes the time you arrived — it doesn't change your
              route or pause monitoring.{" "}
              {activeNeedsPickup
                ? "The Helper still confirms pickup separately."
                : "The Helper still confirms the dropoff separately."}
            </p>
            <div className="mt-4 flex gap-1.5">
              <button
                onClick={() => setConfirmingArrival(false)}
                disabled={isSubmittingTripAction}
                className="flex-1 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  runTripAction(markArrived, () => setConfirmingArrival(false))
                }
                disabled={isSubmittingTripAction}
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-sky-700 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingTripAction && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                {isSubmittingTripAction ? "Please wait…" : "Confirm Arrival"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 14B_ARRIVED_AT_BASE_CONFIRMATION.md -- same confirm-modal shape as
          confirmingArrival above, but the copy branches on whether livePosition
          is currently outside RETURN_TRIP_GEOFENCE_METERS of WAREHOUSE_COORDS.
          No hard block either way -- Confirm always stays available, this is
          a transparency heads-up, not an enforcement gate. */}
      {confirmingArrivedAtBase && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-arrived-at-base-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-4 shadow-xl">
            <h2
              id="confirm-arrived-at-base-title"
              className="text-sm font-bold text-slate-900"
            >
              {isFarFromBase
                ? "You're not at the warehouse yet"
                : "Confirm you've arrived at the warehouse?"}
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              {isFarFromBase
                ? `You're still about ${(distanceFromBaseMeters / 1000).toFixed(1)}km from the warehouse. If you close this now, your Supervisor will be able to see that you marked this trip complete before actually arriving — visible on this trip's report, not as an alert. Continue anyway?`
                : "This closes out monitoring for the drive back."}
            </p>
            <div className="mt-4 flex gap-1.5">
              <button
                onClick={() => setConfirmingArrivedAtBase(false)}
                disabled={isSubmittingTripAction}
                className="flex-1 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  runTripAction(endReturnTrip, () => setConfirmingArrivedAtBase(false))
                }
                disabled={isSubmittingTripAction}
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-900 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingTripAction && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                {isSubmittingTripAction ? "Please wait…" : "Confirm Arrival"}
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

      {/* Floating refresh button — bottom-right, always visible */}
      <button
        type="button"
        onClick={loadDeliveries}
        disabled={isLoadingDeliveries}
        className="fixed bottom-24 right-5 z-[75] flex h-14 w-14 items-center justify-center rounded-full bg-amber-900 shadow-xl shadow-amber-900/30 ring-1 ring-amber-700 transition hover:bg-amber-800 disabled:opacity-60"
        title="Refresh deliveries"
      >
        {isLoadingDeliveries ? (
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        ) : (
          <RefreshCw className="h-6 w-6 text-white" />
        )}
      </button>
    </DriverLayout>
  );
}

export default DriverDeliveries;
