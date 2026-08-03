import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  Package,
  Search,
  Send,
  Truck,
  Users,
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
  Navigation,
  Map,
  Camera,
  Vibrate,
  Volume2,
  Coffee,
  Timer,
  Fuel,
  AlertCircle,
  Lock,
  MessageSquare,
} from 'lucide-react'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import SupLayout from '../layout/SupLayout.jsx'
import { customer_deliveries, delivery_drivers, delivery_helpers, delivery_trucks, delivery_quotations, delivery_cancellations, delivery_monitoring, delivery_alert_monitoring, delivery_supervisor_data, completed_delivery_reports } from '../lib/mockDeliveriesData.js'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Explicit Inter typeface for this page's content, matching SupLayout's
// own font stack instead of relying solely on inherited font-family.
const interFontStyle = { fontFamily: 'Inter, system-ui, sans-serif' }

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

// Column/badge labels show only the numbered statuses. The a/b/c sub-statuses
// (e.g. QUOTATION_SUBMITTED, OUT_FOR_PICKUP) are stored on the request and only
// reflected on the progress timeline via `buildProgressData`.
const statusLabel = {
  PENDING_REQUEST: 'Pending Request',
  QUOTATION_SUBMITTED: 'Processing',
  COUNTER_OFFER_SUBMITTED: 'Processing',
  FINAL_QUOTATION_SUBMITTED: 'Processing',
  APPROVED: 'Approved',
  ASSIGNED: 'Assigned',
  OUT_FOR_PICKUP: 'Pickup',
  ARRIVED_PICKUP: 'Pickup',
  OUT_FOR_DROPOFF: 'Dropoff',
  ARRIVED_DROPOFF: 'Dropoff',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

// Numbered status → the sub-statuses that fall under it (used by the
// toolbar status filter so "Processing" matches all quotation rounds, etc.).
const statusFilterGroups = {
  PROCESSING: ['QUOTATION_SUBMITTED', 'COUNTER_OFFER_SUBMITTED', 'FINAL_QUOTATION_SUBMITTED'],
  PICKUP: ['OUT_FOR_PICKUP', 'ARRIVED_PICKUP'],
  DROPOFF: ['OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF'],
}

function matchesStatusFilter(status, filter) {
  const group = statusFilterGroups[filter]
  return group ? group.includes(status) : status === filter
}

const statusBadge = {
  PENDING_REQUEST: 'bg-amber-100 text-amber-700',
  QUOTATION_SUBMITTED: 'bg-sky-100 text-sky-700',
  COUNTER_OFFER_SUBMITTED: 'bg-sky-100 text-sky-700',
  FINAL_QUOTATION_SUBMITTED: 'bg-sky-100 text-sky-700',
  APPROVED: 'bg-teal-100 text-teal-700',
  ASSIGNED: 'bg-indigo-100 text-indigo-700',
  OUT_FOR_PICKUP: 'bg-cyan-100 text-cyan-700',
  ARRIVED_PICKUP: 'bg-cyan-100 text-cyan-700',
  OUT_FOR_DROPOFF: 'bg-blue-100 text-blue-700',
  ARRIVED_DROPOFF: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
}

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return 'TBD'
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const [y, m, d] = parts.map(Number)
  const monthLabel = months[m - 1] || ''
  let formattedTime = timeStr || ''
  if (timeStr) {
    const [h, min] = timeStr.split(':').map(Number)
    const suffix = h >= 12 ? 'PM' : 'AM'
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    formattedTime = `${hour12}:${String(min).padStart(2, '0')} ${suffix}`
  }
  return formattedTime ? `${monthLabel} ${d}, ${y} at ${formattedTime}` : `${monthLabel} ${d}, ${y}`
}

function getTruckType(r) {
  return r.crew?.truck?.truckType || 'AUV'
}
function getTruckCapacity(r) {
  return r.crew?.truck?.capacity || '1.2 tons'
}
function getCommodityType(itemType) {
  return ['Frozen Goods', 'Pharmaceuticals'].includes(itemType) ? 'Chilled' : 'Ordinary'
}
function isLargeTruck(r) {
  const cap = parseFloat(getTruckCapacity(r))
  return cap >= 4
}
function getEstimatedWeight(itemType) {
  const w = { 'Dry Food': '850 kg', 'Frozen Goods': '1.2 tons', 'Fast Food': '450 kg', 'Beverages': '1.5 tons', 'Pharmaceuticals': '300 kg' }
  return w[itemType] || '500 kg'
}
function getTotalDistance(r) {
  if (!r.currentLocation || !r.destinationCoords) return '24.5 km'
  const R = 6371
  const dLat = (r.destinationCoords.lat - r.currentLocation.lat) * Math.PI / 180
  const dLng = (r.destinationCoords.lng - r.currentLocation.lng) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r.currentLocation.lat * Math.PI / 180) * Math.cos(r.destinationCoords.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return `${(dist * 2).toFixed(1)} km`
}
function getTotalDays(r) {
  if (!r.pickupDate || !r.dropoffDate) return 1
  const d1 = new Date(r.pickupDate), d2 = new Date(r.dropoffDate)
  const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff)
}
function getPickupCoords(r) {
  return r.currentLocation || { lat: r.destinationCoords.lat + 0.01, lng: r.destinationCoords.lng - 0.01 }
}
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-900 text-right truncate">{value}</span>
    </div>
  )
}
function parseMoney(str) {
  if (!str) return 0
  const num = parseFloat(String(str).replace(/[^0-9.-]/g, ''))
  return isNaN(num) ? 0 : num
}

function isDetailedBreakdown(quotation) {
  return Boolean(quotation?.breakdown && !Array.isArray(quotation.breakdown) && quotation.breakdown.directExpenses)
}

function MoneyInput({ value, onValueChange, accent = 'blue' }) {
  const accentClasses = {
    blue: 'border-blue-200 focus:border-blue-500 focus:ring-blue-300',
    amber: 'border-amber-200 focus:border-amber-500 focus:ring-amber-300',
  }
  const strip = (raw) => String(raw).replace(/[^0-9.]/g, '')
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onValueChange(strip(e.target.value))}
      onBlur={(e) => {
        const clean = strip(e.target.value)
        if (clean && !isNaN(parseFloat(clean))) {
          onValueChange(parseFloat(clean).toLocaleString('en-US', { minimumFractionDigits: 2 }))
        }
      }}
      className={`w-40 rounded-lg border px-3 py-2 text-sm text-right font-mono outline-none focus:ring-1 bg-white ${accentClasses[accent]}`}
      placeholder="0.00"
    />
  )
}

