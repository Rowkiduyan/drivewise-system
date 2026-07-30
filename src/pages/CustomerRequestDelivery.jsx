import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Box, Check, CheckCircle2, Clock, MapPin, Package, Ruler, Search, Thermometer, X
} from 'lucide-react'
import CustomerLayout from '../layout/CustomerLayout.jsx'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  truckTypes,
  itemTypes,
  getTruckAvailability,
  getRecommendedTruckValue,
  MIN_SCHEDULING_DAYS,
  getMinDeliveryDate,
  getScheduleErrors,
  getBudgetError
} from '../lib/deliveryOptions.js'

// Fix default marker icon for Leaflet in React
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
})

const background = null

// Map controller — handles view changes, map clicks, and draggable marker
function MapController({ center, zoom, selectedLocation, onLocationChange }) {
  const map = useMap()

  useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom(), { animate: true })
    }
  }, [center, zoom, map])

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng
      onLocationChange(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng)
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(res => res.json())
        .then(data => {
          if (data.display_name) onLocationChange(data.display_name, lat, lng)
        })
        .catch(() => {})
    }
  })

  if (!selectedLocation) return null

  return (
    <Marker
      position={[selectedLocation.lat, selectedLocation.lon]}
      draggable={true}
      eventHandlers={{
        dragend(e) {
          const { lat, lng } = e.target.getLatLng()
          onLocationChange(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng)
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
            .then(res => res.json())
            .then(data => {
              if (data.display_name) onLocationChange(data.display_name, lat, lng)
            })
            .catch(() => {})
        }
      }}
    />
  )
}

