import { useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  EyeOff,
  MapPin,
  Navigation,
  Package,
  Play,
  Repeat,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Truck,
  X,
  Activity,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import DriverLayout from '../layout/DriverLayout.jsx'

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

const statusConfig = {
  ASSIGNED: {
    label: 'Assigned',
    badge: 'bg-indigo-100 text-indigo-700',
    nextLabel: 'Start Delivery',
    nextIcon: Play,
    nextStage: 'FOR_PICKUP',
    nextColor: 'bg-indigo-600 hover:bg-indigo-700',
    banner: 'Ready to start your delivery?',
    bannerIcon: Play,
  },
  FOR_PICKUP: {
    label: 'For Pickup',
    badge: 'bg-cyan-100 text-cyan-700',
    nextLabel: 'Arrived at Pickup — Proceed to Drop-off',
    nextIcon: Navigation,
    nextStage: 'OUT_FOR_DELIVERY',
    nextColor: 'bg-cyan-600 hover:bg-cyan-700',
    banner: 'Head to the pickup location to collect the items.',
    bannerIcon: MapPin,
  },
  OUT_FOR_DELIVERY: {
    label: 'Out for Delivery',
    badge: 'bg-blue-100 text-blue-700',
    nextLabel: 'Mark as Delivered',
    nextIcon: CheckCircle2,
    nextStage: 'DELIVERED',
    nextColor: 'bg-blue-600 hover:bg-blue-700',
    banner: 'Delivering to the drop-off location.',
    bannerIcon: Navigation,
  },
  DELIVERED: {
    label: 'Delivered',
    badge: 'bg-emerald-100 text-emerald-700',
    nextLabel: 'Complete Delivery',
    nextIcon: CheckCircle2,
    nextStage: 'COMPLETED',
    nextColor: 'bg-emerald-600 hover:bg-emerald-700',
    banner: 'Items delivered. Complete to finish.',
    bannerIcon: CheckCircle2,
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

const REPORT_TABS = [
  { id: 'trip', label: 'Trip Summary', icon: Route },
  { id: 'behavior', label: 'Driver Behavior', icon: Activity },
  { id: 'delivery', label: 'Delivery Report', icon: ClipboardList },
  { id: 'route', label: 'Route Deviation', icon: MapPin },
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
        { label: 'Departed', time: '08:30', completed: true },
        { label: 'En Route', time: '08:30-09:10', completed: true },
        { label: 'Arrived', time: '09:10', completed: true },
        { label: 'Unloaded', time: '09:15', completed: true },
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
        { label: 'Departed', time: '06:00', completed: true },
        { label: 'En Route', time: '06:00-06:48', completed: true },
        { label: 'Arrived', time: '06:48', completed: true },
        { label: 'Unloaded', time: '06:55', completed: true },
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
    <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Delivery Report</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-amber-200/70 mb-4">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = reportTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setReportTab(tab.id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive ? 'bg-amber-900 text-white' : 'text-slate-600 hover:bg-amber-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {reportTab === 'trip' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <Route className="mx-auto h-4 w-4 text-slate-400" />
              <p className="mt-1 text-xs text-slate-500">Distance</p>
              <p className="text-sm font-bold text-slate-900">{report.trip.distance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <Clock className="mx-auto h-4 w-4 text-slate-400" />
              <p className="mt-1 text-xs text-slate-500">Duration</p>
              <p className="text-sm font-bold text-slate-900">{report.trip.duration}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <MapPin className="mx-auto h-4 w-4 text-slate-400" />
              <p className="mt-1 text-xs text-slate-500">Route</p>
              <p className="text-sm font-bold text-slate-900 truncate" title={report.trip.route}>{report.trip.route}</p>
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Trip Timeline</p>
            <div className="space-y-2">
              {report.trip.timeline.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="font-medium text-slate-700">{step.label}</span>
                  <span className="ml-auto text-slate-400">{step.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Trip Stops</p>
            <div className="space-y-1.5">
              {report.trip.stops.map((stop, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${i === 0 ? 'bg-sky-100 text-sky-700' : i === report.trip.stops.length - 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      <MapPin className="h-2.5 w-2.5" />
                    </span>
                    {i < report.trip.stops.length - 1 && <div className="mt-0.5 h-3 w-px bg-slate-200" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700">{stop.location}</p>
                    <p className="text-slate-400">{stop.time} — {stop.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportTab === 'behavior' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 p-3">
            <div>
              <p className="text-xs text-slate-500">Your Risk Level</p>
              <p className="text-lg font-bold text-slate-900">{report.behavior.totalAlerts} alerts</p>
            </div>
            <RiskBadge tone={report.behavior.riskLevel.tone} label={report.behavior.riskLevel.label} />
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Alert Type Breakdown</p>
            <div className="space-y-2">
              {report.behavior.alertsByType.map((item) => {
                const Icon = ALERT_TYPE_ICONS[item.type] || AlertTriangle
                const pct = report.behavior.totalAlerts > 0 ? Math.round((item.count / report.behavior.totalAlerts) * 100) : 0
                return (
                  <div key={item.type}>
                    <div className="flex items-center gap-2 text-xs mb-1">
                      <Icon className="h-3.5 w-3.5 text-slate-500" />
                      <span className="flex-1 text-slate-700">{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.count}</span>
                      <span className="text-slate-400">({pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Session Log</p>
            <div className="space-y-1.5">
              {report.behavior.sessions.map((session, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    {formatAlertTimestamp(session.start)} — {formatAlertTimestamp(session.end)}
                  </span>
                  <span className="font-semibold text-slate-900">{session.alerts} alerts</span>
                  <span className="text-slate-400">{formatAlertDuration(session.duration)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportTab === 'delivery' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Total Alerts</p>
              <p className="text-lg font-bold text-slate-900">{report.delivery.totalAlerts}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Avg Duration</p>
              <p className="text-lg font-bold text-slate-900">{report.delivery.avgAlertDuration}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Peak Time</p>
              <p className="text-lg font-bold text-slate-900">{report.delivery.peakAlertTime}</p>
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Eye Closure Alerts</p>
            <div className="space-y-1.5">
              {report.delivery.eyeClosureAlerts.map((alert) => {
                const Icon = ALERT_TYPE_ICONS[alert.type] || EyeOff
                const severityColor = alert.severity === 'High' ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
                return (
                  <div key={alert.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-xs">
                    <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span className="font-medium text-slate-700">{formatAlertTimestamp(alert.time)}</span>
                    <span className="text-slate-500">{ALERT_TYPE_LABELS[alert.type] || alert.type}</span>
                    <span className="text-slate-400">{alert.duration}s</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityColor}`}>
                      {alert.severity}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-2">Delivery History</p>
            <div className="space-y-1.5">
              {report.delivery.history.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
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
                    <p className="text-slate-400">{formatAlertTimestamp(entry.timestamp)} by {entry.actor}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportTab === 'route' && (
        <div className="space-y-3">
          <RouteDeviationMap
            plannedRoute={report.routeDeviation.planned}
            actualRoute={report.routeDeviation.actual}
            pickupCoords={report.routeDeviation.planned[0]}
            dropoffCoords={report.routeDeviation.planned[report.routeDeviation.planned.length - 1]}
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Planned Distance</p>
              <p className="text-sm font-bold text-slate-900">{report.routeDeviation.plannedDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Actual Distance</p>
              <p className="text-sm font-bold text-slate-900">{report.routeDeviation.actualDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Deviation</p>
              <p className="text-sm font-bold text-slate-900">{report.routeDeviation.deviationDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Deviation %</p>
              <p className="text-sm font-bold text-slate-900">{report.routeDeviation.deviationPercent}%</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3 text-xs"
            style={{
              borderColor: report.routeDeviation.aiVerdictTone === 'red' ? '#fecaca' : '#fde68a',
              backgroundColor: report.routeDeviation.aiVerdictTone === 'red' ? '#fef2f2' : '#fffbeb',
            }}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${
              report.routeDeviation.aiVerdictTone === 'red' ? 'bg-red-500' : 'bg-amber-500'
            }`}>
              <Navigation className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-semibold ${report.routeDeviation.aiVerdictTone === 'red' ? 'text-red-800' : 'text-amber-800'}`}>
                AI Route Analysis: {report.routeDeviation.aiVerdict}
              </p>
              <p className={`mt-1 leading-relaxed ${report.routeDeviation.aiVerdictTone === 'red' ? 'text-red-700' : 'text-amber-700'}`}>
                {report.routeDeviation.aiSummary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-white border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#059669' }} />
              <span className="text-slate-600">Planned Route</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#2563eb' }} />
              <span className="text-slate-600">Actual Route</span>
            </div>
            <span className="ml-auto text-[10px] text-slate-400 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              S = Start, E = End
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const mockTruck = {
  plateNumber: 'ABC 1234',
  truckType: 'AUV',
  capacity: '1.2 tons',
  imageUrl: 'https://images.unsplash.com/photo-1556122071-e404eaedb77f?auto=format&fit=crop&w=600&q=80',
}

const mockDriver = {
  id: 'DRV-001',
  name: 'Carlos Mendoza',
  phone: '+63 912 311 1222',
}

const mockHelpers = [
  { id: 'HLP-001', name: 'Pedro Garcia' },
  { id: 'HLP-002', name: 'Luis Torres' },
]

function buildInitialState() {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const fmtTime = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

  return {
    active: {
      id: 'DEL-008',
      customerName: 'Jose Rizal',
      companyName: 'Jollibee',
      pickupAddress: '321 Warehouse District, Brgy. Valenzuela, Caloocan',
      deliveryAddress: '654 Business Park, Brgy. Bicutan, Parañaque',
      itemType: 'Fast Food',
      pickupDate: today,
      pickupTime: fmtTime(now.getHours(), (now.getMinutes() + 15) % 60),
      status: 'ASSIGNED',
      createdAt: '2026-07-25 14:00',
      pickupCoords: { lat: 14.6572, lng: 120.9802 },
      destinationCoords: { lat: 14.4934, lng: 121.0405 },
      quotation: {
        amount: 5500,
        breakdown: [
          { label: 'Base Delivery Fee', amount: 2000 },
          { label: 'Distance Fee', amount: 1200 },
          { label: 'Truck Type Surcharge', amount: 800 },
          { label: 'Fuel Surcharge', amount: 600 },
          { label: 'Loading/Unloading Fee', amount: 900 },
        ],
        notes: 'Standard delivery rate',
      },
      crew: {
        driver: mockDriver,
        helpers: mockHelpers,
        truck: mockTruck,
      },
      assignedAt: 'Jul 26, 2026, 08:00 AM',
    },
    completed: [
      {
        id: 'DEL-004',
        customerName: 'Ana Ramirez',
        companyName: "McDonald's",
        pickupAddress: 'Pasig Hub, Brgy. San Joaquin, Pasig',
        deliveryAddress: 'BGC Branch, Brgy. Fort Bonifacio, Taguig',
        itemType: 'Frozen Goods',
        pickupDate: '2026-07-20',
        pickupTime: '08:30',
        status: 'COMPLETED',
        pickupCoords: { lat: 14.5600, lng: 121.0700 },
        destinationCoords: { lat: 14.5506, lng: 121.0471 },
        quotation: {
          amount: 4200,
          breakdown: [
            { label: 'Base Delivery Fee', amount: 1500 },
            { label: 'Distance Fee', amount: 800 },
            { label: 'Truck Type Surcharge', amount: 600 },
            { label: 'Fuel Surcharge', amount: 500 },
            { label: 'Loading/Unloading Fee', amount: 800 },
          ],
          notes: 'Standard delivery',
        },
        crew: {
          driver: mockDriver,
          helpers: [{ id: 'HLP-001', name: 'Pedro Garcia' }],
          truck: { plateNumber: 'ABC 1234', truckType: 'AUV', capacity: '1.2 tons' },
        },
        assignedAt: 'Jul 19, 2026, 08:00 AM',
      },
      {
        id: 'DEL-005',
        customerName: 'Roberto Dimagiba',
        companyName: 'Chowking',
        pickupAddress: 'Cavite Depot, Brgy. San Antonio, Cavite',
        deliveryAddress: 'Alabang Branch, Brgy. Alabang, Muntinlupa',
        itemType: 'Dry Food',
        pickupDate: '2026-07-19',
        pickupTime: '06:00',
        status: 'COMPLETED',
        pickupCoords: { lat: 14.3000, lng: 120.9600 },
        destinationCoords: { lat: 14.4201, lng: 121.0312 },
        quotation: {
          amount: 3800,
          breakdown: [
            { label: 'Base Delivery Fee', amount: 1200 },
            { label: 'Distance Fee', amount: 600 },
            { label: 'Truck Type Surcharge', amount: 500 },
            { label: 'Fuel Surcharge', amount: 400 },
            { label: 'Loading/Unloading Fee', amount: 1100 },
          ],
          notes: 'Early morning delivery',
        },
        crew: {
          driver: mockDriver,
          helpers: [{ id: 'HLP-002', name: 'Luis Torres' }],
          truck: { plateNumber: 'XYZ 5678', truckType: '2T_REF', capacity: '2.0 tons' },
        },
        assignedAt: 'Jul 18, 2026, 10:00 AM',
      },
    ],
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

function DriverDeliveries() {
  const [data, setData] = useState(() => buildInitialState())
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [search, setSearch] = useState('')
  const [showDirections, setShowDirections] = useState(false)
  const [expandedReport, setExpandedReport] = useState(null)

  const active = data.active
  const statusCfg = active ? statusConfig[active.status] : null

  const advanceStage = () => {
    if (!statusCfg || !statusCfg.nextStage) return
    setData((prev) => ({
      ...prev,
      active: { ...prev.active, status: statusCfg.nextStage },
    }))
    if (statusCfg.nextStage === 'FOR_PICKUP' || statusCfg.nextStage === 'OUT_FOR_DELIVERY') {
      setShowDirections(true)
    }
    if (statusCfg.nextStage === 'COMPLETED') {
      setData((prev) => ({
        active: null,
        completed: [{ ...prev.active, status: 'COMPLETED' }, ...prev.completed],
      }))
      setShowDirections(false)
    }
  }

  const openDirections = (origin, destination) => {
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

  const isDetailCompleted = selectedDelivery && selectedDelivery.status === 'COMPLETED'
  const detailReport = isDetailCompleted ? COMPLETED_REPORT_DATA[selectedDelivery.id] : null

  return (
    <DriverLayout title="Deliveries" background={null}>
      <div className="flex flex-col gap-6 pb-10">
        <header className="space-y-2 md:space-y-3">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            My Deliveries
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Manage your current delivery and review past trips.
          </p>
        </header>

        {/* Active delivery */}
        {active ? (
          <section className="rounded-3xl border-2 border-amber-300 bg-white shadow-md overflow-hidden">
            {statusCfg.banner && (
              <div className="flex items-center gap-2 bg-amber-900 px-5 py-3 text-sm font-medium text-white">
                {statusCfg.bannerIcon && <statusCfg.bannerIcon className="h-4 w-4 shrink-0" />}
                {statusCfg.banner}
              </div>
            )}

            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                      <Truck className="h-7 w-7 text-amber-900" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight text-slate-900">
                        {active.crew.truck.plateNumber}
                      </p>
                      <p className="text-sm text-slate-500">
                        {active.crew.truck.truckType} &bull; {active.crew.truck.capacity}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5">
                      <Calendar className="h-5 w-5 text-amber-700" />
                      <div>
                        <p className="text-xs text-slate-500">Pickup Date</p>
                        <p className="text-base font-bold text-slate-900">{active.pickupDate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5">
                      <Clock className="h-5 w-5 text-amber-700" />
                      <div>
                        <p className="text-xs text-slate-500">Pickup Time</p>
                        <p className="text-base font-bold text-slate-900">{active.pickupTime}</p>
                      </div>
                    </div>
                    <StatusBadge status={active.status} />
                  </div>
                </div>

                <div className="shrink-0 rounded-xl border border-amber-200/70 bg-white p-3 text-center sm:text-right">
                  <p className="text-xs text-slate-500">Delivery Fee</p>
                  <p className="text-xl font-bold text-amber-900">
                    PHP {active.quotation.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-200/70 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{active.customerName}</p>
                  <p className="text-sm text-slate-600">{active.companyName}</p>
                  <p className="mt-1 text-xs text-slate-500">{active.itemType}</p>
                </div>

                <div className="rounded-2xl border border-amber-200/70 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Route</p>
                  <div className="mt-1 space-y-1.5">
                    <div className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700">P</div>
                      <span className="text-slate-700">{active.pickupAddress}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">D</div>
                      <span className="text-slate-700">{active.deliveryAddress}</span>
                    </div>
                  </div>
                </div>
              </div>

              {statusCfg.nextLabel && (
                <div className="mt-5">
                  <button
                    onClick={advanceStage}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold text-white transition sm:w-auto ${statusCfg.nextColor}`}
                  >
                    <statusCfg.nextIcon className="h-5 w-5" />
                    {statusCfg.nextLabel}
                  </button>
                </div>
              )}

              {(active.status === 'FOR_PICKUP' || active.status === 'OUT_FOR_DELIVERY') && showDirections && (
                <div className="mt-5 space-y-3">
                  <div className="overflow-hidden rounded-2xl border border-amber-200/70">
                    <div className="border-b border-amber-200/70 bg-amber-50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {active.status === 'FOR_PICKUP' ? 'Navigate to Pickup Location' : 'Navigate to Drop-off Location'}
                        </h3>
                        <button
                          onClick={() =>
                            openDirections(
                              active.status === 'FOR_PICKUP'
                                ? { lat: 14.5506, lng: 121.0471 }
                                : active.pickupCoords,
                              active.status === 'FOR_PICKUP' ? active.pickupCoords : active.destinationCoords,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-amber-800"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Open Google Maps
                        </button>
                      </div>
                    </div>
                    <iframe
                      title={active.status === 'FOR_PICKUP' ? 'Pickup Map' : 'Drop-off Map'}
                      src={toGoogleMapEmbed(
                        active.status === 'FOR_PICKUP' ? active.pickupCoords : active.destinationCoords,
                      )}
                      className="h-64 w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50 p-3 text-sm">
                    <Route className="h-5 w-5 shrink-0 text-amber-700" />
                    <p className="text-slate-700">
                      {active.status === 'FOR_PICKUP' ? (
                        <><span className="font-semibold">Pickup:</span> {active.pickupAddress}</>
                      ) : (
                        <><span className="font-semibold">Drop-off:</span> {active.deliveryAddress}</>
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <button
                  onClick={() => setSelectedDelivery(active)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition hover:text-amber-900"
                >
                  View Full Details
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-lg font-semibold text-emerald-800">All deliveries completed!</p>
            <p className="mt-1 text-sm text-emerald-600">You have no pending deliveries. Check back for new assignments.</p>
          </div>
        )}

        {/* Delivery History */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Delivery History</h2>
            {data.completed.length > 0 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search history..."
                  className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs outline-none transition focus:border-amber-400"
                />
              </div>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="rounded-2xl border border-amber-200/70 bg-white p-8 text-center text-sm text-slate-500">
              {data.completed.length === 0 ? 'No past deliveries yet.' : 'No results match your search.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded-2xl border border-amber-200/70 bg-white p-4 transition hover:border-amber-300 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusConfig[delivery.status]?.badge || 'bg-slate-100 text-slate-700'}`}>
                          {statusConfig[delivery.status]?.label || delivery.status}
                        </span>
                        <p className="text-sm font-semibold text-slate-900">
                          {delivery.id} &bull; {delivery.companyName}
                        </p>
                      </div>
                      <p className="text-sm text-slate-600">{delivery.deliveryAddress}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5" />
                          {delivery.crew.truck.plateNumber}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {delivery.pickupDate}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3.5 w-3.5" />
                          {delivery.itemType}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedDelivery(delivery)}
                      className="shrink-0 rounded-lg border border-amber-200/70 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-amber-50"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Detail Modal */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-amber-200/70 bg-white p-5 shadow-2xl md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Delivery Details</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">
                  {selectedDelivery.id} &bull; {selectedDelivery.companyName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{selectedDelivery.customerName}</p>
              </div>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {/* Left column */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200/70 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Delivery Overview</h3>
                  <div className="mt-3 space-y-2.5 text-sm">
                    <p className="text-slate-700">
                      <span className="font-medium">Customer:</span> {selectedDelivery.customerName}
                    </p>
                    <p className="text-slate-700">
                      <span className="font-medium">Company:</span> {selectedDelivery.companyName}
                    </p>
                    <p className="text-slate-700">
                      <span className="font-medium">Product Type:</span> {selectedDelivery.itemType}
                    </p>
                    <p className="text-slate-700">
                      <span className="font-medium">Pickup Address:</span> {selectedDelivery.pickupAddress}
                    </p>
                    <p className="text-slate-700">
                      <span className="font-medium">Drop-off Address:</span> {selectedDelivery.deliveryAddress}
                    </p>
                    <p className="text-slate-700">
                      <span className="font-medium">Schedule:</span> {selectedDelivery.pickupDate} at {selectedDelivery.pickupTime}
                    </p>
                    <div className="pt-1">
                      <StatusBadge status={selectedDelivery.status} />
                    </div>
                  </div>
                </div>

                {/* Delivery Fee — always visible */}
                {selectedDelivery.quotation && (
                  <div className="rounded-2xl border border-amber-200/70 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Delivery Fee</h3>
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        <p className="text-sm text-emerald-800 font-medium">
                          PHP {Number(selectedDelivery.quotation.amount).toLocaleString()}
                        </p>
                      </div>
                      {selectedDelivery.quotation.breakdown?.length > 0 && (
                        <div className="rounded-xl border border-amber-200/70 bg-amber-50 p-3 space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Breakdown</p>
                          {selectedDelivery.quotation.breakdown.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-slate-600">{item.label}</span>
                              <span className="font-medium text-slate-800">₱{Number(item.amount).toLocaleString()}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-amber-300 pt-1.5 text-sm font-bold">
                            <span className="text-slate-800">Total</span>
                            <span className="text-slate-800">₱{Number(selectedDelivery.quotation.amount).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Route Deviation Monitoring is inside the Delivery Report below */}
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200/70 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Crew &amp; Truck</h3>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50 p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-900 text-sm font-semibold text-white">
                        {selectedDelivery.crew.driver.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{selectedDelivery.crew.driver.name}</p>
                        <p className="text-xs text-slate-500">{selectedDelivery.crew.driver.phone}</p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">Driver</span>
                    </div>

                    {selectedDelivery.crew.helpers?.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Helpers ({selectedDelivery.crew.helpers.length})
                        </p>
                        <div className="space-y-1.5">
                          {selectedDelivery.crew.helpers.map((helper) => (
                            <div key={helper.id} className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-white p-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                                {helper.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                              </div>
                              <p className="text-sm font-medium text-slate-900">{helper.name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-amber-200/70 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Truck</p>
                      <div className="flex items-center gap-2 text-sm">
                        <Truck className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-900">{selectedDelivery.crew.truck.plateNumber}</span>
                        <span className="text-slate-500">&bull; {selectedDelivery.crew.truck.truckType} &bull; {selectedDelivery.crew.truck.capacity}</span>
                      </div>
                    </div>

                    {selectedDelivery.assignedAt && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        Assigned: {selectedDelivery.assignedAt}
                      </div>
                    )}
                  </div>
                </div>

                {/* Report section — only for completed deliveries */}
                {isDetailCompleted && (
                  <div className="rounded-2xl border border-amber-200/70 bg-white p-4">
                    <button
                      onClick={() => setExpandedReport(expandedReport === selectedDelivery.id ? null : selectedDelivery.id)}
                      className="flex w-full items-center justify-between"
                    >
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <ClipboardList className="h-4 w-4 text-amber-700" />
                        Delivery Report
                      </h3>
                      {expandedReport === selectedDelivery.id ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                    <p className="mt-1 text-xs text-slate-500">
                      Trip summary, driver behavior, and route analysis.
                    </p>
                    {expandedReport === selectedDelivery.id && (
                      <div className="mt-3">
                        <CompletedDeliveryReport report={detailReport} />
                      </div>
                    )}
                  </div>
                )}

                {/* Route Map (for non-completed) or Route picker (completed) */}
                {!isDetailCompleted && (
                  <div className="overflow-hidden rounded-2xl border border-amber-200/70">
                    <div className="border-b border-amber-200/70 bg-amber-50 px-4 py-3">
                      <h3 className="text-sm font-semibold text-slate-900">Route Overview</h3>
                    </div>
                    <iframe
                      title="Route Map"
                      src={toGoogleMapEmbed(selectedDelivery.destinationCoords)}
                      className="h-52 w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    <div className="border-t border-amber-200/70 bg-white px-4 py-3 space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700">P</div>
                        <span className="text-slate-600">{selectedDelivery.pickupAddress}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700">D</div>
                        <span className="text-slate-600">{selectedDelivery.deliveryAddress}</span>
                      </div>
                    </div>
                  </div>
                )}

                {!isDetailCompleted && selectedDelivery.pickupCoords && selectedDelivery.destinationCoords && (
                  <button
                    onClick={() => openDirections(selectedDelivery.pickupCoords, selectedDelivery.destinationCoords)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800"
                  >
                    <Navigation className="h-4 w-4" />
                    Open Directions in Google Maps
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-amber-200/70 pt-4">
              <button
                onClick={() => {
                  setSelectedDelivery(null)
                  setExpandedReport(null)
                }}
                className="rounded-xl border border-amber-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-amber-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DriverLayout>
  )
}

export default DriverDeliveries
