import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GoogleMap,
  Marker as GoogleMapMarker,
  Polyline as GoogleMapPolyline,
  useJsApiLoader,
} from '@react-google-maps/api'
import {
  AlertTriangle,
  Calendar,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  EyeOff,
  Loader2,
  MapPin,
  Navigation,
  Pause,
  Repeat,
  Search,
  Truck,
  Wallet,
  X,
} from 'lucide-react'
import HelperLayout from '../layout/HelperLayout.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { resizeProofPhotoToBase64 } from '../lib/proofPhoto.js'
import { useResolvedAddress } from '../lib/reverseGeocode.js'
import { useResolvedStopCoords } from '../lib/forwardGeocode.js'
import { formatManilaShortTime, manilaTodayISO, MANILA_TIMEZONE } from '../lib/manilaTime.js'
import { GOOGLE_MAPS_LOADER_OPTIONS } from '../lib/googleMapsLoaderOptions.js'

// Same alert taxonomy DriverDeliveries.jsx uses (06_DROWSINESS_ALERT_PIPELINE.md)
// — kept in sync manually since the two pages don't share a module today.
const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: 'Prolonged Eye Closure',
  pattern_eye_closure_yawn: 'Eye Closure + Yawn',
  pattern_repeated_eye_closure: 'Repeated Eye Closure',
  face_not_detected: 'Eyes Not Detected',
}

const ALERT_TYPE_ICONS = {
  prolonged_eye_closure: EyeOff,
  pattern_eye_closure_yawn: AlertTriangle,
  pattern_repeated_eye_closure: Repeat,
  face_not_detected: CameraOff,
}

function formatAlertDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--'
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

// Pinned to Asia/Manila (see lib/manilaTime.js) -- previously regex-
// extracted the raw digit characters straight out of the UTC-stored ISO
// string with no timezone conversion at all, displaying the UTC clock
// reading mislabeled as local time (8 hours behind real Manila time).
function formatTimeOnly(value) {
  return formatManilaShortTime(value)
}

