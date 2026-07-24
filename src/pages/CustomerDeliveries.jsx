import { useState, useEffect, useRef } from 'react'
import CustomerLayout from '../layout/CustomerLayout.jsx'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix default marker icon for Leaflet in React
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
})

const background = null

// Philippine truck models
const truckTypes = [
  { value: 'L300', label: 'L300 - Light commercial vehicle for small cargo, ideal for urban deliveries' },
  { value: 'AUV', label: 'AUV - Utility vehicle for light cargo, suitable for small loads and flexible operations' },
  { value: '1T_DRY', label: '1T DRY - One-ton dry van for transporting general cargo securely' },
  { value: '2T_DRY', label: '2T DRY - Two-ton dry van for transporting bulk cargo' },
  { value: '1T_REF', label: '1T REF - One-ton reefer truck for perishable cargo with temperature control' },
  { value: '2T_REF', label: '2T REF - Two-ton reefer for temperature-sensitive cargo' },
  { value: '4T_DRY', label: '4T DRY - Four-ton dry van for large cargo transport' },
  { value: '4T_REF', label: '4T REF - Four-ton reefer for large volume cold-chain operations' }
]

// Item categories (dry or refrigerated only)
const itemTypes = [
  { value: 'dry_food', label: 'Dry Food (Canned, Packaged, etc.)' },
  { value: 'fresh_food', label: 'Fresh Food (Fruits, Vegetables)' },
  { value: 'frozen', label: 'Frozen Goods' },
  { value: 'dairy', label: 'Dairy Products' },
  { value: 'beverages', label: 'Beverages' },
  { value: 'appliances', label: 'Appliances & Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'clothing', label: 'Clothing & Textiles' },
  { value: 'construction', label: 'Construction Materials' },
  { value: 'pharmaceuticals', label: 'Pharmaceuticals' },
  { value: 'other', label: 'Other Dry Goods' }
]

// Map click handler component
function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng
      // Reverse geocode to get address
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(res => res.json())
        .then(data => {
          const address = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
          onLocationSelect(address, lat, lng)
        })
        .catch(() => {
          onLocationSelect(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng)
        })
    }
  })
  return null
}

