import { useState } from 'react'
import SupLayout from "../layout/SupLayout.jsx"
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  Package, Truck, Users, MapPin, Clock, DollarSign, CheckCircle,
  XCircle, AlertTriangle, ChevronRight, Search, Filter, Eye,
  Navigation, Route, BarChart3, MessageSquare, Send, User,
  Calendar, Phone, Mail, FileText, ArrowRight, X, Check
} from 'lucide-react'

// Fix default marker icon for Leaflet in React
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
})

// Custom markers
const createIcon = (color) => L.divIcon({
  className: 'custom-marker',
  html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
})

const pendingIcon = createIcon('#f59e0b')
const processingIcon = createIcon('#3b82f6')
const assignedIcon = createIcon('#8b5cf6')
const pickupIcon = createIcon('#06b6d4')
const deliveryIcon = createIcon('#10b981')
const completedIcon = createIcon('#22c55e')

// Mock data for demonstration
const mockDeliveryRequests = [
  {
    id: 'DEL-001',
    customerName: 'Juan Dela Cruz',
    customerEmail: 'juan.delacruz@email.com',
    customerPhone: '+639123456789',
    pickupAddress: '140 M. Suarez Avenue, Brgy. San Miguel, Pasig, Metro Manila',
    deliveryAddress: '123 Main Street, Brgy. Central, Quezon City, Metro Manila',
    truckType: '2T_DRY',
    itemType: 'Dry Food',
    weight: '500 kg',
    pickupDate: '2026-07-18',
    pickupTime: '09:00',
    status: 'PENDING',
    quotation: null,
    notes: 'Handle with care - fragile items',
    createdAt: '2026-07-16 10:30'
  },
  {
    id: 'DEL-002',
    customerName: 'Maria Santos',
    customerEmail: 'maria.santos@email.com',
    customerPhone: '+639987654321',
    pickupAddress: '456 Industrial Complex, Brgy. San Antonio, Makati',
    deliveryAddress: '789 Residential Area, Brgy. Poblacion, Muntinlupa',
    truckType: '1T_REF',
    itemType: 'Frozen Goods',
    weight: '200 kg',
    pickupDate: '2026-07-19',
    pickupTime: '14:00',
    status: 'PROCESSING',
    quotation: { amount: 3500, notes: 'Includes cold chain handling', validUntil: '2026-07-17' },
    notes: 'Temperature sensitive - maintain 4°C',
    createdAt: '2026-07-15 08:00'
  },
  {
    id: 'DEL-003',
    customerName: 'Roberto Reyes',
    customerEmail: 'roberto.reyes@email.com',
    customerPhone: '+639555123456',
    pickupAddress: '321 Warehouse District, Brgy. Valenzuela, Caloocan',
    deliveryAddress: '654 Business Park, Brgy. Bicutan, Parañaque',
    truckType: '4T_DRY',
    itemType: 'Construction Materials',
    weight: '1500 kg',
    pickupDate: '2026-07-20',
    pickupTime: '07:00',
    status: 'CONFIRMED',
    quotation: { amount: 5500, notes: 'Heavy cargo surcharge included', validUntil: '2026-07-18' },
    crew: { driver: null, helpers: [], truckType: '4T_DRY', plateNumber: null },
    notes: '',
    createdAt: '2026-07-14 14:00'
  },
  {
    id: 'DEL-004',
    customerName: 'Ana Lim',
    customerEmail: 'ana.lim@email.com',
    customerPhone: '+639444789012',
    pickupAddress: '88 Commercial Center, Brgy. Guadalupe Viejo, Makati',
    deliveryAddress: '22 Subdivision Road, Brgy. San Dionisio, Parañaque',
    truckType: 'AUV',
    itemType: 'Appliances',
    weight: '150 kg',
    pickupDate: '2026-07-17',
    pickupTime: '10:00',
    status: 'ASSIGNED',
    quotation: { amount: 1800, notes: '', validUntil: '2026-07-16' },
    crew: {
      driver: { id: 'DRV-001', name: 'Carlos Mendoza', phone: '+639123111222' },
      helpers: [
        { id: 'HLP-001', name: 'Pedro Garcia' },
        { id: 'HLP-002', name: 'Luis Torres' }
      ],
      truckType: 'AUV',
      plateNumber: 'ABC 1234'
    },
    notes: '',
    createdAt: '2026-07-13 09:00'
  },
  {
    id: 'DEL-005',
    customerName: 'Fernando Torres',
    customerEmail: 'fernando.torres@email.com',
    pickupAddress: '55 Factory Road, Brgy. Ugong, Valenzuela',
    deliveryAddress: '100 Shopping Mall, Brgy. Bf Homes, Parañaque',
    truckType: '2T_REF',
    itemType: 'Dairy Products',
    weight: '400 kg',
    pickupDate: '2026-07-16',
    pickupTime: '06:00',
    status: 'FOR_PICKUP',
    quotation: { amount: 4200, notes: '', validUntil: '2026-07-15' },
    crew: {
      driver: { id: 'DRV-002', name: 'Miguel Santos', phone: '+639123333444' },
      helpers: [{ id: 'HLP-003', name: 'Rico Aquino' }],
      truckType: '2T_REF',
      plateNumber: 'XYZ 5678'
    },
    notes: 'Perishable - urgent delivery required',
    createdAt: '2026-07-12 16:00'
  },
  {
    id: 'DEL-006',
    customerName: 'Elena Cruz',
    customerEmail: 'elena.cruz@email.com',
    pickupAddress: '200 Office Tower, Brgy. Bel-Air, Makati',
    deliveryAddress: '33 Hospital Road, Brgy. Santa Cruz, Las Piñas',
    truckType: 'L300',
    itemType: 'Pharmaceuticals',
    weight: '50 kg',
    pickupDate: '2026-07-15',
    pickupTime: '15:00',
    status: 'OUT_FOR_DELIVERY',
    quotation: { amount: 2500, notes: '', validUntil: '2026-07-14' },
    crew: {
      driver: { id: 'DRV-003', name: 'Ricardo Lopez', phone: '+639123555666' },
      helpers: [],
      truckType: 'L300',
      plateNumber: 'DEF 9012'
    },
    notes: 'Medical supplies - priority delivery',
    currentLocation: { lat: 14.5547, lng: 121.0244 },
    plannedRoute: [
      [14.5547, 121.0244], [14.5500, 121.0200], [14.5400, 121.0150],
      [14.5300, 121.0100], [14.5200, 121.0050]
    ],
    actualRoute: [
      [14.5547, 121.0244], [14.5520, 121.0220], [14.5480, 121.0180],
      [14.5420, 121.0140], [14.5350, 121.0100], [14.5280, 121.0060]
    ],
    createdAt: '2026-07-11 11:00'
  },
  {
    id: 'DEL-007',
    customerName: 'Gloria Martinez',
    customerEmail: 'gloria.martinez@email.com',
    pickupAddress: '77 Shopping Center, Brgy. Kapasigan, Pasig',
    deliveryAddress: '44 Neighborhood, Brgy. Moonwalk, Parañaque',
    truckType: '1T_DRY',
    itemType: 'Clothing',
    weight: '180 kg',
    pickupDate: '2026-07-14',
    pickupTime: '11:00',
    status: 'DELIVERED',
    quotation: { amount: 1500, notes: '', validUntil: '2026-07-13' },
    crew: {
      driver: { id: 'DRV-004', name: 'Antonio Reyes', phone: '+639123777888' },
      helpers: [{ id: 'HLP-004', name: 'Victor Cruz' }],
      truckType: '1T_DRY',
      plateNumber: 'GHI 3456'
    },
    notes: '',
    deliveredAt: '2026-07-14 14:30',
    actualRoute: [
      [14.5613, 121.0859], [14.5580, 121.0800], [14.5500, 121.0700],
      [14.5400, 121.0600], [14.5300, 121.0500]
    ],
    createdAt: '2026-07-10 08:00'
  }
]

