import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Calendar, Camera, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Clock, FileText, MapPin, Package, Search, Send, Truck, Users, X
} from 'lucide-react'
import CustomerLayout from '../layout/CustomerLayout.jsx'
import { truckTypes, getItemTypeLabel } from '../lib/deliveryOptions.js'
import { supabase } from '../lib/supabaseClient.js'
import { manilaTodayISO, MANILA_TIMEZONE } from '../lib/manilaTime.js'

const background = null

// Explicit Inter typeface for this page's content, matching CustomerLayout's
// own font stack instead of relying solely on inherited font-family.
const interFontStyle = { fontFamily: 'Inter, system-ui, sans-serif' }

function format12Hour(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

// "2026-08-05" + "11:04:00" -> "Aug 5, 2026, 11:04 AM" — human-readable
// pickup/drop-off datetime, matching the supervisor's deliveries page.
// timeEndStr, when given, renders a Pickup window ("11:04 AM - 11:19 AM")
// instead of a single instant.
function formatDisplayDateTime(dateStr, timeStr, timeEndStr) {
  if (!dateStr) return 'TBD'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const [year, month, day] = parts.map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthLabel = months[month - 1] || ''
  if (!timeStr) return `${monthLabel} ${day}, ${year}`
  const formattedTime = timeEndStr ? `${format12Hour(timeStr)} - ${format12Hour(timeEndStr)}` : format12Hour(timeStr)
  return `${monthLabel} ${day}, ${year}, ${formattedTime}`
}

// Whole calendar days between Manila-local "today" and a delivery's
// pickup_date (both "YYYY-MM-DD"), independent of time-of-day -- pickup
// dates are calendar dates, not timestamps, and Date.toISOString() (UTC)
// would shift "today" a day early/late during the Manila morning if used
// directly instead of manilaTodayISO().
function daysUntilPickup(pickupDate) {
  if (!pickupDate) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((new Date(`${pickupDate}T00:00:00`) - new Date(`${manilaTodayISO()}T00:00:00`)) / msPerDay)
}

// Status configuration
const statusConfig = {
  PENDING_REQUEST: { label: 'Pending Request', color: 'bg-amber-100 text-amber-800', icon: Clock },
  PROCESSING: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: AlertTriangle },
  FOR_PICKUP: { label: 'For Pickup', color: 'bg-purple-100 text-purple-800', icon: Package },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', color: 'bg-indigo-100 text-indigo-800', icon: Truck },
  DELIVERED: { label: 'Delivered', color: 'bg-teal-100 text-teal-800', icon: MapPin },
  DELIVERY_COMPLETED: { label: 'Completed', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: X }
}

// Statuses where cancellation is still possible — once a delivery is out for
// delivery, delivered, completed, or already cancelled, there's nothing left
// to cancel. Combined with CANCEL_MIN_DAYS_BEFORE_PICKUP below (the actual
// cutoff): a delivery must be at least that many days out from its scheduled
// pickup date, regardless of whether a crew has already been assigned.
// Instant, no supervisor approval step -- an earlier "requires approval once
// a crew is assigned" path existed but only updated local state, never
// persisted anywhere and had no Supervisor UI to act on it, so it never
// actually worked; this replaces it with a single date-based rule.
const CANCELLABLE_STATUSES = ['PENDING_REQUEST', 'PROCESSING', 'FOR_PICKUP']
const CANCEL_MIN_DAYS_BEFORE_PICKUP = 2

// Map the database's status vocabulary to the customer page's labels. The
// customer page has its own set (PROCESSING, FOR_PICKUP, OUT_FOR_DELIVERY,
// DELIVERED, DELIVERY_COMPLETED) while the backend uses finer-grained statuses
// (QUOTATION_SUBMITTED, COUNTER_OFFER_SUBMITTED, APPROVED, ASSIGNED,
// OUT_FOR_PICKUP, ...). The raw DB status is kept on the row as `dbStatus`.
const CUSTOMER_STATUS_MAP = {
  PENDING_REQUEST: 'PENDING_REQUEST',
  QUOTATION_SUBMITTED: 'PROCESSING',
  COUNTER_OFFER_SUBMITTED: 'PROCESSING',
  FINAL_QUOTATION_SUBMITTED: 'PROCESSING',
  APPROVED: 'FOR_PICKUP',
  ASSIGNED: 'FOR_PICKUP',
  OUT_FOR_PICKUP: 'FOR_PICKUP',
  ARRIVED_PICKUP: 'FOR_PICKUP',
  OUT_FOR_DROPOFF: 'OUT_FOR_DELIVERY',
  ARRIVED_DROPOFF: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERY_COMPLETED',
  CANCELLED: 'CANCELLED',
}

// Statuses at or past quotation approval — used to reconstruct
// `quotationApproved` on reload (the flag itself is only kept in local state).
const APPROVED_STATUSES = [
  'APPROVED', 'ASSIGNED', 'OUT_FOR_PICKUP', 'ARRIVED_PICKUP',
  'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED',
]

const cancellationReasons = [
  'Change of schedule',
  'Found another transport provider',
  'Pricing or budget concerns',
  'Duplicate or mistaken request',
  'No longer needed',
  'Other'
]

// Per-tab empty-state copy — shown when a tab has zero matching requests, so
// "nothing here" always reads as expected-and-fine rather than a blank void.
const emptyStateCopy = {
  all: { title: 'No delivery requests yet', subtitle: 'Tap "Request Delivery" to submit your first one.' },
  PENDING_REQUEST: { title: 'No pending requests', subtitle: 'Newly submitted requests awaiting review will show up here.' },
  PROCESSING: { title: 'Nothing in processing', subtitle: 'Requests being quoted by a supervisor will show up here.' },
  FOR_PICKUP: { title: 'No deliveries for pickup', subtitle: 'Confirmed requests ready for pickup will show up here.' },
  OUT_FOR_DELIVERY: { title: 'Nothing out for delivery', subtitle: 'Deliveries currently en route will show up here.' },
  DELIVERED: { title: 'No delivered items', subtitle: 'Items awaiting your confirmation will show up here.' },
  DELIVERY_COMPLETED: { title: 'No completed deliveries yet', subtitle: 'Finished deliveries will show up here.' },
  CANCELLED: { title: 'No cancelled requests' }
}

// Slides its content in from the left/right — gives tab switching a
// page-transition feel. The caller passes `key={activeTab}` so React remounts
// a fresh instance on every tab switch (starting at entered=false); the
// effect below only flips it to true after mount, via rAF. Plain CSS
// transition, no animation library, so the cost is one composited
// transform/opacity transition per tab switch — negligible even with a much
// longer list.
function TabPanel({ direction, children }) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="overflow-hidden">
      <div
        style={{
          transform: entered ? 'translateX(0)' : `translateX(${direction * 48}px)`,
          opacity: entered ? 1 : 0,
          transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease'
        }}
      >
        {children}
      </div>
    </div>
  )
}

// Maps a request's current status to a position in the shared delivery
// lifecycle so the timeline below can mark earlier stages "done" and the
// matching stage "current" — mirrors the stage index used on the supervisor
// side, kept in its own customer-facing status set.
const CUSTOMER_TIMELINE_STAGE_INDEX = {
  PENDING_REQUEST: 0,
  PROCESSING: 1,
  FOR_PICKUP: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  DELIVERY_COMPLETED: 5,
}

// "2026-07-29T10:30:00" -> "Jul 29, 2026, 10:30 AM" — for the timeline's
// per-event timestamps, distinct from formatDisplayDate (date-only, used for
// the mobile Delivery Overview rows).
function formatTimestamp(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    timeZone: MANILA_TIMEZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/**
 * ===== CUSTOMER DELIVERY TIMELINE — BACKEND GUIDE =====
 *
 * Matches the level of detail in the supervisor's Progress Details tracker
 * (buildProgressData in SupDeliveries.jsx) — every stage lists its own
 * timestamped sub-events instead of one summary line — but scoped to what a
 * customer should see: what happened to THEIR request and when. It
 * intentionally omits crew-assignment mechanics, quotation cost formulas,
 * driver/route analytics, and any other supervisor-only operational detail;
 * those stay on the supervisor side.
 *
 * A sub-event is only ever added to a stage's `substeps` once it has
 * actually happened (driven by real fields on the request), so nothing
 * "not yet done" is ever shown.
 *
 * BACKEND TO-DO: the supervisor's own tracker has the same gap today — persist
 * a real timestamp for quotation-sent and crew-assigned events (currently
 * there's no dedicated field for either), and this can drop the `sentTs`
 * placeholder below in favor of it, exactly as noted in buildProgressData's
 * own backend guide.
 */
function buildCustomerTimeline(request) {
  if (request.status === 'CANCELLED') {
    return [
      {
        key: 'submitted',
        label: 'Request Submitted',
        done: true,
        current: false,
        substeps: [
          { label: 'Request Received', timestamp: formatTimestamp(request.createdAt) },
        ],
      },
      {
        key: 'cancelled',
        label: 'Request Cancelled',
        done: true,
        current: false,
        cancelled: true,
        substeps: [
          {
            label: [
              'Request Cancelled',
              request.cancelledBy ? `by ${request.cancelledBy === 'customer' ? 'you' : 'the supervisor'}` : null,
            ].filter(Boolean).join(' '),
            timestamp: formatTimestamp(request.cancelledAt),
          },
          ...(request.cancelReason ? [{ label: `Reason: ${request.cancelReason}`, timestamp: null }] : []),
        ],
      },
    ]
  }

  const currentIdx = CUSTOMER_TIMELINE_STAGE_INDEX[request.status] ?? 0
  const quotationAmount = request.quotation
    ? (typeof request.quotation === 'object' ? request.quotation.amount : request.quotation)
    : null
  const hasNegotiation = Boolean(request.previousQuotation)
  // Placeholder for events the backend doesn't yet timestamp individually —
  // see the backend guide above.
  const sentTs = formatTimestamp(request.createdAt)

  const quotationSubsteps = []
  if (hasNegotiation) {
    quotationSubsteps.push({ label: 'Initial Quotation Received', timestamp: sentTs })
    if (request.priceRange) {
      quotationSubsteps.push({
        label: `You Requested ₱${Number(request.priceRange.min).toLocaleString()}–₱${Number(request.priceRange.max).toLocaleString()}`,
        timestamp: formatTimestamp(request.quotationRespondedAt) || sentTs,
      })
    }
    if (quotationAmount) {
      quotationSubsteps.push({ label: 'Revised Quotation Received', timestamp: sentTs })
    }
  } else if (quotationAmount) {
    quotationSubsteps.push({ label: 'Quotation Received', timestamp: sentTs })
  }
  if (request.quotationApproved) {
    quotationSubsteps.push({
      label: 'Quotation Approved',
      timestamp: formatTimestamp(request.quotationRespondedAt) || sentTs,
    })
  }

  const steps = [
    {
      key: 'submitted',
      label: 'Request Submitted',
      substeps: [
        { label: 'Request Received', timestamp: formatTimestamp(request.createdAt) },
      ],
    },
    {
      key: 'quotation',
      label: 'Quotation & Approval',
      substeps: quotationSubsteps,
    },
    {
      key: 'pickup',
      label: 'Scheduled for Pickup',
      substeps: request.crew ? [
        { label: 'Delivery Crew Assigned', timestamp: sentTs },
        ...(request.confirmedPickupDate ? [{ label: `Pickup Scheduled — ${request.confirmedPickupDate} at ${request.confirmedPickupTime}`, timestamp: null }] : []),
      ] : [],
    },
    {
      key: 'transit',
      label: 'Out for Delivery',
      substeps: [
        ...(request.trip?.actualPickup ? [{ label: 'Picked Up', timestamp: request.trip.actualPickup }] : []),
        ...(request.trip?.actualDropoff ? [{ label: 'Arrived at Drop-off', timestamp: request.trip.actualDropoff }] : []),
      ],
    },
    {
      key: 'delivered',
      label: 'Delivered',
      substeps: [
        ...(request.receivedConfirmed ? [{ label: 'You Confirmed Receipt', timestamp: formatTimestamp(request.receivedConfirmedAt) }] : []),
      ],
    },
    {
      key: 'completed',
      label: 'Completed',
      substeps: [],
    },
  ]

  return steps.map((step, i) => ({
    ...step,
    done: i < currentIdx,
    current: i === currentIdx,
  }))
}

// Label-left/value-right row, matching the Supervisor's Delivery Request
// Details layout (used only inside that desktop-only section below).
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-900 text-right truncate">{value}</span>
    </div>
  )
}

