import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import DriverLayout from '../layout/DriverLayout.jsx'
import { supabase } from '../lib/supabaseClient.js'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const startIcon = L.divIcon({
  className: '',
  html: '<div style="background:#2563eb;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)">S</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const endIcon = L.divIcon({
  className: '',
  html: '<div style="background:#059669;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)">E</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

// Driver-facing workflow: Assigned -> Heading to Pickup -> Out for Delivery -> Delivered.
// "Delivered" is the last thing the driver does — handing over the cargo finishes their job.
// Customer confirmation ("Completed") happens afterward on its own and never blocks the driver;
// it only ever appears on already-archived deliveries, never as a step the driver has to act on.
const statusConfig = {
  ASSIGNED: {
    label: 'Assigned',
    badge: 'bg-indigo-100 text-indigo-700',
    nextLabel: 'Start Pickup',
    nextIcon: Play,
    nextStage: 'FOR_PICKUP',
    nextColor: 'bg-indigo-600 hover:bg-indigo-700',
    banner: 'Ready to head to the pickup location?',
    bannerIcon: Play,
    confirmTitle: 'Start heading to pickup?',
    confirmDescription: 'This marks the delivery as in progress and begins navigation to the pickup location. You haven’t collected the cargo yet.',
  },
  FOR_PICKUP: {
    label: 'Heading to Pickup',
    badge: 'bg-cyan-100 text-cyan-700',
    nextLabel: 'Confirm Pickup',
    nextIcon: CheckCircle2,
    nextStage: 'OUT_FOR_DELIVERY',
    nextColor: 'bg-cyan-600 hover:bg-cyan-700',
    banner: 'Head to the pickup location to collect the items.',
    bannerIcon: MapPin,
    confirmTitle: 'Confirm cargo pickup?',
    confirmDescription: 'This confirms you’ve collected the cargo at the pickup location and updates the status to Out for Delivery.',
  },
  OUT_FOR_DELIVERY: {
    label: 'Out for Delivery',
    badge: 'bg-blue-100 text-blue-700',
    nextLabel: 'Complete Delivery',
    nextIcon: CheckCircle2,
    nextStage: 'DELIVERED',
    nextColor: 'bg-blue-600 hover:bg-blue-700',
    banner: 'Delivering to the drop-off location.',
    bannerIcon: Navigation,
    confirmTitle: 'Complete this delivery?',
    confirmDescription: 'This confirms the cargo has been handed over to the customer and moves the delivery to your history.',
  },
  DELIVERED: {
    label: 'Delivered',
    badge: 'bg-teal-100 text-teal-700',
    nextLabel: null,
    nextIcon: null,
    nextStage: null,
    nextColor: null,
    banner: null,
    bannerIcon: null,
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-green-100 text-green-700',
    nextLabel: null,
    nextIcon: null,
    nextStage: null,
    nextColor: null,
    banner: null,
    bannerIcon: null,
  },
}

// Short, stacked-friendly labels — the tab bar is a 3-up grid on every screen size
// (never a horizontally-scrolling row), so labels need to read fine at that width.
const REPORT_TABS = [
  { id: 'trip', label: 'Trip', icon: Route },
  { id: 'behavior', label: 'Behavior', icon: Activity },
  { id: 'route', label: 'Route', icon: MapPin },
]

const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: 'Prolonged Eye Closure',
  pattern_eye_closure_yawn: 'Eye Closure + Yawn',
  pattern_repeated_eye_closure: 'Repeated Eye Closure',
}

const ALERT_TYPE_ICONS = {
  prolonged_eye_closure: EyeOff,
  pattern_eye_closure_yawn: AlertTriangle,
  pattern_repeated_eye_closure: Repeat,
}

// Live drowsiness monitoring runs client-side against a simulated feed —
// there's no real camera/detection pipeline wired into this frontend yet —
// so a delivery in progress gets an occasional random alert instead of a
// static post-trip summary, matching the pace of real fatigue events
// (roughly one every 5-10 minutes of driving, not constant).
const LIVE_ALERT_TICK_MS = 20000
const LIVE_ALERT_CHANCE = 0.18

// Presentation seed for the "Confirm Pickup" moment — guarantees a
// realistic-looking couple of alerts appear right away (instead of
// depending on the random interval to eventually produce one), so a demo
// of the delivery leg always has something to show. Timestamps are computed
// relative to "now" at seed time, most-recent first, matching the order
// the live interval prepends new alerts in.
function buildMockLiveAlertSeed() {
  const now = Date.now()
  return [
    { id: `live-seed-${now}-a`, type: 'pattern_eye_closure_yawn', duration: 34, time: new Date(now - 2 * 60 * 1000).toISOString() },
    { id: `live-seed-${now}-b`, type: 'prolonged_eye_closure', duration: 47, time: new Date(now - 6 * 60 * 1000).toISOString() },
  ]
}

const RISK_BADGE_CLASSES = {
  red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
}

const RISK_ICONS = { red: ShieldAlert, amber: AlertTriangle, emerald: ShieldCheck }

function getRiskLevel(alertCount) {
  if (alertCount >= 4) return { tone: 'red', label: 'High Risk' }
  if (alertCount >= 2) return { tone: 'amber', label: 'Moderate' }
  return { tone: 'emerald', label: 'Safe' }
}

function RiskBadge({ tone, label }) {
  const Icon = RISK_ICONS[tone] || ShieldCheck
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${RISK_BADGE_CLASSES[tone] || RISK_BADGE_CLASSES.emerald}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function formatAlertDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--'
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function formatAlertTimestamp(value) {
  if (!value) return '--'
  const raw = String(value)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!isoMatch) return raw
  const year = Number(isoMatch[1])
  const monthIndex = Number(isoMatch[2]) - 1
  const day = Number(isoMatch[3])
  const hour24 = Number(isoMatch[4])
  const minute = isoMatch[5]
  const hour12 = ((hour24 + 11) % 12) + 1
  const suffix = hour24 >= 12 ? 'pm' : 'am'
  const monthLabels = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const monthLabel = monthLabels[monthIndex] || ''
  if (!monthLabel || !year) return `${hour12}:${minute} ${suffix}`
  return `${monthLabel} ${day}, ${hour12}:${minute} ${suffix}`
}

// Today's date as "YYYY-MM-DD" in the user's local timezone. Delivery
// pickup/dropoff dates are calendar dates entered by the customer (e.g.
// "2026-08-07"), so grouping must compare against the *local* date — using
// Date.toISOString() (UTC) shifts the comparison a day ahead in timezones
// east of UTC (e.g. PH, UTC+8) during the morning.
function localTodayISO() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// Time-only ("2:45pm") variant of formatAlertTimestamp, for the live
// monitoring feed where a full date would be redundant — every alert shown
// there happened moments ago, today.
function formatTimeOnly(value) {
  if (!value) return '--'
  const raw = String(value)
  const match = raw.match(/[T ](\d{2}):(\d{2})/)
  if (!match) return raw
  const hour24 = Number(match[1])
  const minute = match[2]
  const hour12 = ((hour24 + 11) % 12) + 1
  const suffix = hour24 >= 12 ? 'pm' : 'am'
  return `${hour12}:${minute}${suffix}`
}

function RouteDeviationMap({ plannedRoute, actualRoute, pickupCoords, dropoffCoords }) {
  const allPoints = [...plannedRoute, ...actualRoute]
  const lats = allPoints.map((p) => p[0])
  const lngs = allPoints.map((p) => p[1])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const center = [(minLat + maxLat) / 2, (minLng + maxLng) / 2]

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ height: 280 }}>
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
        <Polyline
          positions={plannedRoute}
          pathOptions={{ color: '#059669', weight: 4, dashArray: '8 6' }}
        />
        <Polyline
          positions={actualRoute}
          pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.7 }}
        />
        <Marker position={pickupCoords} icon={startIcon}>
          <Popup>Pickup Location</Popup>
        </Marker>
        <Marker position={dropoffCoords} icon={endIcon}>
          <Popup>Drop-off Location</Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}