const mockDrivers = [
  { id: 'DRV-001', name: 'Carlos Mendoza', phone: '+639123111222', license: 'CDL-001', status: 'available' },
  { id: 'DRV-002', name: 'Miguel Santos', phone: '+639123333444', license: 'CDL-002', status: 'available' },
  { id: 'DRV-003', name: 'Ricardo Lopez', phone: '+639123555666', license: 'CDL-003', status: 'on_delivery' },
  { id: 'DRV-004', name: 'Antonio Reyes', phone: '+639123777888', license: 'CDL-004', status: 'available' },
  { id: 'DRV-005', name: 'Eduardo Fernandez', phone: '+639123999000', license: 'CDL-005', status: 'available' }
]

const mockHelpers = [
  { id: 'HLP-001', name: 'Pedro Garcia' },
  { id: 'HLP-002', name: 'Luis Torres' },
  { id: 'HLP-003', name: 'Rico Aquino' },
  { id: 'HLP-004', name: 'Victor Cruz' },
  { id: 'HLP-005', name: 'Jerome Wong' },
  { id: 'HLP-006', name: 'Mark Dela Rosa' }
]

const mockVehicles = [
  { plateNumber: 'ABC 1234', truckType: 'AUV', status: 'available' },
  { plateNumber: 'XYZ 5678', truckType: '2T_REF', status: 'on_delivery' },
  { plateNumber: 'DEF 9012', truckType: 'L300', status: 'on_delivery' },
  { plateNumber: 'GHI 3456', truckType: '1T_DRY', status: 'available' },
  { plateNumber: 'JKL 7890', truckType: '2T_DRY', status: 'available' },
  { plateNumber: 'MNO 1111', truckType: '4T_DRY', status: 'available' }
]