// Read-only info-strip cell, matching the Supervisor's Quotation panel
// ("Customer Info" grid) styling — used only in the desktop-only Quotation
// collapsible below.
function InfoCell({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

function fmPeso(v) {
  // Breakdown values come from the supervisor's MoneyInput, which stores them
  // as locale-formatted strings ("1,500.00") — Number() alone returns NaN on
  // the thousands separator, so strip everything but digits/sign/dot first.
  const num = typeof v === 'number'
    ? v
    : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return `₱${(Number.isNaN(num) ? 0 : num).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function BreakdownLine({ label, value, indent = false }) {
  return (
    <div className={`flex items-center justify-between py-1 text-[11px] md:text-xs ${indent ? 'pl-3' : ''}`}>
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{fmPeso(value)}</span>
    </div>
  )
}

// Full Cost Breakdown — the same direct/indirect expense line items and 15%
// income margin the supervisor uses to build the quotation, ported read-only
// for the customer per an explicit decision to be fully transparent about
// cost structure rather than showing an abstracted fee summary.
function QuotationCostBreakdown({ quotation }) {
  const b = quotation?.breakdown || {}
  const d = b.directExpenses || {}
  const i = b.indirectExpenses || {}
  const c = b.calculated || {}
  return (
    <div className="mt-2 space-y-2 md:mt-3 md:space-y-3">
      <div className="border-l-2 border-sky-300 py-0.5 pl-2.5 md:rounded-xl md:border-2 md:border-l-2 md:border-slate-200 md:bg-slate-50/60 md:p-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 md:text-xs md:text-slate-700">
          <span className="hidden h-2 w-2 rounded-full bg-slate-500 md:inline-block" />
          Direct Expenses
        </p>
        <BreakdownLine label="Depreciation" value={d.depreciation} />
        <BreakdownLine label="Total Diesel Expenses" value={c.dieselTotal} />
        {(() => {
          const rate = Number(d.dieselRate || 0)
          const total = Number(c.dieselTotal || 0)
          const distKm = rate > 0 ? total / rate : 0
          return (
            <p className="pl-3 text-[10px] text-sky-700 md:text-slate-600">
              Diesel Rate (₱{rate.toFixed(2)}) x Distance ({distKm.toFixed(1)} km)
            </p>
          )
        })()}
        <p className="mt-1.5 text-[10px] font-semibold text-slate-600 md:text-xs">Repairs &amp; Maintenance</p>
        <BreakdownLine indent label="Batteries" value={d.repairsAndMaintenance?.batteries} />
        <BreakdownLine indent label="Tires" value={d.repairsAndMaintenance?.tires} />
        <p className="mt-1.5 text-[10px] font-semibold text-slate-600 md:text-xs">Salaries &amp; Wages</p>
        <BreakdownLine indent label="Driver" value={d.salariesAndWages?.driver} />
        <BreakdownLine indent label="Helper (1)" value={d.salariesAndWages?.helper1} />
        {d.salariesAndWages?.helper2 && <BreakdownLine indent label="Helper (2)" value={d.salariesAndWages.helper2} />}
        <BreakdownLine label="Trip Allowance" value={d.tripAllowance} />
        <BreakdownLine label="Lodging Allowance" value={d.lodgingAllowance} />
        <BreakdownLine label="Toll/Parking" value={d.tollParking} />
        <div className="mt-1.5 flex items-center justify-between rounded-lg bg-sky-100/70 px-2.5 py-1.5 md:bg-slate-200/60">
          <span className="text-[10px] font-bold text-sky-900 md:text-xs md:text-slate-800">Total Direct Expenses</span>
          <span className="text-xs font-bold text-sky-900 md:text-sm md:text-slate-800">{fmPeso(c.directTotal)}</span>
        </div>
      </div>

      <div className="border-l-2 border-amber-300 py-0.5 pl-2.5 md:rounded-xl md:border-2 md:border-l-2 md:border-slate-200 md:bg-slate-50/60 md:p-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 md:text-xs md:text-slate-700">
          <span className="hidden h-2 w-2 rounded-full bg-slate-500 md:inline-block" />
          Indirect Expenses
        </p>
        <BreakdownLine label="Administration Fees" value={i.adminFees} />
        <BreakdownLine label="Insurance (Vehicle)" value={i.insurance} />
        <BreakdownLine label="Motor Vehicle Registration" value={i.motorVehicleReg} />
        <BreakdownLine label="Rental (Garage)" value={i.garageRental} />
        <div className="mt-1.5 flex items-center justify-between rounded-lg bg-amber-100/70 px-2.5 py-1.5 md:bg-slate-200/60">
          <span className="text-[10px] font-bold text-amber-900 md:text-xs md:text-slate-800">Total Indirect Expenses</span>
          <span className="text-xs font-bold text-amber-900 md:text-sm md:text-slate-800">{fmPeso(c.indirectTotal)}</span>
        </div>
      </div>

      <div className="space-y-1 border-t-2 border-slate-300 pt-1.5 md:rounded-xl md:border-2 md:border-slate-300 md:bg-slate-100/70 md:p-3 md:pt-3">
        <div className="flex items-center justify-between text-[11px] md:text-xs">
          <span className="font-semibold text-slate-700">Total Operating Expenses</span>
          <span className="font-bold text-slate-900">{fmPeso(c.operatingTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] md:text-xs">
          <span className="font-semibold text-slate-700">Income (15%)</span>
          <span className="font-bold text-emerald-700">{fmPeso(c.income)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-300 pt-1 text-xs md:text-sm">
          <span className="font-bold uppercase text-slate-900">Proposed Rate</span>
          <span className="text-sm font-bold text-sky-700 md:text-base md:text-emerald-700">{fmPeso(quotation.amount)}</span>
        </div>
      </div>
    </div>
  )
}

// Progressive disclosure for the cost breakdown — collapsed by default so
// the page stays scannable on mobile; tapping reveals the same detail a
// desktop supervisor sees inline, no separate screen/tab needed.
function ExpandableBreakdown({ quotation, label = 'View Full Breakdown' }) {
  const [open, setOpen] = useState(false)
  if (!quotation?.breakdown?.directExpenses) return null
  return (
    <div className="mt-2 md:mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 transition hover:text-slate-800 md:text-xs"
      >
        {open ? 'Hide Full Breakdown' : label}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && <QuotationCostBreakdown quotation={quotation} />}
    </div>
  )
}

// Delivery Timeline — a compact vertical stepper summarizing where the
// request stands in the same review → quotation → crew → transit →
// delivered lifecycle the supervisor tracks in detail, so customers get the
// same at-a-glance status history without any of the supervisor's internal
// negotiation/assignment mechanics.
function DeliveryTimeline({ request }) {
  const steps = buildCustomerTimeline(request)
  const [showProgressDetails, setShowProgressDetails] = useState(false)
  const currentStage = steps.find((s) => s.current) || steps[steps.length - 1]
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 md:p-4 md:shadow-sm">
      {/* Mobile (<md) — full stepper, always expanded, unchanged. */}
      <h3 className="text-xs font-semibold text-slate-900 md:hidden">Delivery Timeline</h3>
      <div className="mt-2 md:hidden">
        {steps.map((step, i) => (
          <div key={step.key} className="flex gap-2">
            <div className="flex flex-col items-center self-stretch">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                step.cancelled ? 'bg-red-100 text-red-600' :
                step.done ? 'bg-emerald-100 text-emerald-600' :
                step.current ? 'bg-blue-100 text-blue-600' :
                'bg-slate-100 text-slate-300'
              }`}>
                {step.cancelled ? <X className="h-2.5 w-2.5" /> :
                 step.done ? <CheckCircle2 className="h-2.5 w-2.5" /> :
                 step.current ? <Clock className="h-2.5 w-2.5" /> :
                 <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
              </span>
              {i < steps.length - 1 && <div className="my-0.5 w-px flex-1 bg-slate-200" />}
            </div>
            <div className="min-w-0 flex-1 pb-2.5">
              <p className={`text-xs font-medium ${
                step.cancelled ? 'text-red-700' :
                step.done || step.current ? 'text-slate-900' : 'text-slate-400'
              }`}>
                {step.label}
              </p>
              {step.substeps?.length > 0 && (
                <div className="mt-1 space-y-1">
                  {step.substeps.map((sub, si) => (
                    <div key={si} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="text-[10px] text-slate-600">{sub.label}</span>
                      {sub.timestamp && (
                        <span className="shrink-0 text-[10px] text-slate-400">{sub.timestamp}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop (md+) — Supervisor's collapsed pattern: a compact
          current-stage summary by default, plus a "Progress Details"
          toggle that reveals every stage and its timestamped substeps.
          Mobile keeps its own always-expanded stepper above, untouched. */}
      <div className="hidden md:block">
        <div className="mb-3 flex items-center gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            currentStage.cancelled ? 'bg-red-100 text-red-600' :
            currentStage.done ? 'bg-emerald-100 text-emerald-700' :
            'bg-blue-600 text-white'
          }`}>
            {currentStage.cancelled ? <X className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">{currentStage.label}</p>
            <p className="text-xs text-slate-500">
              {currentStage.cancelled ? 'Cancelled' : currentStage.done ? 'Completed' : currentStage.current ? 'In Progress' : 'Pending'}
            </p>
          </div>
        </div>

        {(() => {
          const previewSubstep = steps.flatMap((s) => (s.substeps || []).map((sub) => ({ ...sub, cancelled: s.cancelled }))).pop()
          if (!previewSubstep) return null
          return (
            <div className="ml-11 space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500">
                  <Check className="h-2 w-2 text-white" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">
                    {previewSubstep.cancelled ? (
                      <span className="font-medium text-red-600">{previewSubstep.label}</span>
                    ) : (
                      <>
                        {previewSubstep.label}
                        {previewSubstep.timestamp && <span className="ml-1 text-slate-500">{previewSubstep.timestamp}</span>}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )
        })()}

        <button
          onClick={() => setShowProgressDetails((s) => !s)}
          className="mt-3 ml-11 inline-flex items-center gap-1 text-sm font-medium text-blue-600 transition hover:text-blue-800"
        >
          <ClipboardList className="h-4 w-4" />
          Progress Details
          {showProgressDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showProgressDetails && (
          <div className="mt-4 ml-11 space-y-5 border-l-2 border-slate-200 pl-4">
            {steps.map((stage) => (
              <div key={stage.key}>
                <div className="mb-2 flex items-center gap-2">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    stage.cancelled ? 'bg-red-100 text-red-600' :
                    stage.done ? 'bg-emerald-100 text-emerald-700' :
                    stage.current ? 'bg-blue-600 text-white' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {stage.cancelled ? <X className="h-3 w-3" /> :
                     stage.done ? <Check className="h-3 w-3" /> :
                     stage.current ? <Clock className="h-3 w-3" /> :
                     <div className="h-2 w-2 rounded-full bg-slate-300" />}
                  </div>
                  <p className={`text-sm font-semibold ${
                    stage.cancelled ? 'text-red-700' :
                    stage.done ? 'text-emerald-700' :
                    stage.current ? 'text-blue-700' :
                    'text-slate-400'
                  }`}>
                    {stage.label}
                  </p>
                </div>
                <div className="ml-8 space-y-2">
                  {(stage.substeps || []).map((substep, si) => (
                    <div key={si} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-900">
                          {substep.label}
                          {substep.timestamp && <span className="ml-1 text-slate-500">{substep.timestamp}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Compact stand-in for DeliveryTimeline once a delivery is DELIVERY_COMPLETED —
// the full step-by-step stepper answers "where is my delivery right now,"
// which stops being a relevant question once the journey is over. Showing
// all six already-done steps at the top just pushes more useful content
// (the final quotation, trip summary) further down the page, so a completed
// record gets a one-line confirmation instead.
function CompletedSummary({ request }) {
  const completedDate = request.receivedConfirmedAt
    ? new Date(request.receivedConfirmedAt).toLocaleDateString('en-US', { timeZone: MANILA_TIMEZONE, month: 'long', day: 'numeric', year: 'numeric' })
    : request.trip?.actualDropoff || null
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-2.5 md:p-4 md:shadow-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-900 md:text-sm">Delivery Completed</p>
        {completedDate && <p className="text-[10px] text-slate-500 md:text-xs">{completedDate}</p>}
      </div>
    </div>
  )
}

// Mobile-only unifying wrapper — folds every read-only info section
// (Delivery Overview, Cargo & Budget, Truck & Crew, Trip Details, Quotation
// Negotiation/Summary, Notes) into one flowing page instead of each living
// in its own card, so it reads as a single cohesive details view rather than
// a stack of separate widgets. No card chrome here at all (that's reserved
// for the Delivery Timeline as the page's one primary visual element) —
// just a divider between sections, with each section's own prominent label
// (see the per-section heading classes) doing the work of marking where one
// ends and the next begins. At md+, `md:contents` removes this wrapper from
// layout entirely, so the passed-in sections fall back to being plain
// siblings in the desktop grid — the desktop card-per-section look (each
// section keeping its own `md:` card styling and `md:mt-4` spacing) is
// completely untouched.
function MobileDetailCard({ children }) {
  return (
    <div className="divide-y divide-slate-200 md:contents md:divide-y-0">
      {children}
    </div>
  )
}

// Request Detail View — replaces the list in place (same page) instead of a
// modal overlay, matching the driver-side pattern: this is a lot of content
// to read inside a small dialog, especially on a phone. Everything the old
// modal showed is still here, just laid out as page sections with a Back
// action instead of dialog chrome.
// Proof-of-delivery photos for a completed chain (Pickup -> Dropoff ->
// Stops) — one small block per portal file rather than a shared component,
// matching this codebase's existing per-portal convention (see
// 02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md's "On a shared component" note).
// Gated on the delivery having actually reached Delivered/Completed — a
// Pending/In-Transit request has no photos yet. Only renders items that
// actually have a photo -- a delivery with stops still in progress has
// photos for the items completed so far only.
function ProofOfDeliverySection({ request }) {
  if (request.dbStatus !== 'DELIVERED' && request.dbStatus !== 'COMPLETED') return null

  const items = [
    request.pickupPhotoUrl && { label: 'Pickup', photoUrl: request.pickupPhotoUrl, completedAt: null },
    request.dropoffPhotoUrl && { label: 'Drop-off', photoUrl: request.dropoffPhotoUrl, completedAt: request.dropoffCompletedAt },
    ...(request.stops || [])
      .map((stop, i) => stop.completed && stop.photoUrl && { label: `Dropoff ${i + 2}`, photoUrl: stop.photoUrl, completedAt: stop.completedAt }),
  ].filter(Boolean)

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
        <Camera className="h-3.5 w-3.5 text-slate-400" />
        Proof of Delivery
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">No Proof of Delivery</p>
      ) : (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {items.map((item, i) => (
          <a
            key={i}
            href={item.photoUrl}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <img src={item.photoUrl} alt={`${item.label} proof of delivery`} className="h-20 w-full object-cover transition group-hover:opacity-90" />
            <div className="px-1.5 py-1">
              <p className="truncate text-[10px] font-semibold text-slate-900">{item.label}</p>
              {item.completedAt && (
                <p className="truncate text-[9px] text-slate-500">{new Date(item.completedAt).toLocaleString('en-US', { timeZone: MANILA_TIMEZONE })}</p>
              )}
            </div>
          </a>
        ))}
      </div>
      )}
    </div>
  )
}

function RequestDetailView({ request, onBack, onUpdate, onQuotationResponse, onCancellation, onReceivedConfirmation }) {
  const [showQuotationResponse, setShowQuotationResponse] = useState(false)
  const [quotationAction, setQuotationAction] = useState(null)
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [showCancelForm, setShowCancelForm] = useState(false)
  // Desktop-only collapsible toggles matching the Supervisor Delivery
  // Details page's "Delivery Request Details" / "Quotation" sections
  // (mobile keeps its own always-expanded flat layout, unaffected by these).
  const [showDetailsCard, setShowDetailsCard] = useState(true)
  const [showQuotationCard, setShowQuotationCard] = useState(true)
  const [showInitialQuotation, setShowInitialQuotation] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelReasonOther, setCancelReasonOther] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Keep this delivery row in sync live (customer confirms receipt, etc.).
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => {
    onUpdateRef.current = onUpdate
  })
  useEffect(() => {
    const channel = supabase
      .channel(`customer-request-row-${request.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_requests', filter: `id=eq.${request.id}` },
        (payload) => {
          const row = payload.new
          onUpdateRef.current(request.id, {
            status: row.status,
            receivedConfirmed: row.received_confirmed,
            receivedConfirmedAt: row.received_confirmed_at,
            completedAt: row.completed_at,
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [request.id])

  const status = statusConfig[request.status] || statusConfig.PENDING_REQUEST
  const StatusIcon = status.icon
  // The eyebrow label above the ID — "request" only really fits while it's
  // still being requested/quoted; once a crew is moving on it, it's a
  // delivery, not a request anymore.
  const detailsLabel = request.status === 'CANCELLED'
    ? 'Cancelled Request'
    : (request.status === 'PENDING_REQUEST' || request.status === 'PROCESSING')
      ? 'Request Details'
      : 'Delivery Details'
  const itemLabel = request.itemType === 'other'
    ? `Other: ${request.otherItemType}`
    : getItemTypeLabel(request.itemType)
// The requested truck type (what the customer asked for) vs. the actual
  // truck the supervisor assigned (from the fleet). Once a truck is assigned,
  // the assigned truck's real type is shown as the primary "Truck Type" on
  // both the customer and supervisor sides; the requested type is kept only
  // as a note when it differs (a reefer may be assigned a dry van, etc.).
  const requestedTruckLabel = truckTypes.find(t => t.value === request.truckType)?.label || request.truckType
  const truckLabel = request.crew?.truck?.truckType || requestedTruckLabel
  const requestedTruckNote = request.crew?.truck?.truckType && request.crew.truck.truckType !== requestedTruckLabel
    ? `Requested: ${requestedTruckLabel}`
    : null
  const plateNumber = request.crew?.truck?.plateNumber
  const driverName = request.crew?.driver?.name
  const helpersLabel = request.crew?.helpers?.length
    ? request.crew.helpers.map(h => h.name).join(', ')
    : null

  const hasQuotationContent = request.status === 'PROCESSING'
  // Whether the second (mobile-only-ordered) section should render at all —
  // needed for DELIVERED too, since its confirmation card lives there via
  // the order-1 trick above on mobile, even though that card is md:hidden.
  const hasRightContent = hasQuotationContent ||
    (request.status === 'FOR_PICKUP' && request.confirmedPickupDate) ||
    request.status === 'DELIVERED'
  const quotationAmount = request.quotation
    ? (typeof request.quotation === 'object' ? request.quotation.amount : request.quotation)
    : null
  // The right-side panel already surfaces the quotation prominently while it's
  // awaiting the customer's response, so the left-column summary only repeats
  // it once that interactive state has resolved (approved, rejected, or a later stage).
  const showQuotationSummary = quotationAmount && request.status !== 'PROCESSING'

  // A crew/truck is already assigned once the request reaches FOR_PICKUP --
  // still shown its own "Delivery Team" card below, unrelated to cancellation.
  const hasAssignedCrew = Boolean(request.crew)
  const pickupDaysAway = daysUntilPickup(request.pickupDate)
  const isCancellable = CANCELLABLE_STATUSES.includes(request.status)
    && pickupDaysAway != null && pickupDaysAway >= CANCEL_MIN_DAYS_BEFORE_PICKUP
  const isCancelReasonValid = cancelReason && (cancelReason !== 'Other' || cancelReasonOther.trim())

  const handleQuotationSubmit = () => {
    if (quotationAction === 'approve') {
      onUpdate(request.id, {
        status: 'FOR_PICKUP',
        quotationApproved: true,
        quotation: request.quotation,
        // Real timestamp for the Delivery Timeline's "Quotation Approved"
        // entry — same pattern as receivedConfirmedAt below.
        quotationRespondedAt: new Date().toISOString()
      })
      onQuotationResponse?.(request.id, 'approve', {})
    } else if (quotationAction === 'reject') {
      // Negotiation is capped at one round: once a revised quotation is on
      // the table (previousQuotation exists), rejecting it is final and
      // cancels the request — no second price-range counter.
      if (request.previousQuotation) {
        const cancelledAt = new Date().toISOString()
        const cancelledFromStatus = request.dbStatus || request.status
        onUpdate(request.id, {
          status: 'CANCELLED',
          quotationRejected: true,
          cancelReason: 'Declined the revised quotation',
          cancelledBy: 'customer',
          cancelledAt,
          cancelledFromStatus
        })
        onCancellation?.(request.id, { cancelledBy: 'customer', cancelReason: 'Declined the revised quotation', cancelledAt, cancelledFromStatus })
      } else {
        onUpdate(request.id, {
          status: 'PROCESSING',
          quotationRejected: true,
          priceRange: priceRange,
          // Keep the declined quotation as history (instead of discarding it)
          // so the negotiation trail — what was offered, what you asked for
          // instead — stays visible once a revised quotation arrives, the same
          // way the supervisor's Quotation tab keeps both an "Initial" and an
          // "Updated" round visible.
          previousQuotation: request.quotation,
          quotation: null,
          quotationRespondedAt: new Date().toISOString()
        })
        onQuotationResponse?.(request.id, 'reject', { priceRange })
      }
    }
    setShowQuotationResponse(false)
    setQuotationAction(null)
    setPriceRange({ min: '', max: '' })
  }

  const handleConfirmReceived = () => {
    onUpdate(request.id, { status: 'DELIVERY_COMPLETED', receivedConfirmed: true, receivedConfirmedAt: new Date().toISOString() })
    onReceivedConfirmation?.(request.id)
    setShowConfirmModal(false)
  }

  const handleCancelSubmit = () => {
    if (!isCancelReasonValid) return
    const reason = cancelReason === 'Other' ? cancelReasonOther.trim() : cancelReason

    // Instant, no supervisor approval step -- isCancellable already confirms
    // pickup is still at least CANCEL_MIN_DAYS_BEFORE_PICKUP days out.
    const cancelledAt = new Date().toISOString()
    const cancelledFromStatus = request.dbStatus || request.status
    onUpdate(request.id, {
      status: 'CANCELLED',
      cancelReason: reason,
      cancelledBy: 'customer',
      cancelledAt,
      cancelledFromStatus
    })
    onCancellation?.(request.id, { cancelledBy: 'customer', cancelReason: reason, cancelledAt, cancelledFromStatus })

    setShowCancelForm(false)
    setCancelReason('')
    setCancelReasonOther('')
  }

  return (
    <div className="flex flex-col gap-2.5 pb-4 md:gap-4 md:pb-6" style={interFontStyle}>
      {/* Mobile (<md) — existing back button pill, unchanged. */}
      <button
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-200/70 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 active:bg-emerald-100 md:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      {/* Desktop (md+) — back button in its own bordered bar above the
          header card, matching the Supervisor Delivery Details page's
          navigation pattern: a plain text link (no button box), not a
          floating pill. */}
      <div className="hidden md:block md:border-b md:border-slate-200 md:pb-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      {/* Mobile (<md) — existing bare header, unchanged. */}
      <div className="flex flex-wrap items-start justify-between gap-2 md:hidden">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{detailsLabel}</p>
          <h1 className="mt-0.5 text-lg font-semibold text-slate-900">{request.id}</h1>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.color}`}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </span>
      </div>

      {/* Desktop (md+) — header card matching the Supervisor Delivery
          Details page's composition: icon avatar, ID with the status badge
          inline beside it, secondary label underneath — inside a bordered
          white card instead of bare page text. */}
      <div className="hidden md:block md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-4 md:shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-900">{request.id}</h1>
              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${status.color}`}>
                {status.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{detailsLabel}</p>
          </div>
        </div>
      </div>


      {request.status === 'CANCELLED' && request.cancelReason && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-2.5 md:gap-3 md:p-4 md:shadow-sm">
          <X className="h-4 w-4 shrink-0 text-red-600 md:h-5 md:w-5" />
          <div>
            <h3 className="text-xs font-semibold text-red-800 md:text-sm">Cancellation Details</h3>
            <p className="mt-1 text-xs text-red-800 md:text-sm">Reason: {request.cancelReason}</p>
            {request.cancelledBy && (
              <p className="mt-1 text-[10px] text-red-600 md:text-xs">
                Cancelled by {request.cancelledBy === 'customer' ? 'you' : 'the supervisor'}
                {request.cancelledAt ? ` on ${new Date(request.cancelledAt).toLocaleDateString('en-US', { timeZone: MANILA_TIMEZONE })}` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {request.status === 'DELIVERY_COMPLETED' ? (
        <CompletedSummary request={request} />
      ) : (
        <DeliveryTimeline request={request} />
      )}

      {/* Single stacked column at every breakpoint, matching the Supervisor's
          per-request Delivery Details page (it never splits into
          side-by-side columns either). Real-time monitoring for
          FOR_PICKUP/OUT_FOR_DELIVERY lives on the list page instead — see
          the Supervisor's In Transit Deliveries tab, which is itself a
          list, not a per-request detail view. Mobile's own reordering
          (status-specific actions before reference info) still works via
          order-1/md:order-none below, since that's independent of the
          column count. */}
      <div className="grid grid-cols-1 gap-2.5 md:gap-4">
        {/* Left column — Delivery Overview. Ordered after the right column on
            mobile (status-specific info/actions matter more in the moment
            than static reference facts) but md:order-none restores the
            original left-then-right desktop placement untouched. */}
        <div className="order-2 space-y-2.5 md:order-none md:space-y-4">
          <MobileDetailCard>
          <div className="py-4 first:pt-0 md:hidden">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Delivery Overview</h3>

            {/* Mobile (<md) — grouped Pickup/Drop-off rows: date+time inline
                with the label instead of stacked below it, address folded
                into the same row instead of its own separate label+value
                pair, using the P/D badge convention already used for
                pickup/drop-off elsewhere in the app. Cuts 4 stacked
                label-then-value rows down to 2 grouped ones. */}
            <div className="mt-2 space-y-3 text-xs md:hidden">
              <div className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">P</span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-900">
                    <span className="font-medium">{formatDisplayDateTime(request.pickupDate, request.pickupTime, request.pickupTimeEnd)}</span>
                  </p>
                  <p className="mt-0.5 text-slate-500">{request.pickupLocation}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-bold text-rose-600">D</span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-900">
                    <span className="font-medium">{formatDisplayDateTime(request.dropoffDate, request.dropoffTime)}</span>
                  </p>
                  <p className="mt-0.5 text-slate-500">{request.dropoffLocation}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 md:hidden">
              <ProofOfDeliverySection request={request} />
            </div>

            {/* Desktop (md+) — original 4-row icon + stacked label/value layout, untouched. */}
            <div className="hidden mt-2 space-y-2 text-xs md:mt-3 md:block md:space-y-3 md:text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 md:h-4 md:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Pickup</p>
                  <p className="font-medium text-slate-900">{formatDisplayDateTime(request.pickupDate, request.pickupTime, request.pickupTimeEnd)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 md:h-4 md:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Drop-off</p>
                  <p className="font-medium text-slate-900">{formatDisplayDateTime(request.dropoffDate, request.dropoffTime)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5 md:h-4 md:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Pickup Location</p>
                  <p className="font-medium text-slate-900">{request.pickupLocation}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5 md:h-4 md:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Drop-off Location</p>
                  <p className="font-medium text-slate-900">{request.dropoffLocation}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="py-4 first:pt-0 md:hidden">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Cargo & Budget</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:mt-3 md:gap-3 md:text-sm">
              <div>
                <p className="text-[10px] text-slate-500 md:text-xs">Type of Item</p>
                <p className="font-medium text-slate-900">{itemLabel}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 md:text-xs">Weight</p>
                <p className="font-medium text-slate-900">{request.cargoWeight ? `${request.cargoWeight} kg` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 md:text-xs">Minimum Budget</p>
                <p className="font-medium text-slate-900">{request.budgetMin ? `₱${Number(request.budgetMin).toLocaleString()}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 md:text-xs">Maximum Budget</p>
                <p className="font-medium text-slate-900">{request.budgetMax ? `₱${Number(request.budgetMax).toLocaleString()}` : '—'}</p>
              </div>
            </div>
          </div>

          <div className="py-4 first:pt-0 md:hidden">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Delivery Team</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:mt-3 md:gap-3 md:text-sm">
              <div>
                <p className="text-[10px] text-slate-500 md:text-xs">Truck Type</p>
                <p className="font-medium text-slate-900">{truckLabel}</p>
                {requestedTruckNote && (
                  <p className="text-[10px] text-slate-400">{requestedTruckNote}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] text-slate-500 md:text-xs">Plate Number</p>
                <p className="font-medium text-slate-900">{plateNumber || 'Not yet assigned'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 md:text-xs">Driver</p>
                <p className="font-medium text-slate-900">{driverName || 'Not yet assigned'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 md:text-xs">Helpers</p>
                <p className="font-medium text-slate-900">{helpersLabel || 'Not yet assigned'}</p>
              </div>
            </div>
          </div>

          {request.trip && (
            <div className="py-4 first:pt-0 md:hidden">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Trip Details</h3>
                {typeof request.trip.onTime === 'boolean' && (
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    request.trip.onTime ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {request.trip.onTime ? 'On time' : `Late by ${request.trip.lateMinutes} min`}
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:mt-3 md:gap-3 md:text-sm">
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Total Distance</p>
                  <p className="font-medium text-slate-900">{request.trip.distance || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Actual Pickup</p>
                  <p className="font-medium text-slate-900">{request.trip.actualPickup || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Scheduled Drop-off</p>
                  <p className="font-medium text-slate-900">{request.trip.scheduledDropoff || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Actual Drop-off</p>
                  <p className="font-medium text-slate-900">{request.trip.actualDropoff || '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Quotation Negotiation — mirrors the supervisor's Quotation tab,
              which always keeps the Initial and Updated rounds visible side
              by side. Only appears once a round has actually been declined
              (via `previousQuotation`); a single, never-rejected quotation
              still uses the plain "Quotation" summary card below. */}
          {request.previousQuotation && (
            <div className="py-4 first:pt-0 md:hidden">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Quotation Negotiation</h3>
              <div className="mt-2 space-y-2 md:mt-3 md:space-y-2.5">
                <div className="border-b border-slate-100 pb-2 md:rounded-xl md:border md:border-emerald-200/70 md:bg-emerald-50/50 md:p-3 md:pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 md:text-sm">Round 1</span>
                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Declined</span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-900 md:text-base">
                    ₱{Number(typeof request.previousQuotation === 'object' ? request.previousQuotation.amount : request.previousQuotation).toLocaleString()}
                  </p>
                  {request.priceRange && (
                    <p className="mt-1 text-[10px] text-slate-500 md:text-xs">
                      You requested ₱{Number(request.priceRange.min).toLocaleString()}–₱{Number(request.priceRange.max).toLocaleString()} instead
                    </p>
                  )}
                  <ExpandableBreakdown quotation={request.previousQuotation} label="View Round 1 Breakdown" />
                </div>
                <div className="md:rounded-xl md:border md:border-emerald-200/70 md:bg-emerald-50/50 md:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 md:text-sm">Round 2</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      request.quotationApproved ? 'bg-emerald-100 text-emerald-700' :
                      quotationAmount ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {request.quotationApproved ? 'Approved' : quotationAmount ? 'Awaiting your response' : 'Pending from supervisor'}
                    </span>
                  </div>
                  {quotationAmount ? (
                    <>
                      <p className="mt-1 text-sm font-bold text-slate-900 md:text-base">₱{Number(quotationAmount).toLocaleString()}</p>
                      <ExpandableBreakdown quotation={request.quotation} label="View Round 2 Breakdown" />
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500 md:text-sm">We'll notify you once a revised quotation is ready.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {showQuotationSummary && (
            <div className="py-4 first:pt-0 md:hidden">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Quotation</h3>
              <p className="mt-1.5 text-base font-bold text-emerald-700 md:mt-2 md:text-lg">₱{Number(quotationAmount).toLocaleString()}</p>
              {request.quotationApproved && (
                <p className="mt-1 text-[10px] font-medium text-emerald-600 md:text-xs">Approved</p>
              )}
              <ExpandableBreakdown quotation={request.quotation} />
            </div>
          )}

          {request.notes && (
            <div className="py-4 first:pt-0 md:hidden">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Notes</h3>
              <p className="mt-1.5 text-xs text-slate-700 md:mt-2 md:text-sm">{request.notes}</p>
            </div>
          )}
          </MobileDetailCard>

          {/* Delivery Request Details — desktop (md+) only, matching the
              Supervisor Delivery Details page's collapsible "Delivery
              Request Details" section: a chevron-toggle header, a
              2-column grid of dot-labeled sub-cards, and a full-width
              Location section below. Mobile keeps its own always-expanded
              flat layout above (that block is md:hidden); this is
              hidden below md. Customer's own section names/fields are
              kept exactly as-is — only the outer collapsible-card,
              grid, and sub-card presentation is borrowed from the
              supervisor page. */}
          <div className="hidden md:block md:rounded-2xl md:border md:border-slate-200 md:bg-white md:shadow-sm">
            <button
              onClick={() => setShowDetailsCard((s) => !s)}
              className="flex w-full items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 bg-transparent text-left transition hover:bg-slate-50"
              aria-expanded={showDetailsCard}
            >
              <span className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Delivery Request Details</span>
              </span>
              {showDetailsCard ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>
            {showDetailsCard && (
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Delivery Overview
                    </h4>
                    <div className="space-y-1.5">
                      <Row label="Pickup" value={formatDisplayDateTime(request.pickupDate, request.pickupTime, request.pickupTimeEnd)} />
                      <Row label="Drop-off" value={formatDisplayDateTime(request.dropoffDate, request.dropoffTime)} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Deliverable Items
                    </h4>
                    <div className="space-y-1.5">
                      <Row label="Type of Item" value={itemLabel} />
                      <Row label="Weight" value={request.cargoWeight ? `${request.cargoWeight} kg` : '—'} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                      Delivery Team
                    </h4>
                    <div className="space-y-1.5">
                      <Row label="Truck Type" value={truckLabel} />
                      {requestedTruckNote && (
                        <p className="text-[11px] text-slate-400">{requestedTruckNote}</p>
                      )}
                      <Row label="Plate Number" value={plateNumber || 'Not yet assigned'} />
                      <Row label="Driver" value={driverName || 'Not yet assigned'} />
                      <Row label="Helpers" value={helpersLabel || 'Not yet assigned'} />
                    </div>
                  </div>

                  {request.trip && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                        Trip Details
                        {typeof request.trip.onTime === 'boolean' && (
                          <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${
                            request.trip.onTime ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {request.trip.onTime ? 'On time' : `Late by ${request.trip.lateMinutes} min`}
                          </span>
                        )}
                      </h4>
                      <div className="space-y-1.5">
                        <Row label="Total Distance" value={request.trip.distance || '—'} />
                        <Row label="Actual Pickup" value={request.trip.actualPickup || '—'} />
                        <Row label="Scheduled Drop-off" value={request.trip.scheduledDropoff || '—'} />
                        <Row label="Actual Drop-off" value={request.trip.actualDropoff || '—'} />
                      </div>
                    </div>
                  )}

                  {(request.budgetMin || request.budgetMax) && (
                    <div className="col-span-2">
                      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-100 px-4 py-3">
                        <span className="text-sm font-semibold text-slate-600">Price Range Bid</span>
                        <span className="text-sm font-bold text-blue-700">
                          ₱{Number(request.budgetMin).toLocaleString()} – ₱{Number(request.budgetMax).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}

                  {request.notes && (
                    <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Notes
                      </h4>
                      <p className="text-sm text-slate-700 leading-relaxed">{request.notes}</p>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <ProofOfDeliverySection request={request} />
                </div>
              </div>
            )}
          </div>

          {/* Quotation — desktop (md+) only, matching the Supervisor Delivery
              Details page's collapsible Quotation panel: chevron-toggle
              header whose title switches to "Quotation Review"/"Quotation
              History" once a round has been declined (the supervisor's own
              dynamic-title logic), a read-only info strip, a "Show/Hide
              Initial Quotation" toggle for the earlier round, and the
              current round with the Approve/Reject actions folded in
              directly below it — matching how the supervisor's own
              Update/Decline actions live inside this same panel instead of
              a separate side card. Mobile keeps its existing separate cards
              (all md:hidden below), unaffected. */}
          {(hasQuotationContent || request.previousQuotation || showQuotationSummary) && (
            <div className="hidden md:block md:rounded-2xl md:border md:border-slate-200 md:bg-white md:shadow-sm">
              <button
                onClick={() => setShowQuotationCard((s) => !s)}
                className="flex w-full items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 bg-transparent text-left transition hover:bg-slate-50"
                aria-expanded={showQuotationCard}
              >
                <span className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-sky-600" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {request.previousQuotation ? (quotationAmount ? 'Quotation History' : 'Quotation Review') : 'Quotation'}
                  </span>
                </span>
                {showQuotationCard ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </button>
              {showQuotationCard && (
                <div className="p-4 space-y-4">
                  {/* Read-only info strip, matching the Supervisor's Quotation
                      panel "Customer Info" grid. */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InfoCell
                      label="Price Range Bid"
                      value={request.budgetMin && request.budgetMax ? `₱${Number(request.budgetMin).toLocaleString()} – ₱${Number(request.budgetMax).toLocaleString()}` : '—'}
                    />
                    <InfoCell
                      label="Total Distance"
                      value={request.quotation?.breakdown?.calculated?.distanceKm ? `${request.quotation.breakdown.calculated.distanceKm} km` : request.trip?.distance || '—'}
                    />
                    <InfoCell
                      label="Total Days"
                      value={request.quotation?.breakdown?.calculated?.totalDays ? `${request.quotation.breakdown.calculated.totalDays} day(s)` : '—'}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InfoCell label="Truck Type" value={truckLabel} />
                    <InfoCell label="Weight" value={request.cargoWeight ? `${request.cargoWeight} kg` : '—'} />
                    <InfoCell label="Type of Item" value={itemLabel} />
                  </div>

                  {request.quotationApproved && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Approved Amount</p>
                          <p className="text-2xl font-bold text-emerald-800">₱{Number(quotationAmount).toLocaleString()}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Approved
                        </span>
                      </div>
                    </div>
                  )}

                  {request.previousQuotation && (
                    <>
                      <button
                        onClick={() => setShowInitialQuotation((s) => !s)}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
                      >
                        <ChevronDown className={`h-4 w-4 transition ${showInitialQuotation ? 'rotate-180' : ''}`} />
                        {showInitialQuotation ? 'Hide' : 'Show'} Initial Quotation
                      </button>

                      {showInitialQuotation && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100/60 px-4 py-2.5">
                            <FileText className="h-4 w-4 text-slate-600" />
                            <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Initial Quotation</span>
                            <span className="ml-auto shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Declined</span>
                          </div>
                          <p className="text-lg font-bold text-slate-900">
                            ₱{Number(typeof request.previousQuotation === 'object' ? request.previousQuotation.amount : request.previousQuotation).toLocaleString()}
                          </p>
                          {request.priceRange && (
                            <p className="text-sm text-slate-500">
                              You requested ₱{Number(request.priceRange.min).toLocaleString()}–₱{Number(request.priceRange.max).toLocaleString()} instead
                            </p>
                          )}
                          <ExpandableBreakdown quotation={request.previousQuotation} label="View Initial Breakdown" />
                        </div>
                      )}
                    </>
                  )}

                  {quotationAmount ? (
                    <div className="space-y-3">
                      {request.previousQuotation && (
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-100/60 px-4 py-2.5">
                          <FileText className="h-4 w-4 text-emerald-700" />
                          <span className="text-sm font-bold uppercase tracking-wider text-emerald-800">Revised Quotation</span>
                          <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            request.quotationApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {request.quotationApproved ? 'Approved' : 'Awaiting your response'}
                          </span>
                        </div>
                      )}
                      <p className="text-lg font-bold text-slate-900">₱{Number(quotationAmount).toLocaleString()}</p>
                      <ExpandableBreakdown quotation={request.quotation} label={request.previousQuotation ? 'View Revised Breakdown' : 'View Full Breakdown'} />

                      {/* Approve/Reject — folded into the panel itself,
                          matching how the supervisor's own Update/Decline
                          actions live inside this same collapsible rather
                          than a separate side card. */}
                      {request.status === 'PROCESSING' && !request.quotationApproved && !showQuotationResponse && (
                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={() => { setQuotationAction('approve'); setShowQuotationResponse(true) }}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => { setQuotationAction('reject'); setShowQuotationResponse(true) }}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-5 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition"
                          >
                            <X className="h-4 w-4" />
                            {request.previousQuotation ? 'Reject' : 'Reject & Price Range'}
                          </button>
                        </div>
                      )}

                      {showQuotationResponse && (
                        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4 space-y-3">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-blue-800">
                            {quotationAction === 'approve'
                              ? 'Confirm Approval'
                              : request.previousQuotation
                                ? 'Decline Revised Quotation'
                                : 'Request Price Range'}
                          </h4>
                          {quotationAction === 'approve' ? (
                            <>
                              <p className="text-sm text-slate-700">
                                Approve <span className="font-bold">₱{Number(quotationAmount).toLocaleString()}</span>? The delivery moves to For Pickup.
                              </p>
                              <div className="flex gap-3">
                                <button onClick={handleQuotationSubmit} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
                                  Confirm
                                </button>
                                <button onClick={() => setShowQuotationResponse(false)} className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : request.previousQuotation ? (
                            <>
                              <p className="text-sm text-slate-700">
                                Declining this revised quotation is <span className="font-bold">final</span> and cancels the request — negotiation is limited to one round.
                              </p>
                              <div className="flex gap-3">
                                <button onClick={handleQuotationSubmit} className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition">
                                  Confirm Rejection
                                </button>
                                <button onClick={() => setShowQuotationResponse(false)} className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-slate-700">Enter your preferred price range for the supervisor.</p>
                              <div className="grid grid-cols-2 gap-3 max-w-sm">
                                <div>
                                  <label className="text-xs text-slate-500">Min (₱)</label>
                                  <input type="number" value={priceRange.min} onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Max (₱)</label>
                                  <input type="number" value={priceRange.max} onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm" />
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <button onClick={handleQuotationSubmit} disabled={!priceRange.min || !priceRange.max} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
                                  Submit
                                </button>
                                <button onClick={() => setShowQuotationResponse(false)} className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                                  Cancel
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">We'll notify you once a revised quotation is ready.</p>
                  )}

                  {/* Price range rejected — waiting for a revised quotation. */}
                  {request.status === 'PROCESSING' && request.quotationRejected && request.priceRange && !quotationAmount && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-amber-800">Price Range Requested</h4>
                      {request.previousQuotation && (
                        <p className="mt-1 text-xs text-amber-700">
                          You declined the ₱{Number(typeof request.previousQuotation === 'object' ? request.previousQuotation.amount : request.previousQuotation).toLocaleString()} quotation.
                        </p>
                      )}
                      <p className="mt-2 text-sm text-amber-800">
                        ₱{Number(request.priceRange.min).toLocaleString()} – ₱{Number(request.priceRange.max).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-amber-600">Awaiting supervisor's revised quotation...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Delivery Team — desktop (md+) only, matching the Supervisor
              Delivery Details page's dedicated "Assigned Vehicle and
              Delivery Crew" card: boxed truck/driver/helper entries with
              initials/type avatars, shown once a crew is assigned. Delivery
              Request Details above keeps its own Delivery Team rows too —
              this isn't a replacement, it's the same additional card the
              supervisor shows once assignment is locked in. */}
          {hasAssignedCrew && (
            <div className="hidden md:block md:rounded-2xl md:border md:border-slate-200 md:bg-white md:shadow-sm md:p-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <Users className="h-4 w-4 text-indigo-600" />
                Delivery Team
              </h3>
              <div className="mt-3 space-y-3">
                {request.crew?.truck && (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-center text-[10px] font-bold leading-tight text-slate-600">
                      {request.crew.truck.truckType}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{request.crew.truck.plateNumber}</p>
                      <p className="text-xs text-slate-500">{request.crew.truck.capacity || ''}</p>
                      {requestedTruckNote && (
                        <p className="text-xs text-slate-400">{requestedTruckNote}</p>
                      )}
                    </div>
                  </div>
                )}
                {request.crew?.driver && (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-sm font-bold text-slate-600">
                      {getInitials(request.crew.driver.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{request.crew.driver.name}</p>
                      <p className="text-xs text-slate-500">Driver</p>
                    </div>
                  </div>
                )}
                {request.crew?.helpers?.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Helpers</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {request.crew.helpers.map((h) => (
                        <span key={h.id} className="inline-flex items-center rounded-lg bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
                          {h.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column — Status-specific actions. Ordered before the left
            column on mobile so the thing that actually needs the customer's
            attention right now (approve a quote, confirm receipt, track a
            live truck) isn't buried below several reference-info cards;
            md:order-none restores the original side-by-side placement. */}
        {hasRightContent && (
          <div className="order-1 space-y-2.5 md:order-none md:space-y-4">
            {/* Quotation section — PROCESSING with quotation. Mobile only now
                (md:hidden) — the desktop equivalent is folded into the
                Quotation collapsible in the main column above. */}
            {request.status === 'PROCESSING' && quotationAmount && !showQuotationResponse && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-2.5 md:hidden">
                <h3 className="text-xs font-semibold text-blue-800 md:text-sm">Your Quotation</h3>
                {request.previousQuotation && request.priceRange && (
                  <p className="mt-1 text-[10px] text-blue-600 md:text-xs">
                    Revised after you requested ₱{Number(request.priceRange.min).toLocaleString()}–₱{Number(request.priceRange.max).toLocaleString()}
                  </p>
                )}
                <div className="mt-2 rounded-xl border border-blue-200 bg-white p-2.5 md:mt-3 md:p-3">
                  <p className="text-xl font-bold text-blue-600 md:text-2xl">₱{Number(quotationAmount).toLocaleString()}</p>
                  <ExpandableBreakdown quotation={request.quotation} />
                </div>
                <div className="mt-2 flex flex-col gap-2 md:mt-3 md:flex-row md:gap-3">
                  <button
                    onClick={() => { setQuotationAction('approve'); setShowQuotationResponse(true) }}
                    className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 md:px-4 md:py-2.5 md:text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { setQuotationAction('reject'); setShowQuotationResponse(true) }}
                    className="flex-1 rounded-xl border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 md:px-4 md:py-2.5 md:text-sm"
                  >
                    {request.previousQuotation ? 'Reject' : 'Reject & Price Range'}
                  </button>
                </div>
              </div>
            )}

            {/* Quotation approval/rejection form. Mobile only now (md:hidden)
                — the desktop equivalent is folded into the Quotation
                collapsible in the main column above. */}
              {showQuotationResponse && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-2.5 md:hidden">
                  <h3 className="text-xs font-semibold text-blue-800 md:text-sm">
                    {quotationAction === 'approve'
                      ? 'Confirm Approval'
                      : request.previousQuotation
                        ? 'Decline Revised Quotation'
                        : 'Request Price Range'}
                  </h3>
                  {quotationAction === 'approve' ? (
                    <div className="mt-2 space-y-2 md:mt-3 md:space-y-3">
                      <p className="text-xs text-slate-600 md:text-sm">
                        Approve <span className="font-bold">₱{Number(quotationAmount).toLocaleString()}</span>? The delivery moves to For Pickup.
                      </p>
                      <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                        <button onClick={handleQuotationSubmit} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 md:px-4 md:py-2.5 md:text-sm">
                          Confirm
                        </button>
                        <button onClick={() => setShowQuotationResponse(false)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 md:px-4 md:py-2.5 md:text-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : request.previousQuotation ? (
                    <div className="mt-2 space-y-2 md:mt-3 md:space-y-3">
                      <p className="text-xs text-slate-600 md:text-sm">
                        Declining this revised quotation is <span className="font-bold">final</span> and cancels the request — negotiation is limited to one round.
                      </p>
                      <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                        <button onClick={handleQuotationSubmit} className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 active:bg-rose-800 md:px-4 md:py-2.5 md:text-sm">
                          Confirm Rejection
                        </button>
                        <button onClick={() => setShowQuotationResponse(false)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 md:px-4 md:py-2.5 md:text-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                  <div className="mt-2 space-y-2 md:mt-3 md:space-y-3">
                    <p className="text-xs text-slate-600 md:text-sm">Enter your preferred price range for the supervisor.</p>
                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                      <div>
                        <label className="text-[10px] text-slate-500 md:text-xs">Min (₱)</label>
                        <input type="number" value={priceRange.min} onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 md:text-xs">Max (₱)</label>
                        <input type="number" value={priceRange.max} onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                      <button onClick={handleQuotationSubmit} disabled={!priceRange.min || !priceRange.max} className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 md:px-4 md:py-2.5 md:text-sm">
                        Submit
                      </button>
                      <button onClick={() => setShowQuotationResponse(false)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 md:px-4 md:py-2.5 md:text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Price range feedback — PROCESSING and rejected. Mobile only
                now (md:hidden) — the desktop equivalent is folded into the
                Quotation collapsible in the main column above. */}
            {request.status === 'PROCESSING' && request.quotationRejected && request.priceRange && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-2.5 md:hidden">
                <h3 className="text-xs font-semibold text-amber-800 md:text-sm">Price Range Requested</h3>
                {request.previousQuotation && (
                  <p className="mt-1 text-[10px] text-amber-700 md:text-xs">
                    You declined the ₱{Number(typeof request.previousQuotation === 'object' ? request.previousQuotation.amount : request.previousQuotation).toLocaleString()} quotation.
                  </p>
                )}
                <p className="mt-1.5 text-xs text-amber-800 md:mt-2 md:text-sm">
                  &#x20B1;{Number(request.priceRange.min).toLocaleString()} &ndash; &#x20B1;{Number(request.priceRange.max).toLocaleString()}
                </p>
                <p className="mt-1 text-[10px] text-amber-600 md:text-xs">Awaiting supervisor's revised quotation...</p>
              </div>
            )}

            {/* Confirmed Pickup — FOR_PICKUP. Mobile only now (md:hidden). */}
            {request.status === 'FOR_PICKUP' && request.confirmedPickupDate && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-2.5 md:hidden">
                <h3 className="text-xs font-semibold text-purple-800">Confirmed Pickup Schedule</h3>
                <p className="mt-1.5 text-xs text-purple-700">
                  <span className="font-semibold">{request.confirmedPickupDate} at {request.confirmedPickupTime}</span>
                </p>
                <p className="mt-1 text-[10px] text-purple-600">Your pickup is confirmed.</p>
              </div>
            )}

            {/* Delivery confirmation — DELIVERED. A lightweight, optional
                acknowledgement from the customer; separate from the driver/
                supervisor-driven status pipeline, so confirming here doesn't
                change the request's status itself.
                Mobile only now (md:hidden) — this card sits first on mobile
                via the order-1 trick above, which is exactly the prominence
                mobile already had and keeps. Desktop gets its own version
                below, positioned after the full review instead of living in
                a side panel. */}
            {request.status === 'DELIVERED' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 md:hidden">
                {request.receivedConfirmed ? (
                  <>
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-emerald-800 md:text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      Delivery Confirmed
                    </h3>
                    <p className="mt-1.5 text-xs text-emerald-700 md:mt-2 md:text-sm">
                      You confirmed receipt of this delivery
                      {request.receivedConfirmedAt ? ` on ${new Date(request.receivedConfirmedAt).toLocaleDateString('en-US', { timeZone: MANILA_TIMEZONE })}` : ''}. Thank you!
                    </p>
                  </>
                ) : (
                  <>
                    {/* Shared content simplification (both breakpoints): a
                        short prompt instead of a heading + explanatory
                        paragraph — the card's color/position already says
                        what this is, so the sentence was just extra height
                        for no added clarity. */}
                    <h3 className="text-xs font-semibold text-emerald-800 md:text-sm">Received your delivery?</h3>
                    <div className="mt-2 flex items-center justify-center">
                      <button
                        onClick={() => setShowConfirmModal(true)}
                        className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
                      >
                        Confirm Received
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Delivery Confirmation — desktop (md+) "final step" placement: a
          full-width section after the whole review (Delivery Timeline,
          Overview, Cargo & Budget, etc.) instead of living in a side panel
          next to it, so confirming reads as the natural next action once
          everything's been reviewed rather than a disconnected status
          card. Mobile keeps its existing right-column placement above
          (that version is md:hidden; this one is hidden below md). */}
      {request.status === 'DELIVERED' && (
        <div className="hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center md:block md:shadow-sm">
          {request.receivedConfirmed ? (
            <>
              <h3 className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Delivery Confirmed
              </h3>
              <p className="mt-1.5 text-sm text-emerald-700">
                You confirmed receipt of this delivery
                {request.receivedConfirmedAt ? ` on ${new Date(request.receivedConfirmedAt).toLocaleDateString('en-US', { timeZone: MANILA_TIMEZONE })}` : ''}. Thank you!
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-emerald-800">Received your delivery?</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-emerald-700">
                Confirm once you've reviewed the delivery details and timeline above.
              </p>
              <div className="mt-4 flex items-center justify-center">
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
                >
                  Confirm Received
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showCancelForm && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-2.5 md:p-4 md:shadow-sm">
          <h3 className="text-xs font-semibold text-red-800 md:text-sm">Cancel This Delivery</h3>
          <p className="mt-1 text-[11px] text-red-700 leading-relaxed md:text-xs">
            This will cancel the delivery request right away — no need to wait for approval.
          </p>
          <div className="mt-2 space-y-2 md:mt-3 md:space-y-3">
            <div>
              <label htmlFor="cancelReason" className="text-[11px] font-medium text-slate-700 md:text-xs">Reason for Cancellation</label>
              <select
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-1 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 md:px-4 md:py-2.5 md:text-sm"
              >
                <option value="">Select a reason...</option>
                {cancellationReasons.map(reason => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </div>
            {cancelReason === 'Other' && (
              <div>
                <label htmlFor="cancelReasonOther" className="text-[11px] font-medium text-slate-700 md:text-xs">Please specify</label>
                <textarea
                  id="cancelReasonOther"
                  value={cancelReasonOther}
                  onChange={(e) => setCancelReasonOther(e.target.value)}
                  rows={2}
                  placeholder="Tell us more..."
                  className="mt-1 w-full resize-none rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 md:px-4 md:py-2.5 md:text-sm"
                />
              </div>
            )}
            <div className="flex flex-col gap-2 md:flex-row md:gap-3">
              <button
                onClick={handleCancelSubmit}
                disabled={!isCancelReasonValid}
                className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 md:px-4 md:py-2.5 md:text-sm"
              >
                Confirm Cancellation
              </button>
              <button
                onClick={() => { setShowCancelForm(false); setCancelReason(''); setCancelReasonOther('') }}
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 md:px-4 md:py-2.5 md:text-sm"
              >
                Never Mind
              </button>
            </div>
          </div>
        </div>
      )}

      {isCancellable && !showCancelForm && (
        <div className="flex flex-col gap-1 border-t border-emerald-200/70 pt-3 md:pt-4">
          <button
            onClick={() => setShowCancelForm(true)}
            className="w-full rounded-xl border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 active:bg-red-100 md:w-fit md:px-4 md:py-2.5 md:text-sm"
          >
            Cancel Delivery
          </button>
        </div>
      )}

      {/* Confirm-receipt modal — a deliberate tap-to-confirm step rather than an
          instant action, matching the stage-advance confirmation pattern used
          on the driver side. */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-receipt-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-emerald-200/70 bg-white p-3.5 shadow-xl md:p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" />
              <h2 id="confirm-receipt-title" className="text-xs font-bold text-slate-900 md:text-sm">Confirm Delivery Receipt</h2>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 md:mt-2 md:text-xs">
              Have you received all items for <span className="font-semibold text-slate-800">{request.id}</span> in good condition? This lets us know the delivery is complete.
            </p>
            <div className="mt-3 flex gap-2 md:mt-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 md:py-2.5 md:text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReceived}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-700 md:py-2.5 md:text-xs"
              >
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Request Card Component
function RequestCard({ request, onViewDetails, onConfirmReceived }) {
  const status = statusConfig[request.status] || statusConfig.PENDING_REQUEST
  const itemLabel = request.itemType === 'other'
    ? `Other: ${request.otherItemType}`
    : getItemTypeLabel(request.itemType)

  // Not gated on `quotationRejected` — that flag marks a *previous* round as
  // declined, but a revised quotation sent after that rejection is a fresh
  // ask that still needs the customer's response.
  const needsAction = request.status === 'PROCESSING' &&
    request.quotation &&
    !request.quotationApproved

  const quotationAmount = request.quotation
    ? (typeof request.quotation === 'object' ? request.quotation.amount : request.quotation)
    : null

  // One line that tracks wherever the price currently stands in the
  // negotiation: the customer's original budget range until a supervisor
  // quotes it, the quote itself while it's pending the customer's response
  // or after it's approved (final), or the customer's revised range while a
  // rejected quote is being reworked.
  let quotationInfo = null
  if (quotationAmount && request.quotationApproved) {
    quotationInfo = { text: `Quotation: ₱${Number(quotationAmount).toLocaleString()}`, tone: 'text-emerald-600' }
  } else if (quotationAmount) {
    // Covers both a fresh quotation and a revised one sent after an earlier
    // round was rejected — either way there's a live quotation to act on.
    quotationInfo = {
      text: `Quotation: ₱${Number(quotationAmount).toLocaleString()}${needsAction ? ' — action needed' : ''}`,
      tone: needsAction ? 'text-red-600' : 'text-blue-600'
    }
  } else if (request.quotationRejected && request.priceRange) {
    quotationInfo = {
      text: `Requested range: ₱${Number(request.priceRange.min).toLocaleString()}–₱${Number(request.priceRange.max).toLocaleString()}`,
      tone: 'text-amber-600'
    }
  } else if (request.budgetMin && request.budgetMax) {
    quotationInfo = {
      text: `Budget: ₱${Number(request.budgetMin).toLocaleString()}–₱${Number(request.budgetMax).toLocaleString()}`,
      tone: 'text-slate-500'
    }
  }

  return (
    <>
      {/* Mobile (<md) — minimal, linear list row: no card box, no border, no
          shadow. Rows are separated purely by the parent list's horizontal
          divider lines (like a feed), with generous vertical padding standing
          in for the whitespace a card's border used to provide.
          Matches CustomerLayout's own md breakpoint for swapping the
          hamburger header for the desktop sidebar — otherwise this row style
          and the sidebar would show at the same time between md and lg.
          Desktop (md+) renders the original, untouched card below. */}
      <div
        className="flex flex-col border-b border-slate-300 py-4 transition-colors active:bg-slate-50 cursor-pointer md:hidden"
        onClick={() => onViewDetails(request)}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-slate-900 tracking-tight">{request.id}</span>
              {needsAction && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{itemLabel}</p>

            <p className="mt-2 text-[10px] leading-snug text-slate-400">
              Drop-off &middot; {formatDisplayDateTime(request.dropoffDate, request.dropoffTime)}
            </p>

            {quotationInfo && (
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  {needsAction && (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                    </span>
                  )}
                  <span className={`whitespace-nowrap text-[10px] font-medium ${quotationInfo.tone}`}>{quotationInfo.text}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}>
              {status.label}
            </span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </div>
        </div>

        {/* Delivered — optional one-tap receipt confirmation, visible right on
            the row so the customer doesn't have to open the request to act. */}
        {request.status === 'DELIVERED' && (
          <div className="mt-2.5 border-t border-slate-100 pt-2.5" onClick={(e) => e.stopPropagation()}>
            {request.receivedConfirmed ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Receipt confirmed
              </p>
            ) : (
              <div className="flex flex-nowrap items-center gap-2">
                <div className="flex flex-1 justify-center">
                  <button
                    onClick={() => onConfirmReceived(request)}
                    className="shrink-0 whitespace-nowrap rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
                  >
                    Confirm Received
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop (md+) — table row matching the Supervisor's list layout
          (Status | Request ID | Item Type | Pick-up | Drop-off | chevron)
          instead of a stacked card. The Supervisor's Customer/Company
          column is dropped (redundant — this is the customer's own list),
          and internal-only columns never existed here to begin with.
          The Confirm Received action lives on the Delivery Details page now
          (reviewed there, not from the table) —
          rows stay a plain single line, and the "needs a response" signal
          moves up to a dot on the Delivered tab itself instead of
          repeating a label on every affected row. */}
      <article
        onClick={() => onViewDetails(request)}
        className="hidden cursor-pointer gap-4 border-b border-emerald-100 px-5 py-4 transition [&>*]:min-w-0 last:border-b-0 hover:bg-emerald-50/40 md:grid md:grid-cols-[0.7fr_0.6fr_1.7fr_1.6fr_1.6fr_0.3fr] md:items-center"
      >
        <div className="flex justify-center">
          <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold leading-tight ${status.color}`}>
            {needsAction && (
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
            )}
            {status.label}
          </span>
        </div>
        <p className="text-center text-sm font-semibold text-slate-900">{request.id}</p>
        <p className="truncate text-sm font-medium text-slate-800">{itemLabel}</p>
        <p className="line-clamp-2 text-sm text-slate-700">{request.pickupLocation}</p>
        <p className="line-clamp-2 text-sm text-slate-700">{request.dropoffLocation}</p>
        <div className="flex justify-end">
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
      </article>
    </>
  )
}

// Map a snake_case `delivery_requests` row to the camelCase shape the rest of
// this page expects (detail view, timeline, cards, status helpers). `status`
// is translated to this page's vocabulary (see CUSTOMER_STATUS_MAP); the raw
// DB status is kept as `dbStatus` so writes always send the backend's values.
function mapDeliveryRow(row) {
  return {
    id: row.id,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    pickupTimeEnd: row.pickup_time_end || null,
    dropoffDate: row.dropoff_date,
    dropoffTime: row.dropoff_time,
    pickupLocation: row.pickup_location,
    pickupCoords: (row.pickup_lat != null && row.pickup_lng != null) ? { lat: row.pickup_lat, lng: row.pickup_lng } : null,
    dropoffLocation: row.dropoff_location,
    dropoffCoords: (row.dropoff_lat != null && row.dropoff_lng != null) ? { lat: row.dropoff_lat, lng: row.dropoff_lng } : null,
    truckType: row.truck_type,
    itemType: row.item_type,
    otherItemType: row.other_item_type || '',
    cargoWeight: row.cargo_weight,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    notes: row.notes || '',
    // Reference-only intermediate stops between pickup/dropoff, plus
    // proof-photo state for each item in the Pickup -> Dropoff -> Stops
    // chain, written by the Helper's completion actions — read-only here
    // (02B_MULTI_STOP_DELIVERIES.md, 02C_ROUTE_STYLING_AND_PROOF_VISIBILITY.md).
    stops: Array.isArray(row.stops) ? row.stops : [],
    pickupPhotoUrl: row.pickup_photo_url || null,
    dropoffPhotoUrl: row.dropoff_photo_url || null,
    dropoffCompletedAt: row.dropoff_completed_at || null,
    status: CUSTOMER_STATUS_MAP[row.status] || row.status,
    dbStatus: row.status,
    customerCounterMin: row.customer_counter_min,
    customerCounterMax: row.customer_counter_max,
    cancelledBy: row.cancelled_by,
    cancelReason: row.cancel_reason,
    cancelledAt: row.cancelled_at,
    cancelledFromStatus: row.cancelled_from_status,
    receivedConfirmed: row.received_confirmed,
    receivedConfirmedAt: row.received_confirmed_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  }
}

// Reconstruct the customer-visible quotation state from the delivery row plus
// its saved `delivery_quotations` (initial/updated rounds) and counter-offer
// columns. The detail view and timeline only know the local shape
// (`quotation`, `previousQuotation`, `priceRange`, `quotationRejected`,
// `quotationApproved`), none of which is persisted verbatim.
function attachQuotationState(row, qtnsByType) {
  const initial = qtnsByType.initial ? { amount: qtnsByType.initial.amount, breakdown: qtnsByType.initial.breakdown } : null
  const updated = qtnsByType.updated ? { amount: qtnsByType.updated.amount, breakdown: qtnsByType.updated.breakdown } : null
  const range = (row.customerCounterMin != null && row.customerCounterMax != null)
    ? { min: row.customerCounterMin, max: row.customerCounterMax }
    : null

  if (row.dbStatus === 'COUNTER_OFFER_SUBMITTED') {
    // The customer rejected the initial offer and is awaiting a revised one.
    return {
      ...row,
      quotation: null,
      previousQuotation: initial,
      quotationRejected: true,
      priceRange: range,
      quotationApproved: false,
    }
  }
  if (updated) {
    // A revised quotation exists (FINAL_QUOTATION_SUBMITTED or later).
    return {
      ...row,
      quotation: updated,
      previousQuotation: initial,
      priceRange: range,
      quotationRejected: false,
      quotationApproved: APPROVED_STATUSES.includes(row.dbStatus),
    }
  }
  if (initial) {
    // Initial quotation only.
    return {
      ...row,
      quotation: initial,
      previousQuotation: null,
      priceRange: range,
      quotationRejected: false,
      quotationApproved: APPROVED_STATUSES.includes(row.dbStatus),
    }
  }
  return {
    ...row,
    quotation: null,
    previousQuotation: null,
    priceRange: range,
    quotationRejected: false,
    quotationApproved: APPROVED_STATUSES.includes(row.dbStatus),
  }
}

function CustomerDeliveries() {
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  // Card-level "Delivered" quick actions (mobile) open these shared modals
  // instead of updating instantly — same deliberate-confirm pattern as the
  // detail view, without leaving the list.
  const [confirmingRequest, setConfirmingRequest] = useState(null)
  // +1 = new tab is to the right of the old one (slide in from the right),
  // -1 = to the left — mirrors how a mobile app's screen stack usually feels.
  const [tabDirection, setTabDirection] = useState(1)

  const [deliveryRequests, setDeliveryRequests] = useState([])
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // Load the signed-in customer's own delivery requests from the database.
  // DB rows are snake_case; the rest of this page (detail view, timeline,
  // cards) expects camelCase, so each row is mapped through mapDeliveryRow.
  useEffect(() => {
    let isMounted = true

    async function loadDeliveries() {
      setLoadError('')
      const { data: { user } } = await supabase.auth.getUser()
      if (!isMounted) return
      if (!user) {
        setDeliveryRequests([])
        return
      }

      const { data, error } = await supabase
        .from('delivery_requests')
        .select('*')
        .eq('customer_auth_id', user.id)
        .order('created_at', { ascending: false })

      if (!isMounted) return
      if (error) {
        setLoadError('Failed to load your delivery requests. Please try again.')
        return
      }

      let rows = (data || []).map(mapDeliveryRow)
      const ids = rows.map((r) => r.id)

      if (ids.length > 0) {
        const { data: qtns, error: qError } = await supabase
          .from('delivery_quotations')
          .select('*')
          .in('delivery_id', ids)
        if (!isMounted) return
        if (!qError) {
          const qtnsByDelivery = {}
          for (const q of qtns || []) {
            if (!qtnsByDelivery[q.delivery_id]) qtnsByDelivery[q.delivery_id] = {}
            qtnsByDelivery[q.delivery_id][q.quotation_type] = q
          }
          rows = rows.map((row) => attachQuotationState(row, qtnsByDelivery[row.id] || {}))
        }

        // Resolve the assigned crew (driver/helpers/truck) server-side: the
        // *_records tables are service_role-only, so the customer session can't
        // read the names behind assigned_driver_id / assigned_helper_ids
        // directly. get-delivery-crew returns them keyed by delivery id.
        const { data: crewResult, error: crewError } = await supabase.functions.invoke('admin-users', {
          body: { action: 'get-delivery-crew', deliveryIds: ids },
        })
        if (!isMounted) return
        if (!crewError && crewResult?.crewByDelivery) {
          rows = rows.map((row) => (
            crewResult.crewByDelivery[row.id] ? { ...row, crew: crewResult.crewByDelivery[row.id] } : row
          ))
        }
      }

      if (isMounted) setDeliveryRequests(rows)
    }

    loadDeliveries()

    return () => {
      isMounted = false
    }
  }, [reloadKey])


  const handleUpdateRequest = (id, updates) => {
    setDeliveryRequests(prev => prev.map(req =>
      req.id === id ? { ...req, ...updates } : req
    ))
    // Update selected request if the detail view is open
    if (selectedRequest && selectedRequest.id === id) {
      setSelectedRequest(prev => ({ ...prev, ...updates }))
    }
  }

  // Persist the customer's quotation response (approve/reject) to the backend.
  // Local state is updated optimistically by handleUpdateRequest; this write
  // makes it stick across reloads. Approve advances to APPROVED (the customer
  // side shows that as FOR_PICKUP); reject records the requested price range
  // and moves the request to COUNTER_OFFER_SUBMITTED so the supervisor can
  // read it back from the Customer's Counter Offer card.
  const persistQuotationResponse = async (id, action, payload) => {
    try {
      if (action === 'approve') {
        await supabase
          .from('delivery_requests')
          .update({ status: 'APPROVED' })
          .eq('id', id)
      } else if (action === 'reject') {
        await supabase
          .from('delivery_requests')
          .update({
            status: 'COUNTER_OFFER_SUBMITTED',
            customer_counter_min: payload?.priceRange?.min ? Number(payload.priceRange.min) : null,
            customer_counter_max: payload?.priceRange?.max ? Number(payload.priceRange.max) : null,
          })
          .eq('id', id)
      }
    } catch {
      // Optimistic local state already applied; a failed write just means the
      // response won't survive a reload — surfaced silently like the other
      // one-way writes on this page.
    }
  }

  // Persist a direct cancellation to the backend. Local state is updated
  // optimistically by handleUpdateRequest; this write keeps the CANCELLED
  // status (and the entered reason) across reloads for both the customer and
  // the supervisor's Cancellations module.
  const persistCancellation = async (id, payload) => {
    try {
      await supabase
        .from('delivery_requests')
        .update({
          status: 'CANCELLED',
          cancelled_by: payload?.cancelledBy || null,
          cancel_reason: payload?.cancelReason || null,
          cancelled_at: payload?.cancelledAt || null,
          cancelled_from_status: payload?.cancelledFromStatus || null,
        })
        .eq('id', id)
    } catch {
      // Optimistic local state already applied.
    }
  }

  // Persist a customer "Confirm Received" to the backend: moves the request to
  // COMPLETED and records when receipt was confirmed. Local state is updated
  // optimistically by handleUpdateRequest; this write keeps the confirmation
  // (and the COMPLETED status) across reloads for the customer, supervisor, and
  // driver.
  const persistReceivedConfirmation = async (id) => {
    try {
      await supabase
        .from('delivery_requests')
        .update({
          status: 'COMPLETED',
          received_confirmed: true,
          received_confirmed_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
    } catch {
      // Optimistic local state already applied.
    }
  }

  const filteredRequests = deliveryRequests.filter(req => {
    // Filter by tab
    if (activeTab !== 'all' && req.status !== activeTab) return false

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesId = req.id.toLowerCase().includes(query)
      const matchesPickup = req.pickupLocation.toLowerCase().includes(query)
      const matchesDropoff = req.dropoffLocation.toLowerCase().includes(query)
      const matchesItem = (req.itemType === 'other' ? req.otherItemType : req.itemType).toLowerCase().includes(query)
      const matchesTruck = req.truckType.toLowerCase().includes(query)
      if (!matchesId && !matchesPickup && !matchesDropoff && !matchesItem && !matchesTruck) return false
    }

    return true
  })

  const tabs = [
    { id: 'all', mobileLabel: 'All' },
    { id: 'PENDING_REQUEST', mobileLabel: 'Pending' },
    { id: 'PROCESSING', mobileLabel: 'Processing' },
    { id: 'FOR_PICKUP', mobileLabel: 'For Pickup' },
    { id: 'OUT_FOR_DELIVERY', mobileLabel: 'Out for Delivery' },
    { id: 'DELIVERED', mobileLabel: 'Delivered' },
    { id: 'DELIVERY_COMPLETED', mobileLabel: 'Completed' },
    { id: 'CANCELLED', mobileLabel: 'Cancelled' }
  ]

  // Which tabs currently have at least one request waiting on the customer
  // (a quotation to respond to, a delivery to confirm) — surfaced as a dot
  // on the tab itself instead of repeating a label on every matching row.
  const tabNeedsAttention = {
    PROCESSING: deliveryRequests.some(r => r.status === 'PROCESSING' && r.quotation && !r.quotationApproved),
    DELIVERED: deliveryRequests.some(r => r.status === 'DELIVERED' && !r.receivedConfirmed),
  }

  const handleTabChange = (newTabId) => {
    const order = tabs.map(t => t.id)
    setTabDirection(order.indexOf(newTabId) >= order.indexOf(activeTab) ? 1 : -1)
    setActiveTab(newTabId)
  }

  if (selectedRequest) {
    return (
      <CustomerLayout title="Customer Deliveries" background={background} bg="bg-white md:bg-[#F6F7FB]">
        <RequestDetailView
          request={selectedRequest}
          onBack={() => setSelectedRequest(null)}
          onUpdate={handleUpdateRequest}
          onQuotationResponse={persistQuotationResponse}
          onCancellation={persistCancellation}
          onReceivedConfirmation={persistReceivedConfirmation}
        />
      </CustomerLayout>
    )
  }

  return (
    <CustomerLayout title="Customer Deliveries" background={background} bg="bg-white md:bg-[#F6F7FB]">
      {/* Mobile (<md): sticky bottom CTA bar instead of an inline full-width button —
          stays reachable in the thumb zone without pushing the filters/list down.
          Styled to match the bottom action bar used in DriverDeliveries.jsx.
          Matches CustomerLayout's own md breakpoint for swapping the hamburger
          header for the desktop sidebar — otherwise this bar and the sidebar
          would both be visible between md and lg.
          Desktop (md+) keeps the original inline button, unchanged. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-emerald-200/70 bg-white/95 px-4 py-2.5 backdrop-blur-sm md:hidden"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        <Link
          to="/customer/deliveries/request"
          className="mx-auto flex w-full items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
        >
          Request Delivery
        </Link>
      </div>

      <div className="flex flex-col gap-4 mb-2 pb-24 sm:gap-6 md:gap-4 md:pb-0" style={interFontStyle}>
        {/* Search Bar + Request Delivery Button. Desktop (md+) wraps this in
            its own bordered white card, matching the Supervisor's search/
            filter card that sits above its table (separate from the table's
            own card below) — mobile keeps its existing borderless bar. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none md:pl-4">
              <Search className="h-4 w-4 text-slate-400 md:h-5 md:w-5" />
            </div>
            <input
              type="text"
              placeholder="Search your deliveries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-emerald-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 md:border-slate-200 md:bg-slate-50 md:pl-12 md:pr-4 md:py-3 md:text-sm md:focus:border-sky-300 md:focus:bg-white md:focus:ring-0"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 md:pr-4"
              >
                <svg className="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <Link
            to="/customer/deliveries/request"
            className="hidden shrink-0 rounded-xl bg-emerald-600 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:bg-emerald-800 md:block"
          >
            + Request Delivery
          </Link>
        </div>

        {/* Tab Navigation — the same compact scrollable underline strip at
            every size (previously mobile-only, with a separate pill-button
            row for desktop; unified so both screen sizes share one tab UI). */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-300 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`relative shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition md:px-4 md:py-2.5 md:text-sm ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.mobileLabel}
              {tabNeedsAttention[tab.id] && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-yellow-400" />
              )}
            </button>
          ))}
        </div>

        <TabPanel key={activeTab} direction={tabDirection}>
          {/* Delivery Requests List.
              Mobile: plain divider-separated rows (unchanged).
              Desktop (md+): wrapped in a bordered box with a column header,
              matching the Supervisor's list table. Spacing/dividers are
              still applied per-row (not via a container-level divide-y)
              because each RequestCard renders both a mobile row and a
              desktop row as sibling DOM nodes (one always display:none) —
              Tailwind's divide-y sibling selector only excludes the HTML
              `hidden` attribute, not CSS-hidden elements, so a
              container-level utility here would misfire onto the wrong
              sibling. */}
          <div className="md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:bg-white">
            <div className="hidden gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[0.7fr_0.6fr_1.7fr_1.6fr_1.6fr_0.3fr]">
              <span className="text-center">Status</span>
              <span className="text-center">Request ID</span>
              <span>Item Type</span>
              <span>Pick-up</span>
              <span>Drop-off</span>
              <span></span>
            </div>

            {loadError ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-700">{loadError}</p>
                <button
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Retry
                </button>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Package className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  {searchQuery ? 'No matching requests' : (emptyStateCopy[activeTab]?.title || 'No delivery requests found.')}
                </p>
                <p className="max-w-xs text-xs text-slate-500">
                  {searchQuery
                    ? `We couldn't find anything matching "${searchQuery}".`
                    : emptyStateCopy[activeTab]?.subtitle}
                </p>
              </div>
            ) : (
              filteredRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onViewDetails={setSelectedRequest}
                  onConfirmReceived={setConfirmingRequest}
                />
              ))
            )}
          </div>
        </TabPanel>
      </div>

      {/* Confirm-receipt modal for the card-level quick action */}
      {confirmingRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-confirm-receipt-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-emerald-200/70 bg-white p-4 shadow-xl sm:p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <h2 id="card-confirm-receipt-title" className="text-sm font-bold text-slate-900">Confirm Delivery Receipt</h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Have you received all items for <span className="font-semibold text-slate-800">{confirmingRequest.id}</span> in good condition? This lets us know the delivery is complete.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmingRequest(null)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleUpdateRequest(confirmingRequest.id, { status: 'DELIVERY_COMPLETED', receivedConfirmed: true, receivedConfirmedAt: new Date().toISOString() })
                  persistReceivedConfirmation(confirmingRequest.id)
                  setConfirmingRequest(null)
                }}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
              >
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  )
}

export default CustomerDeliveries