// Read-only mirror of DriverDeliveries.jsx's LiveMonitoringCard — same alert
// count/history/risk framing, but no audio (see 06_DROWSINESS_ALERT_PIPELINE.md's
// Helper visibility note: the Driver's own device audio is already audible to
// a co-riding Helper, so a second <audio> element would just double the sound).
function LiveAlertsCard({ alerts, isExpanded, onToggleExpanded }) {
  const alertCount = alerts.length
  const lastAlert = alerts[0] || null

  return (
    <section className="rounded-xl border border-teal-200/70 bg-white p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
          <EyeOff className="h-4 w-4 shrink-0 text-teal-700" />
          Drowsiness Monitoring
        </h3>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-2.5 py-2">
        <div>
          <p className="text-[10px] text-slate-500">Alerts this trip</p>
          <p className="text-sm font-bold text-slate-900">{alertCount}</p>
        </div>
      </div>

      {lastAlert ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-[11px]">
          {(() => {
            const LastAlertIcon = ALERT_TYPE_ICONS[lastAlert.type] || EyeOff
            return <LastAlertIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          })()}
          <span className="min-w-0 flex-1 truncate text-slate-700">
            Last alert: {ALERT_TYPE_LABELS[lastAlert.type] || lastAlert.type}
          </span>
          <span className="shrink-0 text-[10px] text-slate-400">{formatTimeOnly(lastAlert.time)}</span>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">No drowsiness alerts detected yet this trip.</p>
      )}

      {alertCount > 0 && (
        <button
          onClick={onToggleExpanded}
          className="mt-2 flex w-full items-center justify-between rounded-lg py-1 text-[11px] font-semibold text-teal-800"
        >
          {isExpanded ? 'Hide' : 'View'} alert history ({alertCount})
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}

      {isExpanded && alertCount > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {alerts.map((alert) => {
            const Icon = ALERT_TYPE_ICONS[alert.type] || EyeOff
            return (
              <div key={alert.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-[11px]">
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {ALERT_TYPE_LABELS[alert.type] || alert.type}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">{formatAlertDuration(alert.duration)}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{formatTimeOnly(alert.time)}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// Helper-facing workflow: Assigned -> Heading to Pickup -> Out for Delivery ->
// Delivered. Trip/Session state (Active/Paused, Start/Pause/Resume/End Trip)
// stays Driver-only — this page just reflects the same delivery_requests
// status the Driver's screen drives. But since 2026-08-12 the Helper DOES
// own completing each item in the chain (Confirm Pickup, dropoff, every
// stop) with a required proof photo — see 03_START_TRIP_AND_SESSION.md's
// "Helper visibility" note and 02B_MULTI_STOP_DELIVERIES.md.
const statusConfig = {
  ASSIGNED: {
    label: 'Assigned',
    badge: 'bg-indigo-100 text-indigo-700',
    banner: 'Waiting for the driver to start this trip.',
    bannerIcon: Clock,
  },
  FOR_PICKUP: {
    label: 'Heading to Pickup',
    badge: 'bg-cyan-100 text-cyan-700',
    banner: 'The driver is heading to the pickup location.',
    bannerIcon: MapPin,
  },
  OUT_FOR_DELIVERY: {
    label: 'Out for Delivery',
    badge: 'bg-blue-100 text-blue-700',
    banner: 'The driver is delivering to the drop-off location.',
    bannerIcon: Navigation,
  },
  DELIVERED: {
    label: 'Delivered',
    badge: 'bg-teal-100 text-teal-700',
    banner: null,
    bannerIcon: null,
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-green-100 text-green-700',
    banner: null,
    bannerIcon: null,
  },
}

// Maps delivery_requests.status (the backend/Driver-driven values) to this
// page's simplified stage labels — same mapping DriverDeliveries.jsx uses,
// since both UIs describe the same underlying status.
const DB_TO_HELPER_STATUS = {
  ASSIGNED: 'ASSIGNED',
  OUT_FOR_PICKUP: 'FOR_PICKUP',
  ARRIVED_PICKUP: 'OUT_FOR_DELIVERY',
  OUT_FOR_DROPOFF: 'OUT_FOR_DELIVERY',
  ARRIVED_DROPOFF: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
}

// Today's date as "YYYY-MM-DD" in Asia/Manila (see lib/manilaTime.js) --
// previously used the *browser's* local date, correct only by coincidence
// when the browser happens to already be set to Manila time.
function localTodayISO() {
  return manilaTodayISO()
}

// Some pickup/dropoff locations are stored as a "lat, lng" coordinate pair
// rather than a street address — parse those back into coords for the maps.
function parseCoords(value) {
  if (!value) return null
  const m = String(value).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

// Full ordered legend -- Pickup, then every Dropoff/Stop in the same
// nearest-first order a computed `legs` route actually visits them. Mirrors
// DriverDeliveries.jsx's own buildRouteLegend exactly (not shared, per this
// codebase's existing per-portal convention) -- see its comment for why
// this walks `legs` rather than recomputing the ordering here. Falls back
// to a plain Pickup/Dropoff pair when no route exists yet.
function buildRouteLegend(legs, pickupAddress, dropoffAddress, stops, stopCoords) {
  if (!legs) {
    return [
      { key: 'pickup', badge: 'P', badgeBg: 'bg-sky-100', badgeText: 'text-sky-700', address: pickupAddress },
      { key: 'dropoff', badge: 'D', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700', address: dropoffAddress },
    ]
  }
  let stopNum = 1
  return legs.map((leg) => {
    if (leg.to === 'pickup') {
      return { key: 'pickup', badge: 'P', badgeBg: 'bg-sky-100', badgeText: 'text-sky-700', address: pickupAddress }
    }
    if (leg.to === 'dropoff') {
      return { key: 'dropoff', badge: 'D', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700', address: dropoffAddress }
    }
    stopNum += 1
    const [endLat, endLng] = leg.path[leg.path.length - 1]
    let bestAddress = null
    let bestDist = Infinity
    for (const s of stops || []) {
      const c = parseCoords(s.location) || stopCoords[s.location]
      if (!c) continue
      const d = (c.lat - endLat) ** 2 + (c.lng - endLng) ** 2
      if (d < bestDist) {
        bestDist = d
        bestAddress = s.location
      }
    }
    return { key: `stop-${stopNum}`, badge: String(stopNum), badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', address: bestAddress || `Stop ${stopNum}` }
  })
}

// Plain-JS haversine, no google.maps dependency -- mirrors DriverDeliveries.jsx's
// own distanceMeters helper exactly, used to pick which Delivery Chain item
// is nearest the truck's live position (see the "Next" flag in chainItems
// below, 02B_MULTI_STOP_DELIVERIES.md's "Dynamic Nearest-Dropoff Ordering").
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatAssignedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PH', {
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Shapes the admin-users get-helper-deliveries payload into what this page
// renders — mirrors DriverDeliveries.jsx's mapDelivery for the same reason:
// the client can't read delivery_requests/*_records directly (service_role
// only, see DATABASE.md / SUPABASE_GOTCHAS.md #8).
// Pickup Time is a customer-selected window (start + end), e.g. "07:00 -
// 07:15" -- falls back to a single time for legacy rows with no window end.
function pickupWindowLabel(pickupTime, pickupTimeEnd) {
  return pickupTimeEnd ? `${pickupTime} - ${pickupTimeEnd}` : pickupTime
}

function mapDelivery(d) {
  const str = (v) => (v == null ? '' : String(v))
  return {
    id: str(d.id),
    customerName: str(d.customerName) || 'Customer',
    companyName: str(d.companyName),
    itemType: str(d.itemType),
    pickupDate: str(d.pickupDate),
    pickupTime: str(d.pickupTime),
    pickupTimeEnd: d.pickupTimeEnd ? str(d.pickupTimeEnd) : '',
    pickupAddress: str(d.pickupAddress),
    deliveryAddress: str(d.deliveryAddress),
    // Pickup -> Dropoff -> Stops chain the Helper completes with a required
    // proof photo per item — see 02B_MULTI_STOP_DELIVERIES.md.
    stops: Array.isArray(d.stops) ? d.stops : [],
    // Frozen planned route, if the Driver's pre-trip screen already
    // computed+saved one -- read-only here, see RouteOverviewMap below.
    suggestedRoute: Array.isArray(d.suggestedRoute) ? d.suggestedRoute : null,
    pickupPhotoUrl: d.pickupPhotoUrl || null,
    dropoffPhotoUrl: d.dropoffPhotoUrl || null,
    dropoffCompletedAt: d.dropoffCompletedAt || null,
    status: DB_TO_HELPER_STATUS[d.status] || str(d.status),
    hasOpenSession: Boolean(d.hasOpenSession),
    sessionId: d.sessionId || null,
    assignedAt: formatAssignedAt(d.assignedAt),
    quotation: d.quotation ? { amount: Number(d.quotation.amount) } : null,
    crew: {
      driver: d.driver ? { id: str(d.driver.id), name: str(d.driver.name), phone: str(d.driver.phone) } : { id: '', name: 'Unassigned', phone: '' },
      helpers: d.helpers || [],
      truck: d.truck
        ? { plateNumber: str(d.truck.plateNumber), truckType: str(d.truck.truckType), capacity: str(d.truck.capacity || '') }
        : { plateNumber: '—', truckType: '', capacity: '' },
    },
    pickupCoords: (d.pickupLat != null && d.pickupLng != null) ? { lat: d.pickupLat, lng: d.pickupLng } : parseCoords(d.pickupAddress),
    destinationCoords: (d.dropoffLat != null && d.dropoffLng != null) ? { lat: d.dropoffLat, lng: d.dropoffLng } : parseCoords(d.deliveryAddress),
  }
}

function toGoogleMapEmbed(coords) {
  if (!coords) return 'https://maps.google.com/maps?q=14.5995,120.9842&z=12&output=embed'
  return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=15&output=embed`
}

const GOOGLE_MAP_CONTAINER_STYLE = { width: '100%', height: '100%' }
// Mirrors DriverDeliveries.jsx's own NAV_LEG_COLORS exactly (not shared, per
// this codebase's existing per-portal convention) -- one color per leg of
// the Warehouse -> Pickup -> Dropoff -> Stop 1 -> ... chain, index 0
// reserved for the to-pickup leg.
const NAV_LEG_COLORS = ['#DC2626', '#2563EB', '#059669', '#7C3AED', '#EA580C', '#DB2777']

const DROPOFF_PIN_PATH =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'
function dropoffPinIcon(fillColor) {
  return {
    path: DROPOFF_PIN_PATH,
    fillColor,
    fillOpacity: 0.65,
    strokeColor: '#fff',
    strokeWeight: 1.5,
    scale: 1.25,
    anchor: new window.google.maps.Point(12, 22),
    labelOrigin: new window.google.maps.Point(12, 9),
  }
}

function svgMarkerIcon(svg, size) {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(size, size * 1.2),
    anchor: new window.google.maps.Point(size / 2, size * 1.2),
  }
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
  )
}

function dropoffMarkerIcon() {
  return svgMarkerIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="41" viewBox="0 0 34 41">
      <path d="M17 1C8.4 1 1.5 7.9 1.5 16.4 1.5 27.6 17 40 17 40s15.5-12.4 15.5-23.6C32.5 7.9 25.6 1 17 1z" fill="#059669" stroke="#fff" stroke-width="2"/>
      <path d="M13 8v18" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M13 8.5h11l-3.4 3.75L24 16H13z" fill="#fff"/>
    </svg>`,
    34,
  )
}

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
  )
}

// Read-only whole-trip route preview, mirroring DriverDeliveries.jsx's
// PlannedRouteMap visually (same marker icons/leg colors) but never
// computing or saving a route itself -- unlike the Driver, a Helper isn't
// authorized to call driver-trip's save-suggested-route action (assigned
// Driver only, would 403). Purely renders whatever suggestedRoute the
// Driver's own pre-trip screen has already computed and saved; falls back
// to the original static single-point embed until one exists.
function RouteOverviewMap({ suggestedRoute, dropoffCoords }) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)
  const mapRef = useRef(null)
  const legs = suggestedRoute

  const warehousePos = legs?.[0]?.path?.[0]
  const pickupLeg = legs?.find((leg) => leg.to === 'pickup')
  const pickupPos = pickupLeg ? pickupLeg.path[pickupLeg.path.length - 1] : null
  const dropoffLeg = legs?.find((leg) => leg.to === 'dropoff')
  const dropoffPos = dropoffLeg ? dropoffLeg.path[dropoffLeg.path.length - 1] : null
  // Whether the real dropoff is genuinely the last leg -- Dynamic
  // Nearest-Dropoff Ordering (02B_MULTI_STOP_DELIVERIES.md) can place it
  // before a stop instead, and the flag icon means "this is the actual end
  // of the trip," which would be misleading then (mirrors DriverDeliveries.
  // jsx's own PlannedRouteMap fix).
  const isDropoffFinal = legs?.[legs.length - 1]?.to === 'dropoff'
  const stopPositions = (legs || []).filter((leg) => leg.to === 'stop').map((leg) => leg.path[leg.path.length - 1])

  useEffect(() => {
    if (!mapRef.current || !window.google || !legs?.length) return
    const bounds = new window.google.maps.LatLngBounds()
    legs.forEach((leg) => leg.path.forEach(([lat, lng]) => bounds.extend({ lat, lng })))
    mapRef.current.fitBounds(bounds, 16)
  }, [legs])

  if (!legs) {
    return (
      <iframe
        title="Route Map"
        src={toGoogleMapEmbed(dropoffCoords)}
        className="h-48 w-full sm:h-56"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    )
  }

  return (
    <div className="h-48 w-full sm:h-56">
      {!isLoaded ? (
        <div className="flex h-full items-center justify-center text-xs text-slate-400">Loading map…</div>
      ) : (
        <GoogleMap
          mapContainerStyle={GOOGLE_MAP_CONTAINER_STYLE}
          onLoad={(map) => {
            mapRef.current = map
          }}
          options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' }}
        >
          {legs.map((leg, i) => (
            <GoogleMapPolyline
              key={i}
              path={leg.path.map(([lat, lng]) => ({ lat, lng }))}
              options={{
                strokeColor: NAV_LEG_COLORS[i % NAV_LEG_COLORS.length],
                strokeOpacity: 0.9,
                strokeWeight: 5,
              }}
            />
          ))}
          {warehousePos && <GoogleMapMarker position={{ lat: warehousePos[0], lng: warehousePos[1] }} icon={warehouseMarkerIcon()} />}
          {pickupPos && <GoogleMapMarker position={{ lat: pickupPos[0], lng: pickupPos[1] }} icon={pickupMarkerIcon()} />}
          {dropoffPos && (
            <GoogleMapMarker
              position={{ lat: dropoffPos[0], lng: dropoffPos[1] }}
              icon={isDropoffFinal ? dropoffMarkerIcon() : dropoffPinIcon('#059669')}
            />
          )}
          {stopPositions.map((pos, i) => (
            <GoogleMapMarker
              key={i}
              position={{ lat: pos[0], lng: pos[1] }}
              label={{ text: String(i + 2), color: '#fff', fontSize: '11px', fontWeight: '700' }}
              icon={dropoffPinIcon('#d97706')}
            />
          ))}
        </GoogleMap>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status]
  if (!cfg) return null
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cfg.badge}`}>
      {cfg.label}
    </span>
  )
}

function TodayBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      Today
    </span>
  )
}

// The helper's workflow, start to finish. The helper can advance the delivery
// through every stage, like the driver, until "Delivered" ends their job.
const HELPER_STAGES = [
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'FOR_PICKUP', label: 'Pickup' },
  { key: 'OUT_FOR_DELIVERY', label: 'Delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
]

function StageProgress({ status }) {
  const idx = HELPER_STAGES.findIndex((stage) => stage.key === status)
  return (
    <div className="grid grid-cols-4">
      {HELPER_STAGES.map((stage, i) => {
        const isDone = i < idx
        const isCurrent = i === idx
        return (
          <div key={stage.key} className="flex flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : i <= idx ? 'bg-teal-900' : 'bg-teal-100'}`} />
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  isDone
                    ? 'bg-teal-900'
                    : isCurrent
                      ? 'bg-teal-900 ring-2 ring-teal-200'
                      : 'bg-teal-100'
                }`}
              >
                {isDone && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </span>
              <div className={`h-0.5 flex-1 ${i === HELPER_STAGES.length - 1 ? 'invisible' : isDone ? 'bg-teal-900' : 'bg-teal-100'}`} />
            </div>
            <span
              className={`text-center text-[8px] font-semibold uppercase leading-tight ${
                isCurrent ? 'text-teal-900' : isDone ? 'text-slate-400' : 'text-slate-300'
              }`}
            >
              {stage.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function DeliveryRow({ delivery, showTime, todayISO, onSelect }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(delivery)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(delivery)}
      className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-teal-200/70 bg-white p-3 transition hover:border-teal-300 hover:bg-teal-50/40 active:bg-teal-50"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusConfig[delivery.status]?.badge || 'bg-slate-100 text-slate-700'}`}>
            {statusConfig[delivery.status]?.label || delivery.status}
          </span>
          <p className="truncate text-xs font-semibold text-slate-900">
            {delivery.id} &bull; {delivery.companyName}
          </p>
          {delivery.pickupDate === todayISO && <TodayBadge />}
        </div>
        <p className="truncate text-[11px] text-slate-600">{delivery.deliveryAddress}</p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {delivery.crew.truck.plateNumber}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {delivery.pickupDate}{showTime ? ` • ${pickupWindowLabel(delivery.pickupTime, delivery.pickupTimeEnd)}` : ''}
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </div>
  )
}

// Crew card used in the detail views. For the helper portal the crew's own
// member — the signed-in helper — is the highlighted person, not the driver
// or every helper on the assignment.
function CrewMemberCard({ member, badgeLabel, isHighlighted = false }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-2.5 ${
        isHighlighted
          ? 'border-teal-200 bg-teal-50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
          isHighlighted ? 'bg-teal-900' : 'bg-slate-400'
        }`}
      >
        {member.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-900">{member.name}</p>
        {member.phone && <p className="text-[10px] text-slate-500">{member.phone}</p>}
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isHighlighted ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {badgeLabel}
        {isHighlighted ? ' · You' : ''}
      </span>
    </div>
  )
}

// Proof-of-delivery photos for a completed chain (Pickup -> Dropoff ->
// Stops) — one small block per portal file rather than a shared component,
// matching this codebase's existing per-portal convention (see
// 02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md's "On a shared component" note).
// Only renders items that actually have a photo -- a delivery with stops
// still in progress has photos for the items completed so far only.
function ProofOfDeliverySection({ delivery }) {
  const items = [
    delivery.pickupPhotoUrl && { label: 'Pickup', photoUrl: delivery.pickupPhotoUrl, completedAt: null },
    delivery.dropoffPhotoUrl && { label: 'Drop-off', photoUrl: delivery.dropoffPhotoUrl, completedAt: delivery.dropoffCompletedAt },
    ...(delivery.stops || [])
      .map((stop, i) => stop.completed && stop.photoUrl && { label: `Dropoff ${i + 2}`, photoUrl: stop.photoUrl, completedAt: stop.completedAt }),
  ].filter(Boolean)

  return (
    <section className="rounded-xl border border-teal-200/70 bg-white p-3 sm:p-4">
      <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900">
        <Camera className="h-4 w-4 text-teal-700" />
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
            className="group overflow-hidden rounded-lg border border-teal-200/70"
          >
            <img src={item.photoUrl} alt={`${item.label} proof of delivery`} className="h-20 w-full object-cover transition group-hover:opacity-90" />
            <div className="px-1.5 py-1">
              <p className="truncate text-[10px] font-semibold text-slate-900">{item.label}</p>
              {item.completedAt && (
                <p className="truncate text-[9px] text-slate-500">{formatAssignedAt(item.completedAt)}</p>
              )}
            </div>
          </a>
        ))}
      </div>
      )}
    </section>
  )
}

// Detail screen for a delivery — same layout as the driver's, minus the
// Delivery Report section (driver behavior/route analysis is not part of the
// helper module).
function DeliveryDetailView({ delivery, onBack, currentHelperName }) {
  const isCurrentHelper = (member) =>
    Boolean(currentHelperName) && member.name.trim().toLowerCase() === currentHelperName.trim().toLowerCase()
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1 rounded-lg border border-teal-200/70 bg-white px-2.5 py-1.5 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-900">
            {delivery.id} &bull; {delivery.companyName}
          </h2>
          <p className="truncate text-xs text-slate-600">{delivery.customerName}</p>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {/* Delivery Overview */}
          <section className="rounded-xl border border-teal-200/70 bg-white p-3 sm:p-4">
            <h3 className="text-xs font-bold text-slate-900">Delivery Overview</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] text-slate-500">Customer</p>
                <p className="font-medium text-slate-900">{delivery.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Company</p>
                <p className="font-medium text-slate-900">{delivery.companyName}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Product Type</p>
                <p className="font-medium text-slate-900">{delivery.itemType}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Schedule</p>
                <p className="font-medium text-slate-900">{delivery.pickupDate} at {pickupWindowLabel(delivery.pickupTime, delivery.pickupTimeEnd)}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2.5 border-t border-teal-100 pt-3 text-xs">
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500">Pickup Address</p>
                  <p className="font-medium text-slate-900">{delivery.pickupAddress}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500">Drop-off Address</p>
                  <p className="font-medium text-slate-900">{delivery.deliveryAddress}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Proof of Delivery — ProofOfDeliverySection self-gates on
              whichever chain items actually have a photo, so a Trip still
              in progress shows just what's been captured so far rather than
              waiting for Delivered/Completed. */}
          <ProofOfDeliverySection delivery={delivery} />

          {/* Delivery Fee — always visible */}
          {delivery.quotation && (
            <section className="rounded-xl border border-teal-200/70 bg-white p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-900">Delivery Fee</h3>
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-xs font-medium text-emerald-800">
                    PHP {Number(delivery.quotation.amount).toLocaleString()}
                  </p>
                </div>
                {delivery.quotation.breakdown?.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-teal-200/70 bg-teal-50 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Breakdown</p>
                    {delivery.quotation.breakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-slate-600">{item.label}</span>
                        <span className="font-medium text-slate-800">₱{Number(item.amount).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-teal-300 pt-1.5 text-xs font-bold">
                      <span className="text-slate-800">Total</span>
                      <span className="text-slate-800">₱{Number(delivery.quotation.amount).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* Crew & Truck — helpers are the highlighted members here. */}
          <section className="rounded-xl border border-teal-200/70 bg-white p-3 sm:p-4">
            <h3 className="text-xs font-bold text-slate-900">Crew &amp; Truck</h3>
            <div className="mt-3 space-y-2.5">
              <CrewMemberCard member={delivery.crew.driver} badgeLabel="Driver" />

              {delivery.crew.helpers?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Helpers ({delivery.crew.helpers.length})
                  </p>
                  <div className="space-y-1.5">
                    {delivery.crew.helpers.map((helper) => (
                      <CrewMemberCard key={helper.id} member={helper} badgeLabel="Helper" isHighlighted={isCurrentHelper(helper)} />
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-teal-200/70 bg-white p-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Truck</p>
                <div className="flex items-center gap-2 text-xs">
                  <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-900">{delivery.crew.truck.plateNumber}</span>
                  <span className="truncate text-slate-500">&bull; {delivery.crew.truck.truckType} &bull; {delivery.crew.truck.capacity}</span>
                </div>
              </div>

              {delivery.assignedAt && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  Assigned: {delivery.assignedAt}
                </div>
              )}
            </div>
          </section>

          {/* Route Overview — same whole-trip guide DriverDeliveries.jsx's
              pre-trip screen shows (Warehouse -> Pickup -> Dropoff -> Stops,
              one colored polyline per leg), read-only here: renders whatever
              the Driver's own PlannedRouteMap has already computed and
              saved, falling back to the original static single-point embed
              until one exists. */}
          <section className="overflow-hidden rounded-xl border border-teal-200/70">
            <div className="border-b border-teal-200/70 bg-teal-50 px-3 py-2">
              <h3 className="text-xs font-bold text-slate-900">Route Overview</h3>
            </div>
            <RouteOverviewMap suggestedRoute={delivery.suggestedRoute} dropoffCoords={delivery.destinationCoords} />
          </section>
        </div>
      </div>
    </div>
  )
}

const DELIVERY_TABS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
]

function TabButton({ label, count, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border-b-2 py-2 text-xs font-semibold transition ${
        isActive ? 'border-teal-900 text-teal-900' : 'border-transparent text-slate-400 hover:text-slate-600'
      }`}
    >
      {label}
      {count > 0 && <span className="ml-1 text-[10px] font-normal opacity-60">{count}</span>}
    </button>
  )
}

function HelperDeliveries() {
  const [data, setData] = useState({ active: null, upcoming: [], completed: [] })
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(true)
  const [deliveriesError, setDeliveriesError] = useState('')
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('today')
  const [currentHelperName, setCurrentHelperName] = useState('')
  const [liveAlerts, setLiveAlerts] = useState([])
  const [isAlertHistoryExpanded, setIsAlertHistoryExpanded] = useState(false)
  // Truck's live GPS position, used only to flag which Delivery Chain item
  // is "Next" per the nearest-dropoff logic below -- see the gps_logs
  // subscription further down.
  const [livePosition, setLivePosition] = useState(null)
  // Success confirmation shown after a chain-item photo upload completes
  // (submitChainAction below) -- { label, isFinal }. Mirrors
  // DriverDeliveries.jsx's completionNotice toast (same auto-dismiss
  // pattern), added 2026-08-14 since submitChainAction previously just
  // closed the modal silently on success with no confirmation the upload
  // actually went through.
  const [chainSuccessNotice, setChainSuccessNotice] = useState(null)

  // Photo-required chain completion (Pickup -> Dropoff -> Stops), see
  // 02B_MULTI_STOP_DELIVERIES.md. confirmingChainItem identifies which row's
  // modal is open: { type: 'pickup' } | { type: 'dropoff' } | { type: 'stop', index }.
  const [confirmingChainItem, setConfirmingChainItem] = useState(null)
  const [chainPhotoBase64, setChainPhotoBase64] = useState(null)
  const [chainPhotoPreviewUrl, setChainPhotoPreviewUrl] = useState(null)
  const [chainPhotoError, setChainPhotoError] = useState('')
  const [isSubmittingChainAction, setIsSubmittingChainAction] = useState(false)
  const chainPreviewUrlRef = useRef(null)

  const active = data.active
  // Resolves a "lat, lng"-shaped pickup/dropoff (e.g. DR-0020's fixture data)
  // into a human-readable address for the status/Summary card -- a no-op for
  // deliveries that already store a real street address.
  const resolvedPickupAddress = useResolvedAddress(active?.pickupAddress || '')
  const resolvedDeliveryAddress = useResolvedAddress(active?.deliveryAddress || '')
  // Stop coordinates for the Summary card's ordered legend below (see
  // statusCardLegend) -- same Photon-based resolution the Driver's own
  // PlannedRouteMap uses for its route computation, needed here too so a
  // 'stop' leg's endpoint can be matched back to its address.
  const activeStopLocations = (active?.stops || []).map((s) => s.location)
  const { coordsByLocation: activeStopCoords } = useResolvedStopCoords(activeStopLocations)
  // Full ordered legend for the Summary card -- Pickup, then every
  // Dropoff/Stop in the same nearest-first order the Driver's Planned
  // Route/Live Navigation actually visit them, not just a fixed
  // Pickup/Dropoff pair.
  const statusCardLegend = active
    ? buildRouteLegend(active.suggestedRoute, resolvedPickupAddress, resolvedDeliveryAddress, active.stops, activeStopCoords)
    : []
  const statusCfg = active ? statusConfig[active.status] : null
  const todayISO = localTodayISO()
  // Boolean(active), not a pickupDate === today check — a delivery with a
  // genuinely open Session (see loadDeliveries' activeDelivery selection
  // above) must still render as the active workspace even if its
  // pickup_date isn't today. Mirrors DriverDeliveries.jsx's identical fix.
  const hasActiveDelivery = Boolean(active)
  const todayCount = hasActiveDelivery ? 1 : 0
  const upcomingCount = data.upcoming.length
  const pastCount = data.completed.length

  // Same "Paused isn't a stored value" read as DriverDeliveries.jsx — a delivery
  // past ASSIGNED with no open Session means the driver has paused the trip.
  const isDrivingStage = Boolean(active) && (active.status === 'FOR_PICKUP' || active.status === 'OUT_FOR_DELIVERY')
  const isPausedTrip = isDrivingStage && !active.hasOpenSession
  const isMonitoring = isDrivingStage && active?.hasOpenSession

  const isCurrentHelper = (member) =>
    Boolean(currentHelperName) && member.name.trim().toLowerCase() === currentHelperName.trim().toLowerCase()

  const chainItemKey = (item) => (item.type === 'stop' ? `stop-${item.index}` : item.type)

  // The full completion chain for the active delivery, in the real order
  // (Pickup -> Dropoff -> Stops, not "stops between a fixed pickup/dropoff")
  // — see 02B_MULTI_STOP_DELIVERIES.md. Each item's Complete button is only
  // actionable at the specific stage that item belongs to; once the whole
  // delivery is DELIVERED every button disappears regardless of which
  // individual items happened to get completed (no ordering is enforced
  // server-side, so dropoff can end up never completed if the last stop
  // was completed directly — that's accepted, not a bug).
  const chainItems = active
    ? (() => {
        const items = [
          {
            type: 'pickup',
            label: 'Pickup',
            location: active.pickupAddress,
            done: active.status !== 'FOR_PICKUP',
            photoUrl: active.pickupPhotoUrl,
            actionable: active.status === 'FOR_PICKUP',
          },
          {
            type: 'dropoff',
            label: 'Dropoff',
            location: active.deliveryAddress,
            done: Boolean(active.dropoffCompletedAt),
            photoUrl: active.dropoffPhotoUrl,
            actionable: active.status === 'OUT_FOR_DELIVERY' && !active.dropoffCompletedAt,
          },
          ...active.stops.map((stop, index) => ({
            type: 'stop',
            index,
            // "Dropoff N" naming, not "Stop N" -- every point after Pickup is
            // conceptually another dropoff (Dropoff itself is implicitly
            // "Dropoff 1"), keeps the chain's vocabulary consistent end to end
            // (Delivery Chain list, confirm modal, Proof of Delivery labels).
            label: `Dropoff ${index + 2}`,
            location: stop.location,
            done: Boolean(stop.completed),
            photoUrl: stop.photoUrl,
            actionable: active.status === 'OUT_FOR_DELIVERY' && !stop.completed,
          })),
        ]

        // "Next" highlight (02B_MULTI_STOP_DELIVERIES.md's "Dynamic
        // Nearest-Dropoff Ordering", 2026-08-14) -- purely informational,
        // doesn't change which buttons are actionable above (completion
        // order is still unenforced server-side). Pickup is always first
        // when undone. After that, whichever remaining dropoff/stop is
        // nearest the truck's live position gets the flag, matching what
        // the driver's own nav is routing to; falls back to the first
        // remaining item in chain order if no live position has arrived yet
        // or none of the remaining items have parseable coordinates.
        let nextKey = null
        if (!items[0].done) {
          nextKey = 'pickup'
        } else {
          const undone = items.slice(1).filter((it) => !it.done)
          if (undone.length > 0) {
            const rankable = undone
              .map((it) => ({ item: it, coords: parseCoords(it.location) }))
              .filter((c) => c.coords)
            const nearest = livePosition && rankable.length > 0
              ? rankable.reduce((best, c) => {
                  const d = distanceMeters(livePosition.lat, livePosition.lng, c.coords.lat, c.coords.lng)
                  return !best || d < best.distance ? { ...c, distance: d } : best
                }, null)
              : null
            nextKey = chainItemKey(nearest ? nearest.item : undone[0])
          }
        }

        return items.map((it) => ({ ...it, isNext: nextKey !== null && chainItemKey(it) === nextKey }))
      })()
    : []

  const openChainModal = (item) => {
    setConfirmingChainItem(item)
    setChainPhotoBase64(null)
    setChainPhotoError('')
    if (chainPreviewUrlRef.current) URL.revokeObjectURL(chainPreviewUrlRef.current)
    chainPreviewUrlRef.current = null
    setChainPhotoPreviewUrl(null)
  }

  const closeChainModal = () => {
    if (isSubmittingChainAction) return
    setConfirmingChainItem(null)
    setChainPhotoBase64(null)
    setChainPhotoError('')
    if (chainPreviewUrlRef.current) URL.revokeObjectURL(chainPreviewUrlRef.current)
    chainPreviewUrlRef.current = null
    setChainPhotoPreviewUrl(null)
  }

  const handleChainPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setChainPhotoError('')
    try {
      const base64 = await resizeProofPhotoToBase64(file)
      setChainPhotoBase64(base64)
      if (chainPreviewUrlRef.current) URL.revokeObjectURL(chainPreviewUrlRef.current)
      const previewUrl = URL.createObjectURL(file)
      chainPreviewUrlRef.current = previewUrl
      setChainPhotoPreviewUrl(previewUrl)
    } catch (err) {
      setChainPhotoError(err.message || 'Failed to process the photo. Please try another.')
    }
  }

  const submitChainAction = async () => {
    if (!confirmingChainItem || !chainPhotoBase64 || isSubmittingChainAction) return
    setIsSubmittingChainAction(true)
    setChainPhotoError('')
    try {
      let result
      if (confirmingChainItem.type === 'pickup') {
        result = await supabase.functions.invoke('admin-users', {
          body: {
            action: 'update-driver-delivery',
            deliveryId: active.id,
            status: 'OUT_FOR_DROPOFF',
            fileBase64: chainPhotoBase64,
            contentType: 'image/jpeg',
          },
        })
      } else if (confirmingChainItem.type === 'dropoff') {
        result = await supabase.functions.invoke('admin-users', {
          body: {
            action: 'complete-dropoff',
            deliveryId: active.id,
            fileBase64: chainPhotoBase64,
            contentType: 'image/jpeg',
          },
        })
      } else {
        result = await supabase.functions.invoke('admin-users', {
          body: {
            action: 'complete-stop',
            deliveryId: active.id,
            stopIndex: confirmingChainItem.index,
            fileBase64: chainPhotoBase64,
            contentType: 'image/jpeg',
          },
        })
      }

      if (result.error) {
        const serverMessage = await result.error.context?.json?.().then((b) => b?.error).catch(() => null)
        setChainPhotoError(serverMessage || 'Failed to submit. Please try again.')
        return
      }

      // Whichever action turns out to close the chain's last item also needs
      // driver-trip's end-trip called next (closes the Session, computes
      // mileage) — same two-call order DriverDeliveries.jsx's old Complete
      // Delivery button used, just triggered dynamically now instead of by a
      // fixed button (see admin-users' complete-dropoff/complete-stop).
      if (result.data?.isFinal) {
        const { error: endTripError } = await supabase.functions.invoke('driver-trip', {
          body: { action: 'end-trip', deliveryRequestId: active.id },
        })
        if (endTripError) {
          setChainPhotoError('Photo saved, but closing out the trip failed. Please try again.')
          return
        }
      }

      await loadDeliveries()
      setChainSuccessNotice({
        label:
          confirmingChainItem.type === 'pickup'
            ? 'Pickup'
            : confirmingChainItem.type === 'dropoff'
              ? 'Dropoff'
              : `Dropoff ${confirmingChainItem.index + 2}`,
        isFinal: Boolean(result.data?.isFinal),
      })
      closeChainModal()
    } finally {
      setIsSubmittingChainAction(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    async function loadOwnProfile() {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'get-own-profile' },
      })

      if (isMounted && !error) {
        const fullName = [data.profile.first_name, data.profile.middle_name, data.profile.last_name]
          .filter(Boolean)
          .join(' ')
        setCurrentHelperName(fullName)
      }
    }

    loadOwnProfile()

    return () => {
      isMounted = false
    }
  }, [])

  // Extracted so both the initial load and the Realtime subscription below
  // (any change to delivery_requests re-runs this) can share it — same
  // "refresh on change" pattern SupDeliveries.jsx already uses for its own
  // delivery_requests subscription.
  const loadDeliveries = useCallback(async () => {
    setIsLoadingDeliveries(true)
    setDeliveriesError('')
    const { data: result, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'get-helper-deliveries' },
    })
    if (error) {
      setDeliveriesError('Failed to load your deliveries. Please try again.')
      setData({ active: null, upcoming: [], completed: [] })
      setIsLoadingDeliveries(false)
      return
    }
    const mapped = (result?.deliveries || []).map(mapDelivery)
    const today = localTodayISO()
    const nonArchived = mapped
      .filter((d) => d.status !== 'DELIVERED' && d.status !== 'COMPLETED')
      .sort((a, b) => String(a.pickupDate || '').localeCompare(String(b.pickupDate || '')))
    // A delivery with a genuinely open Session takes priority over "today's"
    // delivery — a stale open Session on a different pickup_date must still
    // surface as Active so its chain-completion actions stay reachable. Same
    // fix DriverDeliveries.jsx already got for this (see STATUS.md's
    // 2026-08-11 incident, driver D002/DR-0015 stuck ~64h) — found here again
    // 2026-08-12 while testing the new Helper-owned chain-completion actions,
    // which were otherwise unreachable for any delivery not dated today.
    const activeDelivery = nonArchived.find((d) => d.hasOpenSession) || nonArchived.find((d) => d.pickupDate === today) || null
    setData({
      active: activeDelivery,
      upcoming: nonArchived.filter((d) => d.id !== (activeDelivery && activeDelivery.id)),
      completed: mapped.filter((d) => d.status === 'DELIVERED' || d.status === 'COMPLETED'),
    })
    setIsLoadingDeliveries(false)
  }, [])

  useEffect(() => {
    // Initial fetch on mount, same shape as every other data-load effect in
    // this file (see loadOwnProfile above) -- not a derived-state anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDeliveries()
  }, [loadDeliveries])

  // Realtime status upgrade (03_START_TRIP_AND_SESSION.md's "Planned catch-up"
  // note): any change to delivery_requests or sessions refreshes the list
  // instead of requiring a page reload to pick up a milestone/Trip-state
  // change the Driver made. Requires the "assigned crew can read own
  // deliveries" RLS policy on delivery_requests (Helper/Driver previously
  // had no direct read access to that table at all — see DATABASE.md).
  useEffect(() => {
    const channel = supabase
      .channel('helper-delivery-requests-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_requests' }, () => {
        loadDeliveries()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadDeliveries])

  useEffect(() => {
    if (!active?.id) return undefined
    const channel = supabase
      .channel(`helper-sessions-${active.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `delivery_request_id=eq.${active.id}` },
        () => {
          loadDeliveries()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [active?.id, loadDeliveries])

  // Read-only alerts feed (06_DROWSINESS_ALERT_PIPELINE.md's Helper visibility
  // note): same seed-fetch + postgres_changes INSERT pattern DriverDeliveries.jsx
  // uses for its own LiveMonitoringCard, minus the audio.
  useEffect(() => {
    if (!isMonitoring || !active?.sessionId) return undefined
    let cancelled = false

    async function loadExistingAlerts() {
      const { data, error } = await supabase
        .from('alerts')
        .select('id, event_type, duration, created_at')
        .eq('session_id', active.sessionId)
        .order('created_at', { ascending: false })
      if (cancelled || error || !data) return
      setLiveAlerts((prev) => {
        const seenIds = new Set(prev.map((a) => a.id))
        const fetched = data
          .filter((row) => !seenIds.has(String(row.id)))
          .map((row) => ({ id: String(row.id), type: row.event_type, duration: row.duration, time: row.created_at }))
        return [...prev, ...fetched].sort((a, b) => new Date(b.time) - new Date(a.time))
      })
    }
    loadExistingAlerts()

    const channel = supabase
      .channel(`helper-alerts-session-${active.sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `session_id=eq.${active.sessionId}` },
        (payload) => {
          const row = payload.new
          const newAlert = { id: String(row.id), type: row.event_type, duration: row.duration, time: row.created_at }
          setLiveAlerts((prev) => [newAlert, ...prev])
        },
      )
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [isMonitoring, active?.sessionId])

  // Live truck position (05_GPS_PIPELINE.md), added 2026-08-14 to support the
  // Delivery Chain list's "Next" highlight (02B_MULTI_STOP_DELIVERIES.md's
  // "Dynamic Nearest-Dropoff Ordering") -- the Helper has no GPS device of
  // their own, only the truck's Pi does, so this reads the same gps_logs
  // stream the Driver's own live nav and the backend's proof-location check
  // already use. Same seed-fetch + postgres_changes INSERT pattern as the
  // alerts subscription above.
  useEffect(() => {
    if (!chainSuccessNotice) return undefined
    const timer = setTimeout(() => setChainSuccessNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [chainSuccessNotice])

  useEffect(() => {
    if (!isMonitoring || !active?.sessionId) return undefined
    let cancelled = false

    async function loadLatestPosition() {
      const { data, error } = await supabase
        .from('gps_logs')
        .select('latitude, longitude')
        .eq('session_id', active.sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (cancelled || error || !data?.length) return
      setLivePosition({ lat: data[0].latitude, lng: data[0].longitude })
    }
    loadLatestPosition()

    const channel = supabase
      .channel(`helper-gps-session-${active.sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gps_logs', filter: `session_id=eq.${active.sessionId}` },
        (payload) => {
          setLivePosition({ lat: payload.new.latitude, lng: payload.new.longitude })
        },
      )
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [isMonitoring, active?.sessionId])

  useEffect(() => {
    // Resets local alert state when the active session changes (e.g. a
    // pause/resume cycle produces a new session_id) -- reacting to an
    // external-system id change, not a derived-state anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveAlerts([])
    setIsAlertHistoryExpanded(false)
  }, [active?.sessionId])

  const filteredHistory = data.completed.filter((d) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      d.id.toLowerCase().includes(q) ||
      d.customerName.toLowerCase().includes(q) ||
      d.companyName.toLowerCase().includes(q) ||
      d.deliveryAddress.toLowerCase().includes(q)
    )
  })

  const closeDeliveryDetail = () => setSelectedDelivery(null)

  const selectTab = (tabId) => {
    setActiveTab(tabId)
    closeDeliveryDetail()
  }

  return (
    <HelperLayout title="Deliveries" background={null}>
      <div className="flex w-full min-w-0 flex-col gap-3 pb-4">
        {deliveriesError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 sm:px-4 sm:py-3 sm:text-sm">
            {deliveriesError}
          </p>
        )}

        {isLoadingDeliveries ? (
          <p className="rounded-xl border border-teal-200/70 bg-white p-5 text-center text-[11px] text-slate-500">
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
              count={tab.id === 'today' ? todayCount : tab.id === 'upcoming' ? upcomingCount : pastCount}
              isActive={activeTab === tab.id}
              onClick={() => selectTab(tab.id)}
            />
          ))}
        </div>

        {/* Today tab */}
        {activeTab === 'today' && (hasActiveDelivery ? (
          <>
            <div className="flex flex-col gap-3">
              {isPausedTrip ? (
                <div className="flex items-center gap-1.5 rounded-xl bg-teal-800 px-3.5 py-2.5 text-[11px] font-medium text-white sm:text-xs">
                  <Pause className="h-3.5 w-3.5 shrink-0" />
                  Trip paused — the driver has paused this trip.
                </div>
              ) : statusCfg.banner && (
                <div className="flex items-center gap-1.5 rounded-xl bg-teal-900 px-3.5 py-2.5 text-[11px] font-medium text-white sm:text-xs">
                  {statusCfg.bannerIcon && <statusCfg.bannerIcon className="h-3.5 w-3.5 shrink-0" />}
                  {statusCfg.banner}
                </div>
              )}

              {/* Summary — at-a-glance status, route, and key facts */}
              <section className="rounded-xl border border-teal-200/70 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <TodayBadge />
                    <span className="truncate text-xs font-bold text-slate-900">{statusCfg.label}</span>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{active.id}</span>
                </div>

                <div className="mt-2">
                  <StageProgress status={active.status} />
                </div>

                <div className="mt-3 flex items-stretch gap-2.5">
                  <div className="flex flex-col items-center justify-between">
                    {statusCardLegend.flatMap((item, i) => [
                      <span
                        key={item.key}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${item.badgeBg} ${item.badgeText}`}
                      >
                        {item.badge}
                      </span>,
                      i < statusCardLegend.length - 1 && <div key={`${item.key}-line`} className="my-0.5 w-px flex-1 bg-teal-200" />,
                    ].filter(Boolean))}
                  </div>
                  <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5">
                    {statusCardLegend.map((item) => (
                      <p key={item.key} className="truncate text-xs font-medium leading-tight text-slate-800">{item.address}</p>
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <div className="rounded-lg bg-teal-50 px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Truck className="h-3 w-3 shrink-0 text-teal-700" />
                      <p className="text-[9px] text-slate-500">Truck</p>
                    </div>
                    <p className="truncate text-xs font-bold text-slate-900">{active.crew.truck.plateNumber}</p>
                  </div>
                  <div className="rounded-lg bg-teal-50 px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0 text-teal-700" />
                      <p className="text-[9px] text-slate-500">Pickup</p>
                    </div>
                    <p className="truncate text-xs font-bold text-slate-900">{pickupWindowLabel(active.pickupTime, active.pickupTimeEnd)}</p>
                  </div>
                  <div className="rounded-lg bg-teal-50 px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Wallet className="h-3 w-3 shrink-0 text-teal-700" />
                      <p className="text-[9px] text-slate-500">Fee</p>
                    </div>
                    <p className="truncate text-xs font-bold text-teal-900">
                      {active.quotation ? `₱${Number(active.quotation.amount).toLocaleString()}` : '—'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Pickup -> Dropoff -> Stops chain, each item completed with a
                  required proof photo — see 02B_MULTI_STOP_DELIVERIES.md. */}
              {isDrivingStage && (
                <section className="rounded-xl border border-teal-200/70 bg-white p-3 sm:p-4">
                  <h3 className="text-xs font-bold text-slate-900">Delivery Chain</h3>
                  <div className="mt-2.5 space-y-1.5">
                    {chainItems.map((item, idx) => (
                      <div
                        key={chainItemKey(item)}
                        className={`flex items-center gap-2.5 rounded-lg border p-2.5 ${
                          item.done
                            ? 'border-emerald-200 bg-emerald-50'
                            : item.isNext
                              ? 'border-teal-400 bg-teal-50/70'
                              : 'border-teal-200/70 bg-white'
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            item.done ? 'bg-emerald-600 text-white' : 'bg-teal-100 text-teal-700'
                          }`}
                        >
                          {item.done ? <Check className="h-3 w-3" strokeWidth={3} /> : idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {item.label}
                            {!item.done && item.isNext && (
                              <span className="rounded-full bg-teal-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                Next
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs font-medium text-slate-800">{item.location}</p>
                        </div>
                        {item.photoUrl && (
                          <img
                            src={item.photoUrl}
                            alt={`${item.label} proof`}
                            className="h-10 w-10 shrink-0 rounded-md border border-emerald-200 object-cover"
                          />
                        )}
                        {item.actionable && (
                          <button
                            onClick={() => openChainModal(item)}
                            className="shrink-0 rounded-md bg-teal-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-800"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {isMonitoring && (
                <LiveAlertsCard
                  alerts={liveAlerts}
                  isExpanded={isAlertHistoryExpanded}
                  onToggleExpanded={() => setIsAlertHistoryExpanded((prev) => !prev)}
                />
              )}

              {/* Route Overview — same whole-trip guide DriverDeliveries.jsx's
                  pre-trip screen shows, read-only here (see RouteOverviewMap). */}
              <section className="overflow-hidden rounded-xl border border-teal-200/70 bg-white">
                <div className="border-b border-teal-200/70 bg-teal-50 px-3 py-2">
                  <h3 className="text-xs font-bold text-slate-900">Route Overview</h3>
                </div>
                <RouteOverviewMap suggestedRoute={active.suggestedRoute} dropoffCoords={active.destinationCoords} />
              </section>

              {/* Delivery overview + fee + crew */}
              <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-xl border border-teal-200/70 bg-white p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-bold text-slate-900">Delivery Overview</h3>
                    <StatusBadge status={active.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-500">Customer</p>
                      <p className="font-medium text-slate-900">{active.customerName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Company</p>
                      <p className="font-medium text-slate-900">{active.companyName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Product Type</p>
                      <p className="font-medium text-slate-900">{active.itemType}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Schedule</p>
                      <p className="font-medium text-slate-900">{active.pickupDate} at {pickupWindowLabel(active.pickupTime, active.pickupTimeEnd)}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-teal-200/70 bg-white p-3 sm:p-4 lg:col-span-2">
                  <h3 className="text-xs font-bold text-slate-900">Crew &amp; Truck</h3>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <CrewMemberCard member={active.crew.driver} badgeLabel="Driver" />

                    <div className="rounded-lg border border-teal-200/70 bg-white p-2.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Truck</p>
                      <div className="flex items-center gap-2 text-xs">
                        <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-900">{active.crew.truck.plateNumber}</span>
                        <span className="truncate text-slate-500">&bull; {active.crew.truck.truckType} &bull; {active.crew.truck.capacity}</span>
                      </div>
                    </div>

                    {active.crew.helpers?.length > 0 && (
                      <div className="sm:col-span-2">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Helpers ({active.crew.helpers.length})
                        </p>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {active.crew.helpers.map((helper) => (
                            <CrewMemberCard key={helper.id} member={helper} badgeLabel="Helper" isHighlighted={isCurrentHelper(helper)} />
                          ))}
                        </div>
                      </div>
                    )}

                    {active.assignedAt && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 sm:col-span-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        Assigned: {active.assignedAt}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <Check className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-2 text-xs font-semibold text-emerald-800">No deliveries for today</p>
            <p className="mt-0.5 text-[11px] text-emerald-600">You have no deliveries scheduled for today.</p>
            <button
              onClick={() => setActiveTab('upcoming')}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
            >
              View Upcoming Deliveries
            </button>
          </div>
        ))}

        {/* Upcoming tab */}
        {activeTab === 'upcoming' && (
          selectedDelivery ? (
            <DeliveryDetailView
              delivery={selectedDelivery}
              onBack={closeDeliveryDetail}
              currentHelperName={currentHelperName}
            />
          ) : data.upcoming.length === 0 ? (
            <p className="rounded-xl border border-teal-200/70 bg-white p-5 text-center text-[11px] text-slate-500">
              No upcoming deliveries scheduled. New assignments will appear here once your supervisor schedules them.
            </p>
          ) : (
            <div className="space-y-1.5">
              {data.upcoming.map((delivery) => (
                <DeliveryRow key={delivery.id} delivery={delivery} showTime todayISO={todayISO} onSelect={setSelectedDelivery} />
              ))}
            </div>
          )
        )}

        {/* Past tab */}
        {activeTab === 'past' && (
          selectedDelivery ? (
            <DeliveryDetailView
              delivery={selectedDelivery}
              onBack={closeDeliveryDetail}
              currentHelperName={currentHelperName}
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
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  />
                </div>
              )}

              {filteredHistory.length === 0 ? (
                <p className="rounded-xl border border-teal-200/70 bg-white p-5 text-center text-[11px] text-slate-500">
                  {data.completed.length === 0 ? 'No past deliveries yet.' : 'No results match your search.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filteredHistory.map((delivery) => (
                    <DeliveryRow key={delivery.id} delivery={delivery} todayISO={todayISO} onSelect={setSelectedDelivery} />
                  ))}
                </div>
              )}
            </div>
          )
        )}
          </>
        )}
      </div>

      {confirmingChainItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-chain-item-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-teal-200/70 bg-white p-4 shadow-xl">
            <h2 id="confirm-chain-item-title" className="text-sm font-bold text-slate-900">
              Complete {confirmingChainItem.type === 'pickup' ? 'Pickup' : confirmingChainItem.type === 'dropoff' ? 'Dropoff' : `Dropoff ${confirmingChainItem.index + 2}`}
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              A photo is required as proof before this can be marked complete.
            </p>

            <div className="mt-3">
              {chainPhotoPreviewUrl ? (
                <div className="relative">
                  <img src={chainPhotoPreviewUrl} alt="Selected proof" className="h-40 w-full rounded-lg border border-teal-200 object-cover" />
                  <label
                    htmlFor="chain-photo-input"
                    className="absolute bottom-2 right-2 inline-flex cursor-pointer items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold text-teal-800 shadow"
                  >
                    <Camera className="h-3 w-3" />
                    Retake
                  </label>
                </div>
              ) : (
                <label
                  htmlFor="chain-photo-input"
                  className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-teal-200 bg-teal-50/60 text-teal-700 transition hover:bg-teal-50"
                >
                  <Camera className="h-5 w-5" />
                  <span className="text-[11px] font-semibold">Take or choose a photo</span>
                </label>
              )}
              <input
                id="chain-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleChainPhotoChange}
                disabled={isSubmittingChainAction}
                className="sr-only"
              />
            </div>

            {chainPhotoError && <p className="mt-2 text-[11px] text-red-600">{chainPhotoError}</p>}

            <div className="mt-4 flex gap-1.5">
              <button
                onClick={closeChainModal}
                disabled={isSubmittingChainAction}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <X className="mr-1 inline h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                onClick={submitChainAction}
                disabled={isSubmittingChainAction || !chainPhotoBase64}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-70"
              >
                {isSubmittingChainAction && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                {isSubmittingChainAction ? 'Please wait…' : 'Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload confirmation -- floats above the page after a chain-item
          photo submits successfully, and auto-dismisses after a few seconds.
          Mirrors DriverDeliveries.jsx's completionNotice toast (same
          pattern/z-index-above-the-confirm-modal reasoning). Added
          2026-08-14 -- submitChainAction previously closed the modal
          silently on success with no confirmation the upload went through. */}
      {chainSuccessNotice && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl shadow-emerald-900/15">
            <div className="flex items-center gap-3 bg-emerald-600 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  {chainSuccessNotice.isFinal ? 'Delivery Completed' : `${chainSuccessNotice.label} Confirmed`}
                </p>
                <p className="truncate text-[11px] text-emerald-100">
                  {chainSuccessNotice.isFinal
                    ? 'Every item in the chain is done — the trip has been closed out.'
                    : 'Photo uploaded successfully.'}
                </p>
              </div>
              <button
                onClick={() => setChainSuccessNotice(null)}
                aria-label="Dismiss"
                className="shrink-0 rounded-full p-1 text-emerald-100 transition hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </HelperLayout>
  )
}

export default HelperDeliveries