const truckTypes = [
  { value: 'L300', label: 'L300' },
  { value: 'AUV', label: 'AUV' },
  { value: '1T_DRY', label: '1T DRY' },
  { value: '2T_DRY', label: '2T DRY' },
  { value: '1T_REF', label: '1T REF' },
  { value: '2T_REF', label: '2T REF' },
  { value: '4T_DRY', label: '4T DRY' },
  { value: '4T_REF', label: '4T REF' }
]

const statusConfig = {
  PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  PROCESSING: { label: 'Processing', color: 'bg-blue-100 text-blue-700', icon: FileText },
  SCHEDULE_SUGGESTED: { label: 'Schedule Suggested', color: 'bg-violet-100 text-violet-700', icon: Calendar },
  APPROVED: { label: 'Approved', color: 'bg-teal-100 text-teal-700', icon: CheckCircle },
  ASSIGNED: { label: 'Assigned', color: 'bg-indigo-100 text-indigo-700', icon: Users },
  FOR_PICKUP: { label: 'For Pickup', color: 'bg-cyan-100 text-cyan-700', icon: Package },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', color: 'bg-emerald-100 text-emerald-700', icon: Truck },
  DELIVERED: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: Check },
  COMPLETED: { label: 'Completed', color: 'bg-gray-100 text-gray-700', icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle }
}

