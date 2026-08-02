import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Calendar, CheckCircle2, ChevronRight, Clock, MapPin, Package, Search, Star, Truck, X
} from 'lucide-react'
import CustomerLayout from '../layout/CustomerLayout.jsx'
import { truckTypes, itemTypes } from '../lib/deliveryOptions.js'

const background = null

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
  FOR_PICKUP: { title: 'No deliveries for pickup', subtitle: 'Confirmed requests with an assigned crew will show up here.' },
  OUT_FOR_DELIVERY: { title: 'Nothing out for delivery', subtitle: 'Deliveries currently en route will show up here.' },
  DELIVERED: { title: 'No delivered items', subtitle: 'Items awaiting your confirmation will show up here.' },
  DELIVERY_COMPLETED: { title: 'No completed deliveries yet', subtitle: 'Finished deliveries you can rate will show up here.' },
  CANCELLED: { title: 'No cancelled requests' }
}

// Star Rating Component
function StarRating({ rating, onRate, readonly = false }) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readonly && onRate(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          className={`text-2xl transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110 active:scale-95'} ${star <= (hover || rating) ? 'text-amber-400' : 'text-slate-300'}`}
          disabled={readonly}
        >
          ★
        </button>
      ))}
    </div>
  )
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

// Request Detail View — replaces the list in place (same page) instead of a
// modal overlay, matching the driver-side pattern: this is a lot of content
// to read inside a small dialog, especially on a phone. Everything the old
// modal showed is still here, just laid out as page sections with a Back
// action instead of dialog chrome.
function RequestDetailView({ request, onBack, onUpdate }) {
  const [showQuotationResponse, setShowQuotationResponse] = useState(false)
  const [quotationAction, setQuotationAction] = useState(null)
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [rating, setRating] = useState(request.rating || 0)
  const [showRatingSuccess, setShowRatingSuccess] = useState(false)
  const [showCancelForm, setShowCancelForm] = useState(false)
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
  const hasRightContent = hasQuotationContent ||
    (request.status === 'FOR_PICKUP' && request.confirmedPickupDate) ||
    request.status === 'DELIVERED' ||
    request.status === 'DELIVERY_COMPLETED'
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
        quotation: request.quotation
      })
    } else if (quotationAction === 'reject') {
      onUpdate(request.id, {
        status: 'PROCESSING',
        quotationRejected: true,
        priceRange: priceRange,
        quotation: null
      })
    }
    setShowQuotationResponse(false)
    setQuotationAction(null)
    setPriceRange({ min: '', max: '' })
  }

  const handleRatingSubmit = () => {
    onUpdate(request.id, { rating })
    setShowRatingSuccess(true)
    setTimeout(() => setShowRatingSuccess(false), 3000)
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
    <div className="flex flex-col gap-2.5 pb-4 lg:gap-5 lg:pb-6">
      <button
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-200/70 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 active:bg-emerald-100 lg:px-3 lg:py-2 lg:text-sm"
      >
        <ArrowLeft className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
        Back
      </button>

      <div className="flex flex-wrap items-start justify-between gap-2 lg:gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 lg:text-xs">{detailsLabel}</p>
          <h1 className="mt-0.5 text-lg font-semibold text-slate-900 lg:mt-1 lg:text-2xl">{request.id}</h1>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold lg:px-3 lg:py-1.5 lg:text-xs ${status.color}`}>
          <StatusIcon className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
          {status.label}
        </span>
      </div>

      {cancellationPending && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 lg:gap-3 lg:p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 lg:h-5 lg:w-5" />
          <div>
            <h3 className="text-xs font-semibold text-amber-800 lg:text-sm">Cancellation Request Pending</h3>
            <p className="mt-1 text-xs text-amber-800 lg:text-sm">Reason: {request.cancellationReason}</p>
            <p className="mt-1 text-[10px] text-amber-600 lg:text-xs">A crew is already assigned to this delivery, so a supervisor needs to approve the cancellation. The delivery will continue as scheduled until then.</p>
          </div>
        </div>
      )}

      {request.status === 'CANCELLED' && request.cancelReason && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-2.5 lg:gap-3 lg:p-4">
          <X className="h-4 w-4 shrink-0 text-red-600 lg:h-5 lg:w-5" />
          <div>
            <h3 className="text-xs font-semibold text-red-800 lg:text-sm">Cancellation Details</h3>
            <p className="mt-1 text-xs text-red-800 lg:text-sm">Reason: {request.cancelReason}</p>
          </div>
        </div>
      )}

      <div className={`grid gap-2.5 lg:gap-4 ${hasRightContent ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Left column — Delivery Overview */}
        <div className="space-y-2.5 lg:space-y-4">
          <div className="rounded-2xl border border-emerald-200/70 bg-white p-2.5 lg:p-4">
            <h3 className="text-xs font-semibold text-slate-900 lg:text-sm">Delivery Overview</h3>
            <div className="mt-2 space-y-2 text-xs lg:mt-3 lg:space-y-3 lg:text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 lg:h-4 lg:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 lg:text-xs">Pickup</p>
                  <p className="font-medium text-slate-900">{request.pickupDate} at {request.pickupTime}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 lg:h-4 lg:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 lg:text-xs">Drop-off</p>
                  <p className="font-medium text-slate-900">{request.dropoffDate} at {request.dropoffTime}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5 lg:h-4 lg:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 lg:text-xs">Pickup Location</p>
                  <p className="font-medium text-slate-900">{request.pickupLocation}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5 lg:h-4 lg:w-4" />
                <div>
                  <p className="text-[10px] text-slate-500 lg:text-xs">Drop-off Location</p>
                  <p className="font-medium text-slate-900">{request.dropoffLocation}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200/70 bg-white p-2.5 lg:p-4">
            <h3 className="text-xs font-semibold text-slate-900 lg:text-sm">Cargo & Budget</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs lg:mt-3 lg:gap-3 lg:text-sm">
              <div>
                <p className="text-[10px] text-slate-500 lg:text-xs">Type of Item</p>
                <p className="font-medium text-slate-900">{itemLabel}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 lg:text-xs">Weight</p>
                <p className="font-medium text-slate-900">{request.cargoWeight ? `${request.cargoWeight} kg` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 lg:text-xs">Minimum Budget</p>
                <p className="font-medium text-slate-900">{request.budgetMin ? `₱${Number(request.budgetMin).toLocaleString()}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 lg:text-xs">Maximum Budget</p>
                <p className="font-medium text-slate-900">{request.budgetMax ? `₱${Number(request.budgetMax).toLocaleString()}` : '—'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200/70 bg-white p-2.5 lg:p-4">
            <h3 className="text-xs font-semibold text-slate-900 lg:text-sm">Truck & Crew Assignment</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs lg:mt-3 lg:gap-3 lg:text-sm">
              <div>
                <p className="text-[10px] text-slate-500 lg:text-xs">Assigned Truck</p>
                <p className="font-medium text-slate-900">{truckLabel}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 lg:text-xs">Truck Plate Number</p>
                <p className="font-medium text-slate-900">{plateNumber || 'Not yet assigned'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 lg:text-xs">Driver</p>
                <p className="font-medium text-slate-900">{driverName || 'Not yet assigned'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 lg:text-xs">Helpers</p>
                <p className="font-medium text-slate-900">{helpersLabel || 'Not yet assigned'}</p>
              </div>
            </div>
          </div>

          {showQuotationSummary && (
            <div className="rounded-2xl border border-emerald-200/70 bg-white p-2.5 lg:p-4">
              <h3 className="text-xs font-semibold text-slate-900 lg:text-sm">Quotation</h3>
              <p className="mt-1.5 text-base font-bold text-emerald-700 lg:mt-2 lg:text-lg">₱{Number(quotationAmount).toLocaleString()}</p>
              {request.quotationApproved && (
                <p className="mt-1 text-[10px] font-medium text-emerald-600 lg:text-xs">Approved</p>
              )}
            </div>
          )}

          {request.notes && (
            <div className="rounded-2xl border border-emerald-200/70 bg-white p-2.5 lg:p-4">
              <h3 className="text-xs font-semibold text-slate-900 lg:text-sm">Notes</h3>
              <p className="mt-1.5 text-xs text-slate-700 lg:mt-2 lg:text-sm">{request.notes}</p>
            </div>
          )}
        </div>

        {/* Right column — Status-specific actions */}
        {hasRightContent && (
          <div className="space-y-2.5 lg:space-y-4">
            {/* Quotation section — PROCESSING with quotation */}
            {request.status === 'PROCESSING' && quotationAmount && !showQuotationResponse && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-2.5 lg:p-4">
                <h3 className="text-xs font-semibold text-blue-800 lg:text-sm">Quotation from Supervisor</h3>
                <div className="mt-2 rounded-xl border border-blue-200 bg-white p-2.5 lg:mt-3 lg:p-3">
                  <p className="text-xl font-bold text-blue-600 lg:text-2xl">₱{Number(quotationAmount).toLocaleString()}</p>
                  {typeof request.quotation === 'object' && request.quotation.breakdown?.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-blue-100 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Breakdown</p>
                      {request.quotation.breakdown.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-blue-700">{item.label}</span>
                          <span className="font-medium text-blue-800">₱{Number(item.amount).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-col gap-2 lg:mt-3 lg:flex-row lg:gap-3">
                  <button
                    onClick={() => { setQuotationAction('approve'); setShowQuotationResponse(true) }}
                    className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 lg:px-4 lg:py-2.5 lg:text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { setQuotationAction('reject'); setShowQuotationResponse(true) }}
                    className="flex-1 rounded-xl border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 lg:px-4 lg:py-2.5 lg:text-sm"
                  >
                    Reject & Price Range
                  </button>
                </div>
              </div>
            )}

            {/* Quotation approval/rejection form */}
            {showQuotationResponse && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-2.5 lg:p-4">
                <h3 className="text-xs font-semibold text-blue-800 lg:text-sm">
                  {quotationAction === 'approve' ? 'Confirm Approval' : 'Request Price Range'}
                </h3>
                {quotationAction === 'approve' ? (
                  <div className="mt-2 space-y-2 lg:mt-3 lg:space-y-3">
                    <p className="text-xs text-slate-600 lg:text-sm">
                      Approve <span className="font-bold">₱{Number(quotationAmount).toLocaleString()}</span>? The delivery moves to For Pickup.
                    </p>
                    <div className="flex flex-col gap-2 lg:flex-row lg:gap-3">
                      <button onClick={handleQuotationSubmit} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 lg:px-4 lg:py-2.5 lg:text-sm">
                        Confirm
                      </button>
                      <button onClick={() => setShowQuotationResponse(false)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 lg:px-4 lg:py-2.5 lg:text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2 lg:mt-3 lg:space-y-3">
                    <p className="text-xs text-slate-600 lg:text-sm">Enter your preferred price range for the supervisor.</p>
                    <div className="grid grid-cols-2 gap-2 lg:gap-3">
                      <div>
                        <label className="text-[10px] text-slate-500 lg:text-xs">Min (₱)</label>
                        <input type="number" value={priceRange.min} onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs lg:px-4 lg:py-2.5 lg:text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 lg:text-xs">Max (₱)</label>
                        <input type="number" value={priceRange.max} onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs lg:px-4 lg:py-2.5 lg:text-sm" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 lg:flex-row lg:gap-3">
                      <button onClick={handleQuotationSubmit} disabled={!priceRange.min || !priceRange.max} className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 lg:px-4 lg:py-2.5 lg:text-sm">
                        Submit
                      </button>
                      <button onClick={() => setShowQuotationResponse(false)} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 lg:px-4 lg:py-2.5 lg:text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Price range feedback — PROCESSING and rejected */}
            {request.status === 'PROCESSING' && request.quotationRejected && request.priceRange && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-2.5 lg:p-4">
                <h3 className="text-xs font-semibold text-amber-800 lg:text-sm">Price Range Requested</h3>
                <p className="mt-1.5 text-xs text-amber-800 lg:mt-2 lg:text-sm">
                  &#x20B1;{Number(request.priceRange.min).toLocaleString()} &ndash; &#x20B1;{Number(request.priceRange.max).toLocaleString()}
                </p>
                <p className="mt-1 text-[10px] text-amber-600 lg:text-xs">Awaiting supervisor's revised quotation...</p>
              </div>
            )}

            {/* Confirmed Pickup — FOR_PICKUP */}
            {request.status === 'FOR_PICKUP' && request.confirmedPickupDate && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-2.5 lg:p-4">
                <h3 className="text-xs font-semibold text-purple-800 lg:text-sm">Confirmed Pickup Schedule</h3>
                <p className="mt-1.5 text-xs text-purple-700 lg:mt-2 lg:text-sm">
                  <span className="font-semibold">{request.confirmedPickupDate} at {request.confirmedPickupTime}</span>
                </p>
                <p className="mt-1 text-[10px] text-purple-600 lg:text-xs">A crew has been assigned to pick up your items.</p>
              </div>
            )}

            {/* Delivery confirmation — DELIVERED. A lightweight, optional
                acknowledgement from the customer; separate from the driver/
                supervisor-driven status pipeline, so confirming or reporting
                an issue here doesn't change the request's status itself. */}
            {request.status === 'DELIVERED' && (
              <div className={`rounded-2xl border p-2.5 lg:p-4 ${
                request.issueReported && !request.receivedConfirmed
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}>
                {request.receivedConfirmed ? (
                  <>
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-emerald-800 lg:text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                      Delivery Confirmed
                    </h3>
                    <p className="mt-1.5 text-xs text-emerald-700 lg:mt-2 lg:text-sm">
                      You confirmed receipt of this delivery
                      {request.receivedConfirmedAt ? ` on ${new Date(request.receivedConfirmedAt).toLocaleDateString()}` : ''}. Thank you!
                    </p>
                  </>
                ) : request.issueReported ? (
                  <>
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-amber-800 lg:text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                      Issue Reported
                    </h3>
                    <p className="mt-1.5 text-xs text-amber-800 lg:mt-2 lg:text-sm">Our team has been notified and will follow up with you shortly.</p>
                    {request.issueDescription && (
                      <p className="mt-1.5 rounded-lg bg-white/70 p-2 text-[11px] italic text-slate-700 lg:mt-2 lg:p-2.5 lg:text-xs">&ldquo;{request.issueDescription}&rdquo;</p>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="text-xs font-semibold text-emerald-800 lg:text-sm">Confirm Your Delivery</h3>
                    <p className="mt-1 text-[11px] text-emerald-700 leading-relaxed lg:text-xs">
                      Your driver has marked this as delivered. Let us know it arrived safely, or report an issue if something's wrong.
                    </p>
                    <div className="mt-2 flex flex-col gap-2 lg:mt-3 lg:flex-row lg:gap-3">
                      <button
                        onClick={() => setShowConfirmModal(true)}
                        className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 lg:px-4 lg:py-2.5 lg:text-sm"
                      >
                        Confirm Received
                      </button>
                      <button
                        onClick={() => setShowIssueModal(true)}
                        className="flex-1 rounded-xl border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 lg:px-4 lg:py-2.5 lg:text-sm"
                      >
                        Report an Issue
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Rating — DELIVERY_COMPLETED */}
            {request.status === 'DELIVERY_COMPLETED' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 lg:p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-emerald-800 lg:text-sm">
                  <Star className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                  Rate Your Delivery
                </h3>
                {showRatingSuccess ? (
                  <div className="mt-2 text-center lg:mt-3">
                    <p className="text-xs font-medium text-emerald-700 lg:text-sm">Thank you for your rating!</p>
                    <div className="mt-2 flex justify-center">
                      <StarRating rating={rating} onRate={() => {}} readonly />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2 lg:mt-3 lg:space-y-3">
                    <div className="flex flex-col items-center">
                      <StarRating rating={rating} onRate={setRating} />
                      <p className="mt-1 text-[10px] text-slate-500 lg:text-xs">
                        {rating === 1 && 'Poor'}
                        {rating === 2 && 'Fair'}
                        {rating === 3 && 'Good'}
                        {rating === 4 && 'Very Good'}
                        {rating === 5 && 'Excellent'}
                      </p>
                    </div>
                    <button
                      onClick={handleRatingSubmit}
                      disabled={rating === 0}
                      className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed lg:px-4 lg:py-2.5 lg:text-sm"
                    >
                      Submit Rating
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showCancelForm && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-2.5 lg:p-4">
          <h3 className="text-xs font-semibold text-red-800 lg:text-sm">Cancel This Delivery</h3>
          <p className="mt-1 text-[11px] text-red-700 leading-relaxed lg:text-xs">
            {hasAssignedCrew
              ? 'A crew has already been assigned to this delivery. Submitting this will send a cancellation request to the supervisor for approval — it will not cancel immediately.'
              : 'This request has not yet been assigned a crew, so it will be cancelled right away.'}
          </p>
          <div className="mt-2 space-y-2 lg:mt-3 lg:space-y-3">
            <div>
              <label htmlFor="cancelReason" className="text-[11px] font-medium text-slate-700 lg:text-xs">Reason for Cancellation</label>
              <select
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-1 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 lg:px-4 lg:py-2.5 lg:text-sm"
              >
                <option value="">Select a reason...</option>
                {cancellationReasons.map(reason => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </div>
            {cancelReason === 'Other' && (
              <div>
                <label htmlFor="cancelReasonOther" className="text-[11px] font-medium text-slate-700 lg:text-xs">Please specify</label>
                <textarea
                  id="cancelReasonOther"
                  value={cancelReasonOther}
                  onChange={(e) => setCancelReasonOther(e.target.value)}
                  rows={2}
                  placeholder="Tell us more..."
                  className="mt-1 w-full resize-none rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 lg:px-4 lg:py-2.5 lg:text-sm"
                />
              </div>
            )}
            <div className="flex flex-col gap-2 lg:flex-row lg:gap-3">
              <button
                onClick={handleCancelSubmit}
                disabled={!isCancelReasonValid}
                className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 lg:px-4 lg:py-2.5 lg:text-sm"
              >
                {hasAssignedCrew ? 'Submit Cancellation Request' : 'Confirm Cancellation'}
              </button>
              <button
                onClick={() => { setShowCancelForm(false); setCancelReason(''); setCancelReasonOther('') }}
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 lg:px-4 lg:py-2.5 lg:text-sm"
              >
                Never Mind
              </button>
            </div>
          </div>
        </div>
      )}

      {isCancellable && !showCancelForm && (
        <div className="flex flex-col gap-1 border-t border-emerald-200/70 pt-3 lg:pt-4">
          <button
            onClick={() => setShowCancelForm(true)}
            className="w-full rounded-xl border border-red-300 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 active:bg-red-100 lg:w-fit lg:px-4 lg:py-2.5 lg:text-sm"
          >
            {hasAssignedCrew ? 'Request Cancellation' : 'Cancel Delivery'}
          </button>
          {hasAssignedCrew && (
            <p className="text-[10px] text-slate-500 lg:text-[11px]">A crew is already assigned — this needs supervisor approval before it takes effect.</p>
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
          <div className="w-full max-w-sm rounded-2xl border border-emerald-200/70 bg-white p-3.5 shadow-xl lg:p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4 lg:h-5 lg:w-5" />
              <h2 id="confirm-receipt-title" className="text-xs font-bold text-slate-900 lg:text-sm">Confirm Delivery Receipt</h2>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 lg:mt-2 lg:text-xs">
              Have you received all items for <span className="font-semibold text-slate-800">{request.id}</span> in good condition? This lets us know the delivery is complete.
            </p>
            <div className="mt-3 flex gap-2 lg:mt-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 lg:py-2.5 lg:text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReceived}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-700 lg:py-2.5 lg:text-xs"
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
          <div className="w-full max-w-sm rounded-2xl border border-amber-200/70 bg-white p-3.5 shadow-xl lg:p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4 lg:h-5 lg:w-5" />
              <h2 id="report-issue-title" className="text-xs font-bold text-slate-900 lg:text-sm">Report an Issue</h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-600 lg:mt-1.5 lg:text-xs">
              Let us know what went wrong with <span className="font-semibold text-slate-800">{request.id}</span>.
            </p>
            <div className="mt-2 space-y-2 lg:mt-3 lg:space-y-3">
              <div>
                <label htmlFor="issueReason" className="text-[11px] font-medium text-slate-700 lg:text-xs">Reason</label>
                <select
                  id="issueReason"
                  value={issueReason}
                  onChange={(e) => setIssueReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 lg:px-3.5 lg:py-2.5 lg:text-xs"
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
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 lg:px-3.5 lg:py-2.5 lg:text-xs"
                />
              )}
            </div>
            <div className="mt-3 flex gap-2 lg:mt-4">
              <button
                onClick={() => { setShowIssueModal(false); setIssueReason(''); setIssueDescription('') }}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 lg:py-2.5 lg:text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleReportIssue}
                disabled={!isIssueReasonValid}
                className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 lg:py-2.5 lg:text-xs"
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
function RequestCard({ request, onViewDetails, onConfirmReceived, onReportIssue }) {
  const status = statusConfig[request.status] || statusConfig.PENDING_REQUEST
  const StatusIcon = status.icon
  const itemLabel = request.itemType === 'other'
    ? `Other: ${request.otherItemType}`
    : itemTypes.find(i => i.value === request.itemType)?.label || request.itemType

  const needsAction = request.status === 'PROCESSING' &&
    request.quotation &&
    !request.quotationApproved &&
    !request.quotationRejected

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
  } else if (quotationAmount && !request.quotationRejected) {
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
      {/* Mobile (<lg) — minimal, linear list row: no card box, no border, no
          shadow. Rows are separated purely by the parent list's horizontal
          divider lines (like a feed), with generous vertical padding standing
          in for the whitespace a card's border used to provide.
          Desktop (lg+) renders the original, untouched card below. */}
      <div
        className="flex flex-col border-b border-slate-300 py-4 transition-colors active:bg-slate-50 cursor-pointer lg:hidden"
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
            "Confirm Received" and "Didn't receive it?" can anchor to the true
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
                    className="shrink-0 whitespace-nowrap text-[10px] font-medium text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    Didn't receive it?
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop (lg+) — original card layout, plus the same Delivered
          confirm/report quick action now added to the mobile card. */}
      <div
        className="hidden rounded-2xl border border-emerald-200/70 bg-white p-3 transition hover:shadow-md active:bg-emerald-50/40 cursor-pointer sm:p-4 lg:block lg:mb-4 last:lg:mb-0"
        onClick={() => onViewDetails(request)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-900 tracking-tight sm:text-lg">{request.id}</span>
              {needsAction && (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-600 truncate">{itemLabel}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:py-1.5 sm:text-xs ${status.color}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-1.5 text-xs text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{request.pickupLocation}</span>
            <span className="text-slate-300 shrink-0">&rarr;</span>
            <span className="truncate">{request.dropoffLocation}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>{request.pickupDate} at {request.pickupTime} &rarr; {request.dropoffDate} at {request.dropoffTime}</span>
          </div>
        </div>

        {(needsAction || (!needsAction && quotationAmount && request.status === 'PROCESSING')) && (
          <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${needsAction ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
            {needsAction && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
            <span className={`font-medium ${needsAction ? 'text-red-700' : 'text-blue-700'}`}>
              Quotation: <span className="font-bold">₱{Number(quotationAmount).toLocaleString()}</span>
              {needsAction ? ' — Action required' : ''}
            </span>
          </div>
        )}

        {cancellationPending && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
            <span className="font-medium text-amber-700">Cancellation request pending supervisor approval</span>
          </div>
        )}

        {/* Delivered — same one-tap receipt confirmation as the mobile card,
            so desktop customers don't have to open the request just to confirm. */}
        {request.status === 'DELIVERED' && (
          <div onClick={(e) => e.stopPropagation()}>
            {request.receivedConfirmed ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-medium text-emerald-700">Receipt confirmed</span>
              </div>
            ) : request.issueReported ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span className="font-medium text-amber-700">Issue reported — we're on it</span>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                <span className="mr-auto font-medium text-emerald-800">Received your delivery?</span>
                <button
                  onClick={() => onConfirmReceived(request)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirm
                </button>
                <button
                  onClick={() => onReportIssue(request)}
                  className="text-[11px] font-medium text-emerald-700 hover:underline"
                >
                  Report an issue
                </button>
              </div>
            )}
          </div>
        )}

        {request.rating && (
          <div className="mt-2 flex items-center gap-1">
            <StarRating rating={request.rating} onRate={() => {}} readonly />
          </div>
        )}
      </div>
    </>
  )
}

function CustomerDeliveries() {
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
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
      quotation: { amount: 15000, breakdown: [{ label: 'Base Delivery Fee', amount: 5000 }, { label: 'Distance Fee', amount: 3500 }, { label: 'Truck Type Surcharge', amount: 2500 }, { label: 'Fuel Surcharge', amount: 2000 }, { label: 'Loading/Unloading Fee', amount: 2000 }], notes: '', validUntil: '' },
      createdAt: '2026-07-28T09:00:00'
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
      quotation: { amount: 7500, breakdown: [{ label: 'Base Delivery Fee', amount: 3000 }, { label: 'Distance Fee', amount: 1800 }, { label: 'Truck Type Surcharge', amount: 1200 }, { label: 'Fuel Surcharge', amount: 800 }, { label: 'Loading/Unloading Fee', amount: 700 }], notes: '', validUntil: '' },
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
      quotation: { amount: 11500, breakdown: [{ label: 'Base Delivery Fee', amount: 4000 }, { label: 'Distance Fee', amount: 2800 }, { label: 'Truck Type Surcharge', amount: 2000 }, { label: 'Fuel Surcharge', amount: 1500 }, { label: 'Loading/Unloading Fee', amount: 1200 }], notes: '', validUntil: '' },
      quotationApproved: true,
      crew: {
        driver: { id: 'DRV-004', name: 'Ramon Aquino' },
        helpers: [{ id: 'HLP-004', name: 'Edwin Bautista' }, { id: 'HLP-005', name: 'Marco Reyes' }],
        truck: { plateNumber: 'GHI 9012', truckType: '6T' }
      },
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
      quotation: { amount: 6800, breakdown: [{ label: 'Base Delivery Fee', amount: 2500 }, { label: 'Distance Fee', amount: 1600 }, { label: 'Truck Type Surcharge', amount: 1200 }, { label: 'Fuel Surcharge', amount: 800 }, { label: 'Loading/Unloading Fee', amount: 700 }], notes: '', validUntil: '' },
      quotationApproved: true,
      crew: {
        driver: { id: 'DRV-005', name: 'Teodoro Salazar' },
        helpers: [{ id: 'HLP-006', name: 'Vince Alonzo' }],
        truck: { plateNumber: 'JKL 3456', truckType: '4T' }
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
      rating: 5,
      quotation: { amount: 4900, breakdown: [{ label: 'Base Delivery Fee', amount: 2000 }, { label: 'Distance Fee', amount: 1200 }, { label: 'Truck Type Surcharge', amount: 800 }, { label: 'Fuel Surcharge', amount: 500 }, { label: 'Loading/Unloading Fee', amount: 400 }], notes: '', validUntil: '' },
      quotationApproved: true,
      crew: {
        driver: { id: 'DRV-006', name: 'Antonio Reyes' },
        helpers: [{ id: 'HLP-007', name: 'Julius Manalo' }],
        truck: { plateNumber: 'ABC 1234', truckType: '2T' }
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

  // Count requests for each status
  const statusCounts = {
    PENDING_REQUEST: deliveryRequests.filter(r => r.status === 'PENDING_REQUEST').length,
    PROCESSING: deliveryRequests.filter(r => r.status === 'PROCESSING').length,
    FOR_PICKUP: deliveryRequests.filter(r => r.status === 'FOR_PICKUP').length,
    OUT_FOR_DELIVERY: deliveryRequests.filter(r => r.status === 'OUT_FOR_DELIVERY').length,
    DELIVERED: deliveryRequests.filter(r => r.status === 'DELIVERED').length,
    DELIVERY_COMPLETED: deliveryRequests.filter(r => r.status === 'DELIVERY_COMPLETED').length,
    CANCELLED: deliveryRequests.filter(r => r.status === 'CANCELLED').length
  }

  const actionRequiredCount = deliveryRequests.filter(r =>
    r.status === 'PROCESSING' &&
    r.quotation &&
    !r.quotationApproved &&
    !r.quotationRejected
  ).length

  // Desktop pill buttons keep their per-status accent color; the mobile tab
  // strip below uses a single underline style instead (see tabs array).
  const tabButtonClass = (isActive, activeClasses) =>
    `whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:py-2 sm:text-sm ${
      isActive ? activeClasses : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300 active:bg-emerald-50'
    }`

  const tabs = [
    { id: 'all', label: 'All Requests', mobileLabel: 'All', count: deliveryRequests.length, activeClasses: 'bg-emerald-900 text-white' },
    { id: 'PENDING_REQUEST', label: 'Pending', mobileLabel: 'Pending', count: statusCounts.PENDING_REQUEST, activeClasses: 'bg-amber-600 text-white' },
    { id: 'PROCESSING', label: `Processing${actionRequiredCount > 0 ? ` (${actionRequiredCount})` : ''}`, mobileLabel: 'Processing', count: statusCounts.PROCESSING, activeClasses: 'bg-blue-600 text-white' },
    { id: 'FOR_PICKUP', label: 'For Pickup', mobileLabel: 'For Pickup', count: statusCounts.FOR_PICKUP, activeClasses: 'bg-purple-600 text-white' },
    { id: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', mobileLabel: 'Out for Delivery', count: statusCounts.OUT_FOR_DELIVERY, activeClasses: 'bg-indigo-600 text-white' },
    { id: 'DELIVERED', label: 'Delivered', mobileLabel: 'Delivered', count: statusCounts.DELIVERED, activeClasses: 'bg-teal-600 text-white' },
    { id: 'DELIVERY_COMPLETED', label: 'Completed', mobileLabel: 'Completed', count: statusCounts.DELIVERY_COMPLETED, activeClasses: 'bg-emerald-900 text-white' },
    { id: 'CANCELLED', label: 'Cancelled', mobileLabel: 'Cancelled', count: statusCounts.CANCELLED, activeClasses: 'bg-rose-600 text-white' }
  ]

  const handleTabChange = (newTabId) => {
    const order = tabs.map(t => t.id)
    setTabDirection(order.indexOf(newTabId) >= order.indexOf(activeTab) ? 1 : -1)
    setActiveTab(newTabId)
  }

  if (selectedRequest) {
    return (
      <CustomerLayout title="Customer Deliveries" background={background}>
        <RequestDetailView
          request={selectedRequest}
          onBack={() => setSelectedRequest(null)}
          onUpdate={handleUpdateRequest}
        />
      </CustomerLayout>
    )
  }

  return (
    <CustomerLayout title="Customer Deliveries" background={background}>
      {/* Mobile (<lg): sticky bottom CTA bar instead of an inline full-width button —
          stays reachable in the thumb zone without pushing the filters/list down.
          Styled to match the bottom action bar used in DriverDeliveries.jsx.
          Desktop (lg+) keeps the original inline button, unchanged. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-emerald-200/70 bg-white/95 px-4 py-2.5 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        <Link
          to="/customer/deliveries/request"
          className="mx-auto flex w-full items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 active:bg-emerald-800"
        >
          Request Delivery
        </Link>
      </div>

      <div className="flex flex-col gap-4 mb-2 pb-24 sm:gap-6 lg:pb-0">
        {/* Search Bar + Request Delivery Button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none lg:pl-4">
              <Search className="h-4 w-4 text-slate-400 lg:h-5 lg:w-5" />
            </div>
            <input
              type="text"
              placeholder="Search your deliveries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-emerald-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 lg:pl-12 lg:pr-4 lg:py-3 lg:text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 lg:pr-4"
              >
                <svg className="h-4 w-4 lg:h-5 lg:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <Link
            to="/customer/deliveries/request"
            className="hidden shrink-0 rounded-xl bg-emerald-600 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-700 active:bg-emerald-800 lg:block"
          >
            + Request Delivery
          </Link>
        </div>

        {/* Tab Navigation — compact horizontally scrollable underline strip on
            mobile (no wrapping, minimal height); full pill row on lg+ */}
        <div className="flex gap-1 overflow-x-auto border-b border-emerald-200/70 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.mobileLabel}
            </button>
          ))}
        </div>

        <div className="hidden flex-wrap gap-2 lg:flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={tabButtonClass(activeTab === tab.id, tab.activeClasses)}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>

        <TabPanel key={activeTab} direction={tabDirection}>
          {/* Status Description — desktop only; skipped on mobile to keep the list closer to the fold */}
          <p className="hidden text-xs text-slate-500 leading-relaxed lg:block">
            {activeTab === 'all' && 'Showing all delivery requests across every stage.'}
            {activeTab === 'PENDING_REQUEST' && 'This request has been submitted and is waiting for the supervisor to review and process it.'}
            {activeTab === 'PROCESSING' && 'The supervisor is reviewing your request and preparing a quotation for your approval.'}
            {activeTab === 'FOR_PICKUP' && 'The request is confirmed. A crew has been assigned and is waiting for the scheduled pickup date and time.'}
            {activeTab === 'OUT_FOR_DELIVERY' && 'Items have been picked up and the driver is en route to the drop-off location.'}
            {activeTab === 'DELIVERED' && 'Items have arrived at the drop-off location. You can confirm receipt or report an issue from the request.'}
            {activeTab === 'DELIVERY_COMPLETED' && 'All done! You can rate your delivery experience and review the completed trip details.'}
            {activeTab === 'CANCELLED' && 'This request has been cancelled and will not proceed.'}
          </p>

          {/* Delivery Requests List. Spacing/dividers are applied per-row (not via
              a container-level divide-y/space-y) because each RequestCard renders
              both a mobile row and a desktop card as sibling DOM nodes (one always
              display:none) — Tailwind's divide-y/space-y sibling selector only
              excludes the HTML `hidden` attribute, not CSS-hidden elements, so a
              container-level utility here would misfire onto the wrong sibling. */}
          <div className="lg:mt-6">
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
