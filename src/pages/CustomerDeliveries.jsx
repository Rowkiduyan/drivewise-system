import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Calendar, CheckCircle2, Clock, MapPin, Package, Search, Star, Truck, X
} from 'lucide-react'
import CustomerLayout from '../layout/CustomerLayout.jsx'
import { truckTypes, itemTypes } from '../lib/deliveryOptions.js'

const background = null

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
          className={`text-2xl transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} ${star <= (hover || rating) ? 'text-amber-400' : 'text-slate-300'}`}
          disabled={readonly}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// Request Detail Modal
function RequestDetailModal({ request, onClose, onUpdate }) {
  const [showQuotationResponse, setShowQuotationResponse] = useState(false)
  const [quotationAction, setQuotationAction] = useState(null)
  const [priceRange, setPriceRange] = useState({ min: '', max: '' })
  const [rating, setRating] = useState(request.rating || 0)
  const [showRatingSuccess, setShowRatingSuccess] = useState(false)
  
  const status = statusConfig[request.status] || statusConfig.PENDING_REQUEST
  const StatusIcon = status.icon
  const itemLabel = request.itemType === 'other' 
    ? `Other: ${request.otherItemType}` 
    : itemTypes.find(i => i.value === request.itemType)?.label || request.itemType
  const truckLabel = truckTypes.find(t => t.value === request.truckType)?.label || request.truckType
  
  const isPending = request.status === 'PENDING_REQUEST'
  const hasQuotationContent = request.status === 'PROCESSING'
  const hasRightContent = hasQuotationContent || 
    (request.status === 'FOR_PICKUP' && request.confirmedPickupDate) || 
    request.status === 'DELIVERY_COMPLETED'
  const quotationAmount = request.quotation
    ? (typeof request.quotation === 'object' ? request.quotation.amount : request.quotation)
    : null
  
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
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl border border-emerald-200/70 bg-white p-5 shadow-2xl md:p-6 ${hasRightContent ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Request Details</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">{request.id}</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${status.color}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className={`mt-5 grid gap-5 ${hasRightContent ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Left column — Delivery Overview */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200/70 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Delivery Overview</h3>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Pickup</p>
                    <p className="font-medium text-slate-900">{request.pickupDate} at {request.pickupTime}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Drop-off</p>
                    <p className="font-medium text-slate-900">{request.dropoffDate} at {request.dropoffTime}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Pickup Location</p>
                    <p className="font-medium text-slate-900">{request.pickupLocation}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Drop-off Location</p>
                    <p className="font-medium text-slate-900">{request.dropoffLocation}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200/70 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Delivery Details</h3>
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-slate-700"><span className="font-medium">Truck:</span> {truckLabel}</p>
                <p className="text-slate-700"><span className="font-medium">Item:</span> {itemLabel}</p>
              </div>
            </div>

            {request.notes && (
              <div className="rounded-2xl border border-emerald-200/70 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
                <p className="mt-2 text-sm text-slate-700">{request.notes}</p>
              </div>
            )}
          </div>

          {/* Right column — Status-specific actions */}
          {hasRightContent && (
            <div className="space-y-4">
              {/* Quotation section — PROCESSING with quotation */}
              {request.status === 'PROCESSING' && quotationAmount && !showQuotationResponse && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="text-sm font-semibold text-blue-800">Quotation from Supervisor</h3>
                  <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3">
                    <p className="text-2xl font-bold text-blue-600">₱{Number(quotationAmount).toLocaleString()}</p>
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
                  <div className="mt-3 flex gap-3">
                    <button
                      onClick={() => { setQuotationAction('approve'); setShowQuotationResponse(true) }}
                      className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setQuotationAction('reject'); setShowQuotationResponse(true) }}
                      className="flex-1 rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Reject & Price Range
                    </button>
                  </div>
                </div>
              )}

              {/* Quotation approval/rejection form */}
              {showQuotationResponse && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="text-sm font-semibold text-blue-800">
                    {quotationAction === 'approve' ? 'Confirm Approval' : 'Request Price Range'}
                  </h3>
                  {quotationAction === 'approve' ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-slate-600">
                        Approve <span className="font-bold">₱{Number(quotationAmount).toLocaleString()}</span>? The delivery moves to For Pickup.
                      </p>
                      <div className="flex gap-3">
                        <button onClick={handleQuotationSubmit} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                          Confirm
                        </button>
                        <button onClick={() => setShowQuotationResponse(false)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-slate-600">Enter your preferred price range for the supervisor.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500">Min (₱)</label>
                          <input type="number" value={priceRange.min} onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Max (₱)</label>
                          <input type="number" value={priceRange.max} onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm" />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={handleQuotationSubmit} disabled={!priceRange.min || !priceRange.max} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                          Submit
                        </button>
                        <button onClick={() => setShowQuotationResponse(false)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Price range feedback — PROCESSING and rejected */}
              {request.status === 'PROCESSING' && request.quotationRejected && request.priceRange && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold text-amber-800">Price Range Requested</h3>
                  <p className="mt-2 text-sm text-amber-800">
                    &#x20B1;{Number(request.priceRange.min).toLocaleString()} &ndash; &#x20B1;{Number(request.priceRange.max).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-amber-600">Awaiting supervisor's revised quotation...</p>
                </div>
              )}

              {/* Confirmed Pickup — FOR_PICKUP */}
              {request.status === 'FOR_PICKUP' && request.confirmedPickupDate && (
                <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
                  <h3 className="text-sm font-semibold text-purple-800">Confirmed Pickup Schedule</h3>
                  <p className="mt-2 text-sm text-purple-700">
                    <span className="font-semibold">{request.confirmedPickupDate} at {request.confirmedPickupTime}</span>
                  </p>
                  <p className="mt-1 text-xs text-purple-600">A crew has been assigned to pick up your items.</p>
                </div>
              )}

              {/* Rating — DELIVERY_COMPLETED */}
              {request.status === 'DELIVERY_COMPLETED' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <Star className="h-4 w-4" />
                    Rate Your Delivery
                  </h3>
                  {showRatingSuccess ? (
                    <div className="mt-3 text-center">
                      <p className="text-sm font-medium text-emerald-700">Thank you for your rating!</p>
                      <div className="mt-2 flex justify-center">
                        <StarRating rating={rating} onRate={() => {}} readonly />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-col items-center">
                        <StarRating rating={rating} onRate={setRating} />
                        <p className="mt-1 text-xs text-slate-500">
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
                        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

        <div className="mt-5 flex justify-end border-t border-emerald-200/70 pt-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-emerald-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-emerald-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Request Card Component
function RequestCard({ request, onViewDetails }) {
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
  
  return (
    <div 
      className="rounded-2xl border border-emerald-200/70 bg-white p-4 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onViewDetails(request)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900 tracking-tight">{request.id}</span>
            {needsAction && (
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-600 truncate">{itemLabel}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${status.color}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
        </span>
      </div>
      
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="truncate max-w-[180px]">{request.pickupLocation}</span>
          <span className="text-slate-300">&rarr;</span>
          <span className="truncate max-w-[180px]">{request.dropoffLocation}</span>
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
      
      {request.rating && (
        <div className="mt-2 flex items-center gap-1">
          <StarRating rating={request.rating} onRate={() => {}} readonly />
        </div>
      )}
    </div>
  )
}

function CustomerDeliveries() {
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Sample delivery requests with different statuses for demo, seeded with any
  // request just submitted from the Request Delivery page (handed back via navigation state)
  const [deliveryRequests, setDeliveryRequests] = useState(() => {
    const sampleRequests = [
    {
      id: 'DR-2024-001',
      pickupDate: '2024-12-20',
      pickupTime: '09:00',
      dropoffDate: '2024-12-20',
      dropoffTime: '14:00',
      pickupLocation: '123 Taft Avenue, Manila, Metro Manila',
      dropoffLocation: '456 Quezon Avenue, Quezon City, Metro Manila',
      truckType: '4T',
      itemType: 'appliances',
      otherItemType: '',
      notes: 'Fragile items - handle with care',
      status: 'PENDING_REQUEST',
      createdAt: '2024-12-15T10:30:00'
    },
    {
      id: 'DR-2024-002',
      pickupDate: '2024-12-22',
      pickupTime: '08:00',
      dropoffDate: '2024-12-22',
      dropoffTime: '16:00',
      pickupLocation: '789 EDSA, Makati, Metro Manila',
      dropoffLocation: '321 Roxas Boulevard, Pasay, Metro Manila',
      truckType: '10T',
      itemType: 'dry_food',
      otherItemType: '',
      notes: '',
      status: 'PROCESSING',
      quotation: { amount: 15000, breakdown: [{ label: 'Base Delivery Fee', amount: 5000 }, { label: 'Distance Fee', amount: 3500 }, { label: 'Truck Type Surcharge', amount: 2500 }, { label: 'Fuel Surcharge', amount: 2000 }, { label: 'Loading/Unloading Fee', amount: 2000 }], notes: '', validUntil: '' },
      createdAt: '2024-12-14T09:00:00'
    },
    {
      id: 'DR-2024-003',
      pickupDate: '2024-12-18',
      pickupTime: '10:00',
      dropoffDate: '2024-12-18',
      dropoffTime: '15:00',
      pickupLocation: '555 Boni Avenue, Mandaluyong, Metro Manila',
      dropoffLocation: '888 Ortigas Center, Pasig, Metro Manila',
      truckType: '2T',
      itemType: 'frozen',
      otherItemType: '',
      notes: 'Maintain refrigeration temperature',
      status: 'FOR_PICKUP',
      confirmedPickupDate: '2024-12-19',
      confirmedPickupTime: '10:00',
      createdAt: '2024-12-10T14:00:00'
    },
    {
      id: 'DR-2024-004',
      pickupDate: '2024-12-16',
      pickupTime: '07:00',
      dropoffDate: '2024-12-16',
      dropoffTime: '12:00',
      pickupLocation: '111 Shaw Boulevard, Pasig, Metro Manila',
      dropoffLocation: '222 BGC, Taguig, Metro Manila',
      truckType: '6T',
      itemType: 'furniture',
      otherItemType: '',
      notes: '',
      status: 'OUT_FOR_DELIVERY',
      createdAt: '2024-12-12T08:00:00'
    },
    {
      id: 'DR-2024-005',
      pickupDate: '2024-12-14',
      pickupTime: '09:00',
      dropoffDate: '2024-12-14',
      dropoffTime: '13:00',
      pickupLocation: '333 Alabang Town Center, Muntinlupa',
      dropoffLocation: '444 SM Mall of Asia, Pasay',
      truckType: '4T',
      itemType: 'beverages',
      otherItemType: '',
      notes: '',
      status: 'DELIVERED',
      createdAt: '2024-12-08T11:00:00'
    },
    {
      id: 'DR-2024-006',
      pickupDate: '2024-12-10',
      pickupTime: '08:00',
      dropoffDate: '2024-12-10',
      dropoffTime: '14:00',
      pickupLocation: '666 Glorietta, Makati',
      dropoffLocation: '777 Greenbelt, Makati',
      truckType: '2T',
      itemType: 'clothing',
      otherItemType: '',
      notes: '',
      status: 'DELIVERY_COMPLETED',
      rating: 5,
      createdAt: '2024-12-05T10:00:00'
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
    // Update selected request if modal is open
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

  // Check if a status has action required (PROCESSING with pending quotation)
  const hasActionRequired = (status) => {
    if (status !== 'PROCESSING') return false
    return deliveryRequests.some(r => 
      r.status === 'PROCESSING' && 
      r.quotation && 
      !r.quotationApproved && 
      !r.quotationRejected
    )
  }

  const actionRequiredCount = deliveryRequests.filter(r => 
    r.status === 'PROCESSING' && 
    r.quotation && 
    !r.quotationApproved && 
    !r.quotationRejected
  ).length

  return (
    <CustomerLayout title="Customer Deliveries" background={background}>
      <div className="flex flex-col gap-6 mb-2">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Deliveries
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Manage delivery requests and review current delivery statuses.
          </p>
        </header>

        {/* Request Delivery Button */}
        <div className="flex justify-end">
          <Link
            to="/customer/deliveries/request"
            className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            + Request Delivery
          </Link>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search by Request ID, location, item type, or truck..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-emerald-200 bg-white pl-12 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'all' ? 'bg-emerald-900 text-white' : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            All Requests
            <span className="ml-1.5 text-xs opacity-70">({deliveryRequests.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('PENDING_REQUEST')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'PENDING_REQUEST' ? 'bg-amber-600 text-white' : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            Pending
            <span className="ml-1.5 text-xs opacity-70">({statusCounts.PENDING_REQUEST})</span>
          </button>
          <button
            onClick={() => setActiveTab('PROCESSING')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'PROCESSING' ? 'bg-blue-600 text-white' : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            Processing{actionRequiredCount > 0 ? ` (${actionRequiredCount})` : ''}
            <span className="ml-1.5 text-xs opacity-70">({statusCounts.PROCESSING})</span>
          </button>
          <button
            onClick={() => setActiveTab('FOR_PICKUP')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'FOR_PICKUP' ? 'bg-purple-600 text-white' : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            For Pickup
            <span className="ml-1.5 text-xs opacity-70">({statusCounts.FOR_PICKUP})</span>
          </button>
          <button
            onClick={() => setActiveTab('OUT_FOR_DELIVERY')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'OUT_FOR_DELIVERY' ? 'bg-indigo-600 text-white' : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            Out for Delivery
            <span className="ml-1.5 text-xs opacity-70">({statusCounts.OUT_FOR_DELIVERY})</span>
          </button>
          <button
            onClick={() => setActiveTab('DELIVERED')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'DELIVERED' ? 'bg-teal-600 text-white' : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            Delivered
            <span className="ml-1.5 text-xs opacity-70">({statusCounts.DELIVERED})</span>
          </button>
          <button
            onClick={() => setActiveTab('DELIVERY_COMPLETED')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'DELIVERY_COMPLETED' ? 'bg-emerald-900 text-white' : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            Completed
            <span className="ml-1.5 text-xs opacity-70">({statusCounts.DELIVERY_COMPLETED})</span>
          </button>
          <button
            onClick={() => setActiveTab('CANCELLED')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'CANCELLED' ? 'bg-rose-600 text-white' : 'border border-emerald-200/70 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            Cancelled
            <span className="ml-1.5 text-xs opacity-70">({statusCounts.CANCELLED})</span>
          </button>
        </div>

        {/* Status Description */}
        <p className="text-xs text-slate-500 leading-relaxed">
          {activeTab === 'all' && 'Showing all delivery requests across every stage.'}
          {activeTab === 'PENDING_REQUEST' && 'This request has been submitted and is waiting for the supervisor to review and process it.'}
          {activeTab === 'PROCESSING' && 'The supervisor is reviewing your request and preparing a quotation for your approval.'}
          {activeTab === 'FOR_PICKUP' && 'The request is confirmed. A crew has been assigned and is waiting for the scheduled pickup date and time.'}
          {activeTab === 'OUT_FOR_DELIVERY' && 'Items have been picked up and the driver is en route to the drop-off location.'}
          {activeTab === 'DELIVERED' && 'Items have arrived at the drop-off location. Waiting for delivery documents to finalise.'}
          {activeTab === 'DELIVERY_COMPLETED' && 'All done! You can rate your delivery experience and review the completed trip details.'}
          {activeTab === 'CANCELLED' && 'This request has been cancelled and will not proceed.'}
        </p>

        {/* Delivery Requests List */}
        <div className="space-y-4">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>No delivery requests found.</p>
            </div>
          ) : (
            filteredRequests.map((request) => (
              <RequestCard 
                key={request.id} 
                request={request} 
                onViewDetails={setSelectedRequest} 
              />
            ))
          )}
        </div>
      </div>

      {/* Request Detail Modal */}
      {selectedRequest && (
        <RequestDetailModal 
          request={selectedRequest} 
          onClose={() => setSelectedRequest(null)}
          onUpdate={handleUpdateRequest}
        />
      )}
    </CustomerLayout>
  )
}

export default CustomerDeliveries