function SupDeliveries() {
  const [activeTab, setActiveTab] = useState('requests')
  const [deliveries, setDeliveries] = useState(mockDeliveryRequests)
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [showQuotationModal, setShowQuotationModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showCrewModal, setShowCrewModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [quotationForm, setQuotationForm] = useState({ amount: '', notes: '', validUntil: '' })
  const [scheduleForm, setScheduleForm] = useState({ date: '', time: '', notes: '' })
  const [crewForm, setCrewForm] = useState({ driver: '', helpers: [], truckType: '', plateNumber: '' })

  // Tab configuration with their respective statuses
  const tabConfig = {
    requests: { label: 'Requests', statuses: ['PENDING', 'PROCESSING', 'SCHEDULE_SUGGESTED'] },
    assignCrew: { label: 'Assign Crew', statuses: ['APPROVED'] },
    tracking: { label: 'Live Tracking', statuses: ['FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
    all: { label: 'All Deliveries', statuses: [] } // empty means all statuses
  }

  // Status options available for each tab
  const getStatusOptionsForTab = (tabId) => {
    const options = []
    if (tabId === 'requests') {
      options.push(
        { value: 'PENDING', label: 'Pending' },
        { value: 'PROCESSING', label: 'Processing' },
        { value: 'SCHEDULE_SUGGESTED', label: 'Schedule Suggested' }
      )
    } else if (tabId === 'assignCrew') {
      options.push({ value: 'APPROVED', label: 'Approved' })
    } else if (tabId === 'tracking') {
      options.push(
        { value: 'FOR_PICKUP', label: 'For Pickup' },
        { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
        { value: 'DELIVERED', label: 'Delivered' }
      )
    } else {
      // All tab - show all statuses
      Object.entries(statusConfig).forEach(([key, val]) => {
        options.push({ value: key, label: val.label })
      })
    }
    return options
  }

  // Filter deliveries based on active tab and search
  const getFilteredDeliveries = () => {
    const tabStatuses = tabConfig[activeTab].statuses
    
    return deliveries.filter(d => {
      // Tab filter - if tab has statuses, filter by them; otherwise show all
      const matchesTab = tabStatuses.length === 0 || tabStatuses.includes(d.status)
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || d.status === statusFilter
      
      // Search filter
      const matchesSearch = searchQuery === '' || 
        d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.deliveryAddress.toLowerCase().includes(searchQuery.toLowerCase())
      
      return matchesTab && matchesStatus && matchesSearch
    })
  }

  // Get count for each tab
  const getTabCount = (tabId) => {
    const tabStatuses = tabConfig[tabId].statuses
    if (tabStatuses.length === 0) return deliveries.length
    return deliveries.filter(d => tabStatuses.includes(d.status)).length
  }

  // Reset status filter when changing tabs
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setStatusFilter('all')
  }

  const filteredDeliveries = getFilteredDeliveries()

  // Handle quotation submission
  const handleSendQuotation = (deliveryId) => {
    setDeliveries(prev => prev.map(d => 
      d.id === deliveryId 
        ? { ...d, status: 'PROCESSING', quotation: { ...quotationForm } }
        : d
    ))
    setShowQuotationModal(false)
    setQuotationForm({ amount: '', notes: '', validUntil: '' })
  }

  // Handle schedule negotiation
  const handleNegotiateSchedule = (deliveryId) => {
    setDeliveries(prev => prev.map(d => 
      d.id === deliveryId ? { ...d, pickupDate: scheduleForm.date, pickupTime: scheduleForm.time } : d
    ))
    setShowScheduleModal(false)
    setScheduleForm({ date: '', time: '', notes: '' })
  }

  // Handle accept/reject
  const handleAcceptRequest = (deliveryId) => {
    setDeliveries(prev => prev.map(d => 
      d.id === deliveryId ? { ...d, status: 'CONFIRMED' } : d
    ))
  }

  const handleRejectRequest = (deliveryId) => {
    setDeliveries(prev => prev.map(d => 
      d.id === deliveryId ? { ...d, status: 'CANCELLED' } : d
    ))
  }

  // Handle crew assignment
  const handleAssignCrew = (deliveryId) => {
    setDeliveries(prev => prev.map(d => 
      d.id === deliveryId 
        ? { ...d, status: 'ASSIGNED', crew: { ...crewForm } }
        : d
    ))
    setShowCrewModal(false)
    setCrewForm({ driver: '', helpers: [], truckType: '', plateNumber: '' })
  }

  // Open modals
  const openQuotationModal = (delivery) => {
    setSelectedDelivery(delivery)
    setShowQuotationModal(true)
  }

  const openScheduleModal = (delivery) => {
    setSelectedDelivery(delivery)
    setScheduleForm({ date: delivery.pickupDate, time: delivery.pickupTime, notes: '' })
    setShowScheduleModal(true)
  }

  const openCrewModal = (delivery) => {
    setSelectedDelivery(delivery)
    setCrewForm({
      driver: '',
      helpers: [],
      truckType: delivery.truckType,
      plateNumber: ''
    })
    setShowCrewModal(true)
  }

  const openDetailModal = (delivery) => {
    setSelectedDelivery(delivery)
    setShowDetailModal(true)
  }

  // Get available drivers for dropdown
  const getAvailableDrivers = () => mockDrivers.filter(d => d.status === 'available')

  // Get available helpers for dropdown
  const getAvailableHelpers = () => mockHelpers

  // Get available vehicles for dropdown
  const getAvailableVehicles = (type) => mockVehicles.filter(v => v.truckType === type && v.status === 'available')

  return (
    <SupLayout title="Deliveries" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Delivery Management
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Process delivery requests, assign crews, and monitor deliveries in real-time.
          </p>
        </header>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
          {[
            { id: 'requests', label: 'Requests', icon: FileText },
            { id: 'assignCrew', label: 'Assign Crew', icon: Users },
            { id: 'tracking', label: 'Live Tracking', icon: MapPin },
            { id: 'all', label: 'All Deliveries', icon: Package }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-blue-500' : 'bg-gray-100'
              }`}>
                {getTabCount(tab.id)}
              </span>
            </button>
          ))}
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by ID, customer name, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 outline-none bg-white"
          >
            <option value="all">All Status</option>
            {getStatusOptionsForTab(activeTab).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Delivery List */}
        <div className="grid gap-4">
          {filteredDeliveries.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No deliveries found</p>
            </div>
          ) : (
            filteredDeliveries.map(delivery => {
              const StatusIcon = statusConfig[delivery.status]?.icon || Clock
              return (
                <div
                  key={delivery.id}
                  onClick={() => openDetailModal(delivery)}
                  className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Delivery Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-slate-800">{delivery.id}</span>
                        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[delivery.status]?.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusConfig[delivery.status]?.label}
                        </span>
                        {delivery.actionRequired && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full animate-pulse">
                            Action Required
                          </span>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wide">Customer</p>
                          <p className="font-medium text-slate-800">{delivery.customerName}</p>
                          <p className="text-slate-600 text-xs">{delivery.customerPhone}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wide">Pickup</p>
                          <p className="text-slate-800 text-xs">{delivery.pickupAddress}</p>
                          <p className="text-slate-600 text-xs">{delivery.pickupDate} at {delivery.pickupTime}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wide">Delivery</p>
                          <p className="text-slate-800 text-xs">{delivery.deliveryAddress}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs uppercase tracking-wide">Details</p>
                          <p className="text-slate-800 text-xs">{delivery.truckType} • {delivery.weight} • {delivery.itemType}</p>
                        </div>
                      </div>
                      {delivery.quotation && (
                        <div className="mt-3 p-3 bg-emerald-50 rounded-lg">
                          <p className="text-emerald-700 text-sm font-medium">
                            Quotation: ₱{delivery.quotation.amount.toLocaleString()}
                            {delivery.quotation.notes && ` - ${delivery.quotation.notes}`}
                          </p>
                        </div>
                      )}
                      {delivery.crew && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                          <p className="text-blue-700 text-sm">
                            <span className="font-medium">Crew Assigned:</span> {delivery.crew.driver?.name || 'TBA'}
                            {delivery.crew.helpers?.length > 0 && ` + ${delivery.crew.helpers.length} helper(s)`}
                            {delivery.crew.plateNumber && ` • ${delivery.crew.plateNumber}`}
                          </p>
                        </div>
                      )}
                      {delivery.scheduleProposal && (
                        <div className="mt-3 p-3 bg-violet-50 rounded-lg border border-violet-200">
                          <p className="text-violet-700 text-sm">
                            <span className="font-medium">Schedule Proposed:</span> {delivery.scheduleProposal.date} at {delivery.scheduleProposal.time}
                            {delivery.scheduleProposal.notes && ` - ${delivery.scheduleProposal.notes}`}
                          </p>
                          <p className="text-violet-600 text-xs mt-1">Awaiting customer response</p>
                        </div>
                      )}
                    </div>

                    {/* View Details Button */}
                    <div className="flex items-center gap-2 lg:flex-col lg:items-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openDetailModal(delivery)
                        }}
                        className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Quotation Modal */}
      {showQuotationModal && selectedDelivery && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">Send Quotation</h2>
              <button onClick={() => setShowQuotationModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Sending quotation for {selectedDelivery.id}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₱)</label>
                <input
                  type="number"
                  value={quotationForm.amount}
                  onChange={(e) => setQuotationForm({...quotationForm, amount: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={quotationForm.notes}
                  onChange={(e) => setQuotationForm({...quotationForm, notes: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                  rows="3"
                  placeholder="Additional notes..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
                <input
                  type="date"
                  value={quotationForm.validUntil}
                  onChange={(e) => setQuotationForm({...quotationForm, validUntil: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowQuotationModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-slate-700 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSendQuotation(selectedDelivery.id)}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send Quote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Negotiation Modal */}
      {showScheduleModal && selectedDelivery && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">Negotiate Schedule</h2>
              <button onClick={() => setShowScheduleModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Current: {selectedDelivery.pickupDate} at {selectedDelivery.pickupTime}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Date</label>
                <input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(e) => setScheduleForm({...scheduleForm, date: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Time</label>
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm({...scheduleForm, time: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({...scheduleForm, notes: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                  rows="3"
                  placeholder="Reason for schedule change..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-slate-700 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleNegotiateSchedule(selectedDelivery.id)}
                className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                Send Proposal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crew Assignment Modal */}
      {showCrewModal && selectedDelivery && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">Assign Delivery Crew</h2>
              <button onClick={() => setShowCrewModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Assign crew for {selectedDelivery.id}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Driver *</label>
                <select
                  value={crewForm.driver}
                  onChange={(e) => setCrewForm({...crewForm, driver: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
                >
                  <option value="">Select Driver</option>
                  {getAvailableDrivers().map(driver => (
                    <option key={driver.id} value={JSON.stringify(driver)}>{driver.name} - {driver.phone}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Helpers (1-2 required)</label>
                <div className="space-y-2">
                  {getAvailableHelpers().map(helper => (
                    <label key={helper.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={crewForm.helpers.some(h => h.id === helper.id)}
                        onChange={(e) => {
                          if (e.target.checked && crewForm.helpers.length < 2) {
                            setCrewForm({...crewForm, helpers: [...crewForm.helpers, helper]})
                          } else if (!e.target.checked) {
                            setCrewForm({...crewForm, helpers: crewForm.helpers.filter(h => h.id !== helper.id)})
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                        disabled={!crewForm.helpers.some(h => h.id === helper.id) && crewForm.helpers.length >= 2}
                      />
                      <span className="text-sm text-slate-700">{helper.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">Select 1-2 helpers</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Truck Type</label>
                <select
                  value={crewForm.truckType}
                  onChange={(e) => setCrewForm({...crewForm, truckType: e.target.value, plateNumber: ''})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
                >
                  {truckTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Plate Number *</label>
                <select
                  value={crewForm.plateNumber}
                  onChange={(e) => setCrewForm({...crewForm, plateNumber: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
                >
                  <option value="">Select Vehicle</option>
                  {getAvailableVehicles(crewForm.truckType).map(vehicle => (
                    <option key={vehicle.plateNumber} value={vehicle.plateNumber}>{vehicle.plateNumber}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCrewModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-slate-700 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAssignCrew(selectedDelivery.id)}
                disabled={!crewForm.driver || !crewForm.plateNumber || crewForm.helpers.length === 0}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Users className="w-4 h-4" />
                Assign Crew
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal with Route Deviation & Analytics */}
      {showDetailModal && selectedDelivery && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{selectedDelivery.id} - Delivery Details</h2>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium mt-1 ${statusConfig[selectedDelivery.status]?.color}`}>
                  {statusConfig[selectedDelivery.status]?.label}
                </span>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Left Column - Info */}
              <div className="space-y-4">
                {/* Customer Info */}
                <div className="p-4 bg-gray-50 rounded-xl">
                  <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Customer Information
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Name:</span> {selectedDelivery.customerName}</p>
                    <p><span className="text-gray-500">Email:</span> {selectedDelivery.customerEmail}</p>
                    <p><span className="text-gray-500">Phone:</span> {selectedDelivery.customerPhone}</p>
                  </div>
                </div>

                {/* Route Info */}
                <div className="p-4 bg-gray-50 rounded-xl">
                  <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <Route className="w-4 h-4" />
                    Route Information
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs uppercase">Pickup</p>
                      <p className="text-slate-800">{selectedDelivery.pickupAddress}</p>
                      <p className="text-slate-600">{selectedDelivery.pickupDate} at {selectedDelivery.pickupTime}</p>
                    </div>
                    <div className="border-l-2 border-dashed border-gray-300 ml-2 pl-4">
                      <p className="text-gray-500 text-xs uppercase">Delivery</p>
                      <p className="text-slate-800">{selectedDelivery.deliveryAddress}</p>
                    </div>
                  </div>
                </div>

                {/* Cargo Info */}
                <div className="p-4 bg-gray-50 rounded-xl">
                  <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Cargo Details
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p><span className="text-gray-500">Truck:</span> {selectedDelivery.truckType}</p>
                    <p><span className="text-gray-500">Weight:</span> {selectedDelivery.weight}</p>
                    <p><span className="text-gray-500">Type:</span> {selectedDelivery.itemType}</p>
                    <p><span className="text-gray-500">Notes:</span> {selectedDelivery.notes || 'None'}</p>
                  </div>
                </div>

                {/* Crew Info */}
                {selectedDelivery.crew && (
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Assigned Crew
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-blue-600" />
                        <span>Driver: {selectedDelivery.crew.driver?.name || 'Not assigned'}</span>
                      </div>
                      {selectedDelivery.crew.helpers?.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-600" />
                          <span>Helpers: {selectedDelivery.crew.helpers.map(h => h.name).join(', ')}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Vehicle:</span>
                        <span>{selectedDelivery.crew.plateNumber || 'Not assigned'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pricing */}
                {selectedDelivery.quotation && (
                  <div className="p-4 bg-emerald-50 rounded-xl">
                    <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Quotation
                    </h3>
                    <p className="text-2xl font-bold text-emerald-700">₱{selectedDelivery.quotation.amount.toLocaleString()}</p>
                    {selectedDelivery.quotation.notes && <p className="text-sm text-slate-600">{selectedDelivery.quotation.notes}</p>}
                  </div>
                )}
              </div>

              {/* Right Column - Map & Analytics */}
              <div className="space-y-4">
                {/* Route Deviation Monitoring */}
                <div className="p-4 bg-orange-50 rounded-xl">
                  <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Route className="w-4 h-4" />
                    Route Deviation Monitoring
                  </h3>
                  <div className="h-48 rounded-lg overflow-hidden border border-gray-200">
                    <MapContainer
                      center={selectedDelivery.currentLocation ? [selectedDelivery.currentLocation.lat, selectedDelivery.currentLocation.lng] : [14.5995, 120.9842]}
                      zoom={12}
                      className="h-full w-full"
                    >
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      {selectedDelivery.plannedRoute && (
                        <Polyline
                          positions={selectedDelivery.plannedRoute}
                          pathOptions={{ color: '#3b82f6', weight: 4, dashArray: '10, 10' }}
                        />
                      )}
                      {selectedDelivery.actualRoute && (
                        <Polyline
                          positions={selectedDelivery.actualRoute}
                          pathOptions={{ color: '#22c55e', weight: 4 }}
                        />
                      )}
                      {selectedDelivery.currentLocation && (
                        <Marker position={[selectedDelivery.currentLocation.lat, selectedDelivery.currentLocation.lng]} icon={deliveryIcon}>
                          <Popup>Current Location</Popup>
                        </Marker>
                      )}
                    </MapContainer>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-1 bg-blue-500 rounded"></div>
                      <span>Planned Route</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-1 bg-green-500 rounded"></div>
                      <span>Actual Route</span>
                    </div>
                  </div>
                  {selectedDelivery.plannedRoute && selectedDelivery.actualRoute && (
                    <div className="mt-3 p-2 bg-white rounded-lg">
                      <p className="text-sm font-medium text-slate-700">Deviation Analysis</p>
                      <p className="text-xs text-slate-600">
                        Route deviation: {selectedDelivery.actualRoute.length > selectedDelivery.plannedRoute.length ? '+' : ''}
                        {(selectedDelivery.actualRoute.length - selectedDelivery.plannedRoute.length) * 0.5} km from planned path
                      </p>
                    </div>
                  )}
                </div>

                {/* Driver Analytics */}
                {selectedDelivery.crew?.driver && (
                  <div className="p-4 bg-purple-50 rounded-xl">
                    <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Driver Analytics - {selectedDelivery.crew.driver.name}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-gray-500">Total Deliveries</p>
                        <p className="text-xl font-bold text-slate-800">156</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-gray-500">On-Time Rate</p>
                        <p className="text-xl font-bold text-emerald-600">94%</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-gray-500">Avg. Delivery Time</p>
                        <p className="text-xl font-bold text-slate-800">2.4h</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-gray-500">Safety Score</p>
                        <p className="text-xl font-bold text-blue-600">98%</p>
                      </div>
                    </div>
                    <div className="mt-3 p-2 bg-white rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Performance Trend</p>
                      <div className="flex items-end gap-1 h-8">
                        {[65, 72, 68, 78, 82, 88, 94].map((val, i) => (
                          <div key={i} className="flex-1 bg-purple-300 rounded-t" style={{ height: `${val}%` }}></div>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Last 7 days performance improving</p>
                    </div>
                  </div>
                )}

                {/* Delivery Timeline */}
                <div className="p-4 bg-gray-50 rounded-xl">
                  <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Delivery Timeline
                  </h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Request Created', time: selectedDelivery.createdAt, done: true },
                      { label: 'Quotation Sent', time: selectedDelivery.quotation ? 'Sent' : 'Pending', done: !!selectedDelivery.quotation },
                      { label: 'Request Confirmed', time: selectedDelivery.status !== 'PENDING' && selectedDelivery.status !== 'PROCESSING' ? 'Confirmed' : 'Pending', done: !['PENDING', 'PROCESSING'].includes(selectedDelivery.status) },
                      { label: 'Crew Assigned', time: selectedDelivery.crew?.driver ? 'Assigned' : 'Pending', done: !!selectedDelivery.crew?.driver },
                      { label: 'Picked Up', time: ['FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(selectedDelivery.status) ? 'Completed' : 'Pending', done: ['FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(selectedDelivery.status) },
                      { label: 'Delivered', time: selectedDelivery.deliveredAt || 'Pending', done: ['DELIVERED', 'COMPLETED'].includes(selectedDelivery.status) }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${item.done ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                          {item.done && <Check className="w-4 h-4 text-white" />}
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm ${item.done ? 'text-slate-800' : 'text-gray-400'}`}>{item.label}</p>
                          <p className="text-xs text-gray-500">{item.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              {/* Status-based Action Buttons */}
              {['PENDING', 'PROCESSING'].includes(selectedDelivery.status) && !selectedDelivery.scheduleProposal && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setShowDetailModal(false)
                      openScheduleModal(selectedDelivery)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700"
                  >
                    <Calendar className="w-4 h-4" />
                    Suggest Schedule
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailModal(false)
                      openQuotationModal(selectedDelivery)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
                  >
                    <DollarSign className="w-4 h-4" />
                    Submit Quotation
                  </button>
                  <button
                    onClick={() => {
                      handleRejectRequest(selectedDelivery.id)
                      setShowDetailModal(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                    Cancel Request
                  </button>
                </div>
              )}

              {/* Schedule Suggested - Awaiting customer response */}
              {selectedDelivery.status === 'SCHEDULE_SUGGESTED' && (
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-100 text-violet-700 rounded-xl">
                    <Clock className="w-4 h-4" />
                    Awaiting Customer Response
                  </div>
                  <button
                    onClick={() => {
                      setShowDetailModal(false)
                      openQuotationModal(selectedDelivery)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
                  >
                    <DollarSign className="w-4 h-4" />
                    Submit Quotation
                  </button>
                </div>
              )}

              {/* APPROVED - Ready to assign crew */}
              {selectedDelivery.status === 'APPROVED' && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setShowDetailModal(false)
                      openCrewModal(selectedDelivery)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                  >
                    <Users className="w-4 h-4" />
                    Assign Crew
                  </button>
                </div>
              )}

              {/* FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED - Track */}
              {['FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(selectedDelivery.status) && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      // Switch to tracking tab and highlight this delivery
                      setActiveTab('tracking')
                      setShowDetailModal(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700"
                  >
                    <MapPin className="w-4 h-4" />
                    Track Delivery
                  </button>
                </div>
              )}

              {/* ASSIGNED - Show crew info */}
              {selectedDelivery.status === 'ASSIGNED' && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      setActiveTab('tracking')
                      setShowDetailModal(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700"
                  >
                    <Truck className="w-4 h-4" />
                    View Assignment
                  </button>
                </div>
              )}

              {/* Default close button */}
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-6 py-2.5 border border-gray-200 text-slate-700 rounded-xl hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </SupLayout>
  )
}

export default SupDeliveries