// Location Picker Modal Component
function LocationPickerModal({ isOpen, onClose, onSelect }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [mapCenter, setMapCenter] = useState([14.5995, 120.9842])
  const [mapZoom, setMapZoom] = useState(13)

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
    setSelectedLocation({ display: suggestion.display, lat: suggestion.lat, lon: suggestion.lon })
    setMapCenter([suggestion.lat, suggestion.lon])
    setMapZoom(16)
    setSuggestions([])
    setSearchQuery('')
  }

  const handleLocationChange = (display, lat, lng) => {
    setSelectedLocation({ display, lat, lon: lng })
  }

  const handleConfirm = () => {
    if (selectedLocation) {
      onSelect(selectedLocation.display)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-3xl rounded-3xl border border-emerald-200/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between rounded-t-3xl border-b border-emerald-200/70 bg-white p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Location Picker</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Pick Location on Map</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a location in Philippines..."
              className="w-full rounded-xl border border-emerald-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-emerald-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-[9999]">
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
          <div className="h-72 rounded-xl overflow-hidden border border-emerald-200">
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapController
                center={mapCenter}
                zoom={mapZoom}
                selectedLocation={selectedLocation}
                onLocationChange={handleLocationChange}
              />
            </MapContainer>
          </div>

          {/* Selected Location Display */}
          {selectedLocation && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <MapPin className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-emerald-700">Selected Location</p>
                <p className="text-sm text-emerald-900 mt-0.5 break-words">{selectedLocation.display}</p>
                <p className="text-xs text-emerald-600 mt-0.5 font-mono">
                  {selectedLocation.lat?.toFixed(6)}, {selectedLocation.lon?.toFixed(6)}
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center">
            Click on the map, drag the marker, or search above to pin a location
          </p>
        </div>

        <div className="flex justify-end gap-3 rounded-b-3xl border-t border-emerald-200/70 bg-white p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-emerald-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-emerald-50"
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
      />
    </div>
  )
}

function CustomerRequestDelivery() {
  const navigate = useNavigate()
  const [dateError, setDateError] = useState('')
  const [dropoffDateError, setDropoffDateError] = useState('')
  const [dropoffTimeError, setDropoffTimeError] = useState('')
  const [budgetError, setBudgetError] = useState('')
  const [truckSelectionError, setTruckSelectionError] = useState('')
  const minDeliveryDate = getMinDeliveryDate()
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
    cargoWeight: '',
    budgetMin: '',
    budgetMax: '',
    notes: ''
  })
  const recommendedTruckValue = getRecommendedTruckValue(formData.itemType, formData.cargoWeight)

  // Recommended truck first, then other compatible trucks, then unavailable ones last
  const sortedTruckTypes = [...truckTypes].sort((a, b) => {
    const rank = (truck) => {
      if (truck.value === recommendedTruckValue) return 0
      return getTruckAvailability(truck, formData.itemType, formData.cargoWeight).available ? 1 : 2
    }
    return rank(a) - rank(b)
  })

  const goBackToDeliveries = () => navigate('/customer/deliveries')

  const handleChange = (e) => {
    const { name, value } = e.target
    const next = { ...formData, [name]: value }

    if (name === 'pickupDate') {
      setDateError(value && value < minDeliveryDate ? `Delivery date must be on or after ${minDeliveryDate}.` : '')
    }

    if (['pickupDate', 'pickupTime', 'dropoffDate', 'dropoffTime'].includes(name)) {
      const { dropoffDateError, dropoffTimeError } = getScheduleErrors(next)
      setDropoffDateError(dropoffDateError)
      setDropoffTimeError(dropoffTimeError)
    }

    if (name === 'budgetMin' || name === 'budgetMax') {
      setBudgetError(getBudgetError(next))
    }

    if (name === 'itemType' || name === 'cargoWeight') {
      const selectedTruck = truckTypes.find(t => t.value === next.truckType)
      if (selectedTruck && !getTruckAvailability(selectedTruck, next.itemType, next.cargoWeight).available) {
        next.truckType = ''
        setTruckSelectionError('')
      }
    }

    setFormData(next)
  }

  const handleTruckSelect = (truck) => {
    if (!getTruckAvailability(truck, formData.itemType, formData.cargoWeight).available) return
    setFormData(prev => ({ ...prev, truckType: truck.value }))
    setTruckSelectionError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (formData.pickupDate < minDeliveryDate) {
      setDateError(`Delivery date must be on or after ${minDeliveryDate}.`)
      return
    }

    const { dropoffDateError, dropoffTimeError } = getScheduleErrors(formData)
    if (dropoffDateError || dropoffTimeError) {
      setDropoffDateError(dropoffDateError)
      setDropoffTimeError(dropoffTimeError)
      return
    }

    const budgetErrorMessage = getBudgetError(formData)
    if (budgetErrorMessage) {
      setBudgetError(budgetErrorMessage)
      return
    }

    if (!formData.truckType) {
      setTruckSelectionError('Please select a truck for this delivery.')
      return
    }

    const newRequest = {
      id: `DR-${Date.now()}`,
      ...formData,
      status: 'PENDING_REQUEST',
      createdAt: new Date().toISOString()
    }

    navigate('/customer/deliveries', { state: { newRequest } })
  }

  return (
    <CustomerLayout title="Request Delivery" background={background}>
      <div className="flex flex-col gap-6 mb-2">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <Link
            to="/customer/deliveries"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Deliveries
          </Link>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Request Delivery
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Fill out the details below to submit a new delivery request for review.
          </p>
        </header>

        <div className="rounded-2xl border border-emerald-200/70 bg-white p-5 shadow-sm sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Schedule Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Schedule</h3>

              <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <Clock className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  Deliveries must be scheduled at least <span className="font-semibold">{MIN_SCHEDULING_DAYS} days in advance</span>. The earliest available date is <span className="font-semibold">{minDeliveryDate}</span>.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="relative space-y-2">
                  <label htmlFor="pickupDate" className="text-sm font-medium text-slate-700">Pick Up Date</label>
                  <input
                    type="date"
                    id="pickupDate"
                    name="pickupDate"
                    value={formData.pickupDate}
                    onChange={handleChange}
                    min={minDeliveryDate}
                    required
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                      dateError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                  {dateError && (
                    <p className="absolute left-0 top-full mt-1 text-xs text-red-600">{dateError}</p>
                  )}
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
                <div className="relative space-y-2">
                  <label htmlFor="dropoffDate" className="text-sm font-medium text-slate-700">Drop Off Date</label>
                  <input
                    type="date"
                    id="dropoffDate"
                    name="dropoffDate"
                    value={formData.dropoffDate}
                    onChange={handleChange}
                    min={formData.pickupDate || minDeliveryDate}
                    required
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                      dropoffDateError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                  {dropoffDateError && (
                    <p className="absolute left-0 top-full mt-1 text-xs text-red-600">{dropoffDateError}</p>
                  )}
                </div>
                <div className="relative space-y-2">
                  <label htmlFor="dropoffTime" className="text-sm font-medium text-slate-700">Drop Off Time</label>
                  <input
                    type="time"
                    id="dropoffTime"
                    name="dropoffTime"
                    value={formData.dropoffTime}
                    onChange={handleChange}
                    min={formData.dropoffDate === formData.pickupDate ? formData.pickupTime : undefined}
                    required
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                      dropoffTimeError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                  {dropoffTimeError && (
                    <p className="absolute left-0 top-full mt-1 text-xs text-red-600">{dropoffTimeError}</p>
                  )}
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

            {/* Cargo Details Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Cargo Details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
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
                <div className="space-y-2">
                  <label htmlFor="cargoWeight" className="text-sm font-medium text-slate-700">Estimated Cargo Weight (kg)</label>
                  <input
                    type="number"
                    id="cargoWeight"
                    name="cargoWeight"
                    min="1"
                    value={formData.cargoWeight}
                    onChange={handleChange}
                    placeholder="e.g. 800"
                    required
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Other Item Type Input */}
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

            {/* Truck Selection Section */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Truck Selection</h3>
                {recommendedTruckValue && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    We recommend the highlighted truck below
                  </span>
                )}
              </div>

              {!formData.itemType ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Select an item type and estimated cargo weight above to see compatible trucks.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-emerald-200/70">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-emerald-200/70 bg-emerald-50/60 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3 font-medium">Truck</th>
                          <th className="px-4 py-3 font-medium">Type</th>
                          <th className="px-4 py-3 font-medium">Max Payload</th>
                          <th className="px-4 py-3 font-medium">Dimensions</th>
                          <th className="px-4 py-3 font-medium">Select</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedTruckTypes.map(truck => {
                          const { available, reason } = getTruckAvailability(truck, formData.itemType, formData.cargoWeight)
                          const isSelected = formData.truckType === truck.value
                          const isRecommended = recommendedTruckValue === truck.value

                          return (
                            <tr
                              key={truck.value}
                              onClick={() => handleTruckSelect(truck)}
                              className={`transition ${
                                !available
                                  ? 'cursor-not-allowed bg-slate-50 opacity-60'
                                  : isSelected
                                    ? 'cursor-pointer bg-emerald-50'
                                    : isRecommended
                                      ? 'cursor-pointer bg-emerald-50/40 hover:bg-emerald-50'
                                      : 'cursor-pointer bg-white hover:bg-emerald-50/50'
                              }`}
                            >
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">{truck.label}</span>
                                  {isRecommended && available && (
                                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                      Recommended
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 max-w-xs text-xs text-slate-500 leading-relaxed">{truck.description}</p>
                                {!available && (
                                  <p className="mt-1 text-[11px] font-medium text-red-500">{reason}</p>
                                )}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                                  truck.category === 'reefer' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {truck.category === 'reefer' ? <Thermometer className="h-3 w-3" /> : <Box className="h-3 w-3" />}
                                  {truck.category === 'reefer' ? 'Refrigerated' : 'Dry'}
                                </span>
                              </td>
                              <td className="px-4 py-3 align-top text-slate-700">
                                <div className="flex items-center gap-1.5">
                                  <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  {truck.payloadKg.toLocaleString()} kg
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top text-slate-700">
                                <div className="flex items-center gap-1.5">
                                  <Ruler className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  {truck.dimensions}
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                                  !available
                                    ? 'border-slate-300'
                                    : isSelected
                                      ? 'border-emerald-600 bg-emerald-600'
                                      : 'border-slate-300'
                                }`}>
                                  {isSelected && available && <Check className="h-3 w-3 text-white" />}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {truckSelectionError && (
                    <p className="text-xs text-red-600">{truckSelectionError}</p>
                  )}
                </>
              )}
            </div>

            {/* Budget Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Budget Range</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your preferred budget range. The final quotation will be discussed with the supervisor.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="budgetMin" className="text-sm font-medium text-slate-700">Minimum Budget (₱)</label>
                  <input
                    type="number"
                    id="budgetMin"
                    name="budgetMin"
                    min="0"
                    value={formData.budgetMin}
                    onChange={handleChange}
                    placeholder="e.g. 5000"
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                      budgetError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
                <div className="relative space-y-2">
                  <label htmlFor="budgetMax" className="text-sm font-medium text-slate-700">Maximum Budget (₱)</label>
                  <input
                    type="number"
                    id="budgetMax"
                    name="budgetMax"
                    min="0"
                    value={formData.budgetMax}
                    onChange={handleChange}
                    placeholder="e.g. 10000"
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                      budgetError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                    }`}
                  />
                  {budgetError && (
                    <p className="absolute left-0 top-full mt-1 text-xs text-red-600">{budgetError}</p>
                  )}
                </div>
              </div>
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

            {/* Actions */}
            <div className="flex justify-end gap-3 border-t border-emerald-200/70 pt-4">
              <button
                type="button"
                onClick={goBackToDeliveries}
                className="rounded-xl border border-emerald-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-emerald-50"
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
        </div>
      </div>
    </CustomerLayout>
  )
}

export default CustomerRequestDelivery