const COMPLETED_REPORT_DATA = {
  'DEL-004': {
    routeDeviation: {
      planned: [
        [14.560, 121.070],
        [14.557, 121.060],
        [14.555, 121.053],
        [14.553, 121.048],
        [14.550, 121.047],
      ],
      actual: [
        [14.560, 121.070],
        [14.557, 121.060],
        [14.562, 121.055],
        [14.555, 121.052],
        [14.553, 121.048],
        [14.550, 121.047],
      ],
      plannedDistance: '5.8 km',
      actualDistance: '6.4 km',
      deviationDistance: '0.6 km',
      deviationPercent: 10.3,
      aiSummary: 'Minor route deviation detected. The driver briefly deviated north near the C5-Meralco intersection, adding approximately 0.6 km to the planned route. This appears to be a navigation correction rather than an intentional detour. No significant impact on delivery time or safety.',
      aiVerdict: 'Minor Deviation',
      aiVerdictTone: 'amber',
    },
    trip: {
      route: 'Pasig Hub → BGC Branch',
      distance: '14.2 km',
      duration: '45 min',
      startTime: '2026-07-20T08:30:00',
      endTime: '2026-07-20T09:15:00',
      stops: [
        { location: 'Pasig Hub', time: '08:30', action: 'Departure' },
        { location: 'C5 Road Checkpoint', time: '08:48', action: 'Waypoint' },
        { location: 'BGC Branch', time: '09:15', action: 'Drop-off Completed' },
      ],
      timeline: [
        { label: 'Departed for Pickup', time: '08:00', completed: true },
        { label: 'Arrived at Pickup Location', time: '08:15', completed: true },
        { label: 'Departed for Drop Off', time: '08:30', completed: true },
        { label: 'Arrived at Drop Off Location', time: '09:10', completed: true },
        { label: 'Delivery Completed', time: '09:15', completed: true },
      ],
    },
    behavior: {
      totalAlerts: 2,
      avgAlertsPerTrip: 2.0,
      riskLevel: getRiskLevel(2),
      alertsByType: [
        { type: 'prolonged_eye_closure', count: 1, label: 'Prolonged Eye Closure' },
        { type: 'pattern_repeated_eye_closure', count: 1, label: 'Repeated Eye Closure' },
      ],
      sessions: [
        { start: '2026-07-20T08:30:00', end: '2026-07-20T09:15:00', alerts: 2, duration: 2700 },
      ],
    },
    delivery: {
      totalAlerts: 2,
      totalSessions: 1,
      avgAlertDuration: '47s',
      peakAlertTime: '08:45 AM',
      eyeClosureAlerts: [
        { id: 'A-1', time: '2026-07-20T08:42:00', type: 'prolonged_eye_closure', duration: 45, severity: 'Moderate' },
        { id: 'A-2', time: '2026-07-20T08:55:00', type: 'pattern_repeated_eye_closure', duration: 50, severity: 'High' },
      ],
      history: [
        { event: 'Delivery Request Created', timestamp: '2026-07-18T10:00:00', actor: 'System' },
        { event: 'Quotation Approved', timestamp: '2026-07-18T14:30:00', actor: 'Supervisor' },
        { event: 'Crew Assigned — Carlos Mendoza + ABC 1234', timestamp: '2026-07-19T08:00:00', actor: 'Supervisor' },
        { event: 'Picked Up from Pasig Hub', timestamp: '2026-07-20T08:30:00', actor: 'Driver' },
        { event: 'Delivered to BGC Branch', timestamp: '2026-07-20T09:15:00', actor: 'Driver' },
        { event: 'Marked as Completed', timestamp: '2026-07-20T09:20:00', actor: 'System' },
      ],
    },
  },
  'DEL-005': {
    routeDeviation: {
      planned: [
        [14.300, 120.960],
        [14.320, 120.970],
        [14.350, 120.985],
        [14.380, 121.000],
        [14.400, 121.015],
        [14.420, 121.031],
      ],
      actual: [
        [14.300, 120.960],
        [14.310, 120.965],
        [14.330, 120.945],
        [14.360, 120.965],
        [14.390, 121.010],
        [14.410, 121.025],
        [14.420, 121.031],
      ],
      plannedDistance: '18.2 km',
      actualDistance: '22.8 km',
      deviationDistance: '4.6 km',
      deviationPercent: 25.3,
      aiSummary: 'Significant route deviation detected. The driver took an alternative route through General Trias residential areas instead of staying on Aguinaldo Highway, adding 4.6 km to the planned route. This deviation is notable and may indicate driver unfamiliarity with the area or a deliberate choice to avoid traffic. Recommend reviewing the trip log for this delivery to assess any impact on schedule or fuel efficiency.',
      aiVerdict: 'Significant Deviation',
      aiVerdictTone: 'red',
    },
    trip: {
      route: 'Cavite Depot → Alabang Branch',
      distance: '22.8 km',
      duration: '55 min',
      startTime: '2026-07-19T06:00:00',
      endTime: '2026-07-19T06:55:00',
      stops: [
        { location: 'Cavite Depot', time: '06:00', action: 'Departure' },
        { location: 'General Trias Toll', time: '06:20', action: 'Waypoint' },
        { location: 'Alabang Branch', time: '06:55', action: 'Drop-off Completed' },
      ],
      timeline: [
        { label: 'Departed for Pickup', time: '05:30', completed: true },
        { label: 'Arrived at Pickup Location', time: '05:45', completed: true },
        { label: 'Departed for Drop Off', time: '06:00', completed: true },
        { label: 'Arrived at Drop Off Location', time: '06:48', completed: true },
        { label: 'Delivery Completed', time: '06:55', completed: true },
      ],
    },
    behavior: {
      totalAlerts: 5,
      avgAlertsPerTrip: 5.0,
      riskLevel: getRiskLevel(5),
      alertsByType: [
        { type: 'prolonged_eye_closure', count: 2, label: 'Prolonged Eye Closure' },
        { type: 'pattern_eye_closure_yawn', count: 2, label: 'Eye Closure + Yawn' },
        { type: 'pattern_repeated_eye_closure', count: 1, label: 'Repeated Eye Closure' },
      ],
      sessions: [
        { start: '2026-07-19T06:00:00', end: '2026-07-19T06:55:00', alerts: 5, duration: 3300 },
      ],
    },
    delivery: {
      totalAlerts: 5,
      totalSessions: 1,
      avgAlertDuration: '52s',
      peakAlertTime: '06:30 AM',
      eyeClosureAlerts: [
        { id: 'A-3', time: '2026-07-19T06:12:00', type: 'prolonged_eye_closure', duration: 60, severity: 'High' },
        { id: 'A-4', time: '2026-07-19T06:20:00', type: 'pattern_eye_closure_yawn', duration: 45, severity: 'Moderate' },
        { id: 'A-5', time: '2026-07-19T06:28:00', type: 'pattern_eye_closure_yawn', duration: 55, severity: 'High' },
        { id: 'A-6', time: '2026-07-19T06:35:00', type: 'prolonged_eye_closure', duration: 50, severity: 'Moderate' },
        { id: 'A-7', time: '2026-07-19T06:42:00', type: 'pattern_repeated_eye_closure', duration: 50, severity: 'High' },
      ],
      history: [
        { event: 'Delivery Request Created', timestamp: '2026-07-17T09:00:00', actor: 'System' },
        { event: 'Quotation Approved', timestamp: '2026-07-17T15:00:00', actor: 'Supervisor' },
        { event: 'Crew Assigned — Miguel Santos + XYZ 5678', timestamp: '2026-07-18T10:00:00', actor: 'Supervisor' },
        { event: 'Picked Up from Cavite Depot', timestamp: '2026-07-19T06:00:00', actor: 'Driver' },
        { event: 'Delivered to Alabang Branch', timestamp: '2026-07-19T06:55:00', actor: 'Driver' },
        { event: 'Marked as Completed', timestamp: '2026-07-19T07:00:00', actor: 'System' },
      ],
    },
  },
}

