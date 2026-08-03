import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Clock, FileText, MapPin, Package, Search, Send, Truck, Users, X
} from 'lucide-react'
import CustomerLayout from '../layout/CustomerLayout.jsx'
import { truckTypes, itemTypes } from '../lib/deliveryOptions.js'

const background = null

// Explicit Inter typeface for this page's content, matching CustomerLayout's
// own font stack instead of relying solely on inherited font-family.
const interFontStyle = { fontFamily: 'Inter, system-ui, sans-serif' }

// "2026-08-05" -> "August 5, 2026" — human-readable date for the mobile list row.
function formatDisplayDate(isoDate) {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

// "14:30" -> "2:30 PM"
function formatDisplayTime(time24) {
  if (!time24) return ''
  const [hour, minute] = time24.split(':').map(Number)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
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
// delivery, delivered, completed, or already cancelled, there's nothing left to cancel.
const CANCELLABLE_STATUSES = ['PENDING_REQUEST', 'PROCESSING', 'FOR_PICKUP']

const cancellationReasons = [
  'Change of schedule',
  'Found another transport provider',
  'Pricing or budget concerns',
  'Duplicate or mistaken request',
  'No longer needed',
  'Other'
]

const deliveryIssueReasons = [
  'Item damaged',
  'Missing item(s)',
  'Wrong item delivered',
  'Never received',
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
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
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
        ...(request.issueReported ? [{ label: 'You Reported an Issue', timestamp: formatTimestamp(request.issueReportedAt) }] : []),
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

function toGoogleMapEmbed(location) {
  if (!location) return 'https://maps.google.com/maps?q=14.5995,120.9842&z=12&output=embed'
  if (typeof location === 'string') return `https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=14&output=embed`
  return `https://maps.google.com/maps?q=${location.lat},${location.lng}&z=14&output=embed`
}

function fmPeso(v) {
  return `₱${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
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
        <BreakdownLine label="Diesel Rate" value={d.dieselRate} />
        {c.dieselTotal != null && (
          <p className="pl-3 text-[10px] text-sky-700 md:text-slate-600">Total diesel: {fmPeso(c.dieselTotal)}</p>
        )}
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
    ? new Date(request.receivedConfirmedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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

// Real-time Monitoring — desktop (md+) only, copied layout-for-layout from
// the Supervisor's In Transit Deliveries tab: the right-side "Real-time
// Monitoring" card (map + driver/truck row + Speed/Last Update grid) that
// sits beside the delivery list itself, not inside a per-request detail
// page — same placement here, used on the Customer Deliveries LIST page
// (see CustomerDeliveries below) for whichever request is "monitored" in
// the FOR_PICKUP/OUT_FOR_DELIVERY tabs. The Supervisor's DriveWise Alerts
// card next to it is driver-behavior telemetry and stays supervisor-only —
// not copied here. Mobile is unaffected; it keeps its own separate
// "Confirmed Pickup Schedule" / "Live Tracking" cards on the detail page.
function RealTimeMonitoringCard({ request, status }) {
  const isOutForDelivery = request.status === 'OUT_FOR_DELIVERY' && request.liveTracking
  const mapSrc = isOutForDelivery ? toGoogleMapEmbed(request.liveTracking) : toGoogleMapEmbed(request.pickupLocation)
  const driverName = request.crew?.driver?.name
  const truck = request.crew?.truck

  return (
    <div className="hidden md:block md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-base font-semibold text-slate-900">Real-time Monitoring</h3>
        <p className="text-xs text-slate-500">{request.id} • {status.label}</p>
      </div>
      <div className="p-4">
        <iframe
          title="Live Delivery Map"
          src={mapSrc}
          className="h-56 w-full rounded-xl"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {isOutForDelivery ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                {getInitials(driverName || '?')}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{driverName || 'Driver TBA'}</p>
                <p className="truncate text-xs text-slate-500">
                  <Truck className="mr-1 inline h-3.5 w-3.5" />
                  {truck?.plateNumber || 'Truck TBA'}
                  {truck?.truckType && ` • ${truck.truckType}`}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Speed</p>
                <p className="text-xl font-bold text-slate-900">{request.liveTracking.speedKmh} km/h</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Last Update</p>
                <p className="text-sm font-bold text-slate-900">{request.liveTracking.lastUpdate}</p>
              </div>
            </div>
          </div>
        ) : request.status === 'FOR_PICKUP' && request.confirmedPickupDate ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
                <Package className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">Pickup Scheduled</p>
                <p className="truncate text-xs text-slate-500">{request.confirmedPickupDate} at {request.confirmedPickupTime}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No active truck to monitor.</p>
        )}
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
function RequestDetailView({ request, onBack, onUpdate }) {
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
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [issueReason, setIssueReason] = useState('')
  const [issueDescription, setIssueDescription] = useState('')

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
    : itemTypes.find(i => i.value === request.itemType)?.label || request.itemType
  const truckLabel = truckTypes.find(t => t.value === request.truckType)?.label || request.truckType
  const plateNumber = request.crew?.truck?.plateNumber
  const driverName = request.crew?.driver?.name
  const helpersLabel = request.crew?.helpers?.length
    ? request.crew.helpers.map(h => h.name).join(', ')
    : null

  const hasQuotationContent = request.status === 'PROCESSING'
  // Whether the second (mobile-only-ordered) section should render at all —
  // needed for DELIVERED too, since its confirmation card lives there via
  // the order-1 trick above on mobile, even though that card is md:hidden.
  // Real-time monitoring for FOR_PICKUP/OUT_FOR_DELIVERY now lives on the
  // list page instead (matching the Supervisor's In Transit Deliveries tab,
  // which is a list, not a per-request detail view) — this detail page
  // stays a single stacked column for every status.
  const hasRightContent = hasQuotationContent ||
    (request.status === 'FOR_PICKUP' && request.confirmedPickupDate) ||
    (request.status === 'OUT_FOR_DELIVERY' && request.liveTracking) ||
    request.status === 'DELIVERED'
  const quotationAmount = request.quotation
    ? (typeof request.quotation === 'object' ? request.quotation.amount : request.quotation)
    : null
  // The right-side panel already surfaces the quotation prominently while it's
  // awaiting the customer's response, so the left-column summary only repeats
  // it once that interactive state has resolved (approved, rejected, or a later stage).
  const showQuotationSummary = quotationAmount && request.status !== 'PROCESSING'

  // A crew/truck is already assigned once the request reaches FOR_PICKUP — from that
  // point on, cancelling needs the supervisor to sign off rather than taking effect right away.
  const hasAssignedCrew = Boolean(request.crew)
  const today = new Date().toISOString().slice(0, 10)
  const isBeforePickup = !request.pickupDate || request.pickupDate > today
  const cancellationPending = request.cancellationRequested && request.status !== 'CANCELLED'
  const isCancellable = CANCELLABLE_STATUSES.includes(request.status) && isBeforePickup && !cancellationPending
  const isCancelReasonValid = cancelReason && (cancelReason !== 'Other' || cancelReasonOther.trim())
  const isIssueReasonValid = issueReason && (issueReason !== 'Other' || issueDescription.trim())

  const handleQuotationSubmit = () => {
    if (quotationAction === 'approve') {
      onUpdate(request.id, {
        status: 'FOR_PICKUP',
        quotationApproved: true,
        quotation: request.quotation,
        // Real timestamp for the Delivery Timeline's "Quotation Approved"
        // entry — same pattern as receivedConfirmedAt/issueReportedAt below.
        quotationRespondedAt: new Date().toISOString()
      })
    } else if (quotationAction === 'reject') {
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
    }
    setShowQuotationResponse(false)
    setQuotationAction(null)
    setPriceRange({ min: '', max: '' })
  }

  const handleConfirmReceived = () => {
    onUpdate(request.id, { receivedConfirmed: true, receivedConfirmedAt: new Date().toISOString() })
    setShowConfirmModal(false)
  }

  const handleReportIssue = () => {
    if (!isIssueReasonValid) return
    const reason = issueReason === 'Other' ? issueDescription.trim() : issueReason
    onUpdate(request.id, {
      issueReported: true,
      issueDescription: reason,
      issueReportedAt: new Date().toISOString()
    })
    setShowIssueModal(false)
    setIssueReason('')
    setIssueDescription('')
  }

  const handleCancelSubmit = () => {
    if (!isCancelReasonValid) return
    const reason = cancelReason === 'Other' ? cancelReasonOther.trim() : cancelReason

    if (hasAssignedCrew) {
      onUpdate(request.id, {
        cancellationRequested: true,
        cancellationReason: reason,
        cancellationRequestedAt: new Date().toISOString()
      })
    } else {
      onUpdate(request.id, {
        status: 'CANCELLED',
        cancelReason: reason,
        cancelledBy: 'customer',
        cancelledAt: new Date().toISOString()
      })
    }

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

      {cancellationPending && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 md:gap-3 md:p-4 md:shadow-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 md:h-5 md:w-5" />
          <div>
            <h3 className="text-xs font-semibold text-amber-800 md:text-sm">Cancellation Request Pending</h3>
            <p className="mt-1 text-xs text-amber-800 md:text-sm">Reason: {request.cancellationReason}</p>
            <p className="mt-1 text-[10px] text-amber-600 md:text-xs">A crew is already assigned to this delivery, so a supervisor needs to approve the cancellation. The delivery will continue as scheduled until then.</p>
          </div>
        </div>
      )}

      {request.status === 'CANCELLED' && request.cancelReason && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-2.5 md:gap-3 md:p-4 md:shadow-sm">
          <X className="h-4 w-4 shrink-0 text-red-600 md:h-5 md:w-5" />
          <div>
            <h3 className="text-xs font-semibold text-red-800 md:text-sm">Cancellation Details</h3>
            <p className="mt-1 text-xs text-red-800 md:text-sm">Reason: {request.cancelReason}</p>
            {request.cancelledBy && (
              <p className="mt-1 text-[10px] text-red-600 md:text-xs">
                Cancelled by {request.cancelledBy === 'customer' ? 'you' : 'the supervisor'}
                {request.cancelledAt ? ` on ${new Date(request.cancelledAt).toLocaleDateString()}` : ''}
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
                    <span className="font-medium">{request.pickupDate} at {request.pickupTime}</span>
                  </p>
                  <p className="mt-0.5 text-slate-500">{request.pickupLocation}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-bold text-rose-600">D</span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-900">
                    <span className="font-medium">{request.dropoffDate} at {request.dropoffTime}</span>
                  </p>
                  <p className="mt-0.5 text-slate-500">{request.dropoffLocation}</p>
                </div>
              </div>
            </div>

            {/* Desktop (md+) — original 4-row icon + stacked label/value layout, untouched. */}
            <div className="hidden mt-2 space-y-2 text-xs md:mt-3 md:block md:space-y-3 md:text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 md:h-4 md:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Pickup</p>
                  <p className="font-medium text-slate-900">{request.pickupDate} at {request.pickupTime}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 md:h-4 md:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 md:text-xs">Drop-off</p>
                  <p className="font-medium text-slate-900">{request.dropoffDate} at {request.dropoffTime}</p>
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
                      <Row label="Pickup" value={`${request.pickupDate} at ${request.pickupTime}`} />
                      <Row label="Drop-off" value={`${request.dropoffDate} at ${request.dropoffTime}`} />
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

                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    Location
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-5 w-5 shrink-0 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                          <span className="text-[10px] font-bold text-blue-600">P</span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Pick-up Location</span>
                          <span className="text-sm font-medium text-slate-900 block truncate">{request.pickupLocation}</span>
                        </div>
                      </div>
                      <iframe
                        title="Pickup - Google Map"
                        src={toGoogleMapEmbed(request.pickupLocation)}
                        className="h-36 w-full rounded-lg border border-slate-200"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-5 w-5 shrink-0 rounded-full bg-rose-100 flex items-center justify-center mt-0.5">
                          <span className="text-[10px] font-bold text-rose-600">D</span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Drop-off Location</span>
                          <span className="text-sm font-medium text-slate-900 block truncate">{request.dropoffLocation}</span>
                        </div>
                      </div>
                      <iframe
                        title="Drop-off - Google Map"
                        src={toGoogleMapEmbed(request.dropoffLocation)}
                        className="h-36 w-full rounded-lg border border-slate-200"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  </div>
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
                            Reject &amp; Price Range
                          </button>
                        </div>
                      )}

                      {showQuotationResponse && (
                        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4 space-y-3">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-blue-800">
                            {quotationAction === 'approve' ? 'Confirm Approval' : 'Request Price Range'}
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
                      <p className="text-xs text-slate-500">{truckLabel}</p>
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
            {/* Live Tracking — OUT_FOR_DELIVERY with live coordinates. Mobile
                only now (md:hidden) — the desktop equivalent is the
                Real-time Monitoring card below, copied from the
                Supervisor's In Transit Delivery Details page. */}
            {request.status === 'OUT_FOR_DELIVERY' && request.liveTracking && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-2.5 md:hidden">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-indigo-800">
                  <Truck className="h-3.5 w-3.5" />
                  Live Tracking
                </h3>
                <iframe
                  title="Live delivery location"
                  src={`https://maps.google.com/maps?q=${request.liveTracking.lat},${request.liveTracking.lng}&z=14&output=embed`}
                  className="mt-2 h-40 w-full rounded-xl border border-indigo-100"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/70 p-2 text-center">
                    <p className="text-[10px] text-slate-500">Speed</p>
                    <p className="text-sm font-bold text-indigo-900">{request.liveTracking.speedKmh} km/h</p>
                  </div>
                  <div className="rounded-xl bg-white/70 p-2 text-center">
                    <p className="text-[10px] text-slate-500">Last Update</p>
                    <p className="text-sm font-bold text-indigo-900">{request.liveTracking.lastUpdate}</p>
                  </div>
                </div>
              </div>
            )}

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
                    Reject & Price Range
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
                  {quotationAction === 'approve' ? 'Confirm Approval' : 'Request Price Range'}
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

            {/* Confirmed Pickup — FOR_PICKUP. Mobile only now (md:hidden) —
                the desktop equivalent is the Real-time Monitoring card
                above, copied from the Supervisor's In Transit Delivery
                Details page. */}
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
                supervisor-driven status pipeline, so confirming or reporting
                an issue here doesn't change the request's status itself.
                Mobile only now (md:hidden) — this card sits first on mobile
                via the order-1 trick above, which is exactly the prominence
                mobile already had and keeps. Desktop gets its own version
                below, positioned after the full review instead of living in
                a side panel. */}
            {request.status === 'DELIVERED' && (
              <div className={`rounded-2xl border p-2.5 md:hidden ${
                request.issueReported && !request.receivedConfirmed
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}>
                {request.receivedConfirmed ? (
                  <>
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-emerald-800 md:text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      Delivery Confirmed
                    </h3>
                    <p className="mt-1.5 text-xs text-emerald-700 md:mt-2 md:text-sm">
                      You confirmed receipt of this delivery
                      {request.receivedConfirmedAt ? ` on ${new Date(request.receivedConfirmedAt).toLocaleDateString()}` : ''}. Thank you!
                    </p>
                  </>
                ) : request.issueReported ? (
                  <>
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-amber-800 md:text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      Issue Reported
                    </h3>
                    <p className="mt-1.5 text-xs text-amber-800 md:mt-2 md:text-sm">Our team has been notified and will follow up with you shortly.</p>
                    {request.issueDescription && (
                      <p className="mt-1.5 rounded-lg bg-white/70 p-2 text-[11px] italic text-slate-700 md:mt-2 md:p-2.5 md:text-xs">&ldquo;{request.issueDescription}&rdquo;</p>
                    )}
                  </>
                ) : (
                  <>
                    {/* Shared content simplification (both breakpoints): a
                        short prompt instead of a heading + explanatory
                        paragraph — the card's color/position already says
                        what this is, so the sentence was just extra height
                        for no added clarity. */}
                    <h3 className="text-xs font-semibold text-emerald-800 md:text-sm">Received your delivery?</h3>

                    {/* Compact primary button + secondary destructive text
                        action instead of two full-width stacked buttons.
                        Centered as a pair with a modest gap (not stretched
                        to the row's edges), and the secondary action gets
                        its own padded, rounded tap target (subtle red
                        hover/press fill) so it reads as an intentional,
                        comfortably-sized action rather than a bare floating
                        link next to a real button. */}
                    <div className="mt-2 flex items-center justify-center gap-4">
                      <button
                        onClick={() => setShowConfirmModal(true)}
                        className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
                      >
                        Confirm Received
                      </button>
                      <button
                        onClick={() => setShowIssueModal(true)}
                        className="rounded-md px-2 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-700 active:bg-red-100"
                      >
                        Report an Issue
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
        <div className={`hidden rounded-2xl border p-6 text-center md:block md:shadow-sm ${
          request.issueReported && !request.receivedConfirmed
            ? 'border-amber-200 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50'
        }`}>
          {request.receivedConfirmed ? (
            <>
              <h3 className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Delivery Confirmed
              </h3>
              <p className="mt-1.5 text-sm text-emerald-700">
                You confirmed receipt of this delivery
                {request.receivedConfirmedAt ? ` on ${new Date(request.receivedConfirmedAt).toLocaleDateString()}` : ''}. Thank you!
              </p>
            </>
          ) : request.issueReported ? (
            <>
              <h3 className="flex items-center justify-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Issue Reported
              </h3>
              <p className="mt-1.5 text-sm text-amber-800">Our team has been notified and will follow up with you shortly.</p>
              {request.issueDescription && (
                <p className="mx-auto mt-2 max-w-md rounded-lg bg-white/70 p-2.5 text-xs italic text-slate-700">&ldquo;{request.issueDescription}&rdquo;</p>
              )}
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-emerald-800">Received your delivery?</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-emerald-700">
                You've reviewed the delivery details and timeline above — let us know it arrived safely, or report an issue if something's wrong.
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
                >
                  Confirm Received
                </button>
                <button
                  onClick={() => setShowIssueModal(true)}
                  className="rounded-xl border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 active:bg-red-100"
                >
                  Report an Issue
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
            {hasAssignedCrew
              ? 'A crew has already been assigned to this delivery. Submitting this will send a cancellation request to the supervisor for approval — it will not cancel immediately.'
              : 'This request has not yet been assigned a crew, so it will be cancelled right away.'}
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
                {hasAssignedCrew ? 'Submit Cancellation Request' : 'Confirm Cancellation'}
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
            {hasAssignedCrew ? 'Request Cancellation' : 'Cancel Delivery'}
          </button>
          {hasAssignedCrew && (
            <p className="text-[10px] text-slate-500 md:text-[11px]">A crew is already assigned — this needs supervisor approval before it takes effect.</p>
          )}
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

      {/* Report-an-issue modal */}
      {showIssueModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-issue-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-3.5 shadow-xl md:p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4 md:h-5 md:w-5" />
              <h2 id="report-issue-title" className="text-xs font-bold text-slate-900 md:text-sm">Report an Issue</h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-600 md:mt-1.5 md:text-xs">
              Let us know what went wrong with <span className="font-semibold text-slate-800">{request.id}</span>.
            </p>
            <div className="mt-2 space-y-2 md:mt-3 md:space-y-3">
              <div>
                <label htmlFor="issueReason" className="text-[11px] font-medium text-slate-700 md:text-xs">Reason</label>
                <select
                  id="issueReason"
                  value={issueReason}
                  onChange={(e) => setIssueReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 md:px-3.5 md:py-2.5 md:text-xs"
                >
                  <option value="">Select a reason...</option>
                  {deliveryIssueReasons.map(reason => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>
              {issueReason === 'Other' && (
                <textarea
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  rows={3}
                  placeholder="Tell us what happened..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 md:px-3.5 md:py-2.5 md:text-xs"
                />
              )}
            </div>
            <div className="mt-3 flex gap-2 md:mt-4">
              <button
                onClick={() => { setShowIssueModal(false); setIssueReason(''); setIssueDescription('') }}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 md:py-2.5 md:text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleReportIssue}
                disabled={!isIssueReasonValid}
                className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 md:py-2.5 md:text-xs"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Request Card Component
function RequestCard({ request, onViewDetails, onConfirmReceived, onReportIssue, desktopHidden = false }) {
  const status = statusConfig[request.status] || statusConfig.PENDING_REQUEST
  const itemLabel = request.itemType === 'other'
    ? `Other: ${request.otherItemType}`
    : itemTypes.find(i => i.value === request.itemType)?.label || request.itemType

  // Not gated on `quotationRejected` — that flag marks a *previous* round as
  // declined, but a revised quotation sent after that rejection is a fresh
  // ask that still needs the customer's response.
  const needsAction = request.status === 'PROCESSING' &&
    request.quotation &&
    !request.quotationApproved

  const quotationAmount = request.quotation
    ? (typeof request.quotation === 'object' ? request.quotation.amount : request.quotation)
    : null

  const cancellationPending = request.cancellationRequested && request.status !== 'CANCELLED'

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
              Drop-off &middot; {formatDisplayDate(request.dropoffDate)} at {formatDisplayTime(request.dropoffTime)}
            </p>

            {(quotationInfo || cancellationPending) && (
              <div className="mt-2 space-y-1 text-xs">
                {quotationInfo && (
                  <div className="flex items-center gap-1.5">
                    {needsAction && (
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                      </span>
                    )}
                    <span className={`whitespace-nowrap text-[10px] font-medium ${quotationInfo.tone}`}>{quotationInfo.text}</span>
                  </div>
                )}
                {cancellationPending && (
                  <p className="font-medium text-amber-600">Cancellation pending supervisor approval</p>
                )}
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
            the row so the customer doesn't have to open the request to act.
            Spans the full row width (not just the left content column) so
            "Confirm Received" and "Report an Issue" can anchor to the true
            left/right edges — the same edges the status badge/chevron use. */}
        {request.status === 'DELIVERED' && (
          <div className="mt-2.5 border-t border-slate-100 pt-2.5" onClick={(e) => e.stopPropagation()}>
            {request.receivedConfirmed ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Receipt confirmed
              </p>
            ) : request.issueReported ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Issue reported — we're on it
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
                <div className="flex flex-1 justify-center">
                  <button
                    onClick={() => onReportIssue(request)}
                    className="shrink-0 whitespace-nowrap text-[10px] font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Report an Issue
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
          The Confirm Received / Report an Issue actions live on the
          Delivery Details page now (reviewed there, not from the table) —
          rows stay a plain single line, and the "needs a response" signal
          moves up to a dot on the Delivered tab itself instead of
          repeating a label on every affected row.
          `desktopHidden` suppresses this row entirely at desktop — used by
          the FOR_PICKUP/OUT_FOR_DELIVERY tabs, which render their own
          Supervisor-style monitoring row (MonitoringRequestRow) instead. */}
      <article
        onClick={() => onViewDetails(request)}
        className={`gap-4 border-b border-emerald-100 px-5 py-4 transition [&>*]:min-w-0 last:border-b-0 hover:bg-emerald-50/40 md:items-center ${
          desktopHidden ? 'hidden' : 'hidden cursor-pointer md:grid md:grid-cols-[0.7fr_0.6fr_1.7fr_1.6fr_1.6fr_0.3fr]'
        }`}
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

        {cancellationPending && (
          <div className="md:col-span-full" onClick={(e) => e.stopPropagation()}>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
              <span className="font-medium text-amber-700">Cancellation request pending supervisor approval</span>
            </div>
          </div>
        )}
      </article>
    </>
  )
}

// Desktop (md+) only — the FOR_PICKUP/OUT_FOR_DELIVERY list row, copied
// layout-for-layout from the Supervisor's In Transit Deliveries tab row
// (Status | Request ID | Customer | View Details). The Customer/Company
// column becomes Item Type + Pick-up (this is the customer's own list, so
// their own name doesn't need repeating). Clicking the row selects it for
// the Real-time Monitoring panel on the right, same as the supervisor
// page's `setMonitoredDeliveryId`; the "View Details" button stops
// propagation and opens the full Delivery Details page instead, exactly
// like the supervisor's separate `openDetails` action on the same row.
function MonitoringRequestRow({ request, isMonitored, onSelect, onViewDetails }) {
  const status = statusConfig[request.status] || statusConfig.PENDING_REQUEST
  const itemLabel = request.itemType === 'other'
    ? `Other: ${request.otherItemType}`
    : itemTypes.find((i) => i.value === request.itemType)?.label || request.itemType

  return (
    <article
      onClick={() => onSelect(request.id)}
      className={`grid cursor-pointer grid-cols-[0.55fr_0.55fr_1.5fr_0.5fr] items-center gap-4 px-5 py-4 transition [&>*]:min-w-0 ${
        isMonitored ? 'bg-sky-50 hover:bg-sky-50' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex justify-center">
        <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-center text-[10px] font-semibold leading-tight ${status.color}`}>
          {status.label}
        </span>
      </div>
      <p className="text-center text-sm font-semibold text-slate-900">{request.id}</p>
      <div>
        <p className="text-sm font-semibold text-slate-900">{itemLabel}</p>
        <p className="truncate text-xs text-slate-500">{request.pickupLocation}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onViewDetails(request) }}
        className="flex items-center justify-end gap-0.5 text-sm font-semibold text-sky-600 hover:text-sky-700"
      >
        View Details
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  )
}

function CustomerDeliveries() {
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  // Desktop (md+) only — which request is selected for the Real-time
  // Monitoring panel on the FOR_PICKUP/OUT_FOR_DELIVERY tabs, matching the
  // Supervisor's In Transit Deliveries tab (`monitoredDeliveryId`).
  const [monitoredRequestId, setMonitoredRequestId] = useState(null)
  // Card-level "Delivered" quick actions (mobile) open these shared modals
  // instead of updating instantly — same deliberate-confirm pattern as the
  // detail view, without leaving the list.
  const [confirmingRequest, setConfirmingRequest] = useState(null)
  const [reportingRequest, setReportingRequest] = useState(null)
  const [cardIssueReason, setCardIssueReason] = useState('')
  const [cardIssueText, setCardIssueText] = useState('')
  // +1 = new tab is to the right of the old one (slide in from the right),
  // -1 = to the left — mirrors how a mobile app's screen stack usually feels.
  const [tabDirection, setTabDirection] = useState(1)

  // Sample delivery requests with different statuses for demo, seeded with any
  // request just submitted from the Request Delivery page (handed back via navigation state)
  const [deliveryRequests, setDeliveryRequests] = useState(() => {
    const sampleRequests = [
    {
      id: 'DR-2024-001',
      pickupDate: '2026-08-05',
      pickupTime: '09:00',
      dropoffDate: '2026-08-05',
      dropoffTime: '14:00',
      pickupLocation: '123 Taft Avenue, Manila, Metro Manila',
      dropoffLocation: '456 Quezon Avenue, Quezon City, Metro Manila',
      truckType: '4T',
      itemType: 'appliances',
      otherItemType: '',
      cargoWeight: '850',
      budgetMin: '4000',
      budgetMax: '7000',
      notes: 'Fragile items - handle with care',
      status: 'PENDING_REQUEST',
      createdAt: '2026-07-29T10:30:00'
    },
    {
      id: 'DR-2024-002',
      pickupDate: '2026-08-07',
      pickupTime: '08:00',
      dropoffDate: '2026-08-07',
      dropoffTime: '16:00',
      pickupLocation: '789 EDSA, Makati, Metro Manila',
      dropoffLocation: '321 Roxas Boulevard, Pasay, Metro Manila',
      truckType: '10T',
      itemType: 'dry_food',
      otherItemType: '',
      cargoWeight: '9200',
      budgetMin: '12000',
      budgetMax: '16000',
      notes: '',
      status: 'PROCESSING',
      quotation: {
        amount: 14042,
        breakdown: {
          directExpenses: {
            depreciation: 1600, dieselRate: 70,
            repairsAndMaintenance: { batteries: 450, tires: 550 },
            salariesAndWages: { driver: 2400, helper1: 1200, helper2: '' },
            tripAllowance: 600, lodgingAllowance: 350, tollParking: 300
          },
          indirectExpenses: { adminFees: 600, insurance: 700, motorVehicleReg: 350, garageRental: 450 },
          calculated: { distanceKm: 38, totalDays: 1, dieselTotal: 2660, directTotal: 10110, indirectTotal: 2100, operatingTotal: 12210, income: 1831.5, proposedRate: 14041.5 }
        },
        notes: '', validUntil: ''
      },
      createdAt: '2026-07-28T09:00:00'
    },
    {
      id: 'DR-2024-007',
      pickupDate: '2026-08-06',
      pickupTime: '09:00',
      dropoffDate: '2026-08-06',
      dropoffTime: '15:00',
      pickupLocation: '99 Marcos Highway, Marikina, Metro Manila',
      dropoffLocation: '210 Commonwealth Avenue, Quezon City, Metro Manila',
      truckType: '6T',
      itemType: 'furniture',
      otherItemType: '',
      cargoWeight: '3800',
      budgetMin: '7000',
      budgetMax: '10000',
      notes: '',
      status: 'PROCESSING',
      quotationRejected: true,
      priceRange: { min: '8500', max: '10000' },
      previousQuotation: {
        amount: 12949,
        breakdown: {
          directExpenses: {
            depreciation: 1600, dieselRate: 80,
            repairsAndMaintenance: { batteries: 450, tires: 550 },
            salariesAndWages: { driver: 2400, helper1: 1200, helper2: 600 },
            tripAllowance: 550, lodgingAllowance: 0, tollParking: 250
          },
          indirectExpenses: { adminFees: 550, insurance: 650, motorVehicleReg: 300, garageRental: 400 },
          calculated: { distanceKm: 22, totalDays: 1, dieselTotal: 1760, directTotal: 9360, indirectTotal: 1900, operatingTotal: 11260, income: 1689, proposedRate: 12949 }
        },
        notes: 'Includes 2-helper crew for large furniture pieces', validUntil: ''
      },
      quotation: {
        amount: 9683,
        breakdown: {
          directExpenses: {
            depreciation: 1200, dieselRate: 60,
            repairsAndMaintenance: { batteries: 350, tires: 420 },
            salariesAndWages: { driver: 1800, helper1: 900, helper2: 450 },
            tripAllowance: 400, lodgingAllowance: 0, tollParking: 180
          },
          indirectExpenses: { adminFees: 400, insurance: 480, motorVehicleReg: 220, garageRental: 300 },
          calculated: { distanceKm: 22, totalDays: 1, dieselTotal: 1320, directTotal: 7020, indirectTotal: 1400, operatingTotal: 8420, income: 1263, proposedRate: 9683 }
        },
        notes: 'Revised per your requested price range', validUntil: ''
      },
      createdAt: '2026-07-29T13:00:00'
    },
    {
      id: 'DR-2024-003',
      pickupDate: '2026-08-03',
      pickupTime: '10:00',
      dropoffDate: '2026-08-03',
      dropoffTime: '15:00',
      pickupLocation: '555 Boni Avenue, Mandaluyong, Metro Manila',
      dropoffLocation: '888 Ortigas Center, Pasig, Metro Manila',
      truckType: '2T',
      itemType: 'frozen',
      otherItemType: '',
      cargoWeight: '1500',
      budgetMin: '6000',
      budgetMax: '9000',
      notes: 'Maintain refrigeration temperature',
      status: 'FOR_PICKUP',
      confirmedPickupDate: '2026-08-04',
      confirmedPickupTime: '10:00',
      quotation: {
        amount: 7383,
        breakdown: {
          directExpenses: {
            depreciation: 900, dieselRate: 55,
            repairsAndMaintenance: { batteries: 300, tires: 380 },
            salariesAndWages: { driver: 1600, helper1: 800, helper2: '' },
            tripAllowance: 350, lodgingAllowance: 0, tollParking: 180
          },
          indirectExpenses: { adminFees: 350, insurance: 420, motorVehicleReg: 200, garageRental: 280 },
          calculated: { distanceKm: 12, totalDays: 1, dieselTotal: 660, directTotal: 5170, indirectTotal: 1250, operatingTotal: 6420, income: 963, proposedRate: 7383 }
        },
        notes: '', validUntil: ''
      },
      quotationApproved: true,
      crew: {
        driver: { id: 'DRV-003', name: 'Nestor Villareal' },
        helpers: [{ id: 'HLP-003', name: 'Jomar Cruz' }],
        truck: { plateNumber: 'DEF 9012', truckType: '2T' }
      },
      createdAt: '2026-07-25T14:00:00'
    },
    {
      id: 'DR-2024-004',
      pickupDate: '2026-07-30',
      pickupTime: '07:00',
      dropoffDate: '2026-07-31',
      dropoffTime: '12:00',
      pickupLocation: '111 Shaw Boulevard, Pasig, Metro Manila',
      dropoffLocation: '222 BGC, Taguig, Metro Manila',
      truckType: '6T',
      itemType: 'furniture',
      otherItemType: '',
      cargoWeight: '4800',
      budgetMin: '9000',
      budgetMax: '13000',
      notes: '',
      status: 'OUT_FOR_DELIVERY',
      quotation: {
        amount: 11447,
        breakdown: {
          directExpenses: {
            depreciation: 1300, dieselRate: 60,
            repairsAndMaintenance: { batteries: 380, tires: 460 },
            salariesAndWages: { driver: 2600, helper1: 1300, helper2: 550 },
            tripAllowance: 450, lodgingAllowance: 0, tollParking: 220
          },
          indirectExpenses: { adminFees: 450, insurance: 540, motorVehicleReg: 260, garageRental: 340 },
          calculated: { distanceKm: 18.4, totalDays: 1, dieselTotal: 1104, directTotal: 8364, indirectTotal: 1590, operatingTotal: 9954, income: 1493.1, proposedRate: 11447.1 }
        },
        notes: '', validUntil: ''
      },
      quotationApproved: true,
      crew: {
        driver: { id: 'DRV-004', name: 'Ramon Aquino' },
        helpers: [{ id: 'HLP-004', name: 'Edwin Bautista' }, { id: 'HLP-005', name: 'Marco Reyes' }],
        truck: { plateNumber: 'GHI 9012', truckType: '6T' }
      },
      trip: {
        distance: '18.4 km',
        actualPickup: 'July 30, 7:12 AM',
        scheduledDropoff: 'July 31, 12:00 PM'
      },
      liveTracking: { lat: 14.5657, lng: 121.0644, speedKmh: 42, lastUpdate: 'Just now' },
      createdAt: '2026-07-27T08:00:00'
    },
    {
      id: 'DR-2024-005',
      pickupDate: '2026-07-28',
      pickupTime: '09:00',
      dropoffDate: '2026-07-28',
      dropoffTime: '13:00',
      pickupLocation: '333 Alabang Town Center, Muntinlupa',
      dropoffLocation: '444 SM Mall of Asia, Pasay',
      truckType: '4T',
      itemType: 'beverages',
      otherItemType: '',
      cargoWeight: '3100',
      budgetMin: '5000',
      budgetMax: '8000',
      notes: '',
      status: 'DELIVERED',
      quotation: {
        amount: 6714,
        breakdown: {
          directExpenses: {
            depreciation: 700, dieselRate: 55,
            repairsAndMaintenance: { batteries: 250, tires: 320 },
            salariesAndWages: { driver: 1650, helper1: 820, helper2: '' },
            tripAllowance: 300, lodgingAllowance: 0, tollParking: 150
          },
          indirectExpenses: { adminFees: 320, insurance: 380, motorVehicleReg: 180, garageRental: 240 },
          calculated: { distanceKm: 9.6, totalDays: 1, dieselTotal: 528, directTotal: 4718, indirectTotal: 1120, operatingTotal: 5838, income: 875.7, proposedRate: 6713.7 }
        },
        notes: '', validUntil: ''
      },
      quotationApproved: true,
      crew: {
        driver: { id: 'DRV-005', name: 'Teodoro Salazar' },
        helpers: [{ id: 'HLP-006', name: 'Vince Alonzo' }],
        truck: { plateNumber: 'JKL 3456', truckType: '4T' }
      },
      trip: {
        distance: '9.6 km',
        actualPickup: 'July 28, 9:05 AM',
        scheduledDropoff: 'July 28, 1:00 PM',
        actualDropoff: 'July 28, 12:48 PM',
        onTime: true
      },
      createdAt: '2026-07-24T11:00:00'
    },
    {
      id: 'DR-2024-006',
      pickupDate: '2026-07-24',
      pickupTime: '08:00',
      dropoffDate: '2026-07-24',
      dropoffTime: '14:00',
      pickupLocation: '666 Glorietta, Makati',
      dropoffLocation: '777 Greenbelt, Makati',
      truckType: '2T',
      itemType: 'clothing',
      otherItemType: '',
      cargoWeight: '1200',
      budgetMin: '3500',
      budgetMax: '6000',
      notes: '',
      status: 'DELIVERY_COMPLETED',
      quotation: {
        amount: 4727,
        breakdown: {
          directExpenses: {
            depreciation: 500, dieselRate: 50,
            repairsAndMaintenance: { batteries: 180, tires: 230 },
            salariesAndWages: { driver: 1250, helper1: 620, helper2: '' },
            tripAllowance: 200, lodgingAllowance: 0, tollParking: 100
          },
          indirectExpenses: { adminFees: 220, insurance: 260, motorVehicleReg: 130, garageRental: 160 },
          calculated: { distanceKm: 5.2, totalDays: 1, dieselTotal: 260, directTotal: 3340, indirectTotal: 770, operatingTotal: 4110, income: 616.5, proposedRate: 4726.5 }
        },
        notes: '', validUntil: ''
      },
      quotationApproved: true,
      crew: {
        driver: { id: 'DRV-006', name: 'Antonio Reyes' },
        helpers: [{ id: 'HLP-007', name: 'Julius Manalo' }],
        truck: { plateNumber: 'ABC 1234', truckType: '2T' }
      },
      trip: {
        distance: '5.2 km',
        actualPickup: 'July 24, 8:10 AM',
        scheduledDropoff: 'July 24, 2:00 PM',
        actualDropoff: 'July 24, 2:20 PM',
        onTime: false,
        lateMinutes: 20
      },
      createdAt: '2026-07-20T10:00:00'
    }
    ]

    return location.state?.newRequest ? [location.state.newRequest, ...sampleRequests] : sampleRequests
  })

  // Clear the navigation state once consumed so a refresh or back/forward nav doesn't re-add the request
  useEffect(() => {
    if (location.state?.newRequest) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

  const handleUpdateRequest = (id, updates) => {
    setDeliveryRequests(prev => prev.map(req =>
      req.id === id ? { ...req, ...updates } : req
    ))
    // Update selected request if the detail view is open
    if (selectedRequest && selectedRequest.id === id) {
      setSelectedRequest(prev => ({ ...prev, ...updates }))
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

  // Whether this tab gets the Supervisor-style list+monitoring split.
  const isMonitoringTab = activeTab === 'FOR_PICKUP' || activeTab === 'OUT_FOR_DELIVERY'
  const monitoredRequest = isMonitoringTab
    ? (filteredRequests.find((r) => r.id === monitoredRequestId) || filteredRequests[0] || null)
    : null
  const monitoredStatus = monitoredRequest ? (statusConfig[monitoredRequest.status] || statusConfig.PENDING_REQUEST) : null

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
    DELIVERED: deliveryRequests.some(r => r.status === 'DELIVERED' && !r.receivedConfirmed && !r.issueReported),
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
              sibling.
              On the FOR_PICKUP/OUT_FOR_DELIVERY tabs, this table's own
              desktop row/header are suppressed (desktopHidden) in favor of
              the Supervisor-style list+monitoring split rendered below —
              mobile keeps using this same list either way. */}
          <div className={isMonitoringTab ? '' : 'md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:bg-white'}>
            <div className={isMonitoringTab ? 'hidden' : 'hidden gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[0.7fr_0.6fr_1.7fr_1.6fr_1.6fr_0.3fr]'}>
              <span className="text-center">Status</span>
              <span className="text-center">Request ID</span>
              <span>Item Type</span>
              <span>Pick-up</span>
              <span>Drop-off</span>
              <span></span>
            </div>

            {filteredRequests.length === 0 ? (
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
                  onReportIssue={setReportingRequest}
                  desktopHidden={isMonitoringTab}
                />
              ))
            )}
          </div>

          {/* Desktop (md+) only — Supervisor-style list+monitoring split for
              FOR_PICKUP/OUT_FOR_DELIVERY, copied from the Supervisor's In
              Transit Deliveries tab: a list on the left (MonitoringRequestRow)
              and the Real-time Monitoring card on the right for whichever
              request is selected. Mobile keeps the plain list above. */}
          {isMonitoringTab && filteredRequests.length > 0 && (
            <div className="hidden md:grid md:grid-cols-[1.15fr_0.85fr] md:gap-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid grid-cols-[0.55fr_0.55fr_1.5fr_0.5fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span className="text-center">Status</span>
                  <span className="text-center">Request ID</span>
                  <span className="text-left">Item Type</span>
                  <span></span>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredRequests.map((request) => (
                    <MonitoringRequestRow
                      key={request.id}
                      request={request}
                      isMonitored={monitoredRequest?.id === request.id}
                      onSelect={setMonitoredRequestId}
                      onViewDetails={setSelectedRequest}
                    />
                  ))}
                </div>
              </div>

              <div>
                {monitoredRequest && <RealTimeMonitoringCard request={monitoredRequest} status={monitoredStatus} />}
              </div>
            </div>
          )}
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
                  handleUpdateRequest(confirmingRequest.id, { receivedConfirmed: true, receivedConfirmedAt: new Date().toISOString() })
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

      {/* Report-an-issue modal for the card-level quick action */}
      {reportingRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-report-issue-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-4 shadow-xl sm:p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              <h2 id="card-report-issue-title" className="text-sm font-bold text-slate-900">Report an Issue</h2>
            </div>
            <p className="mt-1.5 text-xs text-slate-600">
              Let us know what went wrong with <span className="font-semibold text-slate-800">{reportingRequest.id}</span>.
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="cardIssueReason" className="text-xs font-medium text-slate-700">Reason</label>
                <select
                  id="cardIssueReason"
                  value={cardIssueReason}
                  onChange={(e) => setCardIssueReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="">Select a reason...</option>
                  {deliveryIssueReasons.map(reason => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>
              {cardIssueReason === 'Other' && (
                <textarea
                  value={cardIssueText}
                  onChange={(e) => setCardIssueText(e.target.value)}
                  rows={3}
                  placeholder="Tell us what happened..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setReportingRequest(null); setCardIssueReason(''); setCardIssueText('') }}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const isValid = cardIssueReason && (cardIssueReason !== 'Other' || cardIssueText.trim())
                  if (!isValid) return
                  const reason = cardIssueReason === 'Other' ? cardIssueText.trim() : cardIssueReason
                  handleUpdateRequest(reportingRequest.id, {
                    issueReported: true,
                    issueDescription: reason,
                    issueReportedAt: new Date().toISOString()
                  })
                  setReportingRequest(null)
                  setCardIssueReason('')
                  setCardIssueText('')
                }}
                disabled={!cardIssueReason || (cardIssueReason === 'Other' && !cardIssueText.trim())}
                className="flex-1 rounded-lg bg-amber-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  )
}

export default CustomerDeliveries
