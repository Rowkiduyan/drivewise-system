import { useMemo, useState } from 'react'
import {
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  MapPin,
  Package,
  Search,
  Send,
  Truck,
  Users,
  X,
  XCircle,
  EyeOff,
  AlertTriangle,
  Repeat,
  Activity,
  Clock,
  Route,
  ShieldCheck,
  ShieldAlert,
  ClipboardList,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import SupLayout from '../layout/SupLayout.jsx'

const deliverySteps = [
  'REQUEST_CREATED',
  'QUOTATION_SENT',
  'CREW_ASSIGNED',
  'PICKUP',
  'DELIVERED',
]

const statusByStep = {
  PENDING: 'REQUEST_CREATED',
  QUOTED: 'QUOTATION_SENT',
  APPROVED: 'CREW_ASSIGNED',
  ASSIGNED: 'CREW_ASSIGNED',
  FOR_PICKUP: 'PICKUP',
  OUT_FOR_DELIVERY: 'PICKUP',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'REQUEST_CREATED',
}

const stepLabel = {
  REQUEST_CREATED: 'Request Created',
  QUOTATION_SENT: 'Quotation Sent',
  CREW_ASSIGNED: 'Crew Assigned',
  PICKUP: 'Pickup',
  DELIVERED: 'Delivered',
}

const statusBadge = {
  PENDING: 'bg-amber-100 text-amber-700',
  QUOTED: 'bg-sky-100 text-sky-700',
  APPROVED: 'bg-teal-100 text-teal-700',
  ASSIGNED: 'bg-indigo-100 text-indigo-700',
  FOR_PICKUP: 'bg-cyan-100 text-cyan-700',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
}

const mockRequests = [
  {
    id: 'DEL-001',
    customerName: 'Juan Dela Cruz',
    companyName: '7-Eleven',
    pickupAddress: '140 M. Suarez Avenue, Brgy. San Miguel, Pasig, Metro Manila',
    deliveryAddress: '123 Main Street, Brgy. Central, Quezon City, Metro Manila',
    itemType: 'Dry Food',
    pickupDate: '2026-07-25',
    pickupTime: '09:00',
    status: 'PENDING',
    createdAt: '2026-07-22 10:30',
    destinationCoords: { lat: 14.6465, lng: 121.0521 },
    currentLocation: { lat: 14.593, lng: 121.032 },
    quotation: null,
    crew: null,
  },
  {
    id: 'DEL-002',
    customerName: 'Maria Santos',
    companyName: 'Arla',
    pickupAddress: '456 Industrial Complex, Brgy. San Antonio, Makati',
    deliveryAddress: '789 Residential Area, Brgy. Poblacion, Muntinlupa',
    itemType: 'Frozen Goods',
    pickupDate: '2026-07-25',
    pickupTime: '14:00',
    status: 'APPROVED',
    createdAt: '2026-07-21 08:00',
    destinationCoords: { lat: 14.3834, lng: 121.0419 },
    currentLocation: { lat: 14.5172, lng: 121.0198 },
    quotation: { amount: 3500, notes: 'Includes cold chain handling', validUntil: '2026-07-24' },
    crew: null,
  },
  {
    id: 'DEL-003',
    customerName: 'Carlo Gomez',
    companyName: 'Jollibee',
    pickupAddress: '321 Warehouse District, Brgy. Valenzuela, Caloocan',
    deliveryAddress: '654 Business Park, Brgy. Bicutan, Parañaque',
    itemType: 'Fast Food',
    pickupDate: '2026-07-24',
    pickupTime: '07:00',
    status: 'QUOTED',
    createdAt: '2026-07-20 14:00',
    destinationCoords: { lat: 14.4934, lng: 121.0405 },
    currentLocation: { lat: 14.5264, lng: 121.0108 },
    quotation: { amount: 5500, notes: 'Standard delivery rate', validUntil: '2026-07-23' },
    crew: null,
    customerWants: 4800,
  },
  {
    id: 'DEL-004',
    customerName: 'Ana Ramirez',
    companyName: 'McDonald\'s',
    pickupAddress: 'Pasig Hub, Brgy. San Joaquin, Pasig',
    deliveryAddress: 'BGC Branch, Brgy. Fort Bonifacio, Taguig',
    itemType: 'Frozen Goods',
    pickupDate: '2026-07-20',
    pickupTime: '08:30',
    status: 'COMPLETED',
    createdAt: '2026-07-18 10:00',
    destinationCoords: { lat: 14.5506, lng: 121.0471 },
    currentLocation: { lat: 14.5506, lng: 121.0471 },
    quotation: { amount: 4200, notes: 'Standard delivery', validUntil: '2026-07-22' },
    crew: {
      driver: { id: 'DRV-001', name: 'Carlos Mendoza', phone: '+63 912 311 1222', rating: 4.8, trips: 126, avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
      helpers: [{ id: 'HLP-001', name: 'Pedro Garcia', avatarUrl: 'https://images.unsplash.com/photo-1541535881962-3bb380b08458?auto=format&fit=crop&w=180&q=80' }],
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
    createdAt: '2026-07-17 09:00',
    destinationCoords: { lat: 14.4201, lng: 121.0312 },
    currentLocation: { lat: 14.4201, lng: 121.0312 },
    quotation: { amount: 3800, notes: 'Early morning delivery', validUntil: '2026-07-21' },
    crew: {
      driver: { id: 'DRV-002', name: 'Miguel Santos', phone: '+63 917 832 4100', rating: 4.7, trips: 104, avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80' },
      helpers: [{ id: 'HLP-002', name: 'Luis Torres', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=180&q=80' }],
      truck: { plateNumber: 'XYZ 5678', truckType: '2T_REF', capacity: '2.0 tons' },
    },
    assignedAt: 'Jul 18, 2026, 10:00 AM',
  },
  {
    id: 'DEL-006',
    customerName: 'Lisa Mendiola',
    companyName: 'KFC',
    pickupAddress: 'Manila Warehouse, Brgy. Santa Cruz, Manila',
    deliveryAddress: 'Ortigas Branch, Brgy. San Antonio, Pasig',
    itemType: 'Fast Food',
    pickupDate: '2026-07-17',
    pickupTime: '11:00',
    status: 'CANCELLED',
    createdAt: '2026-07-15 13:00',
    destinationCoords: { lat: 14.5864, lng: 121.0605 },
    currentLocation: { lat: 14.5864, lng: 121.0605 },
    quotation: { amount: 2900, notes: 'Standard rate', validUntil: '2026-07-19' },
    crew: null,
  },
]

const mockDrivers = [
  {
    id: 'DRV-001',
    name: 'Carlos Mendoza',
    status: 'available',
    phone: '+63 912 311 1222',
    rating: 4.8,
    trips: 126,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'DRV-002',
    name: 'Miguel Santos',
    status: 'available',
    phone: '+63 917 832 4100',
    rating: 4.7,
    trips: 104,
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'DRV-003',
    name: 'Ricardo Lopez',
    status: 'available',
    phone: '+63 919 553 1170',
    rating: 4.9,
    trips: 168,
    avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'DRV-004',
    name: 'Antonio Reyes',
    status: 'on_delivery',
    phone: '+63 922 730 2811',
    rating: 4.6,
    trips: 89,
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
  },
]

const mockHelpers = [
  {
    id: 'HLP-001',
    name: 'Pedro Garcia',
    status: 'available',
    avatarUrl: 'https://images.unsplash.com/photo-1541535881962-3bb380b08458?auto=format&fit=crop&w=180&q=80',
  },
  {
    id: 'HLP-002',
    name: 'Luis Torres',
    status: 'available',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=180&q=80',
  },
  {
    id: 'HLP-003',
    name: 'Rico Aquino',
    status: 'available',
    avatarUrl: 'https://images.unsplash.com/photo-1463453091185-61582044d556?auto=format&fit=crop&w=180&q=80',
  },
  {
    id: 'HLP-004',
    name: 'Victor Cruz',
    status: 'on_delivery',
    avatarUrl: 'https://images.unsplash.com/photo-1552058544-f2b08422138a?auto=format&fit=crop&w=180&q=80',
  },
]

const mockTrucks = [
  {
    plateNumber: 'ABC 1234',
    truckType: 'AUV',
    status: 'available',
    capacity: '1.2 tons',
    imageUrl: 'https://images.unsplash.com/photo-1556122071-e404eaedb77f?auto=format&fit=crop&w=600&q=80',
  },
  {
    plateNumber: 'XYZ 5678',
    truckType: '2T_REF',
    status: 'available',
    capacity: '2.0 tons',
    imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
  },
  {
    plateNumber: 'DEF 9012',
    truckType: 'L300',
    status: 'available',
    capacity: '1.0 ton',
    imageUrl: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=600&q=80',
  },
  {
    plateNumber: 'JKL 7890',
    truckType: '2T_DRY',
    status: 'on_delivery',
    capacity: '2.0 tons',
    imageUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80',
  },
]

const REPORT_TABS = [
  { id: 'trip', label: 'Trip Summary', icon: Route },
  { id: 'behavior', label: 'Driver Behavior', icon: Activity },
  { id: 'delivery', label: 'Delivery Report', icon: ClipboardList },
]

function getRiskLevel(alertCount) {
  if (alertCount >= 4) return { tone: 'red', label: 'High Risk' }
  if (alertCount >= 2) return { tone: 'amber', label: 'Moderate' }
  return { tone: 'emerald', label: 'Safe' }
}

const RISK_BADGE_CLASSES = {
  red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
}

const RISK_ICONS = { red: ShieldAlert, amber: AlertTriangle, emerald: ShieldCheck }

function RiskBadge({ tone, label }) {
  const Icon = RISK_ICONS[tone] || ShieldCheck
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${RISK_BADGE_CLASSES[tone] || RISK_BADGE_CLASSES.emerald}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

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

const COMPLETED_REPORT_DATA = {
  'DEL-004': {
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

function CompletedDeliveryReport({ delivery, onClose }) {
  const report = COMPLETED_REPORT_DATA[delivery.id]
  const [reportTab, setReportTab] = useState('trip')

  if (!report) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No detailed report available for this delivery.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Delivery Report</p>
        <button onClick={onClose} className="text-xs text-sky-600 hover:text-sky-800 font-medium">Close</button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200 mb-4">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = reportTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setReportTab(tab.id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
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
              <p className="text-xs text-slate-500">Driver Risk Level</p>
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
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
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
    </div>
  )
}

function toGoogleMapEmbed(coords) {
  if (!coords) return 'https://maps.google.com/maps?q=14.5995,120.9842&z=12&output=embed'
  return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=14&output=embed`
}

function SupDeliveries() {
  const [requests, setRequests] = useState(mockRequests)
  const [activeModule, setActiveModule] = useState('inbox')
  const [trackingTab, setTrackingTab] = useState('ongoing')
  const [ongoingLane, setOngoingLane] = useState('FOR_PICKUP')
  const [search, setSearch] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [quotationForm, setQuotationForm] = useState({ amount: '', notes: '', validUntil: '' })
  const [negotiationAmount, setNegotiationAmount] = useState('')
  const [negotiationCallSchedule, setNegotiationCallSchedule] = useState('')
  const [assignment, setAssignment] = useState({ driverId: '', helperIds: [], plateNumber: '' })
  const [hasApproved, setHasApproved] = useState(false)
  const [quotationSubmitted, setQuotationSubmitted] = useState(false)
  const [expandedReport, setExpandedReport] = useState(null)

  const inboxRows = useMemo(
    () => requests.filter((r) => ['PENDING', 'QUOTED', 'APPROVED', 'ASSIGNED'].includes(r.status)),
    [requests],
  )

  const filteredInbox = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return inboxRows
    return inboxRows.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.companyName.toLowerCase().includes(q) ||
        r.pickupAddress.toLowerCase().includes(q) ||
        r.deliveryAddress.toLowerCase().includes(q),
    )
  }, [inboxRows, search])

  const ongoingDeliveries = useMemo(
    () => requests.filter((r) => ['FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(r.status)),
    [requests],
  )

  const canTrackSelectedRequest = Boolean(
    selectedRequest
      && ['FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(selectedRequest.status)
      && selectedRequest.crew?.driver
      && selectedRequest.crew?.truck?.plateNumber,
  )

  const completedDeliveries = useMemo(
    () => requests.filter((r) => ['COMPLETED', 'CANCELLED'].includes(r.status)),
    [requests],
  )

  const laneRows = ongoingDeliveries.filter((d) => d.status === ongoingLane)

  const highlightedTracking = useMemo(() => {
    const preferred = laneRows[0]
    return preferred || ongoingDeliveries[0] || null
  }, [laneRows, ongoingDeliveries])

  const activeStepIndex = selectedRequest
    ? deliverySteps.indexOf(statusByStep[selectedRequest.status] || 'REQUEST_CREATED')
    : -1

  const selectedDriver = mockDrivers.find((d) => d.id === assignment.driverId)
  const selectedTruck = mockTrucks.find((t) => t.plateNumber === assignment.plateNumber)
  const selectedHelpers = mockHelpers.filter((h) => assignment.helperIds.includes(h.id))
  const canConfirmAssignment = Boolean(selectedDriver && selectedTruck && selectedHelpers.length > 0)

  const openDetails = (request) => {
    setSelectedRequest(request)
    // If request is already past PENDING (APPROVED, QUOTED, etc.), expand the modal immediately
    setHasApproved(request.status !== 'PENDING')
    // Quotation step is considered done if the request already has a quotation
    setQuotationSubmitted(Boolean(request.quotation))
    setQuotationForm({
      amount: request.quotation?.amount || '',
      notes: request.quotation?.notes || '',
      validUntil: request.quotation?.validUntil || '',
    })
    setAssignment({
      driverId: request.crew?.driver?.id || '',
      helperIds: request.crew?.helpers?.map((h) => h.id) || [],
      plateNumber: request.crew?.truck?.plateNumber || '',
    })
  }

  const updateRequest = (id, patch) => {
    setRequests((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    setSelectedRequest((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  const submitQuotation = () => {
    if (!selectedRequest || !quotationForm.amount) return
    updateRequest(selectedRequest.id, {
      quotation: {
        amount: Number(quotationForm.amount),
        notes: quotationForm.notes,
        validUntil: quotationForm.validUntil,
      },
      status: 'QUOTED',
    })
    setQuotationSubmitted(true)
  }

  const startQuotation = () => {
    if (!selectedRequest) return
    // Move from PENDING to APPROVED and reveal the quotation form first.
    // Assignment UI will only appear once the quotation is submitted/approved.
    updateRequest(selectedRequest.id, { status: 'APPROVED' })
    setHasApproved(true)
    setQuotationSubmitted(false)
  }

  const approveRequest = () => {
    if (!selectedRequest) return
    updateRequest(selectedRequest.id, { status: 'APPROVED' })
    setHasApproved(true)
    setQuotationSubmitted(true)
  }

  const cancelRequest = () => {
    if (!selectedRequest) return
    updateRequest(selectedRequest.id, { status: 'CANCELLED' })
    setSelectedRequest(null)
  }

  const toggleHelper = (id) => {
    setAssignment((prev) => {
      if (prev.helperIds.includes(id)) {
        return { ...prev, helperIds: prev.helperIds.filter((v) => v !== id) }
      }
      if (prev.helperIds.length >= 2) return prev
      return { ...prev, helperIds: [...prev.helperIds, id] }
    })
  }

  const assignCrew = () => {
    if (!selectedRequest || !canConfirmAssignment) return

    const assignedAt = new Date().toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

    updateRequest(selectedRequest.id, {
      status: 'ASSIGNED',
      crew: { driver: selectedDriver, helpers: selectedHelpers, truck: selectedTruck },
      assignedAt,
    })
  }

  return (
    <SupLayout title="Deliveries" background={null} bg="bg-[#F6F7FB]">
      <div className="space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-sky-700">Supervisor Deliveries</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">Deliveries Inbox and Live Tracking</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
            Cleaner workflow for request review, quotation approval, crew assignment, and active-delivery tracking.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveModule('inbox')}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              activeModule === 'inbox' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            Delivery Requests Inbox ({inboxRows.length})
          </button>
          <button
            onClick={() => setActiveModule('tracking')}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              activeModule === 'tracking' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            Live Tracking ({ongoingDeliveries.length + completedDeliveries.length})
          </button>
        </div>

        {activeModule === 'inbox' && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by request ID, customer, company, pickup, or drop-off"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="hidden grid-cols-[1.2fr_1.5fr_1.5fr_1fr_0.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
                <span>Customer / Company</span>
                <span>Pick-up Address</span>
                <span>Drop-off Address</span>
                <span>Product Type</span>
                <span className="text-right">Action</span>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredInbox.length === 0 && (
                  <div className="px-5 py-14 text-center text-slate-500">No requests found in the inbox.</div>
                )}

                {filteredInbox.map((row) => (
                  <article key={row.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_1.5fr_1.5fr_1fr_0.8fr] lg:items-center">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.customerName}</p>
                      <p className="text-xs text-slate-500">{row.companyName}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadge[row.status]}`}>
                        {row.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{row.pickupAddress}</p>
                    <p className="text-sm text-slate-700">{row.deliveryAddress}</p>
                    <p className="text-sm font-medium text-slate-800">{row.itemType}</p>
                    <div className="flex justify-end">
                      <button
                        onClick={() => openDetails(row)}
                        className="rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
                      >
                        View Details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeModule === 'tracking' && (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-3">
              <button
                onClick={() => setTrackingTab('ongoing')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  trackingTab === 'ongoing' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                On-going Deliveries ({ongoingDeliveries.length})
              </button>
              <button
                onClick={() => setTrackingTab('completed')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  trackingTab === 'completed' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Completed Deliveries ({completedDeliveries.length})
              </button>
            </div>

            {trackingTab === 'ongoing' && (
              <>
                <div className="flex flex-wrap gap-3">
                  {['FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'].map((lane) => (
                    <button
                      key={lane}
                      onClick={() => setOngoingLane(lane)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                        ongoingLane === lane ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {lane === 'FOR_PICKUP' ? 'For Pickup' : lane === 'OUT_FOR_DELIVERY' ? 'Out for Delivery' : 'Delivered'}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-slate-900">Active Deliveries List</h3>
                    <div className="mt-3 space-y-3">
                      {laneRows.length === 0 && <p className="text-sm text-slate-500">No deliveries in this status.</p>}
                      {laneRows.map((delivery) => (
                        <button
                          key={delivery.id}
                          onClick={() => openDetails(delivery)}
                          className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-sky-300 hover:bg-sky-50"
                        >
                          <p className="text-sm font-semibold text-slate-900">{delivery.id} • {delivery.companyName}</p>
                          <p className="mt-1 text-xs text-slate-600">{delivery.deliveryAddress}</p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                            <Truck className="h-3.5 w-3.5" />
                            <span>{delivery.crew?.truck?.plateNumber || 'Truck TBA'}</span>
                            <Calendar className="ml-3 h-3.5 w-3.5" />
                            <span>{delivery.pickupDate} {delivery.pickupTime}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-200 px-4 py-3">
                        <h3 className="text-base font-semibold text-slate-900">Real-time Truck Location</h3>
                        <p className="text-xs text-slate-500">
                          {highlightedTracking ? `${highlightedTracking.id} • ${highlightedTracking.status.replaceAll('_', ' ')}` : 'No active truck'}
                        </p>
                      </div>
                      <iframe
                        title="Live Delivery Map"
                        src={toGoogleMapEmbed(highlightedTracking?.currentLocation || highlightedTracking?.destinationCoords)}
                        className="h-64 w-full"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Driver Analytics</p>
                        <p className="text-xl font-bold text-slate-900">94%</p>
                        <p className="text-xs text-slate-500">Average on-time rate</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Active Trucks</p>
                        <p className="text-xl font-bold text-slate-900">{ongoingDeliveries.length}</p>
                        <p className="text-xs text-slate-500">Across all lanes</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {trackingTab === 'completed' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-semibold text-slate-900">Completed Deliveries History</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {completedDeliveries.filter(d => d.status === 'COMPLETED').length} completed, {completedDeliveries.filter(d => d.status === 'CANCELLED').length} cancelled
                  </p>
                  <div className="mt-3 space-y-3">
                    {completedDeliveries.length === 0 && (
                      <p className="text-sm text-slate-500 py-4 text-center">No completed deliveries yet.</p>
                    )}
                    {completedDeliveries.map((delivery) => (
                      <div key={delivery.id} className="rounded-xl border border-slate-200 overflow-hidden">
                        <article className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-slate-900">{delivery.id}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  delivery.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                }`}>
                                  {delivery.status}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5">{delivery.companyName} • {delivery.deliveryAddress}</p>
                              {delivery.crew?.driver && (
                                <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                                  <span className="flex items-center gap-1">
                                    <Truck className="h-3 w-3" />
                                    {delivery.crew.truck.plateNumber}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {delivery.crew.driver.name}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {delivery.pickupDate}
                                  </span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                setExpandedReport(expandedReport === delivery.id ? null : delivery.id)
                              }
                              className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                expandedReport === delivery.id
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                              }`}
                            >
                              {expandedReport === delivery.id ? (
                                <>Hide Report <ChevronUp className="h-3 w-3" /></>
                              ) : (
                                <>View Report <ChevronDown className="h-3 w-3" /></>
                              )}
                            </button>
                          </div>
                        </article>
                        {expandedReport === delivery.id && (
                          <div className="border-t border-slate-200 px-3 pb-3 pt-0">
                            <CompletedDeliveryReport
                              delivery={delivery}
                              onClose={() => setExpandedReport(null)}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div
            className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 md:p-6 transition-all duration-300 ${
              hasApproved ? 'max-w-6xl' : 'max-w-2xl'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Request Details</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">{selectedRequest.id} • {selectedRequest.companyName}</h2>
                <p className="mt-1 text-sm text-slate-600">{selectedRequest.customerName}</p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className={`mt-5 grid gap-5 transition-all duration-300 ${
                hasApproved ? 'lg:grid-cols-[1fr_1fr]' : 'grid-cols-1'
              }`}
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Delivery Overview</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-slate-700"><span className="font-medium">Customer:</span> {selectedRequest.customerName}</p>
                    <p className="text-slate-700"><span className="font-medium">Company:</span> {selectedRequest.companyName}</p>
                    <p className="text-slate-700"><span className="font-medium">Pick-up:</span> {selectedRequest.pickupAddress}</p>
                    <p className="text-slate-700"><span className="font-medium">Drop-off:</span> {selectedRequest.deliveryAddress}</p>
                    <p className="text-slate-700"><span className="font-medium">Products:</span> {selectedRequest.itemType}</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Drop-off Location (Google Maps)</h3>
                  </div>
                  <iframe
                    title="Drop-off Google Map"
                    src={toGoogleMapEmbed(selectedRequest.destinationCoords)}
                    className="h-64 w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>

                {/* Approve/Cancel buttons - only visible for PENDING requests */}
                {selectedRequest.status === 'PENDING' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={startQuotation}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve Request
                    </button>
                    <button
                      onClick={cancelRequest}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Cancel Request
                    </button>
                  </div>
                )}

                {/* Progress Timeline - only visible after approval */}
                {hasApproved && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Progress Timeline</h3>
                  <div className="mt-3">
                    <div className="relative flex w-full items-center">
                      {/* Progress bar behind circles */}
                      <div className="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-slate-200">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${(activeStepIndex / (deliverySteps.length - 1)) * 100}%`
                          }}
                        />
                      </div>

                      {/* Circles */}
                      <div className="relative z-10 flex w-full items-center">
                        {deliverySteps.map((step, index) => {
                          const current = index === activeStepIndex
                          const reached = index <= activeStepIndex
                          const stepIcons = {
                            REQUEST_CREATED: reached ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />,
                            QUOTATION_SENT: reached ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />,
                            CREW_ASSIGNED: reached ? <Check className="h-4 w-4" /> : <Users className="h-4 w-4" />,
                            PICKUP: reached ? <Check className="h-4 w-4" /> : <Package className="h-4 w-4" />,
                            DELIVERED: <CheckCircle2 className="h-4 w-4" />,
                          }

                          return (
                            <div key={step} className="flex flex-1 items-center justify-center">
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                                  current
                                    ? 'border-sky-600 bg-sky-600 text-white'
                                    : reached
                                      ? 'border-emerald-600 bg-emerald-600 text-white'
                                      : 'border-slate-300 bg-white text-slate-400'
                                }`}
                              >
                                {stepIcons[step]}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Step labels */}
                    <div className="mt-2 flex w-full">
                      {deliverySteps.map((step, index) => {
                        const done = index < activeStepIndex
                        const current = index === activeStepIndex
                        const reached = index <= activeStepIndex

                        return (
                          <div key={step} className="flex flex-1 justify-center">
                            <div className="min-w-0 text-center">
                              <p className={`truncate text-xs font-semibold leading-tight ${current ? 'text-sky-700' : reached ? 'text-slate-900' : 'text-slate-500'}`}>
                                {stepLabel[step]}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {current ? 'In Progress' : done ? 'Completed' : 'Waiting'}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                )}
              </div>

              <div className="space-y-4">
                {hasApproved && (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Quotation</h3>

                  {/* Show form whenever the request has been approved but no quotation exists yet */}
                  {!selectedRequest.quotation && !quotationSubmitted && (
                    <>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input
                          type="number"
                          value={quotationForm.amount}
                          onChange={(e) => setQuotationForm((prev) => ({ ...prev, amount: e.target.value }))}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300"
                          placeholder="Amount (PHP)"
                        />
                        <input
                          type="date"
                          value={quotationForm.validUntil}
                          onChange={(e) => setQuotationForm((prev) => ({ ...prev, validUntil: e.target.value }))}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300"
                        />
                        <textarea
                          value={quotationForm.notes}
                          onChange={(e) => setQuotationForm((prev) => ({ ...prev, notes: e.target.value }))}
                          className="sm:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300"
                          rows={3}
                          placeholder="Quotation notes"
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2.5">
                        <button
                          onClick={submitQuotation}
                          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                        >
                          <Send className="h-4 w-4" />
                          Submit Quotation
                        </button>
                      </div>
                    </>
                  )}

                  {/* QUOTED - Quotation sent, waiting for customer or negotiating */}
                  {selectedRequest.status === 'QUOTED' && selectedRequest.quotation && (
                    <div className="mt-3 space-y-3">
                      {/* If customer hasn't responded yet, show waiting message */}
                      {!selectedRequest.customerWants && (
                        <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                          <div className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                          <p className="text-sm text-sky-800">
                            Waiting for customer to review quotation.
                          </p>
                        </div>
                      )}

                      {/* If customer wants to negotiate, show negotiation UI */}
                      {selectedRequest.customerWants && (
                        <>
                          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                            <p className="text-sm text-amber-800">
                              Customer wants to negotiate the price.
                            </p>
                          </div>

                          {/* Current quotation */}
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Your Quotation</p>
                            <p className="text-lg font-bold text-slate-900">
                              PHP {Number(selectedRequest.quotation.amount).toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-500">{selectedRequest.quotation.notes}</p>
                          </div>

                          {/* Customer's requested amount */}
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                            <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Customer's Counter Offer</p>
                            <p className="text-lg font-bold text-amber-800">
                              PHP {Number(selectedRequest.customerWants).toLocaleString()}
                            </p>
                          </div>

                          {/* Schedule a call */}
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              Schedule a Call for Negotiation
                            </label>
                            <input
                              type="datetime-local"
                              value={negotiationCallSchedule}
                              onChange={(e) => setNegotiationCallSchedule(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300"
                            />
                          </div>

                          {/* Google Meet Link */}
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              Google Meet Link
                            </label>
                            <input
                              type="url"
                              value={selectedRequest.meetLink || ''}
                              onChange={(e) => {
                                updateRequest(selectedRequest.id, { meetLink: e.target.value })
                              }}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300"
                              placeholder="https://meet.google.com/..."
                            />
                          </div>

                          {/* Counter offer input */}
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              Your Counter Offer
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={negotiationAmount}
                                onChange={(e) => setNegotiationAmount(e.target.value)}
                                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300"
                                placeholder="Counter offer amount (PHP)"
                              />
                              <button
                                onClick={() => {
                                  if (negotiationAmount) {
                                    updateRequest(selectedRequest.id, {
                                      quotation: {
                                        ...selectedRequest.quotation,
                                        amount: Number(negotiationAmount),
                                      },
                                    })
                                    setNegotiationAmount('')
                                  }
                                }}
                                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                              >
                                <Check className="h-4 w-4" />
                                Submit Counter
                              </button>
                            </div>
                          </div>

                          {/* Approve original quotation */}
                          <button
                            onClick={approveRequest}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve Original Quotation
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* APPROVED or later - Quotation approved, show summary */}
                  {['APPROVED', 'ASSIGNED', 'FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(selectedRequest.status) && selectedRequest.quotation && (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <p className="text-sm text-emerald-800 font-medium">
                          Quotation Approved
                        </p>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Approved Amount</p>
                            <p className="text-2xl font-bold text-emerald-800">
                              PHP {Number(selectedRequest.quotation.amount).toLocaleString()}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <Check className="h-3 w-3" />
                            Approved
                          </span>
                        </div>
                        <div className="pt-2 border-t border-emerald-200">
                          <p className="text-sm text-emerald-700">{selectedRequest.quotation.notes}</p>
                          <p className="text-xs text-emerald-600 mt-1">Valid until: {selectedRequest.quotation.validUntil}</p>
                        </div>
                      </div>

                      <button
                        onClick={cancelRequest}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Cancel Request
                      </button>
                    </div>
                  )}
                </div>
                )}

                {hasApproved && quotationSubmitted && ['APPROVED', 'ASSIGNED', 'FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(selectedRequest.status) && (
                  <div
                    className={`rounded-2xl border bg-gradient-to-b p-4 transition-colors ${
                      selectedRequest.crew?.driver && selectedRequest.crew?.truck?.plateNumber
                        ? 'border-emerald-400 from-emerald-50 to-white'
                        : 'border-indigo-200 from-indigo-50 to-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Dispatch and Assignment</h3>
                        <p className="mt-1 text-xs text-slate-600">Choose the best-fit crew and truck for this approved request.</p>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-slate-200">
                          Drivers: {mockDrivers.filter((d) => d.status === 'available').length}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-slate-200">
                          Trucks: {mockTrucks.filter((t) => t.status === 'available').length}
                        </span>
                      </div>
                    </div>

                    {selectedRequest.crew?.driver && selectedRequest.crew?.truck?.plateNumber && (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        <p className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4" />
                          Assignment saved successfully
                        </p>
                        <p className="mt-1 text-xs text-emerald-700">
                          {selectedRequest.crew.driver.name} • {selectedRequest.crew.truck.plateNumber}
                          {selectedRequest.assignedAt ? ` • Saved ${selectedRequest.assignedAt}` : ''}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available Drivers</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {mockDrivers
                          .filter((d) => d.status === 'available' || d.id === assignment.driverId)
                          .map((driver) => {
                            const isSelected = assignment.driverId === driver.id
                            return (
                              <button
                                type="button"
                                key={driver.id}
                                onClick={() => setAssignment((prev) => ({ ...prev, driverId: driver.id }))}
                                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                                  isSelected
                                    ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                                    : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                                }`}
                              >
                                <img
                                  src={driver.avatarUrl}
                                  alt={driver.name}
                                  className="h-12 w-12 rounded-lg object-cover"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{driver.name}</p>
                                  <p className="text-xs text-slate-500">{driver.id} • {driver.phone}</p>
                                  <p className="text-xs text-slate-600">{driver.trips} completed trips • ★ {driver.rating}</p>
                                </div>
                              </button>
                            )
                          })}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available Trucks</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {mockTrucks
                          .filter((t) => t.status === 'available' || t.plateNumber === assignment.plateNumber)
                          .map((truck) => {
                            const isSelected = assignment.plateNumber === truck.plateNumber
                            return (
                              <button
                                type="button"
                                key={truck.plateNumber}
                                onClick={() => setAssignment((prev) => ({ ...prev, plateNumber: truck.plateNumber }))}
                                className={`overflow-hidden rounded-xl border text-left transition ${
                                  isSelected
                                    ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                                    : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                                }`}
                              >
                                <img
                                  src={truck.imageUrl}
                                  alt={`${truck.plateNumber} ${truck.truckType}`}
                                  className="h-16 w-full object-cover"
                                />
                                <div className="p-3">
                                  <p className="text-sm font-semibold text-slate-900">{truck.plateNumber}</p>
                                  <p className="text-xs text-slate-500">{truck.truckType} • Capacity {truck.capacity}</p>
                                </div>
                              </button>
                            )
                          })}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available Helpers (max 2)</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {mockHelpers
                          .filter((h) => h.status === 'available' || assignment.helperIds.includes(h.id))
                          .map((helper) => {
                            const isChecked = assignment.helperIds.includes(helper.id)
                            return (
                              <button
                                type="button"
                                key={helper.id}
                                onClick={() => toggleHelper(helper.id)}
                                disabled={!isChecked && assignment.helperIds.length >= 2}
                                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                                  isChecked
                                    ? 'border-indigo-400 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200'
                                    : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                                }`}
                              >
                                <span className="flex min-w-0 items-center gap-3">
                                  <img
                                    src={helper.avatarUrl}
                                    alt={helper.name}
                                    className="h-12 w-12 rounded-lg object-cover"
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold">{helper.name}</span>
                                    <span className="block text-xs text-slate-500">{helper.id} • Loading Team</span>
                                  </span>
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isChecked ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                  {isChecked ? 'Selected' : 'Select'}
                                </span>
                              </button>
                            )
                          })}
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                      <p className="font-semibold text-slate-900">Auto-filled Dispatch Details</p>
                      <div className="mt-2 grid gap-2 text-slate-700 sm:grid-cols-2">
                        <p><span className="font-medium">Plate Number:</span> {selectedTruck?.plateNumber || 'Select truck'}</p>
                        <p><span className="font-medium">Driver ID:</span> {selectedDriver?.id || 'Select driver'}</p>
                        <p><span className="font-medium">Driver Name:</span> {selectedDriver?.name || 'Select driver'}</p>
                        <p><span className="font-medium">Delivery Location:</span> {selectedRequest.deliveryAddress}</p>
                        <p><span className="font-medium">Date and Time:</span> {selectedRequest.pickupDate} {selectedRequest.pickupTime}</p>
                        <p><span className="font-medium">Helpers:</span> {assignment.helperIds.length || 0} selected</p>
                      </div>
                    </div>

                    <button
                      onClick={assignCrew}
                      disabled={!canConfirmAssignment}
                      title={!canConfirmAssignment ? 'Select a valid driver, truck, and at least one helper to confirm assignment.' : undefined}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Users className="h-4 w-4" />
                      {selectedRequest.crew?.driver ? 'Update Assignment' : 'Confirm Assignment'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                onClick={() => setSelectedRequest(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (!canTrackSelectedRequest) return
                  setActiveModule('tracking')
                  setSelectedRequest(null)
                }}
                disabled={!canTrackSelectedRequest}
                title={!canTrackSelectedRequest ? 'Tracking is available only for assigned on-going deliveries.' : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition ${
                  canTrackSelectedRequest ? 'bg-slate-900 hover:bg-slate-800' : 'cursor-not-allowed bg-slate-300'
                }`}
              >
                <MapPin className="h-4 w-4" />
                Go to Live Tracking
              </button>
            </div>
          </div>
        </div>
      )}
    </SupLayout>
  )
}

export default SupDeliveries