function QuotationExpenseForm({
  form,
  onFormChange,
  distanceKm,
  distanceLabel,
  isLargeTruckFlag,
  directTotal,
  indirectTotal,
  operatingTotal,
  income,
  proposedRate,
  onSubmit,
  submitLabel,
}) {
  const fm = (v) => parseMoney(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const directExpenses = form.directExpenses
  const indirectExpenses = form.indirectExpenses
  const setField = (fieldPath, value) => {
    onFormChange((p) => {
      const next = { ...p }
      const keys = fieldPath.split('.')
      let cursor = next
      for (let i = 0; i < keys.length - 1; i++) {
        cursor[keys[i]] = { ...cursor[keys[i]] }
        cursor = cursor[keys[i]]
      }
      cursor[keys[keys.length - 1]] = value
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-blue-800 mb-4">
          <span className="h-3 w-3 rounded-full bg-blue-600" />
          Direct Expenses
        </h4>

        <div className="flex items-center justify-between gap-3 py-2 border-b border-blue-100">
          <span className="text-sm font-medium text-slate-700">Depreciation Expenses</span>
          <MoneyInput value={directExpenses.depreciation} onValueChange={(v) => setField('directExpenses.depreciation', v)} />
        </div>

        <div className="flex items-center justify-between gap-3 py-2 border-b border-blue-100">
          <span className="text-sm font-medium text-slate-700">Diesel Rate</span>
          <MoneyInput value={directExpenses.dieselRate} onValueChange={(v) => setField('directExpenses.dieselRate', v)} />
        </div>
        <p className="text-sm text-blue-700 ml-1 mt-1 mb-2">
          a. Total diesel expenses:{' '}
          <span className="font-semibold">
            ₱{(parseMoney(directExpenses.dieselRate) * distanceKm).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-blue-500 ml-1">
            ({directExpenses.dieselRate || '0'} × {distanceLabel})
          </span>
        </p>

        <p className="text-sm font-semibold text-blue-700 ml-0.5 mb-2 mt-3">Repairs and Maintenance</p>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm font-medium text-slate-700 pl-4">a. Batteries</span>
          <MoneyInput value={directExpenses.repairsAndMaintenance.batteries} onValueChange={(v) => setField('directExpenses.repairsAndMaintenance.batteries', v)} />
        </div>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm font-medium text-slate-700 pl-4">b. Tires</span>
          <MoneyInput value={directExpenses.repairsAndMaintenance.tires} onValueChange={(v) => setField('directExpenses.repairsAndMaintenance.tires', v)} />
        </div>

        <p className="text-sm font-semibold text-blue-700 ml-0.5 mb-2 mt-3">Salaries and Wages</p>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm font-medium text-slate-700 pl-4">a. Driver</span>
          <MoneyInput value={directExpenses.salariesAndWages.driver} onValueChange={(v) => setField('directExpenses.salariesAndWages.driver', v)} />
        </div>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm font-medium text-slate-700 pl-4">b. Helper (1)</span>
          <MoneyInput value={directExpenses.salariesAndWages.helper1} onValueChange={(v) => setField('directExpenses.salariesAndWages.helper1', v)} />
        </div>
        {isLargeTruckFlag && (
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-sm font-medium text-slate-700 pl-4">c. Helper (2)</span>
            <MoneyInput value={directExpenses.salariesAndWages.helper2} onValueChange={(v) => setField('directExpenses.salariesAndWages.helper2', v)} />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 py-1.5 mt-1">
          <span className="text-sm font-medium text-slate-700">Trip Allowance</span>
          <MoneyInput value={directExpenses.tripAllowance} onValueChange={(v) => setField('directExpenses.tripAllowance', v)} />
        </div>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm font-medium text-slate-700">Lodging Allowance</span>
          <MoneyInput value={directExpenses.lodgingAllowance} onValueChange={(v) => setField('directExpenses.lodgingAllowance', v)} />
        </div>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm font-medium text-slate-700">Toll/Parking (Delivery Truck)</span>
          <MoneyInput value={directExpenses.tollParking} onValueChange={(v) => setField('directExpenses.tollParking', v)} />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-blue-200/60 px-4 py-3">
          <span className="text-sm font-bold text-blue-900">Total Direct Expenses</span>
          <span className="text-base font-bold text-blue-900">₱{fm(directTotal)}</span>
        </div>
      </div>

      <div className="rounded-xl border-2 border-amber-200 bg-amber-50/60 p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-800 mb-4">
          <span className="h-3 w-3 rounded-full bg-amber-600" />
          Indirect Expenses
        </h4>

        <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
          <span className="text-sm font-medium text-slate-700">Administration Fees</span>
          <MoneyInput accent="amber" value={indirectExpenses.adminFees} onValueChange={(v) => setField('indirectExpenses.adminFees', v)} />
        </div>
        <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
          <span className="text-sm font-medium text-slate-700">Insurance (Vehicle)</span>
          <MoneyInput accent="amber" value={indirectExpenses.insurance} onValueChange={(v) => setField('indirectExpenses.insurance', v)} />
        </div>
        <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
          <span className="text-sm font-medium text-slate-700">Motor Vehicle Registration</span>
          <MoneyInput accent="amber" value={indirectExpenses.motorVehicleReg} onValueChange={(v) => setField('indirectExpenses.motorVehicleReg', v)} />
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <span className="text-sm font-medium text-slate-700">Rental (Garage)</span>
          <MoneyInput accent="amber" value={indirectExpenses.garageRental} onValueChange={(v) => setField('indirectExpenses.garageRental', v)} />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-200/60 px-4 py-3">
          <span className="text-sm font-bold text-amber-900">Total Indirect Expenses</span>
          <span className="text-base font-bold text-amber-900">₱{fm(indirectTotal)}</span>
        </div>
      </div>

      <div className="rounded-xl border-2 border-slate-300 bg-slate-100/70 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Total Operating Expenses</span>
          <span className="text-base font-bold text-slate-900">₱{fm(operatingTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Income (15%)</span>
          <span className="text-base font-bold text-emerald-700">₱{fm(income)}</span>
        </div>
        <div className="flex items-center justify-between border-t-2 border-slate-300 pt-2">
          <span className="text-sm font-bold text-slate-900 uppercase">Proposed Rate</span>
          <span className="text-lg font-bold text-sky-700">₱{fm(proposedRate)}</span>
        </div>
      </div>

      <button
        onClick={onSubmit}
        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition"
      >
        <Send className="h-4 w-4" />
        {submitLabel}
      </button>
    </div>
  )
}

const stageStatus = {
  PENDING_REQUEST: 0,
  QUOTATION_SUBMITTED: 1,
  COUNTER_OFFER_SUBMITTED: 1,
  FINAL_QUOTATION_SUBMITTED: 1,
  APPROVED: 2,
  ASSIGNED: 3,
  OUT_FOR_PICKUP: 4,
  ARRIVED_PICKUP: 4,
  OUT_FOR_DROPOFF: 5,
  ARRIVED_DROPOFF: 5,
  DELIVERED: 6,
  COMPLETED: 7,
  CANCELLED: -1,
}

/**
 * ===== PROGRESS DETAILS — BACKEND GUIDE =====
 *
 * This card ("Progress Details") is the supervisor's view of a delivery
 * request's lifecycle. It renders STAGES (pending → processing → approved →
 * assigned → pickup → dropoff → delivered → completed) and each stage's
 * SUBSTEPS.
 *
 * FRONT-END CONTRACT:
 * 1. A substep only appears once it is DONE, i.e. once its `detail`
 *    (a short timestamp/actor string like `· Jul 25, 2026 09:00` or
 *    `by Supervisor · Jul 25, 2026 09:00`) is filled in. Steps that have
 *    not happened yet are NOT shown. `detail: null` = not done.
 * 2. A stage is "completed" when the request status is past its stage
 *    index (see `stageStatus`), and "current" while it is the active one.
 * 3. DISPLAY CONTRACT: the status column / badge shows ONLY the numbered
 *    statuses (Pending Request, Processing, Approved, Assigned, Pickup,
 *    Dropoff, Delivered, Completed, Cancelled — see `statusLabel`). The a/b/c
 *    sub-statuses are stored on `request.status` for the timeline to derive
 *    which SUBSTEPS are done, but they are NEVER shown as the column label.
 *
 * STATUS FLOW (backend must persist these `request.status` values):
 * 1. PENDING_REQUEST            — unprocessed request from the customer.
 * 2. PROCESSING (one of):
 *      QUOTATION_SUBMITTED        — first quotation sent by the supervisor.
 *      COUNTER_OFFER_SUBMITTED    — counter-offer received from the customer.
 *      FINAL_QUOTATION_SUBMITTED  — final/updated quotation sent by the
 *                                   supervisor after a counter-offer.
 *    (PROCESSING stays active until the customer approves a quotation.)
 * 3. APPROVED                    — customer approved a quotation and the final
 *                                  delivery rate is confirmed. Waiting for
 *                                  delivery crew/truck assignment.
 * 4. ASSIGNED                    — delivery crew and truck assigned. Waiting
 *                                  for the pickup to start.
 * 5. PICKUP (one of):
 *      OUT_FOR_PICKUP             — crew is on the way to the pickup location.
 *      ARRIVED_PICKUP             — crew has arrived at the pickup location.
 * 6. DROPOFF (one of):
 *      OUT_FOR_DROPOFF            — crew is on the way to the dropoff location.
 *      ARRIVED_DROPOFF            — crew has arrived at the dropoff location.
 * 7. DELIVERED                   — crew confirmed delivery. If the customer
 *                                  reports an issue, status STAYS DELIVERED
 *                                  (issueReported=true, issueReportedAt set)
 *                                  until the customer confirms it is resolved;
 *                                  the timeline shows an "Issue Reported"
 *                                  substep while it is open.
 * 8. COMPLETED                   — customer confirmed the delivery, OR the
 *                                  request auto-completes 7 days after
 *                                  DELIVERED with no other action
 *                                  (see `autoCompleteDelivered`).
 *
 * STAGES → REQUIRED BACKEND DATA
 * ------------------------------
 * 1) pending
 *      - Request Received → done as soon as the request exists (uses
 *        `request.createdAt`).
 * 2) processing
 *      - Quotation Submitted        → done when the supervisor submits the
 *                                     first quotation (`request.quotation`).
 *      - Counter Offer Submitted    → done when the customer sends a counter
 *                                     offer (`request.customerWants`).
 *      - Final Quotation Submitted  → done when the supervisor submits the
 *                                     revised quotation (`request.updatedQuotation`).
 *      - Quotation Approved         → added once the customer approves
 *                                     (`request.status` reaches APPROVED or
 *                                     later). There is intentionally NO
 *                                     "Quotation Declined" step — a declined /
 *                                     unapproved quotation ends the request in
 *                                     CANCELLED, which renders as a cancel
 *                                     point on the pending stage instead.
 * 3) approved
 *      - Quotation approved — final rate confirmed → done when status reaches
 *        APPROVED (or later).
 * 4) assigned
 *      - Delivery crew and truck assigned → done when `request.crew.driver`
 *        exists and `request.assignedAt` is set.
 * 5) pickup
 *      - Crew out to pick up the items → done when the backend records the
 *        truck leaving dispatch for pickup (status OUT_FOR_PICKUP).
 *      - Crew arrived at pickup location → done when status reaches
 *        ARRIVED_PICKUP (or later).
 * 6) dropoff
 *      - Crew out to deliver the items → done when status reaches
 *        OUT_FOR_DROPOFF (or later).
 *      - Crew arrived at dropoff location → done when status reaches
 *        ARRIVED_DROPOFF (or later).
 * 7) delivered
 *      - Crew confirmed delivery → done when status reaches DELIVERED (or
 *        later) and `request.deliveredAt` (or `dropoffDate`) is recorded.
 *      - Issue Reported → added when `request.issueReported` is true and the
 *        issue is not yet resolved. It is REMOVED once `resolvedAt` is set
 *        (customer confirmed the issue is resolved).
 * 8) completed
 *      - Delivery completed → done when status is COMPLETED (`request.completedAt`).
 *
 * BACKEND TO-DO / API CONTRACT:
 * - Persist a timestamp (+ actor) for every milestone above and expose them on
 *   the delivery request payload.
 * - Map each `request.status` to the `stageStatus` index so the correct stage
 *   is marked current/completed. Keep `stageStatus`, `statusLabel` and
 *   `statusBadge` in sync when adding statuses.
 * - Delivery request keeps status DELIVERED while an issue is unresolved;
 *   the Issues module reads `request.issueReported`, not a separate status.
 * - COMPLETED after customer confirmation, or auto after 7 days (see
 *   `autoCompleteDelivered`).
 */
function buildProgressData(request) {
  const idx = stageStatus[request.status] ?? 0
  const registeredAt = request.createdAt
  const now = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  const isCancelled = request.status === 'CANCELLED'
  const isApprovedOrLater = idx >= 2

  const pickupOutDone = idx >= 4
  const pickupArrivedDone = ['ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED'].includes(request.status)
  const dropoffOutDone = ['OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED'].includes(request.status)
  const dropoffArrivedDone = ['ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED'].includes(request.status)
  const deliveredDone = ['DELIVERED', 'COMPLETED'].includes(request.status)
  const issueOpen = Boolean(request.issueReported && !request.resolvedAt)
  const issueResolved = Boolean(request.issueReported && request.resolvedAt)

  const processingSubsteps = [
    { label: 'Quotation Submitted', detail: request.quotation ? `by Supervisor · ${registeredAt}` : null },
    { label: 'Counter Offer Submitted', detail: request.customerWants ? `by Customer · ${registeredAt}` : null },
    { label: 'Final Quotation Submitted', detail: request.updatedQuotation ? `by Supervisor · ${registeredAt}` : null },
  ]
  if (isApprovedOrLater) {
    processingSubsteps.push({ label: 'Quotation Approved', detail: `by Customer · ${registeredAt}` })
  }

  const deliveredSubsteps = [
    {
      label: 'Delivery crew confirmed delivery',
      detail: deliveredDone ? `by Crew · ${request.deliveredAt || request.dropoffDate || registeredAt}` : null,
    },
  ]
  if (issueOpen) {
    deliveredSubsteps.push({ label: 'Issue Reported', detail: request.issueReportedAt ? `by Customer · ${request.issueReportedAt}` : `by Customer · ${registeredAt}`, warning: true })
  } else if (issueResolved) {
    deliveredSubsteps.push({ label: 'Issue Resolved', detail: `by Customer · ${request.resolvedAt}` })
  }

  const stages = [
    {
      key: 'pending',
      label: 'Pending Request',
      completedLabel: 'Request Received',
      substeps: [
        { label: 'Request Received', detail: registeredAt },
        ...(isCancelled ? [{ label: 'Request Cancelled', detail: `· ${registeredAt}`, cancelPoint: true, cancelReason: 'Request cancelled', warning: true }] : []),
      ],
    },
    {
      key: 'processing',
      label: 'Processing Request',
      completedLabel: 'Quotation Submitted',
      substeps: processingSubsteps,
    },
    {
      key: 'approved',
      label: 'Quotation Approved',
      completedLabel: 'Quotation Approved',
      substeps: [
        { label: 'Quotation approved — final delivery rate confirmed', detail: isApprovedOrLater ? `by Customer · ${registeredAt}` : null },
      ],
    },
    {
      key: 'assigned',
      label: 'Assigning Delivery Crew',
      completedLabel: 'Delivery Crew Assigned',
      substeps: [
        { label: 'Delivery crew and truck assigned', detail: request.crew?.driver ? `by Supervisor · ${request.assignedAt || now}` : null },
      ],
    },
    {
      key: 'pickup',
      label: 'Pickup',
      completedLabel: 'Pickup Completed',
      substeps: [
        { label: 'Delivery crew is out to pick up the items', detail: pickupOutDone ? `· ${request.pickupDate || registeredAt}` : null },
        { label: 'Delivery crew arrived at the pickup location', detail: pickupArrivedDone ? `· ${request.pickupDate || registeredAt}` : null },
      ],
    },
    {
      key: 'dropoff',
      label: 'Dropoff',
      completedLabel: 'Dropoff Completed',
      substeps: [
        { label: 'Delivery crew is out to deliver the items', detail: dropoffOutDone ? `· ${request.dropoffDate || registeredAt}` : null },
        { label: 'Delivery crew arrived at the dropoff location', detail: dropoffArrivedDone ? `· ${request.dropoffDate || registeredAt}` : null },
      ],
    },
    {
      key: 'delivered',
      label: 'Delivered',
      completedLabel: 'Delivery Completed',
      substeps: deliveredSubsteps,
    },
    {
      key: 'completed',
      label: 'Completed',
      completedLabel: 'Delivery Completed',
      substeps: [
        { label: 'Delivery confirmed completed', detail: request.completedAt || request.resolvedAt ? `· ${request.completedAt || request.resolvedAt}` : null },
      ],
    },
  ]

  const isCompleted = request.status === 'COMPLETED'
  return stages.map((stage, i) => ({
    ...stage,
    status: i < idx || (isCompleted && i === idx) ? 'completed' : i === idx ? 'current' : 'pending',
  }))
}

const quotationsByDelivery = {}
for (const q of delivery_quotations) {
  if (!quotationsByDelivery[q.delivery_id]) quotationsByDelivery[q.delivery_id] = {}
  quotationsByDelivery[q.delivery_id][q.quotation_type] = q
}

const cancellationsByDelivery = {}
for (const c of delivery_cancellations) {
  cancellationsByDelivery[c.delivery_id] = {
    cancelledAt: c.cancelled_at,
    cancelledBy: c.cancelled_by,
    cancelledFromStatus: c.cancelled_from_status,
    cancellationReason: c.cancellation_reason,
  }
}

const CUSTOMER_REPLIES = {
  'Item damaged': 'Thank you for the update. Please schedule a replacement for the damaged cases.',
  'Missing item(s)': 'Understood. Kindly confirm the schedule for the delivery of the missing boxes.',
  'Wrong item delivered': 'Appreciated. Please advise when the correct stock can be exchanged.',
}

const reportedIssues = [
  {
    id: 'DEL-071',
    customerName: 'Maria Santos',
    companyName: 'Santos Enterprises',
    itemType: 'Beverages',
    truckType: '4T',
    cargoWeight: '3100',
    status: 'DELIVERED',
    pickupDate: '2026-07-28',
    pickupTime: '09:00',
    dropoffDate: '2026-07-28',
    dropoffTime: '13:00',
    pickupAddress: '321 Roxas Boulevard, Pasay',
    deliveryAddress: '222 BGC, Taguig',
    createdAt: '2026-07-28T09:00:00',
    issueCategory: 'Item damaged',
    issueReported: true,
    issueDescription: 'Two cases of bottles arrived with visible damage. Reported on receipt.',
    issueReportedAt: 'Jul 28, 2026 14:32',
    phone: '0917 555 0131',
    email: 'maria.santos@santosent.example',
    resolvedAt: null,
    destinationCoords: { lat: 14.555, lng: 121.051 },
    currentLocation: { lat: 14.5378, lng: 120.9963 },
    messages: [
      { id: 'm1', sender: 'customer', text: 'Two cases of beverages arrived with visible damage on the cartons. Can we request a replacement?', at: 'Jul 28, 2026 14:32' },
      { id: 'm2', sender: 'supervisor', text: 'We are sorry for the inconvenience. Our team will verify the load-out records and get back to you within the day.', at: 'Jul 28, 2026 15:10' },
    ],
    quotation: { amount: 12500 },
    crew: { driver: { name: 'Ramon Aquino' }, truck: { plateNumber: 'GHI 9012', truckType: '4T' } },
  },
  {
    id: 'DEL-072',
    customerName: 'Jose Dela Cruz',
    companyName: 'Dela Cruz Trading',
    itemType: 'Dry Food',
    truckType: '6T',
    cargoWeight: '4800',
    status: 'DELIVERED',
    pickupDate: '2026-07-30',
    pickupTime: '08:00',
    dropoffDate: '2026-07-31',
    dropoffTime: '12:00',
    pickupAddress: '789 Quezon Avenue, Quezon City',
    deliveryAddress: '888 Ortigas Center, Pasig',
    createdAt: '2026-07-30T10:15:00',
    issueCategory: 'Missing item(s)',
    issueReported: true,
    issueDescription: 'Three boxes short on the manifest. Customer asked to verify the count.',
    issueReportedAt: 'Jul 30, 2026 17:40',
    phone: '0918 555 0212',
    email: 'jose.delacruz@delacruztrading.example',
    resolvedAt: null,
    destinationCoords: { lat: 14.5855, lng: 121.0586 },
    currentLocation: { lat: 14.6333, lng: 121.0217 },
    messages: [
      { id: 'm1', sender: 'customer', text: 'The manifest shows 48 boxes but we only received 45. Three boxes are missing.', at: 'Jul 30, 2026 17:40' },
      { id: 'm2', sender: 'supervisor', text: 'We are re-checking the truck inventory and the drop-off checklist right now. Will confirm the count shortly.', at: 'Jul 30, 2026 18:05' },
      { id: 'm3', sender: 'customer', text: 'Thank you. Please also confirm the scheduled replacement delivery once verified.', at: 'Jul 31, 2026 08:20' },
    ],
    quotation: { amount: '9800' },
    crew: { driver: { name: 'Nestor Villareal' }, truck: { plateNumber: 'DEF 9012', truckType: '6T' } },
  },
  {
    id: 'DEL-073',
    customerName: 'Ana Reyes',
    companyName: 'Ana’s Grocery',
    itemType: 'Fast Food',
    truckType: '2T',
    cargoWeight: '1500',
    status: 'DELIVERED',
    pickupDate: '2026-08-01',
    pickupTime: '07:00',
    dropoffDate: '2026-08-01',
    dropoffTime: '11:00',
    pickupAddress: '555 Boni Avenue, Mandaluyong',
    deliveryAddress: '777 Greenbelt, Makati',
    createdAt: '2026-08-01T08:05:00',
    issueCategory: 'Wrong item delivered',
    issueReported: true,
    issueDescription: 'Received saturated goods instead of the ordered stock. Awaiting supervisor reply.',
    issueReportedAt: 'Aug 1, 2026 13:12',
    phone: '0919 555 0404',
    email: 'ana.reyes@anasgrocery.example',
    resolvedAt: null,
    destinationCoords: { lat: 14.5531, lng: 121.0231 },
    currentLocation: { lat: 14.5741, lng: 121.0347 },
    messages: [
      { id: 'm1', sender: 'customer', text: 'We received saturated goods instead of the stock we ordered. Kindly advise on the exchange.', at: 'Aug 1, 2026 13:12' },
    ],
    quotation: { amount: '7600' },
    crew: { driver: { name: 'Teodoro Salazar' }, truck: { plateNumber: 'JKL 3456', truckType: '2T' } },
  },
  {
    id: 'DEL-074',
    customerName: 'Ramon Bautista',
    companyName: 'Bautista Merchandising',
    itemType: 'Frozen Goods',
    truckType: '2T_REF',
    cargoWeight: '2100',
    status: 'DELIVERED',
    pickupDate: '2026-08-02',
    pickupTime: '09:30',
    dropoffDate: '2026-08-02',
    dropoffTime: '14:00',
    pickupAddress: '890 Aurora Boulevard, Cubao, Quezon City',
    deliveryAddress: '456 Trade Center, Binondo, Manila',
    createdAt: '2026-08-02T10:00:00',
    issueCategory: 'Delivery delay',
    issueReported: true,
    issueDescription: 'Shipment arrived 4 hours behind the scheduled window, affecting the store’s cold-chain timeline.',
    issueReportedAt: 'Aug 2, 2026 18:05',
    phone: '0920 555 0707',
    email: 'ramon.bautista@bautistamerch.example',
    resolvedAt: null,
    destinationCoords: { lat: 14.5995, lng: 120.9842 },
    currentLocation: { lat: 14.6018, lng: 120.9789 },
    messages: [
      { id: 'm1', sender: 'customer', text: 'Our frozen shipment arrived 4 hours late. The scheduled window was 10:00 AM - 12:00 PM but the truck arrived past 2:00 PM.', at: 'Aug 2, 2026 18:05' },
      { id: 'm2', sender: 'supervisor', text: 'We apologize for the delay. The truck was held up in heavy traffic along EDSA. We will review the route plan for this area.', at: 'Aug 2, 2026 18:40' },
    ],
    quotation: { amount: '11800' },
    crew: { driver: { name: 'Lito Ramos' }, truck: { plateNumber: 'ABC 1234', truckType: '2T_REF' } },
  },
]

const mockRequests = [...customer_deliveries.map((row) => {
  const qtns = quotationsByDelivery[row.id] || {}
  return {
    id: row.id,
    customerName: row.customer_name,
    companyName: row.company_name,
    itemType: row.item_type,
    otherItemType: row.other_item_type,
    truckType: row.truck_type,
    cargoWeight: row.cargo_weight,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    dropoffDate: row.dropoff_date,
    dropoffTime: row.dropoff_time,
    pickupAddress: row.pickup_location,
    deliveryAddress: row.dropoff_location,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    quotation: qtns.initial ? { ...qtns.initial, breakdown: qtns.initial.breakdown, amount: qtns.initial.amount, notes: qtns.initial.notes, validUntil: qtns.initial.valid_until } : null,
    updatedQuotation: qtns.updated ? { ...qtns.updated, breakdown: qtns.updated.breakdown, amount: qtns.updated.amount, notes: qtns.updated.notes, validUntil: qtns.updated.valid_until } : null,
    approvedAmount: row.approved_amount,
    cancellation: cancellationsByDelivery[row.id] || null,
    ...delivery_supervisor_data[row.id],
  }
}), ...reportedIssues]
const mockDrivers = delivery_drivers.map((d) => ({
  id: d.id,
  name: d.name,
  status: d.status,
  phone: d.phone,
  rating: d.rating,
  trips: d.trips,
  defaultHelperIds: d.default_helper_ids,
}))

const mockHelpers = delivery_helpers.map((h) => ({
  id: h.id,
  name: h.name,
  status: h.status,
}))

const mockTrucks = delivery_trucks.map((t) => ({
  plateNumber: t.plate_number,
  truckType: t.truck_type,
  status: t.status,
  capacity: t.capacity,
  commodityType: t.commodity_type,
  defaultDriverId: t.default_driver_id,
}))

const monitoringByDelivery = delivery_monitoring.reduce((map, row) => {
  map[row.delivery_id] = {
    deliveryId: row.delivery_id,
    driver: mockDrivers.find((d) => d.id === row.driver_id) || null,
    helpers: (row.helper_ids || []).map((id) => mockHelpers.find((h) => h.id === id)).filter(Boolean),
    truck: mockTrucks.find((t) => t.plateNumber === row.truck_plate_number) || null,
    currentLocation: { lat: row.current_lat, lng: row.current_lng },
    speedKmh: row.speed_kmh,
    lastUpdate: row.last_update,
    status: row.status,
  }
  return map
}, {})

const alertsByDelivery = delivery_alert_monitoring.reduce((map, row) => {
  map[row.delivery_id] = {
    deliveryId: row.delivery_id,
    cameraStatus: row.camera_status,
    eyeDetection: row.eye_detection,
    drowsinessLevel: row.drowsiness_level,
    prolongedEyeClosure: row.prolonged_eye_closure,
    repeatedEyeClosure: row.repeated_eye_closure,
    yawnCount: row.yawn_count,
    eyeDetectionFailures: row.eye_detection_failures,
    avgClosureDurationMs: row.avg_closure_duration_ms,
    seatVibration: row.seat_vibration,
    audioAlert: row.audio_alert,
    lastAlert: row.last_alert,
    lastAlertAt: row.last_alert_at,
    drivingHours: row.driving_hours,
    drivingDistanceKm: row.driving_distance_km,
    recommendedRestStop: row.recommended_rest_stop,
    restStopDistanceKm: row.rest_stop_distance_km,
    alertHistory: row.alert_history || [],
  }
  return map
}, {})

const DROWSINESS_TONES = {
  LOW: { box: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  MODERATE: { box: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  HIGH: { box: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
}

const ALERT_SEVERITY_DOTS = {
  INFO: 'bg-sky-400',
  WARNING: 'bg-amber-400',
  CRITICAL: 'bg-rose-500',
}

function getDefaultDriverForTruck(truck) {
  return truck ? mockDrivers.find(d => d.id === truck.defaultDriverId) || null : null
}

function getDefaultHelpersForDriver(driver) {
  return driver?.defaultHelperIds ? [...driver.defaultHelperIds] : []
}

function getInitials(name) {
  return name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'
}

const REPORT_TABS = [
  { id: 'details', label: 'Delivery Request Details', icon: ClipboardList },
  { id: 'quotation', label: 'Quotation', icon: FileText },
  { id: 'trip', label: 'Trip Details', icon: Route },
  { id: 'behavior', label: 'DriveWise Report', icon: Activity },
  { id: 'route', label: 'Route Deviation Report', icon: Map },
]

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
    <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ height: 320 }}>
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

function DeliveryRequestDetails({ request }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Customer Details
          </h4>
          <div className="space-y-1.5">
            <Row label="Name" value={request.customerName} />
            <Row label="Company" value={request.companyName} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Schedule
          </h4>
          <div className="space-y-1.5">
            <Row label="Pickup" value={formatDateTime(request.pickupDate, request.pickupTime)} />
            <Row label="Drop-off" value={formatDateTime(request.dropoffDate, request.dropoffTime)} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
            Vehicle Type
          </h4>
          <div className="space-y-1.5">
            <Row label="Truck Type" value={getTruckType(request)} />
            <Row label="Capacity" value={getTruckCapacity(request)} />
            <Row label="Commodity Type" value={getCommodityType(request.itemType)} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Deliverable Items
          </h4>
          <div className="space-y-1.5">
            <Row label="Item Type" value={request.itemType} />
            <Row label="Est. Total Weight" value={getEstimatedWeight(request.itemType)} />
          </div>
        </div>

        <div className="col-span-2">
          <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-600">Price Range Bid</span>
            <span className="text-sm font-bold text-blue-700">less than PHP 10,000.00</span>
          </div>
        </div>

        {request.notes && (
          <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Delivery Notes
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
        <div className="mb-3">
          <Row label="Total Distance (2-way)" value={getTotalDistance(request)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <span className="text-[10px] font-bold text-blue-600">P</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pick-up Location</span>
                <span className="block truncate text-sm font-medium text-slate-900">{request.pickupAddress}</span>
              </div>
            </div>
            <iframe
              title="Pickup - Google Map"
              src={toGoogleMapEmbed(getPickupCoords(request))}
              className="h-36 w-full rounded-lg border border-slate-200"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <span className="text-[10px] font-bold text-rose-600">D</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Drop-off Location</span>
                <span className="block truncate text-sm font-medium text-slate-900">{request.deliveryAddress}</span>
              </div>
            </div>
            <iframe
              title="Drop-off - Google Map"
              src={toGoogleMapEmbed(request.destinationCoords)}
              className="h-36 w-full rounded-lg border border-slate-200"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({ label, value, indent = false }) {
  const num = typeof value === 'number' ? value : Number(value || 0)
  return (
    <div className={`flex items-center justify-between py-1.5 ${indent ? 'pl-4' : ''}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="text-sm font-mono text-slate-900">₱{num.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
    </div>
  )
}

function QuotationBreakdown({ quotation, title }) {
  const b = quotation?.breakdown || {}
  const d = b.directExpenses || {}
  const i = b.indirectExpenses || {}
  const c = b.calculated || {}
  const fm = (v) => `₱${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700">{title}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quotation.validUntil && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Valid until {quotation.validUntil}</span>
          )}
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">{fm(quotation.amount)}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border-2 border-sky-200 bg-sky-50/40 p-4">
          <h5 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sky-800 mb-3">
            <span className="h-3 w-3 rounded-full bg-sky-500" />
            Direct Expenses
          </h5>
          <div className="space-y-1.5">
            <BreakdownRow label="Depreciation" value={d.depreciation} />
            <div>
              <BreakdownRow label="Diesel Rate" value={d.dieselRate} />
              <p className="ml-1 text-sm text-slate-600">
                a. Total diesel expenses: <span className="font-semibold">{fm(c.dieselTotal)}</span>
              </p>
            </div>
            <p className="pt-2 text-sm font-semibold text-slate-700">Repairs and Maintenance</p>
            <BreakdownRow indent label="a. Batteries" value={d.repairsAndMaintenance?.batteries} />
            <BreakdownRow indent label="b. Tires" value={d.repairsAndMaintenance?.tires} />
            <p className="pt-2 text-sm font-semibold text-slate-700">Salaries and Wages</p>
            <BreakdownRow indent label="a. Driver" value={d.salariesAndWages?.driver} />
            <BreakdownRow indent label="b. Helper (1)" value={d.salariesAndWages?.helper1} />
            {d.salariesAndWages?.helper2 && <BreakdownRow indent label="c. Helper (2)" value={d.salariesAndWages?.helper2} />}
            <BreakdownRow label="Trip Allowance" value={d.tripAllowance} />
            <BreakdownRow label="Lodging Allowance" value={d.lodgingAllowance} />
            <BreakdownRow label="Toll/Parking (Delivery Truck)" value={d.tollParking} />
            <div className="mt-3 flex items-center justify-between rounded-lg bg-sky-100/70 px-4 py-3">
              <span className="text-sm font-bold text-slate-800">Total Direct Expenses</span>
              <span className="text-base font-bold text-slate-800">{fm(c.directTotal)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-4">
          <h5 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-800 mb-3">
            <span className="h-3 w-3 rounded-full bg-amber-500" />
            Indirect Expenses
          </h5>
          <div className="space-y-1.5">
            <BreakdownRow label="Administration Fees" value={i.adminFees} />
            <BreakdownRow label="Insurance (Vehicle)" value={i.insurance} />
            <BreakdownRow label="Motor Vehicle Registration" value={i.motorVehicleReg} />
            <BreakdownRow label="Rental (Garage)" value={i.garageRental} />
            <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-100/70 px-4 py-3">
              <span className="text-sm font-bold text-slate-800">Total Indirect Expenses</span>
              <span className="text-base font-bold text-slate-800">{fm(c.indirectTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border-2 border-slate-300 bg-slate-100/70 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Total Operating Expenses</span>
          <span className="text-base font-bold text-slate-900">{fm(c.operatingTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Income (15%)</span>
          <span className="text-base font-bold text-emerald-700">{fm(c.income)}</span>
        </div>
        <div className="flex items-center justify-between border-t-2 border-slate-300 pt-2">
          <span className="text-sm font-bold uppercase text-slate-900">Proposed Rate</span>
          <span className="text-lg font-bold text-sky-700">{fm(quotation.amount)}</span>
        </div>
      </div>

      {quotation.notes && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Quotation Note</p>
          <p className="text-sm text-slate-700">{quotation.notes}</p>
        </div>
      )}
    </div>
  )
}

function QuotationTab({ delivery }) {
  const steps = []
  if (delivery.quotation) steps.push({ key: 'initial', title: 'Initial Quotation', quotation: delivery.quotation })
  if (delivery.updatedQuotation) steps.push({ key: 'updated', title: 'Updated Quotation', quotation: delivery.updatedQuotation })

  if (steps.length === 0 && !delivery.approvedAmount) {
    return <p className="py-8 text-center text-sm text-slate-500">No quotation was submitted for this delivery.</p>
  }

  return (
    <div className="space-y-6">
      {delivery.approvedAmount && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-semibold text-slate-700">Final Approved Amount</span>
          </div>
          <span className="text-lg font-bold text-emerald-700">₱{Number(delivery.approvedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
      )}

      {steps.map((step, idx) => (
        <div key={step.key} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{idx + 1}</span>
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700">{step.title}</h4>
            {steps.length === 1 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Approved</span>
            )}
            {steps.length > 1 && idx === steps.length - 1 && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">Final</span>
            )}
          </div>
          <QuotationBreakdown quotation={step.quotation} title={step.title} />
        </div>
      ))}
    </div>
  )
}

function StatusChip({ icon: Icon, label, ok, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        {value}
      </p>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
    </div>
  )
}

function TripDetailsTab({ delivery, report }) {
  const t = report.trip
  const crew = delivery.crew
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <Route className="mx-auto h-4 w-4 text-slate-400" />
          <p className="mt-1 text-xs text-slate-500">Distance</p>
          <p className="text-sm font-bold text-slate-900">{t.distance}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <Clock className="mx-auto h-4 w-4 text-slate-400" />
          <p className="mt-1 text-xs text-slate-500">Duration</p>
          <p className="text-sm font-bold text-slate-900">{t.duration}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <Navigation className="mx-auto h-4 w-4 text-slate-400" />
          <p className="mt-1 text-xs text-slate-500">Departed</p>
          <p className="text-sm font-bold text-slate-900">{formatAlertTimestamp(t.startTime)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <MapPin className="mx-auto h-4 w-4 text-slate-400" />
          <p className="mt-1 text-xs text-slate-500">Arrived</p>
          <p className="text-sm font-bold text-slate-900">{formatAlertTimestamp(t.endTime)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Route</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
            t.arrivedOnTime ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}>
            {t.arrivedOnTime ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {t.arrivedOnTime ? 'On time' : `Late by ${t.lateMinutes} min`}
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-900">{t.route}</p>
        <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <Row label="Scheduled Pickup" value={formatAlertTimestamp(t.scheduledStart)} />
          <Row label="Actual Departure" value={formatAlertTimestamp(t.startTime)} />
          <Row label="Scheduled Drop-off" value={formatAlertTimestamp(t.scheduledEnd)} />
          <Row label="Actual Arrival" value={formatAlertTimestamp(t.endTime)} />
          <Row label="Waiting at Pickup" value={t.waitingTime} />
          <Row label="Idle at Drop-off" value={t.idleTime} />
        </div>
      </div>

      {crew?.driver && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Delivery Crew</p>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
              {getInitials(crew.driver.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{crew.driver.name}</p>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Truck className="h-3.5 w-3.5" />
                {crew.truck?.plateNumber} • {crew.truck?.truckType}
              </p>
            </div>
            {crew.driver.rating && (
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-500">Rating</p>
                <p className="text-sm font-bold text-amber-600">★ {crew.driver.rating}</p>
              </div>
            )}
          </div>
          {crew.helpers?.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {crew.helpers.map((h) => (
                <span key={h.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                  <Users className="h-3 w-3 text-slate-400" />
                  {h.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {t.restStops?.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-700">
            <Coffee className="h-3.5 w-3.5" />
            Rest Stops
          </p>
          <div className="space-y-2">
            {t.restStops.map((rs, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Coffee className="h-2.5 w-2.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{rs.location}</p>
                  <p className="text-xs text-slate-500">{rs.purpose}</p>
                  <p className="text-xs text-slate-400">{rs.duration} • {rs.distanceFromStart} from start • {rs.drivingTime} driving</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Trip Stops</p>
        <div className="space-y-1.5">
          {t.stops.map((stop, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <div className="flex flex-col items-center">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  i === 0 ? 'bg-sky-100 text-sky-700' : i === t.stops.length - 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  <MapPin className="h-2.5 w-2.5" />
                </span>
                {i < t.stops.length - 1 && <div className="mt-0.5 h-3 w-px bg-slate-200" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-700">{stop.location}</p>
                <p className="text-xs text-slate-400">{stop.time} — {stop.action}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Trip Progress Timeline</p>
        <div className="space-y-2">
          {t.timeline.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                <Check className="h-3 w-3" />
              </span>
              <span className="font-medium text-slate-700">{step.label}</span>
              <span className="ml-auto text-slate-400">{step.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DriveWiseAnalysisTab({ report }) {
  const b = report.behavior
  const [historyOpen, setHistoryOpen] = useState(false)
  const tone = DROWSINESS_TONES[b.drowsinessLevel] || DROWSINESS_TONES.LOW
  const barColor = tone.badge === 'bg-red-100 text-red-700' ? 'bg-red-500' : tone.badge === 'bg-amber-100 text-amber-700' ? 'bg-amber-500' : 'bg-emerald-500'
  const lastAlert = b.alertHistory && b.alertHistory.length > 0 ? b.alertHistory[b.alertHistory.length - 1] : null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div>
            <p className="text-xs text-slate-500">Driver Risk Level</p>
            <p className="text-sm font-semibold text-slate-900">{b.totalAlerts} alerts this trip</p>
          </div>
          <RiskBadge tone={b.riskLevel.tone} label={b.riskLevel.label} />
        </div>
        <div className={`flex items-center justify-between rounded-xl p-3 ${tone.box}`}>
          <div>
            <p className="text-xs opacity-70">Drowsiness Level</p>
            <p className="text-sm font-semibold">AI camera-based detection</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone.badge}`}>{b.drowsinessLevel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusChip icon={Camera} label="Camera Feed" ok={b.cameraStatus === 'ACTIVE'} value={b.cameraStatus} />
        <StatusChip icon={EyeOff} label="Eye Detection" ok={b.eyeDetection === 'DETECTED'} value={b.eyeDetection} />
        <StatusChip icon={Vibrate} label="Seat Vibration" ok={b.alertMechanism?.seatVibration === 'ACTIVE'} value={b.alertMechanism?.seatVibration} />
        <StatusChip icon={Volume2} label="Audio Alert" ok={b.alertMechanism?.audioAlert === 'ACTIVE'} value={b.alertMechanism?.audioAlert} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Total Alerts" value={report.delivery.totalAlerts} />
        <Metric label="Avg. Eye Closure" value={b.avgClosureDuration} />
        <Metric label="Yawns" value={b.yawnCount} />
        <Metric label="Detection Failures" value={b.eyeDetectionFailures} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Alert Type Breakdown</p>
        <div className="space-y-2">
          {b.alertsByType.map((item) => {
            const Icon = ALERT_TYPE_ICONS[item.type] || AlertTriangle
            const pct = b.totalAlerts > 0 ? Math.round((item.count / b.totalAlerts) * 100) : 0
            return (
              <div key={item.type}>
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                  <span className="flex-1 text-slate-700">{item.label}</span>
                  <span className="font-semibold text-slate-900">{item.count}</span>
                  <span className="text-xs text-slate-400">({pct}%)</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Session Log</p>
        <div className="space-y-1.5">
          {b.sessions.map((session, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{formatAlertTimestamp(session.start)} — {formatAlertTimestamp(session.end)}</span>
              <span className="font-semibold text-slate-900">{session.alerts} alerts</span>
              <span className="text-slate-400">{formatAlertDuration(session.duration)}</span>
            </div>
          ))}
        </div>
      </div>

      {b.recommendedRestStop && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
            <Coffee className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Recommended Rest Stop</p>
            <p className="text-sm font-semibold text-slate-900">{b.recommendedRestStop}</p>
          </div>
        </div>
      )}

      {b.alertHistory && b.alertHistory.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex w-full items-center justify-between gap-2 p-3 text-left"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last Alert</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">{lastAlert.type}</p>
              <p className="text-xs text-slate-500">{lastAlert.time}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-400">
              History ({b.alertHistory.length})
              {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {historyOpen && (
            <div className="max-h-56 space-y-1 overflow-y-auto border-t border-slate-200 px-3 py-2">
              {b.alertHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex min-w-0 items-center gap-2 text-xs text-slate-700">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ALERT_SEVERITY_DOTS[h.severity] || ALERT_SEVERITY_DOTS.INFO}`} />
                    <span className="truncate">{h.type}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {b.analysis && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            <Activity className="h-3.5 w-3.5" />
            DriveWise Report
          </p>
          <p className="text-sm leading-relaxed text-slate-700">{b.analysis}</p>
        </div>
      )}
    </div>
  )
}

function RouteDeviationTab({ report }) {
  const r = report.routeDeviation
  const red = r.aiVerdictTone === 'red'
  return (
    <div className="space-y-4">
      <RouteDeviationMap
        plannedRoute={r.planned}
        actualRoute={r.actual}
        pickupCoords={r.planned[0]}
        dropoffCoords={r.planned[r.planned.length - 1]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Planned Distance" value={r.plannedDistance} />
        <Metric label="Actual Distance" value={r.actualDistance} />
        <Metric label="Deviation" value={r.deviationDistance} />
        <Metric label="Deviation %" value={`${r.deviationPercent}%`} />
      </div>

      <div className={`flex items-start gap-3 rounded-xl border p-4 ${red ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${red ? 'bg-red-500' : 'bg-amber-500'}`}>
          {red ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${red ? 'text-red-800' : 'text-amber-800'}`}>AI Route Analysis: {r.aiVerdict}</p>
          <p className={`mt-1 text-sm leading-relaxed ${red ? 'text-red-700' : 'text-amber-700'}`}>{r.aiSummary}</p>
        </div>
      </div>

      {r.deviationSegments?.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Deviation Segments</p>
          <div className="space-y-2">
            {r.deviationSegments.map((seg, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{seg.location}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${seg.severity === 'Significant' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {seg.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{seg.reason}</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">+{seg.extraDistance} extra</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Timer className="h-3.5 w-3.5" />
            Schedule Impact
          </p>
          <p className={`mt-1 text-sm font-bold ${r.scheduleImpact && r.scheduleImpact.toLowerCase().includes('delay') ? 'text-rose-600' : 'text-emerald-600'}`}>
            {r.scheduleImpact || '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Fuel className="h-3.5 w-3.5" />
            Fuel Impact
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">{r.fuelImpact || '—'}</p>
        </div>
      </div>

      {r.recommendations?.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Recommendations</p>
          <ul className="space-y-1.5">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span className="text-slate-700">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#059669' }} />
          <span className="text-slate-600">Planned Route</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#2563eb' }} />
          <span className="text-slate-600">Actual Route</span>
        </div>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
          <MapPin className="h-3 w-3" />
          S = Start, E = End
        </span>
      </div>
    </div>
  )
}

function CompletedDeliveryReport({ delivery }) {
  const report = completed_delivery_reports[delivery.id]
  const [reportTab, setReportTab] = useState('details')

  if (!report) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No detailed report available for this delivery.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
            delivery.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}>
            {delivery.status}
          </span>
          <h3 className="text-sm font-semibold text-slate-900">Delivery Report — {delivery.id}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Package className="h-3.5 w-3.5" />
          {delivery.companyName} • {delivery.deliveryAddress}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-2.5 md:px-5">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = reportTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setReportTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="p-4 md:p-5">
        {reportTab === 'details' && <DeliveryRequestDetails request={delivery} />}
        {reportTab === 'quotation' && <QuotationTab delivery={delivery} />}
        {reportTab === 'trip' && <TripDetailsTab delivery={delivery} report={report} />}
        {reportTab === 'behavior' && <DriveWiseAnalysisTab report={report} />}
        {reportTab === 'route' && <RouteDeviationTab report={report} />}
      </div>
    </div>
  )
}

function CancelledDeliveryDetails({ delivery }) {
  const cancellation = delivery.cancellation || {}
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700">
          <XCircle className="h-3.5 w-3.5" />
          Cancellation Details
        </p>
        <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <Row label="Reason" value={cancellation.cancellationReason || '—'} />
          <Row label="Cancelled by" value={cancellation.cancelledBy === 'customer' ? 'Customer' : 'Supervisor'} />
          <Row label="Cancelled at" value={cancellation.cancelledAt || '—'} />
          <Row label="Status before cancellation" value={statusLabel[cancellation.cancelledFromStatus] ?? (cancellation.cancelledFromStatus || '—').replaceAll('_', ' ')} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Request Details (before cancellation)</p>
        <DeliveryRequestDetails request={delivery} />
      </div>

      {(delivery.quotation || delivery.approvedAmount) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Quotation Before Cancellation</p>
          {delivery.quotation ? (
            <QuotationBreakdown quotation={delivery.quotation} title="Quotation" />
          ) : (
            <div className="space-y-1.5">
              {delivery.approvedAmount && <Row label="Approved Amount" value={`₱${Number(delivery.approvedAmount).toLocaleString()}`} />}
            </div>
          )}
        </div>
      )}

      {delivery.crew?.driver && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned Crew Before Cancellation</p>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <Row label="Driver" value={delivery.crew.driver.name} />
            <Row label="Truck" value={`${delivery.crew.truck.plateNumber} • ${delivery.crew.truck.truckType}`} />
            <Row label="Helpers" value={delivery.crew.helpers.map((h) => h.name).join(', ') || '—'} />
          </div>
        </div>
      )}
    </div>
  )
}

function IssueDetailView({ delivery, onResolve, onSendMessage }) {
  const [confirmResolve, setConfirmResolve] = useState(false)
  const [message, setMessage] = useState('')
  const [reportTab, setReportTab] = useState('details')
  const isResolved = Boolean(delivery.resolvedAt)
  const report = completed_delivery_reports[delivery.id]
  const messages = delivery.messages || []

  const handleSend = () => {
    if (!message.trim()) return
    onSendMessage(message.trim())
    setMessage('')
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
            isResolved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {isResolved ? 'Resolved' : 'Issue'}
          </span>
          <h3 className="text-sm font-semibold text-slate-900">Delivery Report — {delivery.id}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Package className="h-3.5 w-3.5" />
          {delivery.companyName} • {delivery.deliveryAddress}
        </div>
      </div>

      {isResolved ? (
        <div className="flex items-start gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 md:px-5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-800">Issue Resolved</h3>
            <p className="mt-1 text-xs text-emerald-700">
              This issue was resolved on {delivery.resolvedAt}. The delivery status has been automatically updated to Completed.
            </p>
          </div>
        </div>
      ) : (
        <div className="border-b border-amber-200 bg-amber-50/70 px-4 py-4 md:px-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Reported Issue
          </p>
          <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <Row label="Issue" value={delivery.issueCategory} />
            <Row label="Reported at" value={delivery.issueReportedAt} />
            <div className="sm:col-span-2">
              <span className="block text-sm text-slate-500">Details</span>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{delivery.issueDescription}</p>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-slate-200 p-4 md:p-5">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <MessageSquare className="h-3.5 w-3.5" />
          Conversation
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          {messages.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-400">
              No messages yet. Start the conversation with the customer.
            </p>
          )}
          {messages.map((m) => {
            const isSupervisor = m.sender === 'supervisor'
            return (
              <div key={m.id} className={`flex ${isSupervisor ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  isSupervisor
                    ? 'rounded-br-sm bg-slate-900 text-white'
                    : 'rounded-bl-sm bg-white text-slate-800 ring-1 ring-inset ring-slate-200'
                }`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <p className={`mt-1 text-[10px] ${isSupervisor ? 'text-slate-300' : 'text-slate-400'}`}>{m.at}</p>
                </div>
              </div>
            )
          })}
        </div>

        {!isResolved && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              placeholder="Type a message to the customer..."
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
            <button
              onClick={handleSend}
              disabled={!message.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        )}
      </div>

      {!isResolved && (
        <div className="border-b border-slate-200 p-4 md:p-5">
          {confirmResolve ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-sm text-slate-600">Mark this issue as resolved?</p>
              <p className="mt-0.5 text-xs text-slate-400">The delivery status will automatically be set to Completed.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => setConfirmResolve(false)}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={onResolve}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm Resolve
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmResolve(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark as Resolved
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-2.5 md:px-5">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = reportTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setReportTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="p-4 md:p-5">
        {!report ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No detailed report available for this delivery.
          </div>
        ) : reportTab === 'details' ? (
          <DeliveryRequestDetails request={delivery} />
        ) : reportTab === 'quotation' ? (
          <QuotationTab delivery={delivery} />
        ) : reportTab === 'trip' ? (
          <TripDetailsTab delivery={delivery} report={report} />
        ) : reportTab === 'behavior' ? (
          <DriveWiseAnalysisTab report={report} />
        ) : (
          <RouteDeviationTab report={report} />
        )}
      </div>
    </div>
  )
}

function toGoogleMapEmbed(coords) {
  if (!coords) return 'https://maps.google.com/maps?q=14.5995,120.9842&z=12&output=embed'
  return `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=14&output=embed`
}

function filterDeliveryList(list, q) {
  const query = q.trim().toLowerCase()
  if (!query) return list
  return list.filter(
    (r) =>
      r.id.toLowerCase().includes(query) ||
      r.customerName.toLowerCase().includes(query) ||
      r.companyName.toLowerCase().includes(query) ||
      r.pickupAddress.toLowerCase().includes(query) ||
      r.deliveryAddress.toLowerCase().includes(query),
  )
}

function sortNewestFirst(list) {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function autoCompleteDelivered(list) {
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  let changed = false
  const next = list.map((r) => {
    if (r.status !== 'DELIVERED') return r
    if (r.issueReported && !r.resolvedAt) return r
    const deliveredRef = r.deliveredAt
      ? new Date(r.deliveredAt)
      : r.dropoffDate
        ? new Date(`${r.dropoffDate}T${r.dropoffTime || '12:00:00'}`)
        : null
    if (!deliveredRef || isNaN(deliveredRef.getTime())) return r
    if (Date.now() - deliveredRef.getTime() >= SEVEN_DAYS) {
      changed = true
      return {
        ...r,
        status: 'COMPLETED',
        completedAt: new Date().toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' }),
      }
    }
    return r
  })
  return changed ? next : list
}

function PaginationBar({ page, setPage, totalPages }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
      <p className="text-sm text-slate-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="First page"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
        </button>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-1 px-1">
          {(() => {
            const pages = []
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i)
            } else {
              pages.push(1)
              if (page > 3) pages.push('...')
              for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
              if (page < totalPages - 2) pages.push('...')
              pages.push(totalPages)
            }
            return pages.map((num, idx) =>
              num === '...' ? (
                <span key={`ellipsis-${idx}`} className="flex h-8 w-8 items-center justify-center text-sm text-slate-400">...</span>
              ) : (
                <button
                  key={num}
                  onClick={() => setPage(num)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                    num === page
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {num}
                </button>
              )
            )
          })()}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Last page"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  )
}

function SupDeliveries() {
  const [requests, setRequests] = useState(() => autoCompleteDelivered(mockRequests))
  const [activeModule, setActiveModule] = useState('inbox')
  const [monitoredDeliveryId, setMonitoredDeliveryId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const defaultQuotationForm = {
    directExpenses: {
      depreciation: '',
      dieselRate: '',
      repairsAndMaintenance: { batteries: '', tires: '' },
      salariesAndWages: { driver: '', helper1: '', helper2: '' },
      tripAllowance: '',
      lodgingAllowance: '',
      tollParking: '',
    },
    indirectExpenses: {
      adminFees: '',
      insurance: '',
      motorVehicleReg: '',
      garageRental: '',
    },
  }
  const [quotationForm, setQuotationForm] = useState({ ...defaultQuotationForm })
  const [assignment, setAssignment] = useState({ driverId: '', helperIds: [], plateNumber: '', _showDrivers: false, _showHelpers: false, _showTrucks: false })
  const [hasApproved, setHasApproved] = useState(false)
  const [quotationSubmitted, setQuotationSubmitted] = useState(false)
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)
  const [showQuotationConfirmDialog, setShowQuotationConfirmDialog] = useState(false)
  const [showProceedQuotationDialog, setShowProceedQuotationDialog] = useState(false)
  const [adjustingQuotation, setAdjustingQuotation] = useState(false)
  const [bidDeclined, setBidDeclined] = useState(false)
  const [showInitialQuotation, setShowInitialQuotation] = useState(false)
  const [showDeclineCounterOfferDialog, setShowDeclineCounterOfferDialog] = useState(false)
  const [showUpdateQuotationDialog, setShowUpdateQuotationDialog] = useState(false)
  const [showDetails, setShowDetails] = useState(true)
  const [showQuotation, setShowQuotation] = useState(true)
  const [showProgressDetails, setShowProgressDetails] = useState(false)
  const [alertHistoryOpenId, setAlertHistoryOpenId] = useState(null)
  const [page, setPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(() => Math.max(4, Math.floor((window.innerHeight - 280) / 68)))
  const [completedPage, setCompletedPage] = useState(1)
  const [cancelledPage, setCancelledPage] = useState(1)
  const [issuesPage, setIssuesPage] = useState(1)
  const [transitPage, setTransitPage] = useState(1)
  const [selectedIssue, setSelectedIssue] = useState(null)

  useEffect(() => {
    const handleResize = () => setItemsPerPage(Math.max(4, Math.floor((window.innerHeight - 280) / 68)))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const inboxRows = useMemo(
    () => requests.filter((r) => ['PENDING_REQUEST', 'QUOTATION_SUBMITTED', 'COUNTER_OFFER_SUBMITTED', 'FINAL_QUOTATION_SUBMITTED', 'ASSIGNED'].includes(r.status)),
    [requests],
  )

  const pendingAssignments = useMemo(
    () => requests.filter((r) => r.status === 'APPROVED' || r.status === 'ASSIGNED'),
    [requests],
  )

  const [assignPage, setAssignPage] = useState(1)

  const filteredAssign = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = pendingAssignments
    if (statusFilter !== 'ALL') {
      result = result.filter((r) => matchesStatusFilter(r.status, statusFilter))
    }
    if (q) {
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q) ||
          r.pickupAddress.toLowerCase().includes(q) ||
          r.deliveryAddress.toLowerCase().includes(q),
      )
    }
    return sortNewestFirst(result)
  }, [pendingAssignments, search, statusFilter])

  const assignTotalPages = Math.max(1, Math.ceil(filteredAssign.length / itemsPerPage))
  const assignSafePage = Math.min(assignPage, assignTotalPages)
  const paginatedAssign = filteredAssign.slice((assignSafePage - 1) * itemsPerPage, assignSafePage * itemsPerPage)

  const filteredInbox = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = inboxRows
    if (statusFilter !== 'ALL') {
      result = result.filter((r) => matchesStatusFilter(r.status, statusFilter))
    }
    if (q) {
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q) ||
          r.pickupAddress.toLowerCase().includes(q) ||
          r.deliveryAddress.toLowerCase().includes(q),
      )
    }
    return sortNewestFirst(result)
  }, [inboxRows, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredInbox.length / itemsPerPage))
  const safePage = Math.min(page, totalPages)
  const paginatedInbox = filteredInbox.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

  const ongoingDeliveries = useMemo(
    () => requests.filter((r) => ['OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED'].includes(r.status)),
    [requests],
  )

  const filteredTransit = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = ongoingDeliveries
    if (statusFilter !== 'ALL') {
      result = result.filter((r) => matchesStatusFilter(r.status, statusFilter))
    }
    if (q) {
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q) ||
          r.pickupAddress.toLowerCase().includes(q) ||
          r.deliveryAddress.toLowerCase().includes(q),
      )
    }
    return sortNewestFirst(result)
  }, [ongoingDeliveries, search, statusFilter])

  const transitTotalPages = Math.max(1, Math.ceil(filteredTransit.length / itemsPerPage))
  const transitSafePage = Math.min(transitPage, transitTotalPages)
  const paginatedTransit = filteredTransit.slice((transitSafePage - 1) * itemsPerPage, transitSafePage * itemsPerPage)

  const monitoredDelivery = useMemo(() => {
    const preferred = filteredTransit.find((r) => r.id === monitoredDeliveryId)
    return preferred || filteredTransit[0] || ongoingDeliveries[0] || null
  }, [filteredTransit, monitoredDeliveryId, ongoingDeliveries])

  const completedDeliveries = useMemo(
    () => requests.filter((r) => r.status === 'COMPLETED'),
    [requests],
  )

  const cancelledDeliveries = useMemo(
    () => requests.filter((r) => r.status === 'CANCELLED'),
    [requests],
  )

  const selectedCompletedReport = selectedReportId && !selectedReportId.startsWith('cancel-')
    ? completedDeliveries.find((d) => d.id === selectedReportId) || null
    : null
  const selectedCancelledReport = selectedReportId && selectedReportId.startsWith('cancel-')
    ? cancelledDeliveries.find((d) => d.id === selectedReportId.slice(7)) || null
    : null

  const filteredCompleted = useMemo(
    () => sortNewestFirst(filterDeliveryList(completedDeliveries, search)),
    [completedDeliveries, search],
  )
  const completedTotalPages = Math.max(1, Math.ceil(filteredCompleted.length / itemsPerPage))
  const completedSafePage = Math.min(completedPage, completedTotalPages)
  const paginatedCompleted = filteredCompleted.slice((completedSafePage - 1) * itemsPerPage, completedSafePage * itemsPerPage)

  const filteredCancelled = useMemo(
    () => sortNewestFirst(filterDeliveryList(cancelledDeliveries, search)),
    [cancelledDeliveries, search],
  )
  const cancelledTotalPages = Math.max(1, Math.ceil(filteredCancelled.length / itemsPerPage))
  const cancelledSafePage = Math.min(cancelledPage, cancelledTotalPages)
  const paginatedCancelled = filteredCancelled.slice((cancelledSafePage - 1) * itemsPerPage, cancelledSafePage * itemsPerPage)

  const reportedIssuesList = useMemo(
    () => requests.filter((r) => r.issueReported),
    [requests],
  )

  const filteredIssues = useMemo(
    () => sortNewestFirst(filterDeliveryList(reportedIssuesList, search)),
    [reportedIssuesList, search],
  )
  const issuesTotalPages = Math.max(1, Math.ceil(filteredIssues.length / itemsPerPage))
  const issuesSafePage = Math.min(issuesPage, issuesTotalPages)
  const paginatedIssues = filteredIssues.slice((issuesSafePage - 1) * itemsPerPage, issuesSafePage * itemsPerPage)

  const selectedDriver = mockDrivers.find((d) => d.id === assignment.driverId)
  const selectedTruck = mockTrucks.find((t) => t.plateNumber === assignment.plateNumber)
  const selectedHelpers = mockHelpers.filter((h) => assignment.helperIds.includes(h.id))
  const canConfirmAssignment = Boolean(selectedDriver && selectedTruck && selectedHelpers.length > 0)
  const isInTransitStatus = ['OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED'].includes(selectedRequest?.status)

  const moduleTabs = [
    { id: 'inbox', label: 'Delivery Requests Inbox', mobileLabel: 'Inbox', count: inboxRows.length },
    { id: 'assignment', label: 'Assign Vehicle', mobileLabel: 'Assign', count: pendingAssignments.length },
    { id: 'transit', label: 'In Transit Deliveries', mobileLabel: 'In Transit', count: ongoingDeliveries.length },
    { id: 'issues', label: 'Reported Issues', mobileLabel: 'Issues', count: reportedIssuesList.length },
    { id: 'completed', label: 'Completed Deliveries', mobileLabel: 'Completed', count: completedDeliveries.length },
    { id: 'cancelled', label: 'Cancellations', mobileLabel: 'Cancellations', count: cancelledDeliveries.length },
  ]

  const goToModule = (mod) => {
    setActiveModule(mod)
    setStatusFilter('ALL')
    setPage(1)
    setAssignPage(1)
    setCompletedPage(1)
    setCancelledPage(1)
    setIssuesPage(1)
    setTransitPage(1)
  }

  const onGlobalSearchChange = (value) => {
    setSearch(value)
    setPage(1)
    setAssignPage(1)
    setCompletedPage(1)
    setCancelledPage(1)
    setIssuesPage(1)
    setTransitPage(1)
  }

  const resolveIssue = (id) => {
    const resolvedAt = new Date().toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    setRequests((prev) =>
      prev.map((issue) => (issue.id === id ? { ...issue, resolvedAt, completedAt: resolvedAt, status: 'COMPLETED' } : issue)),
    )
    setSelectedIssue((prev) => (prev && prev.id === id ? { ...prev, resolvedAt, completedAt: resolvedAt, status: 'COMPLETED' } : prev))
  }

  const sendIssueMessage = (id, text) => {
    const at = new Date().toLocaleString('en-PH', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    const newMsg = { id: `m-${Date.now()}`, sender: 'supervisor', text, at }
    setRequests((prev) =>
      prev.map((issue) => (issue.id === id ? { ...issue, messages: [...(issue.messages || []), newMsg] } : issue)),
    )
    setSelectedIssue((prev) =>
      prev && prev.id === id ? { ...prev, messages: [...(prev.messages || []), newMsg] } : prev,
    )
    const issue = requests.find((i) => i.id === id)
    const replyText =
      CUSTOMER_REPLIES[issue?.issueCategory] ||
      'We appreciate your response. Please keep us posted on the resolution.'
    setTimeout(() => {
      const reply = { id: `m-${Date.now() + 1}`, sender: 'customer', text: replyText, at }
      setRequests((prev) =>
        prev.map((i) => (i.id === id ? { ...i, messages: [...(i.messages || []), reply] } : i)),
      )
      setSelectedIssue((prev) =>
        prev && prev.id === id ? { ...prev, messages: [...(prev.messages || []), reply] } : prev,
      )
    }, 1500)
  }

  const openDetails = (request) => {
    setSelectedRequest(request)
    // If request is already past PENDING, expand the modal immediately
    setHasApproved(request.status !== 'PENDING_REQUEST')
    // Quotation step is considered done if the request already has a quotation
    setQuotationSubmitted(Boolean(request.quotation))
    setShowInitialQuotation(false)
    // Collapse the Quotation section by default for APPROVED requests with an approved quotation,
    // so the dispatch/assignment section is seen first.
    setShowQuotation(request.status !== 'APPROVED' || !request.quotation)
    setQuotationForm({
      directExpenses: request.quotation?.breakdown?.directExpenses || { ...defaultQuotationForm.directExpenses },
      indirectExpenses: request.quotation?.breakdown?.indirectExpenses || { ...defaultQuotationForm.indirectExpenses },
    })
    setAssignment({
      driverId: request.crew?.driver?.id || '',
      helperIds: request.crew?.helpers?.map((h) => h.id) || [],
      plateNumber: request.crew?.truck?.plateNumber || '',
      _showDrivers: false,
      _showHelpers: false,
      _showTrucks: false,
    })
  }

  const updateRequest = (id, patch) => {
    setRequests((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    setSelectedRequest((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  const getDirectTotal = () => {
    const d = quotationForm.directExpenses
    const distKm = selectedRequest ? parseFloat(getTotalDistance(selectedRequest)) || 0 : 0
    const dieselTotal = parseMoney(d.dieselRate) * distKm
    return dieselTotal +
      parseMoney(d.depreciation) +
      parseMoney(d.repairsAndMaintenance.batteries) +
      parseMoney(d.repairsAndMaintenance.tires) +
      parseMoney(d.salariesAndWages.driver) +
      parseMoney(d.salariesAndWages.helper1) +
      parseMoney(d.salariesAndWages.helper2) +
      parseMoney(d.tripAllowance) +
      parseMoney(d.lodgingAllowance) +
      parseMoney(d.tollParking)
  }
  const getIndirectTotal = () => {
    const i = quotationForm.indirectExpenses
    return parseMoney(i.adminFees) +
      parseMoney(i.insurance) +
      parseMoney(i.motorVehicleReg) +
      parseMoney(i.garageRental)
  }
  const getOperatingTotal = () => getDirectTotal() + getIndirectTotal()
  const getIncome = () => getOperatingTotal() * 0.15
  const getProposedRate = () => getOperatingTotal() + getIncome()

  const submitQuotation = () => {
    if (!selectedRequest) return
    setShowDetails(false)
    setShowQuotationConfirmDialog(true)
  }
  const confirmQuotation = () => {
    if (!selectedRequest) return
    const proposed = getProposedRate()
    if (proposed <= 0) return alert('Fill in at least one expense amount before submitting.')
    const distKm = selectedRequest ? parseFloat(getTotalDistance(selectedRequest)) || 0 : 0
    updateRequest(selectedRequest.id, {
      quotation: {
        amount: proposed,
        breakdown: {
          directExpenses: quotationForm.directExpenses,
          indirectExpenses: quotationForm.indirectExpenses,
          calculated: {
            distanceKm: distKm,
            totalDays: getTotalDays(selectedRequest),
            dieselTotal: parseMoney(quotationForm.directExpenses.dieselRate) * distKm,
            directTotal: getDirectTotal(),
            indirectTotal: getIndirectTotal(),
            operatingTotal: getOperatingTotal(),
            income: getIncome(),
            proposedRate: proposed,
          },
        },
      },
      status: 'QUOTATION_SUBMITTED',
    })
    setQuotationSubmitted(true)
    setShowQuotationConfirmDialog(false)
  }
  const closeQuotationConfirmDialog = () => {
    setShowQuotationConfirmDialog(false)
    setShowDetails(true)
  }

  const startQuotation = () => {
    if (!selectedRequest) return
    setHasApproved(true)
    setQuotationSubmitted(false)
    setQuotationForm({
      directExpenses: {
        depreciation: '',
        dieselRate: '',
        repairsAndMaintenance: { batteries: '', tires: '' },
        salariesAndWages: { driver: '', helper1: '', helper2: '' },
        tripAllowance: '',
        lodgingAllowance: '',
        tollParking: '',
      },
      indirectExpenses: {
        adminFees: '',
        insurance: '',
        motorVehicleReg: '',
        garageRental: '',
      },
    })
    setShowDetails(false)
  }

  const openDeclineDialog = () => {
    if (!selectedRequest) return
    setShowDeclineDialog(true)
  }
  const confirmDecline = () => {
    if (!selectedRequest) return
    updateRequest(selectedRequest.id, { status: 'CANCELLED' })
    setShowDeclineDialog(false)
    setSelectedRequest(null)
  }
  const closeDeclineDialog = () => {
    setShowDeclineDialog(false)
  }

  const handleDeclineCounterOffer = () => {
    setShowDeclineCounterOfferDialog(true)
  }
  const confirmDeclineCounterOffer = () => {
    if (!selectedRequest) return
    setBidDeclined(true)
    setShowDeclineCounterOfferDialog(false)
  }
  const closeDeclineCounterOfferDialog = () => {
    setShowDeclineCounterOfferDialog(false)
  }

  const handleUpdateQuotation = () => {
    setShowUpdateQuotationDialog(true)
  }
  const confirmUpdateQuotation = () => {
    setAdjustingQuotation(true)
    setShowUpdateQuotationDialog(false)
  }
  const closeUpdateQuotationDialog = () => {
    setShowUpdateQuotationDialog(false)
  }

  const handleSubmitUpdatedQuotation = () => {
    if (!selectedRequest) return
    const proposed = getProposedRate()
    if (proposed <= 0) return alert('Fill in at least one expense amount before submitting.')
    const distKm = selectedRequest ? parseFloat(getTotalDistance(selectedRequest)) || 0 : 0
    updateRequest(selectedRequest.id, {
      updatedQuotation: {
        amount: proposed,
        breakdown: {
          directExpenses: quotationForm.directExpenses,
          indirectExpenses: quotationForm.indirectExpenses,
          calculated: {
            distanceKm: distKm,
            totalDays: getTotalDays(selectedRequest),
            dieselTotal: parseMoney(quotationForm.directExpenses.dieselRate) * distKm,
            directTotal: getDirectTotal(),
            indirectTotal: getIndirectTotal(),
            operatingTotal: getOperatingTotal(),
            income: getIncome(),
            proposedRate: proposed,
          },
        },
      },
      status: 'FINAL_QUOTATION_SUBMITTED',
    })
    setAdjustingQuotation(false)
    setBidDeclined(false)
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
      {selectedRequest ? (
        <>
        <div className="flex flex-col gap-4 pb-6" style={interFontStyle}>
          <div className="shrink-0 border-b border-slate-200/70 bg-[#F6F7FB] px-4 pt-3 pb-2 sm:px-5">
            <button
              onClick={() => setSelectedRequest(null)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
                      {selectedRequest.id} • {selectedRequest.companyName}
                    </h1>
                    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge[selectedRequest.status]}`}>
                      {statusLabel[selectedRequest.status] ?? selectedRequest.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{selectedRequest.customerName}</p>
                </div>
              </div>
              {selectedRequest.status === 'PENDING_REQUEST' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowProceedQuotationDialog(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Submit Quotation
                  </button>
                  <button
                    onClick={openDeclineDialog}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Decline Request
                  </button>
                </div>
              )}
            </div>
          </section>

          {(() => {
            const progressData = buildProgressData(selectedRequest)
            const currentStage = progressData.find(s => s.status === 'current') || progressData[progressData.length - 1]

            return (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    currentStage.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white'
                  }`}>
                    <Clock className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedRequest.status === 'CANCELLED'
                        ? 'Request Cancelled'
                        : currentStage.status === 'completed' ? currentStage.completedLabel || currentStage.label : currentStage.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedRequest.status === 'CANCELLED'
                        ? 'Cancelled'
                        : currentStage.status === 'completed' ? 'Completed' : currentStage.status === 'current' ? 'In Progress' : 'Pending'}
                    </p>
                  </div>
                </div>

                {(() => {
                  const allDone = progressData.flatMap(s => s.substeps).filter(s => s.detail)
                  const previewSubstep = selectedRequest.status === 'CANCELLED'
                    ? allDone.find(s => s.cancelPoint) || allDone[allDone.length - 1]
                    : allDone[allDone.length - 1]
                  if (!previewSubstep) return null
                  return (
                    <div className="space-y-2 ml-11">
                      <div className="flex items-start gap-2 text-sm">
                        <span className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500">
                          <Check className="h-2 w-2 text-white" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900">
                            {previewSubstep.cancelPoint && selectedRequest.status === 'CANCELLED' ? (
                              <span className="text-rose-600 font-medium">{previewSubstep.cancelReason || 'Cancelled'}</span>
                            ) : (
                              <>
                                {previewSubstep.label}
                                {previewSubstep.detail && <span className="text-slate-500 ml-1">{previewSubstep.detail}</span>}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                <button
                  onClick={() => setShowProgressDetails(prev => !prev)}
                  className="mt-3 ml-11 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 transition"
                >
                  <ClipboardList className="h-4 w-4" />
                  Progress Details
                  {showProgressDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showProgressDetails && (
                  <div className="mt-4 ml-11 space-y-5 border-l-2 border-slate-200 pl-4">
                    {progressData.map((stage) => (
                      <div key={stage.key}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                            stage.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            stage.status === 'current' ? 'bg-blue-600 text-white' :
                            'bg-slate-100 text-slate-400'
                          }`}>
                            {stage.status === 'completed' ? <Check className="h-3 w-3" /> :
                             stage.status === 'current' ? <Clock className="h-3 w-3" /> :
                             <div className="h-2 w-2 rounded-full bg-slate-300" />}
                          </div>
                          <p className={`text-sm font-semibold ${
                            stage.status === 'completed' ? 'text-emerald-700' :
                            stage.status === 'current' ? 'text-blue-700' :
                            'text-slate-400'
                          }`}>
                            {stage.status === 'completed' ? stage.completedLabel || stage.label : stage.label}
                          </p>
                        </div>
                        <div className="ml-8 space-y-2">
                          {stage.substeps.filter(s => s.detail).map((substep, si2) => (
                            <div key={si2} className="flex items-start gap-2 text-sm">
                              <span className={`mt-1.5 flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full ${substep.warning ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                              <div className="flex-1 min-w-0">
                                <p className={`${substep.warning ? 'font-medium text-amber-700' : 'text-slate-900'}`}>
                                  {substep.label}
                                  {substep.detail && <span className="text-slate-500 ml-1">{substep.detail}</span>}
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
            )
          })()}

          <div className="grid grid-cols-1 gap-5">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  onClick={() => setShowDetails((s) => !s)}
                  className="flex w-full items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 bg-transparent cursor-pointer text-left transition hover:bg-slate-50"
                  aria-expanded={showDetails}
                >
                  <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Delivery Request Details</span>
                  </span>
                  {showDetails ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>
                {showDetails && <div className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Customer Details */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                        Customer Details
                      </h4>
                      <div className="space-y-1.5">
                        <Row label="Name" value={selectedRequest.customerName} />
                        <Row label="Company" value={selectedRequest.companyName} />
                      </div>
                    </div>

                    {/* Schedule */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Schedule
                      </h4>
                      <div className="space-y-1.5">
                        <Row label="Pickup" value={formatDateTime(selectedRequest.pickupDate, selectedRequest.pickupTime)} />
                        <Row label="Drop-off" value={formatDateTime(selectedRequest.dropoffDate, selectedRequest.dropoffTime)} />
                      </div>
                    </div>

                    {/* Vehicle Type */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                        Vehicle Type
                      </h4>
                      <div className="space-y-1.5">
                        <Row label="Truck Type" value={getTruckType(selectedRequest)} />
                        <Row label="Capacity" value={getTruckCapacity(selectedRequest)} />
                        <Row label="Commodity Type" value={getCommodityType(selectedRequest.itemType)} />
                      </div>
                    </div>

                    {/* Deliverable Items */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Deliverable Items
                      </h4>
                      <div className="space-y-1.5">
                        <Row label="Item Type" value={selectedRequest.itemType} />
                        <Row label="Est. Total Weight" value={getEstimatedWeight(selectedRequest.itemType)} />
                      </div>
                    </div>

                    {/* Price Range Bid */}
                    <div className="col-span-2">
                      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-100 px-4 py-3">
                        <span className="text-sm font-semibold text-slate-600">Price Range Bid</span>
                        <span className="text-sm font-bold text-blue-700">less than PHP 10,000.00</span>
                      </div>
                    </div>

                    {/* Delivery Notes */}
                    {selectedRequest.notes && (
                      <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Delivery Notes
                        </h4>
                        <p className="text-sm text-slate-700 leading-relaxed">{selectedRequest.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      Location
                    </h4>
                    <div className="mb-3">
                      <Row label="Total Distance (2-way)" value={getTotalDistance(selectedRequest)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="h-5 w-5 shrink-0 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                            <span className="text-[10px] font-bold text-blue-600">P</span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">Pick-up Location</span>
                            <span className="text-sm font-medium text-slate-900 block truncate">{selectedRequest.pickupAddress}</span>
                          </div>
                        </div>
                        <iframe
                          title="Pickup - Google Map"
                          src={toGoogleMapEmbed(getPickupCoords(selectedRequest))}
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
                            <span className="text-sm font-medium text-slate-900 block truncate">{selectedRequest.deliveryAddress}</span>
                          </div>
                        </div>
                        <iframe
                          title="Drop-off - Google Map"
                          src={toGoogleMapEmbed(selectedRequest.destinationCoords)}
                          className="h-36 w-full rounded-lg border border-slate-200"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    </div>
                  </div>
                </div>}
              </div>

              {/* Quotation Form — appears below details */}
              {hasApproved && (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                    <button
                      onClick={() => setShowQuotation((s) => !s)}
                      className="flex flex-1 items-center gap-2 bg-transparent border-none cursor-pointer text-left transition hover:opacity-80"
                      aria-expanded={showQuotation}
                    >
                      <Send className="h-4 w-4 text-sky-600" />
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {adjustingQuotation
                          ? 'Adjusted Quotation'
                          : selectedRequest.status === 'COUNTER_OFFER_SUBMITTED'
                          ? 'Quotation Review'
                          : selectedRequest.status === 'FINAL_QUOTATION_SUBMITTED'
                          ? 'Quotation History'
                          : 'Quotation'}
                      </h3>
                    </button>
                    <div className="flex items-center gap-2">
                    {(!selectedRequest.quotation || !quotationSubmitted) && !adjustingQuotation && (
                      <button
                        onClick={submitQuotation}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition"
                      >
                        <Send className="h-4 w-4" />
                        Submit Quotation
                      </button>
                    )}
                    <button
                      onClick={() => setShowQuotation((s) => !s)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition bg-transparent border-none cursor-pointer"
                      aria-label={showQuotation ? 'Hide Quotation' : 'Show Quotation'}
                    >
                      {showQuotation ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    </div>
                  </div>
                  {showQuotation && (
                  <div className="p-4 space-y-4">

                    {/* — Approved Amount (post-approval statuses) — */}
                    {['APPROVED', 'ASSIGNED', 'OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED'].includes(selectedRequest.status) && (selectedRequest.approvedAmount || selectedRequest.quotation) && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Approved Amount</p>
                            <p className="text-2xl font-bold text-emerald-800">
                              PHP {Number(selectedRequest.approvedAmount ?? selectedRequest.quotation?.amount).toLocaleString()}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <Check className="h-3 w-3" />
                            Approved
                          </span>
                        </div>
                      </div>
                    )}

                    {/* — Customer Info (read-only, always shown) — */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Customer Price Range Bid</p>
                        <p className="text-sm font-semibold text-slate-800">less than PHP 10,000.00</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Distance (KM)</p>
                        <p className="text-sm font-semibold text-slate-800">{getTotalDistance(selectedRequest)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Days</p>
                        <p className="text-sm font-semibold text-slate-800">{getTotalDays(selectedRequest)} day(s)</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Truck Type</p>
                        <p className="text-sm font-semibold text-slate-800">{getTruckType(selectedRequest)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Capacity</p>
                        <p className="text-sm font-semibold text-slate-800">{getTruckCapacity(selectedRequest)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Commodity Type</p>
                        <p className="text-sm font-semibold text-slate-800">{getCommodityType(selectedRequest.itemType)}</p>
                      </div>
                    </div>

                    {/* === CASE 1: Editable form (new quotation — not yet submitted) === */}
                    {(!selectedRequest.quotation || !quotationSubmitted) && !adjustingQuotation && (
                      <QuotationExpenseForm
                        form={quotationForm}
                        onFormChange={setQuotationForm}
                        distanceKm={selectedRequest ? parseFloat(getTotalDistance(selectedRequest)) || 0 : 0}
                        distanceLabel={selectedRequest ? getTotalDistance(selectedRequest) : '0'}
                        isLargeTruckFlag={selectedRequest ? isLargeTruck(selectedRequest) : false}
                        directTotal={getDirectTotal()}
                        indirectTotal={getIndirectTotal()}
                        operatingTotal={getOperatingTotal()}
                        income={getIncome()}
                        proposedRate={getProposedRate()}
                        onSubmit={submitQuotation}
                        submitLabel="Submit Quotation"
                      />
                    )}

                    {/* === CASE 2: Read-only form (submitted — quotation submitted or counter-offer received) === */}
                    {(selectedRequest.quotation && quotationSubmitted) && !adjustingQuotation && (
                      <>
                        {/* Collapsible toggle for COUNTER_OFFER_SUBMITTED and FINAL_QUOTATION_SUBMITTED */}
                        {(selectedRequest.status === 'COUNTER_OFFER_SUBMITTED' || selectedRequest.status === 'FINAL_QUOTATION_SUBMITTED') && (
                          <button
                            onClick={() => setShowInitialQuotation(!showInitialQuotation)}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition bg-transparent border-none cursor-pointer"
                          >
                            <ChevronDown className={`h-4 w-4 transition ${showInitialQuotation ? 'rotate-180' : ''}`} />
                            {showInitialQuotation ? 'Hide' : 'Show'} Initial Quotation
                          </button>
                        )}

                        {/* Read-only form content (shown by default for QUOTATION_SUBMITTED, collapsible for COUNTER_OFFER_SUBMITTED and FINAL_QUOTATION_SUBMITTED) */}
                        {(showInitialQuotation || (selectedRequest.status !== 'COUNTER_OFFER_SUBMITTED' && selectedRequest.status !== 'FINAL_QUOTATION_SUBMITTED')) && isDetailedBreakdown(selectedRequest.quotation) && (
                          <div className="space-y-4">

                            {/* — Initial Quotation header for COUNTER_OFFER_SUBMITTED / FINAL_QUOTATION_SUBMITTED / APPROVED — */}
                            {(selectedRequest.status === 'COUNTER_OFFER_SUBMITTED' || selectedRequest.status === 'FINAL_QUOTATION_SUBMITTED' || selectedRequest.status === 'APPROVED') && (
                              <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-200/60 px-4 py-2.5">
                                <FileText className="h-4 w-4 text-slate-600" />
                                <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Initial Quotation</span>
                              </div>
                            )}

                            {/* — Direct Expenses (read-only) — */}
                            <div className="rounded-xl border-2 border-slate-200 bg-slate-50/60 p-4">
                              <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700 mb-4">
                                <span className="h-3 w-3 rounded-full bg-slate-500" />
                                Direct Expenses
                              </h4>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between py-2 border-b border-slate-200">
                                  <span className="text-sm font-medium text-slate-700">Depreciation Expenses</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.depreciation}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-slate-200">
                                  <span className="text-sm font-medium text-slate-700">Diesel Rate</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.dieselRate}</span>
                                </div>
                                <p className="text-sm text-slate-600 ml-1">
                                  a. Total diesel expenses:{' '}
                                  <span className="font-semibold">
                                    ₱{Number(selectedRequest.quotation.breakdown.calculated?.dieselTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </span>
                                </p>
                                <p className="text-sm font-semibold text-slate-600 ml-0.5 mb-1 mt-3">Repairs and Maintenance</p>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">a. Batteries</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.repairsAndMaintenance.batteries}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">b. Tires</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.repairsAndMaintenance.tires}</span>
                                </div>
                                <p className="text-sm font-semibold text-slate-600 ml-0.5 mb-1 mt-3">Salaries and Wages</p>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">a. Driver</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.salariesAndWages.driver}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">b. Helper (1)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.salariesAndWages.helper1}</span>
                                </div>
                                {selectedRequest.quotation.breakdown.directExpenses.salariesAndWages.helper2 && (
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">c. Helper (2)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.salariesAndWages.helper2}</span>
                                </div>
                                )}
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700">Trip Allowance</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.tripAllowance}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700">Lodging Allowance</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.lodgingAllowance}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700">Toll/Parking (Delivery Truck)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.directExpenses.tollParking}</span>
                                </div>
                                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-200/60 px-4 py-3">
                                  <span className="text-sm font-bold text-slate-800">Total Direct Expenses</span>
                                  <span className="text-base font-bold text-slate-800">
                                    ₱{Number(selectedRequest.quotation.breakdown.calculated?.directTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* — Indirect Expenses (read-only) — */}
                            <div className="rounded-xl border-2 border-slate-200 bg-slate-50/60 p-4">
                              <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700 mb-4">
                                <span className="h-3 w-3 rounded-full bg-slate-500" />
                                Indirect Expenses
                              </h4>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between py-2 border-b border-slate-200">
                                  <span className="text-sm font-medium text-slate-700">Administration Fees</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.indirectExpenses.adminFees}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-slate-200">
                                  <span className="text-sm font-medium text-slate-700">Insurance (Vehicle)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.indirectExpenses.insurance}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-slate-200">
                                  <span className="text-sm font-medium text-slate-700">Motor Vehicle Registration</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.indirectExpenses.motorVehicleReg}</span>
                                </div>
                                <div className="flex items-center justify-between py-2">
                                  <span className="text-sm font-medium text-slate-700">Rental (Garage)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.quotation.breakdown.indirectExpenses.garageRental}</span>
                                </div>
                                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-200/60 px-4 py-3">
                                  <span className="text-sm font-bold text-slate-800">Total Indirect Expenses</span>
                                  <span className="text-base font-bold text-slate-800">
                                    ₱{Number(selectedRequest.quotation.breakdown.calculated?.indirectTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* — Summary (read-only) — */}
                            <div className="rounded-xl border-2 border-slate-300 bg-slate-100/70 p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-700">Total Operating Expenses</span>
                                <span className="text-base font-bold text-slate-900">
                                  ₱{Number(selectedRequest.quotation.breakdown.calculated?.operatingTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-700">Income (15%)</span>
                                <span className="text-base font-bold text-emerald-700">
                                  ₱{Number(selectedRequest.quotation.breakdown.calculated?.income).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between border-t-2 border-slate-300 pt-2">
                                <span className="text-sm font-bold text-slate-900 uppercase">Proposed Rate</span>
                                <span className="text-lg font-bold text-sky-700">
                                  ₱{Number(selectedRequest.quotation.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* QUOTED: Waiting message */}
                        {selectedRequest.status === 'QUOTATION_SUBMITTED' && !selectedRequest.customerWants && (
                          <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 mt-4">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                            <p className="text-sm text-sky-800">Waiting for customer to review quotation.</p>
                          </div>
                        )}

                        {/* COUNTER_OFFER_SUBMITTED: Customer's Counter Offer section */}
                        {selectedRequest.status === 'COUNTER_OFFER_SUBMITTED' && (
                          <>
                            {!bidDeclined && (
                              <div className="rounded-xl border-2 border-orange-200 bg-orange-50/60 p-4 space-y-3">
                                <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-orange-800">
                                  <span className="h-3 w-3 rounded-full bg-orange-600" />
                                  Customer's Counter Offer
                                </h4>
                                <div className="flex items-center justify-between py-2">
                                  <span className="text-sm font-medium text-slate-700">Initial Quotation</span>
                                  <span className="text-base font-bold text-slate-900">₱{Number(selectedRequest.quotation.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-t border-orange-200">
                                  <span className="text-sm font-medium text-slate-700">Customer's Counter Offer</span>
                                  <span className="text-base font-bold text-orange-700">Less than PHP {Number(selectedRequest.customerWants).toLocaleString()}</span>
                                </div>
                                <div className="flex gap-3 pt-2">
                                  <button
                                    onClick={handleUpdateQuotation}
                                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition"
                                  >
                                    <Send className="h-4 w-4" />
                                    Update Quotation
                                  </button>
                                  <button
                                    onClick={handleDeclineCounterOffer}
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-5 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition"
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Decline Counter Offer
                                  </button>
                                </div>
                              </div>
                            )}
                            {bidDeclined && (
                              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <XCircle className="h-4 w-4 text-slate-400" />
                                <p className="text-sm text-slate-600">Counter offer declined. Sticking with the initial quotation.</p>
                              </div>
                            )}
                          </>
                        )}

                        {/* FINAL_QUOTATION_SUBMITTED: Show initial quotation + customer's counter offer record + updated quotation */}
                        {selectedRequest.status === 'FINAL_QUOTATION_SUBMITTED' && (
                          <>
                            <div className="flex flex-wrap gap-3 border-b border-slate-200 pb-4 mb-4">
                              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                <span className="text-sm font-medium text-emerald-800">Updated Quotation Submitted</span>
                              </div>
                            </div>

                            {/* Customer's Counter Offer record */}
                            <div className="rounded-xl border-2 border-orange-200 bg-orange-50/60 p-4 space-y-3">
                              <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-orange-800">
                                <span className="h-3 w-3 rounded-full bg-orange-600" />
                                Customer's Counter Offer
                              </h4>
                              <div className="flex items-center justify-between py-2">
                                <span className="text-sm font-medium text-slate-700">Initial Quotation</span>
                                <span className="text-base font-bold text-slate-900">₱{Number(selectedRequest.quotation.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex items-center justify-between py-2 border-t border-orange-200">
                                <span className="text-sm font-medium text-slate-700">Customer's Counter Offer</span>
                                <span className="text-base font-bold text-orange-700">Less than PHP {Number(selectedRequest.customerWants).toLocaleString()}</span>
                              </div>
                            </div>

                            {/* Updated Quotation (read-only) */}
                            <div className="rounded-xl border-2 border-purple-200 bg-purple-50/60 p-4 mt-4">
                              <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-purple-800 mb-4">
                                <span className="h-3 w-3 rounded-full bg-purple-600" />
                                Updated Quotation
                              </h4>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between py-2 border-b border-purple-100">
                                  <span className="text-sm font-medium text-slate-700">Depreciation Expenses</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.depreciation}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-purple-100">
                                  <span className="text-sm font-medium text-slate-700">Diesel Rate</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.dieselRate}</span>
                                </div>
                                <p className="text-sm text-purple-700 ml-1">
                                  a. Total diesel expenses:{' '}
                                  <span className="font-semibold">
                                    ₱{Number(selectedRequest.updatedQuotation.breakdown.calculated?.dieselTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </span>
                                </p>
                                <p className="text-sm font-semibold text-purple-700 ml-0.5 mb-1 mt-3">Repairs and Maintenance</p>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">a. Batteries</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.repairsAndMaintenance.batteries}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">b. Tires</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.repairsAndMaintenance.tires}</span>
                                </div>
                                <p className="text-sm font-semibold text-purple-700 ml-0.5 mb-1 mt-3">Salaries and Wages</p>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">a. Driver</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.salariesAndWages.driver}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">b. Helper (1)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.salariesAndWages.helper1}</span>
                                </div>
                                {selectedRequest.updatedQuotation.breakdown.directExpenses.salariesAndWages.helper2 && (
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700 pl-4">c. Helper (2)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.salariesAndWages.helper2}</span>
                                </div>
                                )}
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700">Trip Allowance</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.tripAllowance}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700">Lodging Allowance</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.lodgingAllowance}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-medium text-slate-700">Toll/Parking (Delivery Truck)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.directExpenses.tollParking}</span>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl border-2 border-purple-200 bg-purple-50/60 p-4">
                              <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-purple-800 mb-4">
                                <span className="h-3 w-3 rounded-full bg-purple-600" />
                                Indirect Expenses
                              </h4>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between py-2 border-b border-purple-100">
                                  <span className="text-sm font-medium text-slate-700">Administration Fees</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.indirectExpenses.adminFees}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-purple-100">
                                  <span className="text-sm font-medium text-slate-700">Insurance (Vehicle)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.indirectExpenses.insurance}</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-purple-100">
                                  <span className="text-sm font-medium text-slate-700">Motor Vehicle Registration</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.indirectExpenses.motorVehicleReg}</span>
                                </div>
                                <div className="flex items-center justify-between py-2">
                                  <span className="text-sm font-medium text-slate-700">Rental (Garage)</span>
                                  <span className="text-sm font-mono text-slate-900">₱{selectedRequest.updatedQuotation.breakdown.indirectExpenses.garageRental}</span>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl border-2 border-purple-300 bg-purple-100/70 p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-700">Total Operating Expenses</span>
                                <span className="text-base font-bold text-slate-900">
                                  ₱{Number(selectedRequest.updatedQuotation.breakdown.calculated?.operatingTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-700">Income (15%)</span>
                                <span className="text-base font-bold text-emerald-700">
                                  ₱{Number(selectedRequest.updatedQuotation.breakdown.calculated?.income).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between border-t-2 border-purple-300 pt-2">
                                <span className="text-sm font-bold text-slate-900 uppercase">Updated Proposed Rate</span>
                                <span className="text-lg font-bold text-purple-700">
                                  ₱{Number(selectedRequest.updatedQuotation.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {/* === CASE 3: Adjusting quotation (pre-filled editable form) === */}
                    {adjustingQuotation && (
                      <QuotationExpenseForm
                        form={quotationForm}
                        onFormChange={setQuotationForm}
                        distanceKm={selectedRequest ? parseFloat(getTotalDistance(selectedRequest)) || 0 : 0}
                        distanceLabel={selectedRequest ? getTotalDistance(selectedRequest) : '0'}
                        isLargeTruckFlag={selectedRequest ? isLargeTruck(selectedRequest) : false}
                        directTotal={getDirectTotal()}
                        indirectTotal={getIndirectTotal()}
                        operatingTotal={getOperatingTotal()}
                        income={getIncome()}
                        proposedRate={getProposedRate()}
                        onSubmit={handleSubmitUpdatedQuotation}
                        submitLabel="Submit Updated Quotation"
                      />
                    )}

                  </div>
                  )}
                </div>
              )}

              {hasApproved && quotationSubmitted && ['APPROVED', 'ASSIGNED', 'OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED'].includes(selectedRequest.status) && (
                <div
                  className={`rounded-2xl border bg-white bg-gradient-to-b p-4 transition-colors ${
                    selectedRequest.crew?.driver && selectedRequest.crew?.truck?.plateNumber
                      ? 'border-emerald-400 from-emerald-50 to-white'
                      : 'border-indigo-200 from-indigo-50 to-white'
                  }`}
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {isInTransitStatus ? 'Assigned Vehicle and Delivery Crew' : 'Assign Vehicle and Delivery Crew'}
                    </h3>
                    {isInTransitStatus ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                        <Lock className="h-3.5 w-3.5 text-slate-400" />
                        The crew is locked once the delivery is in transit. Changes can no longer be made.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-600">Pick a vehicle — its default driver and helper are pre-filled. You can override them before confirming.</p>
                    )}
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

                  {isInTransitStatus ? (
                    <div className="mt-4 space-y-3">
                      {selectedRequest.crew?.truck && (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-center text-[10px] font-bold leading-tight text-slate-600">
                            {selectedRequest.crew.truck.truckType}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{selectedRequest.crew.truck.plateNumber}</p>
                            <p className="text-xs text-slate-500">
                              {selectedRequest.crew.truck.truckType} • {selectedRequest.crew.truck.commodityType} • {selectedRequest.crew.truck.capacity}
                            </p>
                          </div>
                        </div>
                      )}
                      {selectedRequest.crew?.driver && (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-sm font-bold text-slate-600">
                            {getInitials(selectedRequest.crew.driver.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{selectedRequest.crew.driver.name}</p>
                            <p className="text-xs text-slate-500">
                              {selectedRequest.crew.driver.id} • ★ {selectedRequest.crew.driver.rating} • {selectedRequest.crew.driver.trips} trips
                            </p>
                          </div>
                        </div>
                      )}
                      {selectedRequest.crew?.helpers && selectedRequest.crew.helpers.length > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Helpers</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedRequest.crew.helpers.map((h) => (
                              <span key={h.id} className="inline-flex items-center rounded-lg bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
                                {h.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedRequest.assignedAt && (
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5" />
                          Saved {selectedRequest.assignedAt}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available Vehicles</p>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAssignment(prev => ({ ...prev, _showTrucks: !prev._showTrucks }))}
                        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200"
                      >
                        {selectedTruck ? (
                          <div className="flex flex-1 items-center gap-3 min-w-0">
                            <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-center text-[10px] font-bold leading-tight text-indigo-700">{selectedTruck.truckType}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{selectedTruck.plateNumber}</p>
                              <p className="text-xs text-slate-500">{selectedTruck.truckType} • {selectedTruck.commodityType} • {selectedTruck.capacity}</p>
                              {selectedDriver && (
                                <p className="mt-0.5 truncate text-[10px] font-medium text-indigo-600">Default driver: {selectedDriver.name}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="flex-1 text-sm text-slate-400">Select a vehicle...</span>
                        )}
                        <svg className={`ml-auto h-5 w-5 shrink-0 text-slate-400 transition ${assignment._showTrucks ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {assignment._showTrucks && (
                        <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {mockTrucks.filter(t => t.status === 'available' || t.plateNumber === assignment.plateNumber).map(truck => {
                            const defaultDriver = getDefaultDriverForTruck(truck)
                            return (
                              <button
                                key={truck.plateNumber}
                                type="button"
                                onClick={() => {
                                  const defaultDriver = getDefaultDriverForTruck(truck)
                                  setAssignment(prev => ({
                                    ...prev,
                                    plateNumber: truck.plateNumber,
                                    driverId: defaultDriver ? defaultDriver.id : prev.driverId,
                                    helperIds: defaultDriver ? getDefaultHelpersForDriver(defaultDriver) : prev.helperIds,
                                    _showTrucks: false,
                                  }))
                                }}
                                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-indigo-50 ${
                                  assignment.plateNumber === truck.plateNumber ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''
                                }`}
                              >
                                <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-center text-[10px] font-bold leading-tight text-slate-600">{truck.truckType}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-slate-900">{truck.plateNumber}</p>
                                  <p className="text-xs text-slate-500">{truck.truckType} • {truck.commodityType} • {truck.capacity}</p>
                                  {defaultDriver && (
                                    <p className="mt-0.5 text-[10px] text-slate-400">Default driver: {defaultDriver.name}</p>
                                  )}
                                </div>
                                {assignment.plateNumber === truck.plateNumber && (
                                  <svg className="h-5 w-5 shrink-0 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Driver
                      <span className="ml-1 font-normal normal-case text-slate-400">(default for vehicle — change if needed)</span>
                    </p>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAssignment(prev => ({ ...prev, _showDrivers: !prev._showDrivers }))}
                        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200"
                      >
                        {selectedDriver ? (
                          <>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">{getInitials(selectedDriver.name)}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{selectedDriver.name}</p>
                              <p className="text-xs text-slate-500">{selectedDriver.id} • ★ {selectedDriver.rating} • {selectedDriver.trips} trips</p>
                            </div>
                          </>
                        ) : (
                          <span className="flex-1 text-sm text-slate-400">Select a driver...</span>
                        )}
                        <svg className={`ml-auto h-5 w-5 text-slate-400 transition ${assignment._showDrivers ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {assignment._showDrivers && (
                        <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {mockDrivers.filter(d => d.status === 'available' || d.id === assignment.driverId).map(driver => (
                            <button
                              key={driver.id}
                              type="button"
                              onClick={() => {
                                setAssignment(prev => ({
                                  ...prev,
                                  driverId: driver.id,
                                  helperIds: getDefaultHelpersForDriver(driver),
                                  _showDrivers: false,
                                }))
                              }}
                              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-indigo-50 ${
                                assignment.driverId === driver.id ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''
                              }`}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{getInitials(driver.name)}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">{driver.name}</p>
                                <p className="text-xs text-slate-500">{driver.trips} trips • ★ {driver.rating}</p>
                              </div>
                              {assignment.driverId === driver.id && (
                                <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Helpers
                      <span className="ml-1 font-normal normal-case text-slate-400">(default for driver — change if needed)</span>
                    </p>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAssignment(prev => ({ ...prev, _showHelpers: !prev._showHelpers }))}
                        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200"
                      >
                        {selectedHelpers.length > 0 ? (
                          <div className="flex flex-1 flex-wrap items-center gap-2">
                            {selectedHelpers.map(h => (
                              <span key={h.id} className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                                {h.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="flex-1 text-sm text-slate-400">Select helpers...</span>
                        )}
                        <svg className={`ml-auto h-5 w-5 shrink-0 text-slate-400 transition ${assignment._showHelpers ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {assignment._showHelpers && (
                        <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {mockHelpers.filter(h => h.status === 'available' || assignment.helperIds.includes(h.id)).map(helper => {
                            const isSelected = assignment.helperIds.includes(helper.id)
                            const disabled = !isSelected && assignment.helperIds.length >= 2
                            return (
                              <button
                                key={helper.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleHelper(helper.id)}
                                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                                  isSelected ? 'bg-indigo-50' : disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'
                                }`}
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{getInitials(helper.name)}</span>
                                <div className="min-w-0 flex-1">
                                  <p className={`truncate text-sm font-semibold ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>{helper.name}</p>
                                  <p className="text-xs text-slate-500">{helper.id} • Loading Team</p>
                                </div>
                                <span className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                                  isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                                }`}>
                                  {isSelected && (
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={!canConfirmAssignment}
                    title={!canConfirmAssignment ? 'Select a vehicle and at least one helper.' : undefined}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Users className="h-4 w-4" />
                    {selectedRequest.crew?.driver ? 'Update Vehicle and Crew' : 'Confirm Vehicle and Crew'}
                  </button>
                    </>
                  )}
                </div>
              )}

              {showConfirmDialog && selectedDriver && selectedTruck && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                          <Users className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">Confirm Assignment</h3>
                          <p className="text-sm text-slate-500">Please review before confirming</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">{getInitials(selectedDriver.name)}</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{selectedDriver.name}</p>
                            <p className="text-xs text-slate-500">Driver</p>
                          </div>
                        </div>
                        {selectedHelpers.length > 0 && (
                          <div className="border-t border-slate-200 pt-3 space-y-2">
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Helpers</p>
                            {selectedHelpers.map(h => (
                              <div key={h.id} className="flex items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{getInitials(h.name)}</span>
                                <p className="text-sm text-slate-900">{h.name}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="border-t border-slate-200 pt-3 flex items-center gap-3">
                          <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-center text-[10px] font-bold leading-tight text-slate-600">{selectedTruck.truckType}</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{selectedTruck.plateNumber}</p>
                            <p className="text-xs text-slate-500">{selectedTruck.truckType} • {selectedTruck.capacity}</p>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm text-slate-700">
                        Are you sure you want to set <strong>{selectedDriver.name}</strong>
                        {selectedHelpers.length > 0 && (
                          <> and <strong>{selectedHelpers.map(h => h.name).join(', ')}</strong></>
                        )} to truck <strong>{selectedTruck.plateNumber}</strong>?
                      </p>

                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowConfirmDialog(false)}
                          className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            assignCrew()
                            setShowConfirmDialog(false)
                          }}
                          className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {showDeclineDialog && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                      <XCircle className="h-5 w-5 text-rose-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Decline Request</h3>
                      <p className="text-sm text-slate-500">Location Restriction</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      This request can only be declined due to <strong className="text-slate-900">Location Restrictions</strong>. The pick-up or drop-off location is outside the serviceable area.
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      Confirming will notify the customer that their request has been declined because their location falls outside the delivery coverage zone.
                    </p>
                  </div>
                  <p className="text-sm font-medium text-slate-800">Are you sure you want to continue?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={closeDeclineDialog}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                      No
                    </button>
                    <button
                      onClick={confirmDecline}
                      className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition"
                    >
                      Yes, Decline Request
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

          {showProceedQuotationDialog && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Submit Quotation</h3>
                      <p className="text-sm text-slate-500">Confirm your intent</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Are you sure you want to proceed with giving a quotation for this request?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowProceedQuotationDialog(false)}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition bg-transparent cursor-pointer"
                    >
                      No
                    </button>
                    <button
                      onClick={() => {
                        setShowProceedQuotationDialog(false)
                        startQuotation()
                      }}
                      className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition cursor-pointer"
                    >
                      Yes, Proceed
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showQuotationConfirmDialog && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100">
                      <Send className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Submit Quotation</h3>
                      <p className="text-sm text-slate-500">Confirm your quotation</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 space-y-2">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      Once submitted, this quotation <strong className="text-slate-900">cannot be undone</strong>. The customer will be notified and will have the option to accept, negotiate, or decline.
                    </p>
                  </div>
                  <p className="text-sm font-medium text-slate-800">Are you sure you want to submit this quotation?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={closeQuotationConfirmDialog}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition bg-transparent cursor-pointer"
                    >
                      No, Cancel
                    </button>
                    <button
                      onClick={confirmQuotation}
                      className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition cursor-pointer"
                    >
                      Yes, Submit Quotation
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showUpdateQuotationDialog && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100">
                      <Send className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Update Quotation</h3>
                      <p className="text-sm text-slate-500">Confirm your update</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 space-y-2">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      Are you sure you want to update the quotation? The customer will be notified of the adjusted amount.
                    </p>
                  </div>
                  <p className="text-sm font-medium text-slate-800">Do you want to continue updating the quotation?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={closeUpdateQuotationDialog}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition bg-transparent cursor-pointer"
                    >
                      No
                    </button>
                    <button
                      onClick={confirmUpdateQuotation}
                      className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition cursor-pointer"
                    >
                      Yes, Update Quotation
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showDeclineCounterOfferDialog && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                      <XCircle className="h-5 w-5 text-rose-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Decline Counter Offer</h3>
                      <p className="text-sm text-slate-500">Confirm your decision</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      Are you sure you want to decline the customer's counter offer? The initial quotation will remain as the final offer.
                    </p>
                  </div>
                  <p className="text-sm font-medium text-slate-800">Do you want to decline the counter offer?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={closeDeclineCounterOfferDialog}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition bg-transparent cursor-pointer"
                    >
                      No
                    </button>
                    <button
                      onClick={confirmDeclineCounterOffer}
                      className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition cursor-pointer"
                    >
                      Yes, Decline
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full flex-col gap-4 overflow-hidden" style={interFontStyle}>
          {!selectedReportId && !selectedIssue && (
          <>
            {/* Global toolbar — search + status filter, styled to mirror
                CustomerDeliveries.jsx (no card wrapper); keeps the supervisor's
                slate/sky color scheme and the status-filter dropdown. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 lg:pl-4">
                    <Search className="h-4 w-4 text-slate-400 lg:h-5 lg:w-5" />
                  </div>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => onGlobalSearchChange(e.target.value)}
                    placeholder="Search by ID, customer, company, or address..."
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 lg:pl-12 lg:pr-4 lg:py-3 lg:text-sm"
                  />
                  {search && (
                    <button
                      onClick={() => onGlobalSearchChange('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition hover:text-slate-600 lg:pr-4"
                    >
                      <svg className="h-4 w-4 lg:h-5 lg:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {(activeModule === 'inbox' || activeModule === 'transit' || activeModule === 'assignment') && (
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); setAssignPage(1); setTransitPage(1) }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
                  >
                    <option value="ALL">All Statuses</option>
                    {activeModule === 'inbox' && (
                      <>
                        <option value="PENDING_REQUEST">Pending Request</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="ASSIGNED">Assigned</option>
                      </>
                    )}
                    {activeModule === 'assignment' && (
                      <>
                        <option value="APPROVED">Approved</option>
                        <option value="ASSIGNED">Assigned</option>
                      </>
                    )}
                    {activeModule === 'transit' && (
                      <>
                        <option value="PICKUP">Pickup</option>
                        <option value="DROPOFF">Dropoff</option>
                        <option value="DELIVERED">Delivered</option>
                      </>
                    )}
                  </select>
                )}
              </div>

            {/* Module tabs — compact horizontally scrollable underline strip at
                every breakpoint. Mirrors CustomerDeliveries.jsx. */}
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {moduleTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => goToModule(tab.id)}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[14px] font-semibold transition ${
                    activeModule === tab.id
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="lg:hidden">{tab.mobileLabel}</span>
                  <span className="hidden lg:inline">{tab.label}</span>
                  <span className={`ml-1.5 text-[10px] font-medium ${
                    activeModule === tab.id ? 'text-slate-400' : 'text-slate-400'
                  }`}>
                    ({tab.count})
                  </span>
                </button>
              ))}
            </div>
          </>
          )}

        {activeModule === 'inbox' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="shrink-0 hidden grid-cols-[0.85fr_0.7fr_1.1fr_1.5fr_1.5fr_0.55fr_0.3fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 [&>*]:min-w-0 lg:grid">
                <span className="text-center">Status</span>
                <span className="text-center">Request ID</span>
                <span className="text-left">Customer</span>
                <span className="text-left">Pick-up</span>
                <span className="text-left">Drop-off</span>
                <span className="text-center">Product Type</span>
                <span></span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {paginatedInbox.length === 0 && (
                  <div className="px-5 py-14 text-center text-slate-500">No requests found in the inbox.</div>
                )}

                {paginatedInbox.map((row) => (
                  <article
                    key={row.id}
                    onClick={() => openDetails(row)}
                    className="grid cursor-pointer gap-4 px-5 py-4 transition hover:bg-slate-50 [&>*]:min-w-0 lg:grid-cols-[0.85fr_0.7fr_1.1fr_1.5fr_1.5fr_0.55fr_0.3fr] lg:items-center"
                  >
                    <div className="flex justify-center">
                      <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-center text-[10px] font-semibold leading-tight xl:text-[11px] ${statusBadge[row.status]}`}>
                        {statusLabel[row.status] ?? row.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-mono font-semibold text-slate-900 text-center">{row.id}</p>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.customerName}</p>
                      <p className="text-xs text-slate-500">{row.companyName}</p>
                    </div>
                    <p className="text-sm text-slate-700 line-clamp-2">{row.pickupAddress}</p>
                    <p className="text-sm text-slate-700 line-clamp-2">{row.deliveryAddress}</p>
                    <p className="text-sm font-medium text-slate-800 text-center">{row.itemType}</p>
                    <div className="flex justify-center">
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </article>
                  ))}
              </div>

              <PaginationBar page={page} setPage={setPage} totalPages={totalPages} />
            </div>
          </section>
        )}

        {activeModule === 'assignment' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="shrink-0 hidden grid-cols-[0.85fr_0.7fr_1.1fr_1.5fr_1.5fr_0.6fr_0.3fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 [&>*]:min-w-0 lg:grid">
                <span className="text-center">Status</span>
                <span className="text-center">Request ID</span>
                <span className="text-left">Customer</span>
                <span className="text-left">Pick-up</span>
                <span className="text-left">Drop-off</span>
                <span className="text-center">Quotation Amount</span>
                <span></span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {paginatedAssign.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-5">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
                    <p className="text-sm font-medium text-slate-900">All crews assigned</p>
                    <p className="text-xs text-slate-500 mt-1">No pending crew assignments at this time.</p>
                  </div>
                )}

                {paginatedAssign.map((row) => (
                  <article
                    key={row.id}
                    onClick={() => openDetails(row)}
                    className="grid cursor-pointer gap-4 px-5 py-4 transition hover:bg-slate-50 [&>*]:min-w-0 lg:grid-cols-[0.85fr_0.7fr_1.1fr_1.5fr_1.5fr_0.6fr_0.3fr] lg:items-center"
                  >
                    <div className="flex justify-center">
                      <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-center text-[10px] font-semibold leading-tight xl:text-[11px] ${statusBadge[row.status]}`}>
                        {statusLabel[row.status] ?? row.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-mono font-semibold text-slate-900 text-center">{row.id}</p>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.customerName}</p>
                      <p className="text-xs text-slate-500">{row.companyName}</p>
                    </div>
                    <p className="text-sm text-slate-700 line-clamp-2">{row.pickupAddress}</p>
                    <p className="text-sm text-slate-700 line-clamp-2">{row.deliveryAddress}</p>
                    <p className="text-sm font-semibold text-emerald-700 text-center">
                      {row.quotation ? `₱${Number(row.quotation.amount).toLocaleString()}` : '—'}
                    </p>
                    <div className="flex justify-center">
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </article>
                ))}
              </div>

              <PaginationBar page={assignPage} setPage={setAssignPage} totalPages={assignTotalPages} />
            </div>
          </section>
        )}

        {activeModule === 'transit' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:overflow-hidden lg:grid-cols-[1.15fr_0.85fr] lg:grid-rows-[minmax(0,1fr)]">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="shrink-0 hidden grid-cols-[0.6fr_0.7fr_1.2fr_0.5fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 [&>*]:min-w-0 lg:grid">
                  <span className="text-center">Status</span>
                  <span className="text-center">Request ID</span>
                  <span className="text-left">Customer</span>
                  <span className="text-right">View Details</span>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {paginatedTransit.length === 0 && (
                    <div className="px-5 py-14 text-center text-slate-500">No in-transit deliveries found.</div>
                  )}

                  {paginatedTransit.map((delivery) => (
                    <article
                      key={delivery.id}
                      onClick={() => setMonitoredDeliveryId(delivery.id)}
                      className={`grid cursor-pointer gap-4 px-5 py-4 transition [&>*]:min-w-0 lg:grid-cols-[0.6fr_0.7fr_1.2fr_0.5fr] lg:items-center ${
                        monitoredDelivery?.id === delivery.id ? 'bg-sky-50 hover:bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex justify-center">
                        <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-center text-[10px] font-semibold leading-tight xl:text-[11px] ${statusBadge[delivery.status]}`}>
                          {statusLabel[delivery.status] ?? delivery.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm font-mono font-semibold text-slate-900 text-center">{delivery.id}</p>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{delivery.customerName}</p>
                        <p className="text-xs text-slate-500">{delivery.companyName}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openDetails(delivery)
                        }}
                        className="flex items-center justify-end gap-0.5 text-sm font-semibold text-sky-600 hover:text-sky-700"
                      >
                        View Details
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </article>
                  ))}
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
                <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
                  <div className="shrink-0 border-b border-slate-200 px-4 py-3">
                    <h3 className="text-base font-semibold text-slate-900">Real-time Monitoring</h3>
                    <p className="text-xs text-slate-500">
                      {monitoredDelivery ? `${monitoredDelivery.id} • ${statusLabel[monitoredDelivery.status] ?? monitoredDelivery.status.replaceAll('_', ' ')}` : 'No active truck'}
                    </p>
                  </div>
                  {monitoredDelivery ? (
                    <div className="flex min-h-0 flex-1 flex-col p-4">
                      <iframe
                        title="Live Delivery Map"
                        src={toGoogleMapEmbed(monitoringByDelivery[monitoredDelivery.id]?.currentLocation || monitoredDelivery.currentLocation || monitoredDelivery.destinationCoords)}
                        className="min-h-[220px] w-full flex-1 rounded-xl"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      {monitoringByDelivery[monitoredDelivery.id] && (
                        <div className="mt-4 shrink-0 space-y-3">
                          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                              {getInitials(monitoringByDelivery[monitoredDelivery.id].driver?.name || '?')}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {monitoringByDelivery[monitoredDelivery.id].driver?.name || 'Driver TBA'}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                <Truck className="mr-1 inline h-3.5 w-3.5" />
                                {monitoringByDelivery[monitoredDelivery.id].truck?.plateNumber || 'Truck TBA'}
                                {monitoringByDelivery[monitoredDelivery.id].truck && ` • ${monitoringByDelivery[monitoredDelivery.id].truck.truckType}`}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-xs text-slate-500">Speed</p>
                              <p className="text-xl font-bold text-slate-900">{monitoringByDelivery[monitoredDelivery.id].speedKmh} km/h</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-3">
                            <p className="text-xs text-slate-500">Last Update</p>
                            <p className="text-sm font-bold text-slate-900">{monitoringByDelivery[monitoredDelivery.id].lastUpdate}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  ) : (
                    <div className="p-4">
                      <p className="py-10 text-center text-sm text-slate-500">No active truck to monitor.</p>
                    </div>
                  )}
                </div>

                <div className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <Activity className="h-4 w-4 text-emerald-600" />
                        DriveWise Alerts
                      </h3>
                      <p className="text-xs text-slate-500">AI driver monitoring • drowsiness & rest safety</p>
                    </div>
                    {alertsByDelivery[monitoredDelivery?.id] ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        LIVE
                      </span>
                    ) : null}
                  </div>

                  {monitoredDelivery && alertsByDelivery[monitoredDelivery.id] ? (
                    (() => {
                      const alert = alertsByDelivery[monitoredDelivery.id]
                      const tone = DROWSINESS_TONES[alert.drowsinessLevel] || DROWSINESS_TONES.LOW
                      const cameraOk = alert.cameraStatus === 'ACTIVE'
                      const eyesOk = alert.eyeDetection === 'DETECTED'
                      return (
                        <div className="space-y-3 p-4">
                          <div className={`rounded-xl p-3 ${tone.box}`}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Drowsiness Level
                              </p>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.badge}`}>{alert.drowsinessLevel}</span>
                            </div>
                            <p className="mt-1 text-xs opacity-80">
                              Driving {alert.drivingHours} hrs • {alert.drivingDistanceKm} km • Avg. eye closure {alert.avgClosureDurationMs} ms
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Camera className="h-3.5 w-3.5" />
                                Camera Feed
                              </p>
                              <p className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${cameraOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <span className={`h-2 w-2 rounded-full ${cameraOk ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {alert.cameraStatus}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                <EyeOff className="h-3.5 w-3.5" />
                                Eye Detection
                              </p>
                              <p className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${eyesOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <span className={`h-2 w-2 rounded-full ${eyesOk ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {alert.eyeDetection}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Vibrate className="h-3.5 w-3.5" />
                                Seat Vibration
                              </p>
                              <p className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${alert.seatVibration === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                <span className={`h-2 w-2 rounded-full ${alert.seatVibration === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                {alert.seatVibration}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Volume2 className="h-3.5 w-3.5" />
                                Audio Alert
                              </p>
                              <p className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${alert.audioAlert === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                <span className={`h-2 w-2 rounded-full ${alert.audioAlert === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                {alert.audioAlert}
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Alert Triggers</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-xl bg-slate-50 p-3">
                                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Repeat className="h-3.5 w-3.5" />
                                  Prolonged Eye Closure
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-slate-900">{alert.prolongedEyeClosure}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-3">
                                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Repeat className="h-3.5 w-3.5" />
                                  Repeated Eye Closure
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-slate-900">{alert.repeatedEyeClosure}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-3">
                                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Activity className="h-3.5 w-3.5" />
                                  Yawning
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-slate-900">{alert.yawnCount}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 p-3">
                                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <EyeOff className="h-3.5 w-3.5" />
                                  Eye Detection Failures
                                </p>
                                <p className="mt-0.5 text-lg font-bold text-slate-900">{alert.eyeDetectionFailures}</p>
                              </div>
                            </div>
                          </div>

                          <div className="overflow-hidden rounded-xl bg-slate-50">
                            <button
                              type="button"
                              onClick={() => setAlertHistoryOpenId(alertHistoryOpenId === monitoredDelivery.id ? null : monitoredDelivery.id)}
                              className="flex w-full items-center justify-between gap-2 p-3 text-left"
                            >
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last Alert</p>
                                <p className="mt-0.5 text-sm font-bold text-slate-900">{alert.lastAlert}</p>
                                <p className="text-xs text-slate-500">{alert.lastAlertAt}</p>
                              </div>
                              <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-400">
                                History ({alert.alertHistory.length})
                                {alertHistoryOpenId === monitoredDelivery.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </span>
                            </button>
                            {alertHistoryOpenId === monitoredDelivery.id && (
                              <div className="max-h-56 space-y-1 overflow-y-auto border-t border-slate-200 px-3 py-2">
                                {alert.alertHistory.length > 0 ? (
                                  alert.alertHistory.map((h, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 py-1">
                                      <span className="flex min-w-0 items-center gap-2 text-xs text-slate-700">
                                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ALERT_SEVERITY_DOTS[h.severity] || ALERT_SEVERITY_DOTS.INFO}`} />
                                        <span className="truncate">{h.type}</span>
                                      </span>
                                      <span className="shrink-0 text-xs text-slate-500">{h.time}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="py-2 text-center text-xs text-slate-500">No alert history recorded.</p>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
                              <Coffee className="h-3.5 w-3.5" />
                              Recommended Rest Stop
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-900">{alert.recommendedRestStop}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700">
                              <Navigation className="h-3.5 w-3.5" />
                              {alert.restStopDistanceKm} km ahead • Driving {alert.drivingHours} hrs / {alert.drivingDistanceKm} km
                            </p>
                          </div>
                        </div>
                      )
                    })()
                  ) : (
                    <div className="p-4">
                      <p className="py-8 text-center text-sm text-slate-500">No DriveWise telemetry for this delivery yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 rounded-2xl border border-slate-200 bg-white">
              <PaginationBar page={transitSafePage} setPage={setTransitPage} totalPages={transitTotalPages} />
            </div>
          </section>
        )}

        {activeModule === 'issues' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {selectedIssue ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-slate-200/70 bg-[#F6F7FB] px-4 pt-3 pb-2 sm:px-5">
                  <button
                    onClick={() => setSelectedIssue(null)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                  <IssueDetailView
                    delivery={selectedIssue}
                    onResolve={() => resolveIssue(selectedIssue.id)}
                    onSendMessage={(text) => sendIssueMessage(selectedIssue.id, text)}
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="shrink-0 hidden grid-cols-[0.6fr_0.7fr_1.1fr_1.3fr_1.3fr_1.5fr_0.3fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 [&>*]:min-w-0 lg:grid">
                  <span className="text-center">Status</span>
                  <span className="text-center">Request ID</span>
                  <span className="text-left">Customer</span>
                  <span className="text-left">Pick-up</span>
                  <span className="text-left">Drop-off</span>
                  <span className="text-left">Reported Issue</span>
                  <span></span>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {paginatedIssues.length === 0 && (
                    <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
                      <AlertTriangle className="h-10 w-10 text-amber-300 mb-3" />
                      <p className="text-sm font-medium text-slate-900">No reported issues found</p>
                      <p className="mt-1 text-xs text-slate-500">Adjust your search or check back later.</p>
                    </div>
                  )}

                  {paginatedIssues.map((delivery) => (
                    <article
                      key={delivery.id}
                      onClick={() => setSelectedIssue(delivery)}
                      className="grid cursor-pointer gap-4 px-5 py-4 transition [&>*]:min-w-0 lg:grid-cols-[0.6fr_0.7fr_1.1fr_1.3fr_1.3fr_1.5fr_0.3fr] lg:items-center hover:bg-slate-50"
                    >
                      <div className="flex justify-center">
                        {delivery.status === 'COMPLETED' ? (
                          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-center text-[10px] font-semibold leading-tight text-green-700 xl:text-[11px]">
                            <CheckCircle2 className="h-3 w-3" />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex max-w-full rounded-full bg-emerald-100 px-2.5 py-1 text-center text-[10px] font-semibold leading-tight text-emerald-700 xl:text-[11px]">
                            Delivered
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-mono font-semibold text-slate-900 text-center">{delivery.id}</p>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{delivery.customerName}</p>
                        <p className="text-xs text-slate-500">{delivery.companyName}</p>
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-2">{delivery.pickupAddress}</p>
                      <p className="text-sm text-slate-700 line-clamp-2">{delivery.deliveryAddress}</p>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-amber-700">{delivery.issueCategory}</p>
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{delivery.issueDescription}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">Reported {delivery.issueReportedAt}</p>
                      </div>
                      <div className="flex justify-center">
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </article>
                  ))}
                </div>

                <PaginationBar page={issuesSafePage} setPage={setIssuesPage} totalPages={issuesTotalPages} />
              </div>
            )}
          </section>
        )}

        {activeModule === 'completed' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {selectedCompletedReport ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-slate-200/70 bg-[#F6F7FB] px-4 pt-3 pb-2 sm:px-5">
                  <button
                    onClick={() => setSelectedReportId(null)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                  <CompletedDeliveryReport delivery={selectedCompletedReport} />
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="shrink-0 hidden grid-cols-[0.85fr_0.7fr_1.1fr_1.4fr_1.4fr_0.8fr_0.3fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 [&>*]:min-w-0 lg:grid">
                    <span className="text-center">Status</span>
                    <span className="text-center">Request ID</span>
                    <span className="text-left">Customer</span>
                    <span className="text-left">Pick-up</span>
                    <span className="text-left">Drop-off</span>
                    <span className="text-left">Crew</span>
                    <span></span>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {paginatedCompleted.length === 0 && (
                      <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
                        <p className="text-sm font-medium text-slate-900">No completed deliveries found</p>
                        <p className="mt-1 text-xs text-slate-500">Adjust your search or check back later.</p>
                      </div>
                    )}

                    {paginatedCompleted.map((delivery) => (
                      <article
                        key={delivery.id}
                        onClick={() => setSelectedReportId(delivery.id)}
                        className="grid cursor-pointer gap-4 px-5 py-4 transition [&>*]:min-w-0 lg:grid-cols-[0.85fr_0.7fr_1.1fr_1.4fr_1.4fr_0.8fr_0.3fr] lg:items-center hover:bg-slate-50"
                      >
                        <div className="flex justify-center">
                          <span className="inline-flex max-w-full rounded-full bg-emerald-100 px-2.5 py-1 text-center text-[10px] font-semibold leading-tight text-emerald-700 xl:text-[11px]">
                            {delivery.status}
                          </span>
                        </div>
                        <p className="text-sm font-mono font-semibold text-slate-900 text-center">{delivery.id}</p>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{delivery.customerName}</p>
                          <p className="text-xs text-slate-500">{delivery.companyName}</p>
                        </div>
                        <p className="text-sm text-slate-700 line-clamp-2">{delivery.pickupAddress}</p>
                        <p className="text-sm text-slate-700 line-clamp-2">{delivery.deliveryAddress}</p>
                        <div className="min-w-0 text-xs text-slate-500">
                          {delivery.crew?.truck && (
                            <p className="flex items-center gap-1 truncate">
                              <Truck className="h-3 w-3 shrink-0" />
                              {delivery.crew.truck.plateNumber}
                            </p>
                          )}
                          {delivery.crew?.driver && (
                            <p className="flex items-center gap-1 truncate">
                              <Users className="h-3 w-3 shrink-0" />
                              {delivery.crew.driver.name}
                            </p>
                          )}
                        </div>
                        <div className="flex justify-center">
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </article>
                    ))}
                  </div>

                  <PaginationBar page={completedSafePage} setPage={setCompletedPage} totalPages={completedTotalPages} />
                </div>
              </>
            )}
          </section>
        )}

        {activeModule === 'cancelled' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {selectedCancelledReport ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-slate-200/70 bg-[#F6F7FB] px-4 pt-3 pb-2 sm:px-5">
                  <button
                    onClick={() => setSelectedReportId(null)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                  <CancelledDeliveryDetails delivery={selectedCancelledReport} />
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="shrink-0 hidden grid-cols-[0.85fr_0.7fr_1.1fr_1.4fr_1.4fr_0.9fr_0.3fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 [&>*]:min-w-0 lg:grid">
                    <span className="text-center">Status</span>
                    <span className="text-center">Request ID</span>
                    <span className="text-left">Customer</span>
                    <span className="text-left">Pick-up</span>
                    <span className="text-left">Drop-off</span>
                    <span className="text-center">Cancelled From</span>
                    <span></span>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {paginatedCancelled.length === 0 && (
                      <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
                        <XCircle className="h-10 w-10 text-rose-300 mb-3" />
                        <p className="text-sm font-medium text-slate-900">No cancellations found</p>
                        <p className="mt-1 text-xs text-slate-500">Adjust your search or check back later.</p>
                      </div>
                    )}

                    {paginatedCancelled.map((delivery) => (
                      <article
                        key={delivery.id}
                        onClick={() => setSelectedReportId(`cancel-${delivery.id}`)}
                        className="grid cursor-pointer gap-4 px-5 py-4 transition [&>*]:min-w-0 lg:grid-cols-[0.85fr_0.7fr_1.1fr_1.4fr_1.4fr_0.9fr_0.3fr] lg:items-center hover:bg-slate-50"
                      >
                        <div className="flex justify-center">
                          <span className="inline-flex max-w-full rounded-full bg-rose-100 px-2.5 py-1 text-center text-[10px] font-semibold leading-tight text-rose-700 xl:text-[11px]">
                            {delivery.status}
                          </span>
                        </div>
                        <p className="text-sm font-mono font-semibold text-slate-900 text-center">{delivery.id}</p>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{delivery.customerName}</p>
                          <p className="text-xs text-slate-500">{delivery.companyName}</p>
                        </div>
                        <p className="text-sm text-slate-700 line-clamp-2">{delivery.pickupAddress}</p>
                        <p className="text-sm text-slate-700 line-clamp-2">{delivery.deliveryAddress}</p>
                        <div className="flex justify-center">
                          {delivery.cancellation ? (
                            <span className="inline-flex max-w-full rounded-full bg-slate-100 px-2 py-0.5 text-center text-[10px] font-semibold text-slate-600">
                              {statusLabel[delivery.cancellation.cancelledFromStatus] ?? delivery.cancellation.cancelledFromStatus.replaceAll('_', ' ')}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </div>
                        <div className="flex justify-center">
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </article>
                    ))}
                  </div>

                  <PaginationBar page={cancelledSafePage} setPage={setCancelledPage} totalPages={cancelledTotalPages} />
                </div>
              </>
            )}
          </section>
        )}
          </div>
        )}
    </SupLayout>
  )
}

export default SupDeliveries
