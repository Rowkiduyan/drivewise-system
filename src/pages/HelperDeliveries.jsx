import { useEffect, useState } from 'react'
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Navigation,
  Pause,
  Search,
  Truck,
  Wallet,
} from 'lucide-react'
import HelperLayout from '../layout/HelperLayout.jsx'
import { supabase } from '../lib/supabaseClient.js'

// Helper-facing workflow: Assigned -> Heading to Pickup -> Out for Delivery ->
// Delivered. Read-only — the Helper never presses Start/Pause/Resume/End
// Trip (only the Driver does, see 03_START_TRIP_AND_SESSION.md's "Helper
// visibility" note); this page just reflects the same delivery_requests
// status and Active/Paused session state the Driver's screen drives.
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

// Today's date as "YYYY-MM-DD" in the user's local timezone — matches
// DriverDeliveries.jsx's localTodayISO, avoiding the UTC-vs-local mismatch
// toISOString() has for timezones east of UTC (e.g. PH, UTC+8).
function localTodayISO() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
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

// Shapes the admin-users get-helper-deliveries payload into what this page
// renders — mirrors DriverDeliveries.jsx's mapDelivery for the same reason:
// the client can't read delivery_requests/*_records directly (service_role
// only, see DATABASE.md / SUPABASE_GOTCHAS.md #8).
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
    status: DB_TO_HELPER_STATUS[d.status] || str(d.status),
    hasOpenSession: Boolean(d.hasOpenSession),
    assignedAt: formatAssignedAt(d.assignedAt),
    quotation: d.quotation ? { amount: Number(d.quotation.amount) } : null,
    crew: {
      driver: d.driver ? { id: str(d.driver.id), name: str(d.driver.name), phone: str(d.driver.phone) } : { id: '', name: 'Unassigned', phone: '' },
      helpers: d.helpers || [],
      truck: d.truck
        ? { plateNumber: str(d.truck.plateNumber), truckType: str(d.truck.truckType), capacity: str(d.truck.capacity || '') }
        : { plateNumber: '—', truckType: '', capacity: '' },
    },
    pickupCoords: parseCoords(d.pickupAddress),
    destinationCoords: parseCoords(d.deliveryAddress),
  }
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
            {delivery.pickupDate}{showTime ? ` • ${delivery.pickupTime}` : ''}
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

// Detail screen for a delivery — same layout as the driver's, minus the
// Delivery Report section (driver behavior/route analysis is not part of the
// helper module).
function DeliveryDetailView({ delivery, onBack, onOpenDirections, currentHelperName }) {
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
                <p className="font-medium text-slate-900">{delivery.pickupDate} at {delivery.pickupTime}</p>
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

          {/* Route Overview */}
          <section className="overflow-hidden rounded-xl border border-teal-200/70">
            <div className="border-b border-teal-200/70 bg-teal-50 px-3 py-2">
              <h3 className="text-xs font-bold text-slate-900">Route Overview</h3>
            </div>
            <iframe
              title="Route Map"
              src={toGoogleMapEmbed(delivery.destinationCoords)}
              className="h-40 w-full sm:h-48"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="space-y-1.5 border-t border-teal-200/70 bg-white px-3 py-2.5 text-[11px]">
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

          {delivery.pickupCoords && delivery.destinationCoords && (
            <button
              onClick={() => onOpenDirections(delivery.pickupCoords, delivery.destinationCoords)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800"
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

  const active = data.active
  const statusCfg = active ? statusConfig[active.status] : null
  const todayISO = localTodayISO()
  const isActiveToday = active ? active.pickupDate === todayISO : false
  const todayCount = isActiveToday ? 1 : 0
  const upcomingCount = data.upcoming.length
  const pastCount = data.completed.length

  // Same "Paused isn't a stored value" read as DriverDeliveries.jsx — a delivery
  // past ASSIGNED with no open Session means the driver has paused the trip.
  const isDrivingStage = Boolean(active) && (active.status === 'FOR_PICKUP' || active.status === 'OUT_FOR_DELIVERY')
  const isPausedTrip = isDrivingStage && !active.hasOpenSession

  const isCurrentHelper = (member) =>
    Boolean(currentHelperName) && member.name.trim().toLowerCase() === currentHelperName.trim().toLowerCase()

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

  useEffect(() => {
    let isMounted = true

    async function loadDeliveries() {
      setIsLoadingDeliveries(true)
      setDeliveriesError('')
      const { data: result, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'get-helper-deliveries' },
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

  const openDirections = (origin, destination) => {
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`, '_blank')
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
        {activeTab === 'today' && (active && isActiveToday ? (
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
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-700">P</span>
                    <div className="my-0.5 w-px flex-1 bg-teal-200" />
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700">D</span>
                  </div>
                  <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5">
                    <p className="truncate text-xs font-medium leading-tight text-slate-800">{active.pickupAddress}</p>
                    <p className="truncate text-xs font-medium leading-tight text-slate-800">{active.deliveryAddress}</p>
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
                    <p className="truncate text-xs font-bold text-slate-900">{active.pickupTime}</p>
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

                <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5">
                  <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-slate-400">To</span>
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {active.customerName} <span className="font-normal text-slate-500">&bull; {active.companyName}</span>
                  </p>
                </div>
              </section>

              {/* Route & Navigation — helper sees the same live route the driver does. */}
              <section className="overflow-hidden rounded-xl border border-teal-200/70 bg-white">
                <div className="border-b border-teal-200/70 bg-teal-50 px-3 py-2">
                  <h3 className="text-xs font-bold text-slate-900">Route Overview</h3>
                </div>
                <iframe
                  title="Navigation Map"
                  src={toGoogleMapEmbed(active.destinationCoords)}
                  className="h-36 w-full sm:h-44"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="space-y-1.5 border-t border-teal-200/70 px-3 py-2.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700">P</span>
                    <span className="truncate text-slate-600">{active.pickupAddress}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700">D</span>
                    <span className="truncate text-slate-600">{active.deliveryAddress}</span>
                  </div>
                </div>
                <div className="border-t border-teal-200/70 p-2.5">
                  <button
                    onClick={() => openDirections(active.pickupCoords, active.destinationCoords)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-teal-900 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-teal-800"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Navigate Now
                  </button>
                </div>
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
                      <p className="font-medium text-slate-900">{active.pickupDate} at {active.pickupTime}</p>
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
              onOpenDirections={openDirections}
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
              onOpenDirections={openDirections}
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
    </HelperLayout>
  )
}

export default HelperDeliveries