function CompletedDeliveryReport({ report }) {
  const [reportTab, setReportTab] = useState('trip')

  if (!report) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No detailed report available for this delivery.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Delivery Report</p>
      </div>

      {/* A 3-up grid, not a horizontally-scrolling row — it always fits the viewport
          instead of requiring a swipe to reach the third tab. */}
      <div className="mb-4 grid grid-cols-3 gap-1.5 border-b border-amber-200/70 pb-3">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = reportTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setReportTab(tab.id)}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-semibold transition ${
                isActive ? 'bg-amber-900 text-white' : 'text-slate-600 hover:bg-amber-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {reportTab === 'trip' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <Route className="mx-auto h-3.5 w-3.5 text-slate-400" />
              <p className="mt-1 text-[10px] text-slate-500">Distance</p>
              <p className="text-xs font-bold text-slate-900">{report.trip.distance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <Clock className="mx-auto h-3.5 w-3.5 text-slate-400" />
              <p className="mt-1 text-[10px] text-slate-500">Duration</p>
              <p className="text-xs font-bold text-slate-900">{report.trip.duration}</p>
            </div>
            {/* Full-width on mobile: this value can be long, and unlike desktop there's no
                hover to reveal a truncated title, so it needs room to actually be read. */}
            <div className="col-span-2 rounded-lg bg-white border border-slate-200 p-2 text-center sm:col-span-1">
              <MapPin className="mx-auto h-3.5 w-3.5 text-slate-400" />
              <p className="mt-1 text-[10px] text-slate-500">Route</p>
              <p className="text-xs font-bold text-slate-900 sm:truncate" title={report.trip.route}>{report.trip.route}</p>
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Trip Timeline</p>
            <div className="space-y-1.5">
              {report.trip.timeline.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${step.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{step.label}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-slate-400">{step.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Trip Stops</p>
            <div className="space-y-1.5">
              {report.trip.stops.map((stop, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${i === 0 ? 'bg-sky-100 text-sky-700' : i === report.trip.stops.length - 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      <MapPin className="h-2.5 w-2.5" />
                    </span>
                    {i < report.trip.stops.length - 1 && <div className="mt-0.5 h-3 w-px bg-slate-200" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700">{stop.location}</p>
                    <p className="text-[10px] text-slate-400">{stop.time} — {stop.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Eye Closure Alerts</p>
            <div className="space-y-1.5">
              {report.delivery.eyeClosureAlerts.map((alert) => {
                const Icon = ALERT_TYPE_ICONS[alert.type] || EyeOff
                const severityColor = alert.severity === 'High' ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
                return (
                  <div key={alert.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-100 p-2 text-[11px]">
                    <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span className="font-medium text-slate-700">{formatAlertTimestamp(alert.time)}</span>
                    <span className="text-slate-500">{ALERT_TYPE_LABELS[alert.type] || alert.type}</span>
                    <span className="text-[10px] text-slate-400">{alert.duration}s</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityColor}`}>
                      {alert.severity}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Delivery History</p>
            <div className="space-y-1.5">
              {report.delivery.history.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      i === report.delivery.history.length - 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                    }`}>
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    {i < report.delivery.history.length - 1 && <div className="mt-0.5 h-3 w-px bg-slate-200" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700">{entry.event}</p>
                    <p className="text-[10px] text-slate-400">{formatAlertTimestamp(entry.timestamp)} by {entry.actor}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportTab === 'behavior' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Total Alerts</p>
              <p className="text-xs font-bold text-slate-900">{report.delivery.totalAlerts}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Avg Duration</p>
              <p className="text-xs font-bold text-slate-900">{report.delivery.avgAlertDuration}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Peak Time</p>
              <p className="text-xs font-bold text-slate-900">{report.delivery.peakAlertTime}</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 p-2.5">
            <div>
              <p className="text-[10px] text-slate-500">Your Risk Level</p>
              <p className="text-xs font-bold text-slate-900">{report.behavior.totalAlerts} alerts</p>
            </div>
            <RiskBadge tone={report.behavior.riskLevel.tone} label={report.behavior.riskLevel.label} />
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Alert Type Breakdown</p>
            <div className="space-y-2">
              {report.behavior.alertsByType.map((item) => {
                const Icon = ALERT_TYPE_ICONS[item.type] || AlertTriangle
                const pct = report.behavior.totalAlerts > 0 ? Math.round((item.count / report.behavior.totalAlerts) * 100) : 0
                return (
                  <div key={item.type}>
                    <div className="flex items-center gap-2 text-[11px] mb-1">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{item.label}</span>
                      <span className="shrink-0 font-semibold text-slate-900">{item.count}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">({pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Session Log</p>
            <div className="space-y-1.5">
              {report.behavior.sessions.map((session, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="text-slate-600">
                    {formatAlertTimestamp(session.start)} — {formatAlertTimestamp(session.end)}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="font-semibold text-slate-900">{session.alerts} alerts</span>
                    <span className="text-[10px] text-slate-400">{formatAlertDuration(session.duration)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportTab === 'route' && (
        <div className="space-y-2.5">
          <RouteDeviationMap
            plannedRoute={report.routeDeviation.planned}
            actualRoute={report.routeDeviation.actual}
            pickupCoords={report.routeDeviation.planned[0]}
            dropoffCoords={report.routeDeviation.planned[report.routeDeviation.planned.length - 1]}
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Planned Distance</p>
              <p className="text-xs font-bold text-slate-900">{report.routeDeviation.plannedDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Actual Distance</p>
              <p className="text-xs font-bold text-slate-900">{report.routeDeviation.actualDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Deviation</p>
              <p className="text-xs font-bold text-slate-900">{report.routeDeviation.deviationDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
              <p className="text-[10px] text-slate-500">Deviation %</p>
              <p className="text-xs font-bold text-slate-900">{report.routeDeviation.deviationPercent}%</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border p-2.5"
            style={{
              borderColor: report.routeDeviation.aiVerdictTone === 'red' ? '#fecaca' : '#fde68a',
              backgroundColor: report.routeDeviation.aiVerdictTone === 'red' ? '#fef2f2' : '#fffbeb',
            }}
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${
              report.routeDeviation.aiVerdictTone === 'red' ? 'bg-red-500' : 'bg-amber-500'
            }`}>
              <Navigation className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${report.routeDeviation.aiVerdictTone === 'red' ? 'text-red-800' : 'text-amber-800'}`}>
                AI Route Analysis: {report.routeDeviation.aiVerdict}
              </p>
              <p className={`mt-1 text-[11px] leading-relaxed ${report.routeDeviation.aiVerdictTone === 'red' ? 'text-red-700' : 'text-amber-700'}`}>
                {report.routeDeviation.aiSummary}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white border border-slate-200 p-2.5">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="inline-block h-3 w-6 shrink-0 rounded-sm" style={{ background: '#059669' }} />
              <span className="text-slate-600">Planned Route</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="inline-block h-3 w-6 shrink-0 rounded-sm" style={{ background: '#2563eb' }} />
              <span className="text-slate-600">Actual Route</span>
            </div>
            <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" />
              S = Start, E = End
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Backend-backed delivery loading ------------------------------------
// The driver's deliveries come from the admin-users Edge Function's
// get-driver-deliveries action (the client can't read delivery_requests or
// the *_records tables directly — see DATABASE.md / SUPABASE_GOTCHAS #8).
// Statuses are mapped between the driver UI's simplified flow
// (ASSIGNED -> FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED) and the
// delivery_requests.status values the supervisor timeline uses.

const DB_TO_DRIVER_STATUS = {
  ASSIGNED: 'ASSIGNED',
  OUT_FOR_PICKUP: 'FOR_PICKUP',
  ARRIVED_PICKUP: 'OUT_FOR_DELIVERY',
  OUT_FOR_DROPOFF: 'OUT_FOR_DELIVERY',
  ARRIVED_DROPOFF: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
}

// Driver internal next-stage -> delivery_requests.status to write back.
const DRIVER_STATUS_TO_DB = {
  FOR_PICKUP: 'OUT_FOR_PICKUP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DROPOFF',
  DELIVERED: 'DELIVERED',
}

// Some pickup/dropoff locations are stored as a "lat, lng" coordinate pair
// rather than a street address — parse those back into coords for the maps.
function parseCoords(value) {
  if (!value) return null
  const m = String(value).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function formatAssignedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Shape the Edge Function payload into the shape the rest of this page
// renders (the same one the old mock data used to provide). A delivery may
// have no quotation yet (supervisor hasn't priced it), so quotation is null
// and every render site below guards on it.
function mapDelivery(d) {
  const str = (v) => (v == null ? '' : String(v))
  return {
    id: str(d.id),
    customerName: str(d.customerName) || 'Customer',
    companyName: str(d.companyName),
    itemType: str(d.itemType),
    pickupDate: str(d.pickupDate),
    pickupTime: str(d.pickupTime),
    pickupAddress: str(d.pickupAddress),
    deliveryAddress: str(d.deliveryAddress),
    status: DB_TO_DRIVER_STATUS[d.status] || str(d.status),
    hasOpenSession: Boolean(d.hasOpenSession),
    assignedAt: formatAssignedAt(d.assignedAt),
    quotation: d.quotation ? { amount: Number(d.quotation.amount), breakdown: null } : null,
    crew: {
      driver: d.driver ? { id: str(d.driver.id), name: str(d.driver.name), phone: str(d.driver.phone) } : { id: '', name: 'You', phone: '' },
      helpers: d.helpers || [],
      truck: d.truck
        ? { plateNumber: str(d.truck.plateNumber), truckType: str(d.truck.truckType), capacity: str(d.truck.capacity || '') }
        : { plateNumber: '—', truckType: '', capacity: '' },
    },
    pickupCoords: parseCoords(d.pickupAddress),
    destinationCoords: parseCoords(d.deliveryAddress),
  }
}

function toGoogleMapsDirections(origin, destination) {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`
}

function toGoogleMapEmbed(coords) {
  if (!coords) return 'https://maps.google.com/maps?q=14.5995,120.9842&z=12&output=embed'
  return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=15&output=embed`
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
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      Today
    </span>
  )
}

// The driver's workflow, start to finish. "Delivered" is the last step the driver takes —
// any customer confirmation happens later and is a separate concern (see statusConfig above).
const DRIVER_STAGES = [
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'FOR_PICKUP', label: 'Pickup' },
  { key: 'OUT_FOR_DELIVERY', label: 'Delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
]

// Checkmark-and-connector tracker — the same pattern parcel-tracking apps use (order placed ✓ →
// shipped ✓ → out for delivery ● → delivered ○), so "where am I in this job" reads at a glance
// instead of needing an unexplained fraction.
function StageProgress({ status }) {
  const idx = DRIVER_STAGES.findIndex((stage) => stage.key === status)
  return (
    <div className="grid grid-cols-4">
      {DRIVER_STAGES.map((stage, i) => {
        const isDone = i < idx
        const isCurrent = i === idx
        return (
          <div key={stage.key} className="flex flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : i <= idx ? 'bg-amber-900' : 'bg-amber-100'}`} />
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  isDone
                    ? 'bg-amber-900'
                    : isCurrent
                      ? 'bg-amber-900 ring-2 ring-amber-200'
                      : 'bg-amber-100'
                }`}
              >
                {isDone && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </span>
              <div className={`h-0.5 flex-1 ${i === DRIVER_STAGES.length - 1 ? 'invisible' : isDone ? 'bg-amber-900' : 'bg-amber-100'}`} />
            </div>
            <span
              className={`text-center text-[8px] font-semibold uppercase leading-tight ${
                isCurrent ? 'text-amber-900' : isDone ? 'text-slate-400' : 'text-slate-300'
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
      className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-amber-200/70 bg-white p-3 transition hover:border-amber-300 hover:bg-amber-50/40 active:bg-amber-50"
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
            {delivery.pickupDate}{showTime ? ` • ${delivery.pickupTime}` : ''}
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </div>
  )
}

// The Upcoming/Past "detail" screen — replaces the list in place (same tab) instead of a modal,
// since this is a lot of information to read inside a small overlay. Everything the old modal
// showed is still here, just laid out as page sections with a Back action instead of dialog chrome.
function DeliveryDetailView({ delivery, onBack, isReportExpanded, onToggleReport, onOpenDirections }) {
  const isArchived = delivery.status === 'COMPLETED' || delivery.status === 'DELIVERED'
  const report = isArchived ? COMPLETED_REPORT_DATA[delivery.id] : null

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
          <p className="truncate text-xs text-slate-600">{delivery.customerName}</p>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {/* Delivery Overview */}
          <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
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
                <p className="font-medium text-slate-900">{delivery.pickupDate} at {delivery.pickupTime}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2.5 border-t border-amber-100 pt-3 text-xs">
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
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Breakdown</p>
                    {delivery.quotation.breakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-slate-600">{item.label}</span>
                        <span className="font-medium text-slate-800">₱{Number(item.amount).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-amber-300 pt-1.5 text-xs font-bold">
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
          {/* Crew & Truck */}
          <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
            <h3 className="text-xs font-bold text-slate-900">Crew &amp; Truck</h3>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-3 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-900 text-xs font-semibold text-white">
                  {delivery.crew.driver.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900">{delivery.crew.driver.name}</p>
                  <p className="text-[10px] text-slate-500">{delivery.crew.driver.phone}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Driver</span>
              </div>

              {delivery.crew.helpers?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Helpers ({delivery.crew.helpers.length})
                  </p>
                  <div className="space-y-1.5">
                    {delivery.crew.helpers.map((helper) => (
                      <div key={helper.id} className="flex items-center gap-2.5 rounded-lg border border-amber-200/70 bg-white p-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800">
                          {helper.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <p className="truncate text-xs font-medium text-slate-900">{helper.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-amber-200/70 bg-white p-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Truck</p>
                <div className="flex items-center gap-2 text-xs">
                  <Truck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-900">{delivery.crew.truck.plateNumber}</span>
                  <span className="truncate text-slate-500">&bull; {delivery.crew.truck.truckType} &bull; {delivery.crew.truck.capacity}</span>
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
              <button onClick={onToggleReport} className="flex w-full items-center justify-between">
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
                  <CompletedDeliveryReport report={report} />
                </div>
              )}
            </section>
          )}

          {/* Route Overview — for deliveries still in progress */}
          {!isArchived && (
            <section className="overflow-hidden rounded-xl border border-amber-200/70">
              <div className="border-b border-amber-200/70 bg-amber-50 px-3 py-2">
                <h3 className="text-xs font-bold text-slate-900">Route Overview</h3>
              </div>
              <iframe
                title="Route Map"
                src={toGoogleMapEmbed(delivery.destinationCoords)}
                className="h-40 w-full sm:h-48"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="space-y-1.5 border-t border-amber-200/70 bg-white px-3 py-2.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700">P</span>
                  <span className="truncate text-slate-600">{delivery.pickupAddress}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700">D</span>
                  <span className="truncate text-slate-600">{delivery.deliveryAddress}</span>
                </div>
              </div>
            </section>
          )}

          {!isArchived && delivery.pickupCoords && delivery.destinationCoords && (
            <button
              onClick={() => onOpenDirections(delivery.pickupCoords, delivery.destinationCoords)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-amber-800"
            >
              <Navigation className="h-3.5 w-3.5" />
              Open Directions in Google Maps
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Live, in-trip drowsiness monitoring for the active delivery — shown only
// while the driver is actually driving (heading to pickup or out for
// delivery), not while merely assigned. This is the "right now" counterpart
// to the post-trip Behavior tab inside CompletedDeliveryReport: same alert
// taxonomy and risk thresholds (ALERT_TYPE_LABELS/getRiskLevel), but framed
// around "how am I doing on this trip so far" instead of a finished report.
function LiveMonitoringCard({ alerts, isExpanded, onToggleExpanded }) {
  const alertCount = alerts.length
  const risk = getRiskLevel(alertCount)
  const lastAlert = alerts[0] || null
  const hasElevatedRisk = risk.tone !== 'emerald'

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

      {hasElevatedRisk && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          Multiple alerts detected recently — consider pulling over for a short rest.
        </div>
      )}

      {alertCount > 0 && (
        <button
          onClick={onToggleExpanded}
          className="mt-2 flex w-full items-center justify-between rounded-lg py-1 text-[11px] font-semibold text-amber-800"
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
        isActive ? 'border-amber-900 text-amber-900' : 'border-transparent text-slate-400 hover:text-slate-600'
      }`}
    >
      {label}
      {count > 0 && <span className="ml-1 text-[10px] font-normal opacity-60">{count}</span>}
    </button>
  )
}

function DriverDeliveries() {
  const [data, setData] = useState({ active: null, upcoming: [], completed: [] })
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(true)
  const [deliveriesError, setDeliveriesError] = useState('')
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [search, setSearch] = useState('')
  const [expandedReport, setExpandedReport] = useState(null)
  const [activeTab, setActiveTab] = useState('today')
  const [confirmingStageAdvance, setConfirmingStageAdvance] = useState(false)
  const [confirmingPause, setConfirmingPause] = useState(false)
  const [confirmingResume, setConfirmingResume] = useState(false)
  // Shared across every confirm-modal action below since only one can ever be
  // open at a time — see the "Loading States" convention in DESIGNS.md for
  // why every future confirm-modal button should follow this same pattern.
  const [isSubmittingTripAction, setIsSubmittingTripAction] = useState(false)
  const [liveAlerts, setLiveAlerts] = useState([])
  const [isAlertHistoryExpanded, setIsAlertHistoryExpanded] = useState(false)
  const [completionNotice, setCompletionNotice] = useState(null)

  const active = data.active
  const statusCfg = active ? statusConfig[active.status] : null
  const todayISO = localTodayISO()
  const isActiveToday = active ? active.pickupDate === todayISO : false
  const todayCount = isActiveToday ? 1 : 0
  const upcomingCount = data.upcoming.length
  const pastCount = data.completed.length

  // Before pickup, the relevant leg is "get to the pickup point"; after pickup, it's "get to drop-off."
  const activeNeedsPickup = active ? (active.status === 'ASSIGNED' || active.status === 'FOR_PICKUP') : true
  const activeNavTarget = active ? (activeNeedsPickup ? active.pickupCoords : active.destinationCoords) : null
  const activeNavOrigin = active ? (activeNeedsPickup ? { lat: 14.5506, lng: 121.0471 } : active.pickupCoords) : null

  // Monitoring runs for the whole time the vehicle is being driven — both the
  // pickup leg and the delivery leg — matching how the post-trip Behavior
  // report treats it as a single session spanning the entire trip. A driver
  // past ASSIGNED with no open Session is Paused, not "not yet started" —
  // see 03B_PAUSE_AND_RESUME_TRIP.md's "Paused isn't a stored value" note.
  const isDrivingStage = Boolean(active) && (active.status === 'FOR_PICKUP' || active.status === 'OUT_FOR_DELIVERY')
  const isMonitoring = isDrivingStage && active.hasOpenSession
  const isPausedTrip = isDrivingStage && !active.hasOpenSession

  useEffect(() => {
    let isMounted = true

    async function loadDeliveries() {
      setIsLoadingDeliveries(true)
      setDeliveriesError('')
      const { data: result, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'get-driver-deliveries' },
      })
      if (!isMounted) return
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
      const activeDelivery = nonArchived.find((d) => d.pickupDate === today) || null
      setData({
        active: activeDelivery,
        upcoming: nonArchived.filter((d) => d.id !== (activeDelivery && activeDelivery.id)),
        completed: mapped.filter((d) => d.status === 'DELIVERED' || d.status === 'COMPLETED'),
      })
      setIsLoadingDeliveries(false)
    }

    loadDeliveries()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!completionNotice) return undefined
    const timer = setTimeout(() => setCompletionNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [completionNotice])

  useEffect(() => {
    if (!isMonitoring) return undefined
    const interval = setInterval(() => {
      if (Math.random() >= LIVE_ALERT_CHANCE) return
      const types = Object.keys(ALERT_TYPE_LABELS)
      const type = types[Math.floor(Math.random() * types.length)]
      const duration = 25 + Math.floor(Math.random() * 40)
      setLiveAlerts((prev) => [{ id: `live-${Date.now()}`, type, duration, time: new Date().toISOString() }, ...prev])
    }, LIVE_ALERT_TICK_MS)
    return () => clearInterval(interval)
  }, [isMonitoring])

  // Runs a confirm-modal action while it's in flight: blocks re-entry (a second
  // tap while the first request is still pending is a no-op instead of firing
  // a duplicate call), then always closes the modal and clears the loading
  // state whether the action succeeded or the alert()-based error path fired.
  const runTripAction = async (action, closeModal) => {
    if (isSubmittingTripAction) return
    setIsSubmittingTripAction(true)
    try {
      await action()
    } finally {
      setIsSubmittingTripAction(false)
      closeModal()
    }
  }

  const advanceStage = async () => {
    if (!active || !statusCfg || !statusCfg.nextStage) return
    const nextDbStatus = DRIVER_STATUS_TO_DB[statusCfg.nextStage]
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'update-driver-delivery', deliveryId: active.id, status: nextDbStatus },
    })
    if (error) {
      alert('Failed to update the delivery. Please try again.')
      return
    }
    if (statusCfg.nextStage === 'DELIVERED') {
      // Handing over the cargo finishes the driver's job — closes the trip's Session
      // (end_time/duration/mileage) same as Start Pickup opens one. Sequenced after
      // the status update above per STATUS.md's handoff plan: if this call fails, the
      // delivery status is already correct and this can just be retried.
      const { error: tripError } = await supabase.functions.invoke('driver-trip', {
        body: { action: 'end-trip', deliveryRequestId: active.id },
      })
      if (tripError) {
        alert('Delivery status updated, but ending the trip session failed. Please try again.')
        return
      }
      // Handing over the cargo finishes the driver's job — archive it right away instead of
      // asking for a separate "complete" tap. Customer confirmation happens later, on its own.
      setData((prev) => ({
        active: null,
        upcoming: prev.upcoming || [],
        completed: [{ ...prev.active, status: 'DELIVERED' }, ...(prev.completed || [])],
      }))
      // The live feed is per-trip and this trip just ended — its history now
      // lives in the archived report instead, so clear it for the next trip.
      setLiveAlerts([])
      setIsAlertHistoryExpanded(false)
      setCompletionNotice({ id: active.id, customerName: active.customerName })
      return
    }
    if (statusCfg.nextStage === 'FOR_PICKUP') {
      // Driving — and therefore monitoring — starts now. Sequenced after the
      // status update above per STATUS.md's handoff plan: if this call fails,
      // the delivery status is already correct and this can just be retried.
      const { error: tripError } = await supabase.functions.invoke('driver-trip', {
        body: { action: 'start-trip', deliveryRequestId: active.id },
      })
      if (tripError) {
        alert('Delivery status updated, but starting the trip session failed. Please try again.')
        return
      }
      setLiveAlerts([])
      setIsAlertHistoryExpanded(false)
    }
    if (statusCfg.nextStage === 'OUT_FOR_DELIVERY') {
      // Cargo just got confirmed picked up — seed a couple of example
      // alerts so the monitoring card has something to show right away.
      setLiveAlerts(buildMockLiveAlertSeed())
      setIsAlertHistoryExpanded(false)
    }
    setData((prev) => ({
      ...prev,
      active: {
        ...prev.active,
        status: statusCfg.nextStage,
        hasOpenSession: statusCfg.nextStage === 'FOR_PICKUP' ? true : prev.active.hasOpenSession,
      },
    }))
  }

  const pauseTrip = async () => {
    if (!active) return
    const { error } = await supabase.functions.invoke('driver-trip', {
      body: { action: 'pause-trip', deliveryRequestId: active.id },
    })
    if (error) {
      alert('Failed to pause the trip. Please try again.')
      return
    }
    setData((prev) => ({ ...prev, active: { ...prev.active, hasOpenSession: false } }))
    setLiveAlerts([])
    setIsAlertHistoryExpanded(false)
  }

  const resumeTrip = async () => {
    if (!active) return
    const { error } = await supabase.functions.invoke('driver-trip', {
      body: { action: 'resume-trip', deliveryRequestId: active.id },
    })
    if (error) {
      alert('Failed to resume the trip. Please try again.')
      return
    }
    setData((prev) => ({ ...prev, active: { ...prev.active, hasOpenSession: true } }))
  }

  const openDirections = (origin, destination) => {
    if (!origin || !destination) return
    window.open(toGoogleMapsDirections(origin, destination), '_blank')
  }

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

  const closeDeliveryDetail = () => {
    setSelectedDelivery(null)
    setExpandedReport(null)
  }

  const selectTab = (tabId) => {
    setActiveTab(tabId)
    closeDeliveryDetail()
  }

  return (
    <DriverLayout title="Deliveries" background={null}>
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
              count={tab.id === 'today' ? todayCount : tab.id === 'upcoming' ? upcomingCount : pastCount}
              isActive={activeTab === tab.id}
              onClick={() => selectTab(tab.id)}
            />
          ))}
        </div>

        {/* Today tab — today's delivery is the driver's dedicated workspace, not a modal */}
        {activeTab === 'today' && (active && isActiveToday ? (
          <>
            <div className="flex flex-col gap-3">
              {isPausedTrip ? (
                <div className="flex items-center gap-1.5 rounded-xl bg-amber-800 px-3.5 py-2.5 text-[11px] font-medium text-white sm:text-xs">
                  <Pause className="h-3.5 w-3.5 shrink-0" />
                  Trip paused — GPS and drowsiness monitoring are stopped. Resume when you're ready to continue driving.
                </div>
              ) : statusCfg.banner && (
                <div className="flex items-center gap-1.5 rounded-xl bg-amber-900 px-3.5 py-2.5 text-[11px] font-medium text-white sm:text-xs">
                  {statusCfg.bannerIcon && <statusCfg.bannerIcon className="h-3.5 w-3.5 shrink-0" />}
                  {statusCfg.banner}
                </div>
              )}

              {/* Summary — at-a-glance status, route, and key facts */}
              <section className="rounded-xl border border-amber-200/70 bg-white p-3 shadow-sm sm:p-4">
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
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-700">P</span>
                    <div className="my-0.5 w-px flex-1 bg-amber-200" />
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700">D</span>
                  </div>
                  <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5">
                    <p className="truncate text-xs font-medium leading-tight text-slate-800">{active.pickupAddress}</p>
                    <p className="truncate text-xs font-medium leading-tight text-slate-800">{active.deliveryAddress}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Truck className="h-3 w-3 shrink-0 text-amber-700" />
                      <p className="text-[9px] text-slate-500">Truck</p>
                    </div>
                    <p className="truncate text-xs font-bold text-slate-900">{active.crew.truck.plateNumber}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0 text-amber-700" />
                      <p className="text-[9px] text-slate-500">Pickup</p>
                    </div>
                    <p className="truncate text-xs font-bold text-slate-900">{active.pickupTime}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Wallet className="h-3 w-3 shrink-0 text-amber-700" />
                      <p className="text-[9px] text-slate-500">Fee</p>
                    </div>
                    <p className="truncate text-xs font-bold text-amber-900">
                      {active.quotation ? `₱${Number(active.quotation.amount).toLocaleString()}` : '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5">
                  <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-slate-400">To</span>
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {active.customerName} <span className="font-normal text-slate-500">&bull; {active.companyName}</span>
                  </p>
                </div>
              </section>

              {/* Live drowsiness monitoring — only while actually driving, right after the
                  trip-status summary since "how alert am I right now" is the next thing a
                  driver mid-trip needs, ahead of navigation details. */}
              {isMonitoring && (
                <LiveMonitoringCard
                  alerts={liveAlerts}
                  isExpanded={isAlertHistoryExpanded}
                  onToggleExpanded={() => setIsAlertHistoryExpanded((v) => !v)}
                />
              )}

              {/* Route & Navigation — always visible; recenters as the delivery progresses.
                  This is the one map/address surface on the page: the old separate "Navigate Now"
                  and "Route Overview" cards duplicated the same two addresses and two live map
                  embeds, so they're merged here into a single always-current source of truth. */}
              <section className="overflow-hidden rounded-xl border border-amber-200/70 bg-white">
                <div className="border-b border-amber-200/70 bg-amber-50 px-3 py-2">
                  <h3 className="text-xs font-bold text-slate-900">
                    {activeNeedsPickup ? 'Navigate to Pickup Location' : 'Navigate to Drop-off Location'}
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
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700">P</span>
                    <span className="truncate text-slate-600">{active.pickupAddress}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700">D</span>
                    <span className="truncate text-slate-600">{active.deliveryAddress}</span>
                  </div>
                </div>
                <div className="border-t border-amber-200/70 p-2.5">
                  <button
                    onClick={() => openDirections(activeNavOrigin, activeNavTarget)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-900 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-800"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Navigate Now
                  </button>
                </div>
              </section>

              {/* Full delivery detail — everything the old modal showed, now part of the page.
                  Addresses live only in the Route section above, so they aren't repeated here. */}
              <div className="grid gap-3 lg:grid-cols-2">
                {/* Delivery Overview */}
                <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
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
                      <p className="font-medium text-slate-900">{active.pickupDate} at {active.pickupTime}</p>
                    </div>
                  </div>
                </section>

                {/* Delivery Fee — always visible */}
                {active.quotation && (
                  <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4">
                    <h3 className="text-xs font-bold text-slate-900">Delivery Fee</h3>
                    <div className="mt-3 space-y-2.5">
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <p className="text-xs font-medium text-emerald-800">
                          PHP {Number(active.quotation.amount).toLocaleString()}
                        </p>
                      </div>
                      {active.quotation.breakdown?.length > 0 && (
                        <div className="space-y-1.5 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Breakdown</p>
                          {active.quotation.breakdown.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-slate-600">{item.label}</span>
                              <span className="font-medium text-slate-800">₱{Number(item.amount).toLocaleString()}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-amber-300 pt-1.5 text-xs font-bold">
                            <span className="text-slate-800">Total</span>
                            <span className="text-slate-800">₱{Number(active.quotation.amount).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Crew & Truck — least likely to change mid-delivery, so it anchors the bottom */}
                <section className="rounded-xl border border-amber-200/70 bg-white p-3 sm:p-4 lg:col-span-2">
                  <h3 className="text-xs font-bold text-slate-900">Crew &amp; Truck</h3>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-lg border border-amber-200/70 bg-amber-50 p-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-900 text-xs font-semibold text-white">
                        {active.crew.driver.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">{active.crew.driver.name}</p>
                        <p className="text-[10px] text-slate-500">{active.crew.driver.phone}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Driver</span>
                    </div>

                    <div className="rounded-lg border border-amber-200/70 bg-white p-2.5">
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
                            <div key={helper.id} className="flex items-center gap-2.5 rounded-lg border border-amber-200/70 bg-white p-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800">
                                {helper.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                              </div>
                              <p className="truncate text-xs font-medium text-slate-900">{helper.name}</p>
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

            {!isPausedTrip && statusCfg.nextLabel && (
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
                  <button
                    onClick={() => setConfirmingStageAdvance(true)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-bold text-white transition ${statusCfg.nextColor}`}
                  >
                    <statusCfg.nextIcon className="h-4 w-4" />
                    {statusCfg.nextLabel}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
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
              isReportExpanded={expandedReport === selectedDelivery.id}
              onToggleReport={() => setExpandedReport(expandedReport === selectedDelivery.id ? null : selectedDelivery.id)}
              onOpenDirections={openDirections}
            />
          ) : data.upcoming.length === 0 ? (
            <p className="rounded-xl border border-amber-200/70 bg-white p-5 text-center text-[11px] text-slate-500">
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
              isReportExpanded={expandedReport === selectedDelivery.id}
              onToggleReport={() => setExpandedReport(expandedReport === selectedDelivery.id ? null : selectedDelivery.id)}
              onOpenDirections={openDirections}
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

      {/* Confirm before advancing the delivery status — prevents an accidental tap on the
          sticky action button from silently moving the job to its next stage. */}
      {confirmingStageAdvance && statusCfg?.nextLabel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-stage-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-4 shadow-xl">
            <h2 id="confirm-stage-title" className="text-sm font-bold text-slate-900">
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
                onClick={() => runTripAction(advanceStage, () => setConfirmingStageAdvance(false))}
                disabled={isSubmittingTripAction}
                className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${statusCfg.nextColor}`}
              >
                {isSubmittingTripAction && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                {isSubmittingTripAction ? 'Please wait…' : statusCfg.nextLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm before Pause/Resume — same compact-modal pattern as the stage-advance
          confirmation above, since both stop/start GPS and drowsiness monitoring. */}
      {confirmingPause && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-pause-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-4 shadow-xl">
            <h2 id="confirm-pause-title" className="text-sm font-bold text-slate-900">
              Pause this trip?
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              This stops GPS and drowsiness monitoring for now. The delivery stays assigned to you — resume whenever you're ready to continue driving.
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
                onClick={() => runTripAction(pauseTrip, () => setConfirmingPause(false))}
                disabled={isSubmittingTripAction}
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-900 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingTripAction && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                {isSubmittingTripAction ? 'Please wait…' : 'Pause Trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingResume && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-resume-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-4 shadow-xl">
            <h2 id="confirm-resume-title" className="text-sm font-bold text-slate-900">
              Resume this trip?
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
              This restarts GPS and drowsiness monitoring and continues the same delivery from here.
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
                onClick={() => runTripAction(resumeTrip, () => setConfirmingResume(false))}
                disabled={isSubmittingTripAction}
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-900 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingTripAction && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                {isSubmittingTripAction ? 'Please wait…' : 'Resume Trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion confirmation — floats above the page after the driver hands
          over the cargo, and auto-dismisses after a few seconds. */}
      {completionNotice && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl shadow-emerald-900/15">
            <div className="flex items-center gap-3 bg-emerald-600 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">Delivery Completed</p>
                <p className="truncate text-[11px] text-emerald-100">{completionNotice.id} • handed over to the customer</p>
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
                Great job! This delivery has been marked as delivered and moved to your history. The customer will
                confirm on their end to finalize the trip.
              </p>
            </div>
          </div>
        </div>
      )}
    </DriverLayout>
  )
}

export default DriverDeliveries