// Location Picker Modal Component
function LocationPickerModal({ isOpen, onClose, onSelect, currentValue }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [mapReady, setMapReady] = useState(false)
  
  // Default to Philippines center (Manila)
  const defaultCenter = [14.5995, 120.9842]
  const [mapCenter, setMapCenter] = useState(defaultCenter)
  
  useEffect(() => {
    if (searchQuery.length > 2) {
      const timer = setTimeout(() => {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=ph&limit=5`)
          .then(res => res.json())
          .then(data => {
            setSuggestions(data.map(item => ({
              display: item.display_name,
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon)
            })))
          })
          .catch(() => setSuggestions([]))
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setSuggestions([])
    }
  }, [searchQuery])

  const handleSuggestionClick = (suggestion) => {
    setSelectedLocation(suggestion)
    setMapCenter([suggestion.lat, suggestion.lon])
    setSuggestions([])
    setSearchQuery('')
  }

  const handleMapClick = (address, lat, lng) => {
    setSelectedLocation({ display: address, lat, lon: lng })
  }

  const handleConfirm = () => {
    if (selectedLocation) {
      onSelect(selectedLocation.display)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="text-lg font-semibold text-slate-900">Pick Location on Map</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a location in Philippines..."
              className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-emerald-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 border-b border-slate-100 last:border-b-0"
                  >
                    {suggestion.display}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Map */}
          <div className="h-80 rounded-xl overflow-hidden border border-emerald-200">
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              whenReady={() => setMapReady(true)}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onLocationSelect={handleMapClick} />
              {selectedLocation && (
                <Marker position={[selectedLocation.lat, selectedLocation.lon]} />
              )}
            </MapContainer>
          </div>
          
          {/* Selected Location Display */}
          {selectedLocation && (
            <div className="p-3 bg-emerald-50 rounded-xl">
              <p className="text-sm text-emerald-800 font-medium">Selected Location:</p>
              <p className="text-sm text-emerald-700 mt-1">{selectedLocation.display}</p>
            </div>
          )}
          
          <p className="text-xs text-slate-500 text-center">
            Click on the map or search for a location to pin it
          </p>
        </div>
        
        <div className="flex justify-end gap-3 border-t border-slate-200 p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedLocation}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  )
}

// Location Input with Autocomplete and Map Picker
function LocationInput({ id, label, value, onChange, required }) {
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const inputRef = useRef(null)

  const handleInputChange = (e) => {
    const query = e.target.value
    onChange(e)
    
    if (query.length > 2) {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ph&limit=5`)
        .then(res => res.json())
        .then(data => {
          setSuggestions(data.map(item => ({
            display: item.display_name,
            lat: item.lat,
            lon: item.lon
          })))
          setShowSuggestions(true)
        })
        .catch(() => {
          setSuggestions([])
          setShowSuggestions(false)
        })
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  const handleSuggestionClick = (suggestion) => {
    onChange({ target: { name: id, value: suggestion.display } })
    setShowSuggestions(false)
    setSuggestions([])
  }

  const handleLocationSelect = (address) => {
    onChange({ target: { name: id, value: address } })
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            id={id}
            name={id}
            value={value}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Enter address or search..."
            required={required}
            className="flex-1 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="button"
            onClick={() => setShowMapPicker(true)}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            title="Pick from map"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="hidden sm:inline">Map</span>
          </button>
        </div>
        
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-emerald-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 border-b border-slate-100 last:border-b-0"
              >
                {suggestion.display}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <LocationPickerModal
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={handleLocationSelect}
        currentValue={value}
      />
    </div>
  )
}

// Status configuration
const statusConfig = {
  PENDING_REQUEST: { label: 'Pending Request', color: 'bg-amber-100 text-amber-800', icon: '⏳' },
  PROCESSING: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: '⚙️' },
  FOR_PICKUP: { label: 'For Pickup', color: 'bg-purple-100 text-purple-800', icon: '📦' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', color: 'bg-indigo-100 text-indigo-800', icon: '🚚' },
  DELIVERED: { label: 'Delivered', color: 'bg-teal-100 text-teal-800', icon: '✓' },
  DELIVERY_COMPLETED: { label: 'Delivery Completed', color: 'bg-emerald-100 text-emerald-800', icon: '🎉' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: '✕' }
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
  const itemLabel = request.itemType === 'other' 
    ? `Other: ${request.otherItemType}` 
    : itemTypes.find(i => i.value === request.itemType)?.label || request.itemType
  const truckLabel = truckTypes.find(t => t.value === request.truckType)?.label || request.truckType
  
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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Request ID: {request.id}</p>
            <h3 className="text-lg font-semibold text-slate-900">Delivery Request Details</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${status.color}`}>
              <span>{status.icon}</span>
              {status.label}
            </span>
          </div>
          
          {/* Schedule Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Schedule</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Pick Up</p>
                <p className="text-sm font-medium text-slate-900">{request.pickupDate} at {request.pickupTime}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Drop Off</p>
                <p className="text-sm font-medium text-slate-900">{request.dropoffDate} at {request.dropoffTime}</p>
              </div>
            </div>
          </div>
          
          {/* Location Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Locations</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Pick Up Location</p>
                <p className="text-sm text-slate-900">{request.pickupLocation}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Drop Off Location</p>
                <p className="text-sm text-slate-900">{request.dropoffLocation}</p>
              </div>
            </div>
          </div>
          
          {/* Delivery Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Delivery Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Truck Type</p>
                <p className="text-sm font-medium text-slate-900">{truckLabel}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Item Type</p>
                <p className="text-sm font-medium text-slate-900">{itemLabel}</p>
              </div>
            </div>
          </div>
          
          {/* Notes */}
          {request.notes && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Notes</h4>
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-700">{request.notes}</p>
              </div>
            </div>
          )}
          
          {/* Quotation Section - Shows when in PROCESSING status with quotation */}
          {request.status === 'PROCESSING' && request.quotation && !showQuotationResponse && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <h4 className="text-sm font-medium text-blue-800">Quotation from Supervisor</h4>
              <div className="p-3 bg-white rounded-lg space-y-2">
                <p className="text-2xl font-bold text-blue-600">₱{(typeof request.quotation === 'object' ? request.quotation.amount : request.quotation).toLocaleString()}</p>
                {typeof request.quotation === 'object' && request.quotation.breakdown?.length > 0 && (
                  <div className="border-t border-blue-200 pt-2 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Breakdown</p>
                    {request.quotation.breakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-blue-700">{item.label}</span>
                        <span className="font-medium text-blue-800">₱{Number(item.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setQuotationAction('approve'); setShowQuotationResponse(true) }}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Approve Quotation
                </button>
                <button
                  onClick={() => { setQuotationAction('reject'); setShowQuotationResponse(true) }}
                  className="flex-1 rounded-xl border border-red-300 text-red-600 px-4 py-2.5 text-sm font-semibold hover:bg-red-50"
                >
                  Reject & Request Price Range
                </button>
              </div>
            </div>
          )}
          
          {/* Quotation Response Form */}
          {showQuotationResponse && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <h4 className="text-sm font-medium text-blue-800">
                {quotationAction === 'approve' ? 'Confirm Approval' : 'Request Price Range'}
              </h4>
              
              {quotationAction === 'approve' ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">You are about to approve the quotation of <span className="font-bold">₱{(typeof request.quotation === 'object' ? request.quotation.amount : request.quotation)?.toLocaleString()}</span>. The delivery will proceed to the next step.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleQuotationSubmit}
                      className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Confirm Approval
                    </button>
                    <button
                      onClick={() => setShowQuotationResponse(false)}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Enter your preferred price range. The supervisor will review and provide a new quotation.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">Minimum (₱)</label>
                      <input
                        type="number"
                        value={priceRange.min}
                        onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Maximum (₱)</label>
                      <input
                        type="number"
                        value={priceRange.max}
                        onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleQuotationSubmit}
                      disabled={!priceRange.min || !priceRange.max}
                      className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Submit Price Range
                    </button>
                    <button
                      onClick={() => setShowQuotationResponse(false)}
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Price Range Request Feedback */}
          {request.status === 'PROCESSING' && request.quotationRejected && request.priceRange && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-sm text-amber-800">
                <span className="font-medium">Your requested price range:</span> ₱{request.priceRange.min?.toLocaleString()} - ₱{request.priceRange.max?.toLocaleString()}
              </p>
              <p className="text-xs text-amber-600 mt-1">Awaiting supervisor's revised quotation...</p>
            </div>
          )}
          
          {/* Pickup Schedule - Shows when in FOR_PICKUP status */}
          {request.status === 'FOR_PICKUP' && request.confirmedPickupDate && (
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
              <h4 className="text-sm font-medium text-purple-800 mb-2">Confirmed Pickup Schedule</h4>
              <p className="text-sm text-purple-700">
                Pickup scheduled for: <span className="font-semibold">{request.confirmedPickupDate} at {request.confirmedPickupTime}</span>
              </p>
            </div>
          )}
          
          {/* Rating Section - Shows when in DELIVERY_COMPLETED status */}
          {request.status === 'DELIVERY_COMPLETED' && (
            <div className="space-y-4 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <h4 className="text-sm font-medium text-emerald-800">Rate Your Delivery Experience</h4>
              {showRatingSuccess ? (
                <div className="text-center py-4">
                  <p className="text-emerald-600 font-medium">Thank you for your rating!</p>
                  <div className="flex justify-center mt-2">
                    <StarRating rating={rating} onRate={() => {}} readonly />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center">
                    <StarRating rating={rating} onRate={setRating} />
                    <p className="text-xs text-slate-500 mt-2">
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
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Submit Rating
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Request Card Component
function RequestCard({ request, onViewDetails }) {
  const status = statusConfig[request.status] || statusConfig.PENDING_REQUEST
  const itemLabel = request.itemType === 'other' 
    ? `Other: ${request.otherItemType}` 
    : itemTypes.find(i => i.value === request.itemType)?.label || request.itemType
  
  // Check if this specific request needs action (quotation pending approval)
  const needsAction = request.status === 'PROCESSING' && 
    request.quotation && 
    !request.quotationApproved && 
    !request.quotationRejected
  
  return (
    <div 
      className="rounded-3xl border border-emerald-200/70 bg-white p-6 hover:shadow-md transition-shadow cursor-pointer relative"
      onClick={() => onViewDetails(request)}
    >
      {/* Action Required Indicator */}
      {needsAction && (
        <div className="absolute top-4 right-4">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        </div>
      )}
      
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Request #{request.id}</p>
          <p className="text-sm font-medium text-slate-900">{itemLabel}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
          <span>{status.icon}</span>
          {status.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
        <div>
          <p className="font-medium text-slate-500">Pick Up</p>
          <p className="truncate">{request.pickupLocation}</p>
          <p>{request.pickupDate} at {request.pickupTime}</p>
        </div>
        <div>
          <p className="font-medium text-slate-500">Drop Off</p>
          <p className="truncate">{request.dropoffLocation}</p>
          <p>{request.dropoffDate} at {request.dropoffTime}</p>
        </div>
      </div>
      {needsAction && (
        <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <p className="text-xs font-semibold text-red-700">Action Required</p>
          </div>
          <p className="text-xs text-red-600">
            Quotation received: <span className="font-bold">₱{(typeof request.quotation === 'object' ? request.quotation.amount : request.quotation).toLocaleString()}</span> - Please approve or reject
          </p>
        </div>
      )}
      {!needsAction && request.quotation && request.status === 'PROCESSING' && (
        <div className="mt-4 p-3 bg-blue-50 rounded-xl">
          <p className="text-xs text-blue-700">
            Quotation received: <span className="font-bold">₱{(typeof request.quotation === 'object' ? request.quotation.amount : request.quotation).toLocaleString()}</span>
          </p>
        </div>
      )}
      {request.rating && (
        <div className="mt-4 flex items-center gap-1">
          <StarRating rating={request.rating} onRate={() => {}} readonly />
        </div>
      )}
    </div>
  )
}

function CustomerDeliveries() {
  const [showForm, setShowForm] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState({
    pickupDate: '',
    pickupTime: '',
    dropoffDate: '',
    dropoffTime: '',
    pickupLocation: '',
    dropoffLocation: '',
    truckType: '',
    itemType: '',
    otherItemType: '',
    notes: ''
  })
  
  // Sample delivery requests with different statuses for demo
  const [deliveryRequests, setDeliveryRequests] = useState([
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
  ])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const itemLabel = formData.itemType === 'other' 
      ? `Other: ${formData.otherItemType}` 
      : itemTypes.find(i => i.value === formData.itemType)?.label || formData.itemType
    
    const newRequest = {
      id: `DR-${Date.now()}`,
      ...formData,
      status: 'PENDING_REQUEST',
      createdAt: new Date().toISOString()
    }
    
    setDeliveryRequests(prev => [newRequest, ...prev])
    
    setFormData({
      pickupDate: '',
      pickupTime: '',
      dropoffDate: '',
      dropoffTime: '',
      pickupLocation: '',
      dropoffLocation: '',
      truckType: '',
      itemType: '',
      otherItemType: '',
      notes: ''
    })
    setShowForm(false)
  }

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
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-600 font-medium">
            Customer Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Deliveries
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Manage delivery requests and review current delivery statuses.
          </p>
        </header>

        {/* Request Delivery Button */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            {showForm ? 'Cancel' : '+ Request Delivery'}
          </button>
        </div>

        {/* Request Delivery Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-3xl border border-emerald-200/70 bg-white p-6 space-y-6">
            <h2 className="text-lg font-semibold text-slate-900">New Delivery Request</h2>

            {/* Schedule Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Schedule</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="pickupDate" className="text-sm font-medium text-slate-700">Pick Up Date</label>
                  <input
                    type="date"
                    id="pickupDate"
                    name="pickupDate"
                    value={formData.pickupDate}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="pickupTime" className="text-sm font-medium text-slate-700">Pick Up Time</label>
                  <input
                    type="time"
                    id="pickupTime"
                    name="pickupTime"
                    value={formData.pickupTime}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="dropoffDate" className="text-sm font-medium text-slate-700">Drop Off Date</label>
                  <input
                    type="date"
                    id="dropoffDate"
                    name="dropoffDate"
                    value={formData.dropoffDate}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="dropoffTime" className="text-sm font-medium text-slate-700">Drop Off Time</label>
                  <input
                    type="time"
                    id="dropoffTime"
                    name="dropoffTime"
                    value={formData.dropoffTime}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </div>

            {/* Location Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Location</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <LocationInput
                  id="pickupLocation"
                  label="Pick Up Location"
                  value={formData.pickupLocation}
                  onChange={handleChange}
                  required
                />
                <LocationInput
                  id="dropoffLocation"
                  label="Drop Off Location"
                  value={formData.dropoffLocation}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Truck and Item Type Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Delivery Details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="truckType" className="text-sm font-medium text-slate-700">Type of Truck</label>
                  <select
                    id="truckType"
                    name="truckType"
                    value={formData.truckType}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Select truck type</option>
                    {truckTypes.map(truck => (
                      <option key={truck.value} value={truck.value}>{truck.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="itemType" className="text-sm font-medium text-slate-700">Type of Item</label>
                  <select
                    id="itemType"
                    name="itemType"
                    value={formData.itemType}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Select item type</option>
                    {itemTypes.map(item => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Other Item Type Input - Shows when "Other Dry Goods" is selected */}
              {formData.itemType === 'other' && (
                <div className="space-y-2">
                  <label htmlFor="otherItemType" className="text-sm font-medium text-slate-700">
                    Specify Item Type <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="otherItemType"
                    name="otherItemType"
                    value={formData.otherItemType}
                    onChange={handleChange}
                    placeholder="Please specify the type of item..."
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Notes</label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Add any special instructions or notes for the delivery..."
                rows={4}
                className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Submit Request
              </button>
            </div>
          </form>
        )}

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
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

        {/* Tab Navigation - Individual Status Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 border-b border-slate-200 scrollbar-hide">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'all' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            All Requests
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'all' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {deliveryRequests.length}
            </span>
          </button>
          
          {/* Pending Request Tab */}
          <button
            onClick={() => setActiveTab('PENDING_REQUEST')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'PENDING_REQUEST' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <span className="relative">
              Pending Request
              {statusCounts.PENDING_REQUEST > 0 && (
                <span className="absolute -top-1 -right-3 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              )}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'PENDING_REQUEST' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
              {statusCounts.PENDING_REQUEST}
            </span>
          </button>
          
          {/* Processing Tab - Action Required */}
          <button
            onClick={() => setActiveTab('PROCESSING')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'PROCESSING' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <span className="relative">
              Processing
              {actionRequiredCount > 0 && (
                <span className="absolute -top-1 -right-3 flex">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'PROCESSING' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
              {statusCounts.PROCESSING}
            </span>
          </button>
          
          {/* For Pickup Tab */}
          <button
            onClick={() => setActiveTab('FOR_PICKUP')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'FOR_PICKUP' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            For Pickup
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'FOR_PICKUP' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
              {statusCounts.FOR_PICKUP}
            </span>
          </button>
          
          {/* Out for Delivery Tab */}
          <button
            onClick={() => setActiveTab('OUT_FOR_DELIVERY')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'OUT_FOR_DELIVERY' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Out for Delivery
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'OUT_FOR_DELIVERY' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
              {statusCounts.OUT_FOR_DELIVERY}
            </span>
          </button>
          
          {/* Delivered Tab */}
          <button
            onClick={() => setActiveTab('DELIVERED')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'DELIVERED' ? 'border-teal-500 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Delivered
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'DELIVERED' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>
              {statusCounts.DELIVERED}
            </span>
          </button>
          
          {/* Delivery Completed Tab */}
          <button
            onClick={() => setActiveTab('DELIVERY_COMPLETED')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'DELIVERY_COMPLETED' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Completed
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'DELIVERY_COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {statusCounts.DELIVERY_COMPLETED}
            </span>
          </button>
          
          {/* Cancelled Tab */}
          <button
            onClick={() => setActiveTab('CANCELLED')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'CANCELLED' ? 'border-red-500 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Cancelled
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
              {statusCounts.CANCELLED}
            </span>
          </button>
        </div>

        {/* Action Required Alert Banner */}
        {actionRequiredCount > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
            <div className="flex-shrink-0">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                Action Required: {actionRequiredCount} quotation{actionRequiredCount > 1 ? 's' : ''} pending your approval
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Please review and approve or reject the quotation(s) in the Processing tab to proceed with your delivery.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('PROCESSING')}
              className="flex-shrink-0 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
            >
              Review Now
            </button>
          </div>
        )}

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
