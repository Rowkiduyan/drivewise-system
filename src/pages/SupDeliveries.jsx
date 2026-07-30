import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Calendar,
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
} from 'lucide-react'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import SupLayout from '../layout/SupLayout.jsx'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

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

const deliverySteps = [
  'REQUEST_CREATED',
  'QUOTATION_SENT',
  'CREW_ASSIGNED',
  'PICKUP',
  'DELIVERED',
]

const statusByStep = {
  FOR_REVIEW: 'REQUEST_CREATED',
  QUOTED: 'QUOTATION_SENT',
  COUNTER_OFFER: 'QUOTATION_SENT',
  UPDATED_QUOTATION: 'QUOTATION_SENT',
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
  FOR_REVIEW: 'bg-amber-100 text-amber-700',
  QUOTED: 'bg-sky-100 text-sky-700',
  COUNTER_OFFER: 'bg-orange-100 text-orange-700',
  UPDATED_QUOTATION: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-teal-100 text-teal-700',
  ASSIGNED: 'bg-indigo-100 text-indigo-700',
  FOR_PICKUP: 'bg-cyan-100 text-cyan-700',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-700',
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
function getPriceRange(r) {
  if (r.quotation?.amount) return `₱${r.quotation.amount.toLocaleString()}`
  return '—'
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

const stageStatus = {
  FOR_REVIEW: 0,
  QUOTED: 1,
  COUNTER_OFFER: 1,
  UPDATED_QUOTATION: 1,
  APPROVED: 2,
  ASSIGNED: 2,
  FOR_PICKUP: 3,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  COMPLETED: 4,
  CANCELLED: -1,
}

function buildProgressData(request) {
  const idx = stageStatus[request.status] ?? 0
  const registeredAt = request.createdAt
  const now = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  const stages = [
    {
      key: 'review',
      label: 'Reviewing Delivery Request',
      completedLabel: 'Reviewed Delivery Request',
      substeps: [
        { label: 'Request Received', detail: registeredAt, cancelPoint: request.status === 'CANCELLED', cancelReason: 'Cancelled by supervisor' },
      ],
    },
    {
      key: 'quotation',
      label: 'Negotiating Quotation',
      completedLabel: 'Quotation Approved',
      substeps: [
        { label: 'Initial Quotation Sent', detail: request.quotation ? `by Supervisor · ${registeredAt}` : null },
        { label: 'Customer Quotation Bid Received', detail: request.customerWants ? `· ${registeredAt}` : null, cancelPoint: false },
        { label: 'Updated Quotation Submitted', detail: request.updatedQuotation ? `· ${registeredAt}` : null },
        { label: 'Final Quotation Sent', detail: null },
        { label: 'Customer Quotation Approval Received', detail: request.status !== 'QUOTED' && request.quotation ? `· ${registeredAt}` : null, cancelPoint: false },
      ],
    },
    {
      key: 'assignment',
      label: 'Assigning Delivery Crew',
      completedLabel: 'Assigned Delivery Crew',
      substeps: [
        { label: 'Delivery Crew has been Assigned', detail: request.crew?.driver ? `by Supervisor · ${request.assignedAt || now}` : null },
      ],
    },
    {
      key: 'transit',
      label: 'In Transit',
      substeps: [
        { label: `Truck left dispatch location for Pickup`, detail: null },
        { label: `Truck arrived at pickup location`, detail: null },
        { label: `Truck left pickup location on its way to drop off location`, detail: null },
        { label: `Truck arrived at drop off location`, detail: null },
      ],
    },
    {
      key: 'delivered',
      label: 'Delivered',
      substeps: [
        { label: 'Delivery Crew confirmed delivery', detail: null },
      ],
    },
  ]

  return stages.map((stage, i) => ({
    ...stage,
    status: i < idx ? 'completed' : i === idx ? 'current' : 'pending',
  }))
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
    dropoffDate: '2026-07-25',
    dropoffTime: '12:00',
    status: 'FOR_REVIEW',
    createdAt: '2026-07-22 10:30',
    destinationCoords: { lat: 14.6465, lng: 121.0521 },
    currentLocation: { lat: 14.593, lng: 121.032 },
    quotation: null,
    crew: {
      driver: { id: 'DRV-001', name: 'Carlos Mendoza', phone: '+63 912 311 1222', rating: 4.8, trips: 126, avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
      helpers: [{ id: 'HLP-001', name: 'Pedro Garcia', avatarUrl: 'https://images.unsplash.com/photo-1541535881962-3bb380b08458?auto=format&fit=crop&w=180&q=80' }],
      truck: { plateNumber: 'ABC 1234', truckType: 'AUV', capacity: '5.0 tons' },
    },
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
    dropoffDate: '2026-07-25',
    dropoffTime: '17:00',
    status: 'APPROVED',
    createdAt: '2026-07-21 08:00',
    destinationCoords: { lat: 14.3834, lng: 121.0419 },
    currentLocation: { lat: 14.5172, lng: 121.0198 },
    quotation: { amount: 3500, breakdown: [{ label: 'Base Delivery Fee', amount: 1200 }, { label: 'Distance Fee', amount: 710 }, { label: 'Truck Type Surcharge', amount: 500 }, { label: 'Fuel Surcharge', amount: 400 }, { label: 'Loading/Unloading Fee', amount: 690 }], notes: 'Includes cold chain handling', validUntil: '2026-07-24' },
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
    dropoffDate: '2026-07-24',
    dropoffTime: '10:00',
    status: 'QUOTED',
    createdAt: '2026-07-20 14:00',
    destinationCoords: { lat: 14.4934, lng: 121.0405 },
    currentLocation: { lat: 14.5264, lng: 121.0108 },
    quotation: {
      amount: 14835,
      breakdown: {
        directExpenses: {
          depreciation: '1,500.00',
          dieselRate: '58.00',
          repairsAndMaintenance: { batteries: '2,000.00', tires: '3,500.00' },
          salariesAndWages: { driver: '800.00', helper1: '500.00', helper2: '400.00' },
          tripAllowance: '350.00',
          lodgingAllowance: '250.00',
          tollParking: '200.00',
        },
        indirectExpenses: {
          adminFees: '500.00',
          insurance: '1,200.00',
          motorVehicleReg: '800.00',
          garageRental: '1,000.00',
        },
        calculated: {
          distanceKm: 24.5,
          totalDays: 1,
          dieselTotal: 1421,
          directTotal: 9400,
          indirectTotal: 3500,
          operatingTotal: 12900,
          income: 1935,
          proposedRate: 14835,
        },
      },
    },
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
    dropoffDate: '2026-07-20',
    dropoffTime: '12:00',
    status: 'COMPLETED',
    createdAt: '2026-07-18 10:00',
    destinationCoords: { lat: 14.5506, lng: 121.0471 },
    currentLocation: { lat: 14.5506, lng: 121.0471 },
    quotation: { amount: 4200, breakdown: [{ label: 'Base Delivery Fee', amount: 1500 }, { label: 'Distance Fee', amount: 800 }, { label: 'Truck Type Surcharge', amount: 600 }, { label: 'Fuel Surcharge', amount: 500 }, { label: 'Loading/Unloading Fee', amount: 800 }], notes: 'Standard delivery', validUntil: '2026-07-22' },
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
    dropoffDate: '2026-07-19',
    dropoffTime: '09:00',
    status: 'COMPLETED',
    createdAt: '2026-07-17 09:00',
    destinationCoords: { lat: 14.4201, lng: 121.0312 },
    currentLocation: { lat: 14.4201, lng: 121.0312 },
    quotation: { amount: 3800, breakdown: [{ label: 'Base Delivery Fee', amount: 1200 }, { label: 'Distance Fee', amount: 600 }, { label: 'Truck Type Surcharge', amount: 500 }, { label: 'Fuel Surcharge', amount: 400 }, { label: 'Loading/Unloading Fee', amount: 1100 }], notes: 'Early morning delivery', validUntil: '2026-07-21' },
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
    dropoffDate: '2026-07-17',
    dropoffTime: '14:00',
    status: 'CANCELLED',
    createdAt: '2026-07-15 13:00',
    destinationCoords: { lat: 14.5864, lng: 121.0605 },
    currentLocation: { lat: 14.5864, lng: 121.0605 },
    quotation: { amount: 2900, breakdown: [{ label: 'Base Delivery Fee', amount: 1000 }, { label: 'Distance Fee', amount: 500 }, { label: 'Truck Type Surcharge', amount: 400 }, { label: 'Fuel Surcharge', amount: 300 }, { label: 'Loading/Unloading Fee', amount: 700 }], notes: 'Standard rate', validUntil: '2026-07-19' },
    crew: null,
  },
  {
    id: 'DEL-007',
    customerName: 'Pedro Gonzales',
    companyName: 'Shell Depot',
    pickupAddress: 'Shell Gas Complex, Brgy. Tabang, Guiguinto, Bulacan',
    deliveryAddress: 'Balagtas Station, Brgy. Poblacion, Balagtas, Bulacan',
    itemType: 'Dry Food',
    pickupDate: '2026-07-28',
    pickupTime: '08:00',
    dropoffDate: '2026-07-28',
    dropoffTime: '11:00',
    status: 'FOR_REVIEW',
    createdAt: '2026-07-25 09:00',
    destinationCoords: { lat: 14.8145, lng: 120.9056 },
    currentLocation: { lat: 14.8205, lng: 120.8950 },
    quotation: null,
    crew: null,
  },
  {
    id: 'DEL-008',
    customerName: 'Sofia Reyes',
    companyName: 'SM Appliance Center',
    pickupAddress: 'SM Warehouse, Brgy. San Jose, San Fernando, Pampanga',
    deliveryAddress: 'SM Clark, Brgy. Balibago, Angeles City, Pampanga',
    itemType: 'Dry Food',
    pickupDate: '2026-07-28',
    pickupTime: '10:00',
    dropoffDate: '2026-07-28',
    dropoffTime: '13:00',
    status: 'FOR_REVIEW',
    createdAt: '2026-07-25 11:30',
    destinationCoords: { lat: 15.1628, lng: 120.5897 },
    currentLocation: { lat: 15.1752, lng: 120.5907 },
    quotation: null,
    crew: null,
  },


  {
    id: 'DEL-011',
    customerName: 'Ramon Bautista',
    companyName: 'Pizza Hut',
    pickupAddress: 'Pizza Hut Commissary, Brgy. San Antonio, Makati',
    deliveryAddress: 'Pizza Hut Katipunan, Brgy. Loyola Heights, Quezon City',
    itemType: 'Fast Food',
    pickupDate: '2026-07-27',
    pickupTime: '09:00',
    dropoffDate: '2026-07-27',
    dropoffTime: '12:00',
    status: 'COUNTER_OFFER',
    createdAt: '2026-07-24 08:15',
    destinationCoords: { lat: 14.6357, lng: 121.0747 },
    currentLocation: { lat: 14.6398, lng: 121.0668 },
    quotation: {
      amount: 8500,
      breakdown: {
        directExpenses: {
          depreciation: '800.00',
          dieselRate: '55.00',
          repairsAndMaintenance: { batteries: '1,000.00', tires: '1,500.00' },
          salariesAndWages: { driver: '600.00', helper1: '400.00', helper2: '' },
          tripAllowance: '250.00',
          lodgingAllowance: '150.00',
          tollParking: '100.00',
        },
        indirectExpenses: {
          adminFees: '300.00',
          insurance: '800.00',
          motorVehicleReg: '500.00',
          garageRental: '600.00',
        },
        calculated: {
          distanceKm: 18.5,
          totalDays: 1,
          dieselTotal: 1017.5,
          directTotal: 5567.5,
          indirectTotal: 2200,
          operatingTotal: 7767.5,
          income: 1165.125,
          proposedRate: 8932.625,
        },
      },
    },
    crew: null,
    customerWants: 12000,
  },



  {
    id: 'DEL-015',
    customerName: 'Mark Anthony Hernandez',
    companyName: 'Puregold',
    pickupAddress: 'Puregold Warehouse, Brgy. Tambo, Parañaque',
    deliveryAddress: 'Puregold Sucat, Brgy. San Dionisio, Parañaque',
    itemType: 'Frozen Goods',
    pickupDate: '2026-07-31',
    pickupTime: '08:00',
    dropoffDate: '2026-07-31',
    dropoffTime: '12:00',
    status: 'APPROVED',
    createdAt: '2026-07-28 09:20',
    destinationCoords: { lat: 14.4716, lng: 121.0178 },
    currentLocation: { lat: 14.4900, lng: 121.0100 },
    quotation: { amount: 4100, breakdown: [{ label: 'Base Delivery Fee', amount: 1400 }, { label: 'Distance Fee', amount: 700 }, { label: 'Truck Type Surcharge', amount: 550 }, { label: 'Fuel Surcharge', amount: 450 }, { label: 'Loading/Unloading Fee', amount: 1000 }], notes: 'Includes cold storage handling', validUntil: '2026-07-30' },
    crew: null,
  },

  {
    id: 'DEL-017',
    customerName: 'Emilio Jacinto',
    companyName: 'Petron Corporation',
    pickupAddress: 'Petron Depot, Brgy. San Roque, Marikina',
    deliveryAddress: 'Petron Gas Station EDSA, Brgy. San Lorenzo, Makati',
    itemType: 'Dry Food',
    pickupDate: '2026-08-01',
    pickupTime: '06:00',
    dropoffDate: '2026-08-01',
    dropoffTime: '09:00',
    status: 'APPROVED',
    createdAt: '2026-07-29 08:30',
    destinationCoords: { lat: 14.5547, lng: 121.0239 },
    currentLocation: { lat: 14.5700, lng: 121.0150 },
    quotation: { amount: 3600, breakdown: [{ label: 'Base Delivery Fee', amount: 1200 }, { label: 'Distance Fee', amount: 650 }, { label: 'Truck Type Surcharge', amount: 500 }, { label: 'Fuel Surcharge', amount: 350 }, { label: 'Loading/Unloading Fee', amount: 900 }], notes: 'Early morning delivery', validUntil: '2026-07-31' },
    crew: null,
  },
  {
    id: 'DEL-018',
    customerName: 'Lorna Santiago',
    companyName: 'Goldilocks',
    pickupAddress: 'Goldilocks Commissary, Brgy. Pinyahan, Quezon City',
    deliveryAddress: 'Goldilocks SM Dasma, Brgy. Paliparan III, Dasmariñas, Cavite',
    itemType: 'Frozen Goods',
    pickupDate: '2026-07-26',
    pickupTime: '04:00',
    dropoffDate: '2026-07-26',
    dropoffTime: '08:00',
    status: 'COMPLETED',
    createdAt: '2026-07-23 14:00',
    destinationCoords: { lat: 14.3084, lng: 120.9633 },
    currentLocation: { lat: 14.3084, lng: 120.9633 },
    quotation: { amount: 4800, breakdown: [{ label: 'Base Delivery Fee', amount: 1600 }, { label: 'Distance Fee', amount: 1000 }, { label: 'Truck Type Surcharge', amount: 700 }, { label: 'Fuel Surcharge', amount: 500 }, { label: 'Loading/Unloading Fee', amount: 1000 }], notes: 'Long distance delivery with refrigeration', validUntil: '2026-07-25' },
    crew: {
      driver: { id: 'DRV-003', name: 'Ricardo Lopez', phone: '+63 919 553 1170', rating: 4.9, trips: 168, avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=200&q=80' },
      helpers: [{ id: 'HLP-003', name: 'Rico Aquino', avatarUrl: 'https://images.unsplash.com/photo-1463453091185-61582044d556?auto=format&fit=crop&w=180&q=80' }],
      truck: { plateNumber: 'DEF 9012', truckType: 'L300', capacity: '1.0 ton' },
    },
    assignedAt: 'Jul 24, 2026, 09:00 AM',
  },
  {
    id: 'DEL-019',
    customerName: 'Nestor Cabrera',
    companyName: 'Mini Stop',
    pickupAddress: 'Mini Stop Warehouse, Brgy. San Isidro, Cainta, Rizal',
    deliveryAddress: 'Mini Stop Angono, Brgy. San Vicente, Angono, Rizal',
    itemType: 'Dry Food',
    pickupDate: '2026-07-28',
    pickupTime: '11:00',
    dropoffDate: '2026-07-28',
    dropoffTime: '14:00',
    status: 'QUOTED',
    createdAt: '2026-07-26 11:00',
    destinationCoords: { lat: 14.5261, lng: 121.1536 },
    currentLocation: { lat: 14.5400, lng: 121.1400 },
    quotation: {
      amount: 6780,
      breakdown: {
        directExpenses: {
          depreciation: '700.00',
          dieselRate: '52.00',
          repairsAndMaintenance: { batteries: '800.00', tires: '1,200.00' },
          salariesAndWages: { driver: '500.00', helper1: '350.00', helper2: '' },
          tripAllowance: '200.00',
          lodgingAllowance: '100.00',
          tollParking: '80.00',
        },
        indirectExpenses: {
          adminFees: '250.00',
          insurance: '600.00',
          motorVehicleReg: '400.00',
          garageRental: '500.00',
        },
        calculated: {
          distanceKm: 15.2,
          totalDays: 1,
          dieselTotal: 790.4,
          directTotal: 4820.4,
          indirectTotal: 1750,
          operatingTotal: 6570.4,
          income: 985.56,
          proposedRate: 7555.96,
        },
      },
    },
    crew: null,
  },
  {
    id: 'DEL-020',
    customerName: 'Catherine De Leon',
    companyName: 'Army Navy',
    pickupAddress: 'Army Navy Commissary, Brgy. Bel-Air, Makati',
    deliveryAddress: 'Army Navy BGC, Brgy. Fort Bonifacio, Taguig',
    itemType: 'Fast Food',
    pickupDate: '2026-07-29',
    pickupTime: '07:00',
    dropoffDate: '2026-07-29',
    dropoffTime: '10:00',
    status: 'APPROVED',
    createdAt: '2026-07-26 15:00',
    destinationCoords: { lat: 14.5521, lng: 121.0528 },
    currentLocation: { lat: 14.5600, lng: 121.0450 },
    quotation: { amount: 3000, breakdown: [{ label: 'Base Delivery Fee', amount: 1000 }, { label: 'Distance Fee', amount: 550 }, { label: 'Truck Type Surcharge', amount: 400 }, { label: 'Fuel Surcharge', amount: 350 }, { label: 'Loading/Unloading Fee', amount: 700 }], notes: 'Weekday delivery', validUntil: '2026-07-30' },
    crew: null,
  },



  {
    id: 'DEL-024',
    customerName: 'Helen Reyes',
    companyName: 'Puregold',
    pickupAddress: 'Puregold Warehouse, Brgy. San Bartolome, Novaliches, Quezon City',
    deliveryAddress: 'Puregold Sucat Branch, Brgy. San Dionisio, Parañaque',
    itemType: 'Dry Food',
    pickupDate: '2026-07-26',
    pickupTime: '09:00',
    dropoffDate: '2026-07-26',
    dropoffTime: '14:00',
    status: 'FOR_PICKUP',
    createdAt: '2026-07-23 11:00',
    destinationCoords: { lat: 14.4745, lng: 121.0254 },
    currentLocation: { lat: 14.6575, lng: 121.0254 },
    quotation: { amount: 4800, breakdown: [{ label: 'Base Delivery Fee', amount: 1800 }, { label: 'Distance Fee', amount: 900 }, { label: 'Truck Type Surcharge', amount: 600 }, { label: 'Fuel Surcharge', amount: 500 }, { label: 'Loading/Unloading Fee', amount: 1000 }], notes: 'Includes Saturday surcharge', validUntil: '2026-07-28' },
    crew: {
      driver: { id: 'DRV-003', name: 'Antonio Flores', phone: '+63 915 789 0123', rating: 4.6, trips: 89, avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80' },
      helpers: [{ id: 'HLP-003', name: 'Jose Rizal', avatarUrl: 'https://images.unsplash.com/photo-1541535881962-3bb380b08458?auto=format&fit=crop&w=180&q=80' }],
      truck: { plateNumber: 'DEF 5678', truckType: '4T_DRY', capacity: '4.0 tons' },
    },
    assignedAt: 'Jul 25, 2026, 10:00 AM',
  },
  {
    id: 'DEL-025',
    customerName: 'Danny Chua',
    companyName: 'San Miguel Corporation',
    pickupAddress: 'SMC Plant, Brgy. Bagbaguin, Meycauayan, Bulacan',
    deliveryAddress: 'SMC Depot, Brgy. Poblacion, Valenzuela City',
    itemType: 'Beverages',
    pickupDate: '2026-07-26',
    pickupTime: '06:00',
    dropoffDate: '2026-07-26',
    dropoffTime: '11:00',
    status: 'OUT_FOR_DELIVERY',
    createdAt: '2026-07-24 09:00',
    destinationCoords: { lat: 14.6864, lng: 120.9663 },
    currentLocation: { lat: 14.6850, lng: 120.9700 },
    quotation: { amount: 6200, breakdown: [{ label: 'Base Delivery Fee', amount: 2000 }, { label: 'Distance Fee', amount: 1100 }, { label: 'Truck Type Surcharge', amount: 800 }, { label: 'Fuel Surcharge', amount: 700 }, { label: 'Loading/Unloading Fee', amount: 1600 }], notes: 'Bulk delivery — palletised', validUntil: '2026-07-27' },
    crew: {
      driver: { id: 'DRV-004', name: 'Ramon Bautista', phone: '+63 918 456 7890', rating: 4.9, trips: 215, avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
      helpers: [{ id: 'HLP-004', name: 'Eduardo Cruz', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=180&q=80' }],
      truck: { plateNumber: 'GHI 9012', truckType: '6T_DRY', capacity: '6.0 tons' },
    },
    assignedAt: 'Jul 25, 2026, 02:00 PM',
  },
  {
    id: 'DEL-026',
    customerName: 'Lorna Perez',
    companyName: 'National Book Store',
    pickupAddress: 'NBS Warehouse, Brgy. San Rafael, Cubao, Quezon City',
    deliveryAddress: 'NBS SM North EDSA Branch, Brgy. Bagong Pag-asa, Quezon City',
    itemType: 'School Supplies',
    pickupDate: '2026-07-26',
    pickupTime: '07:30',
    dropoffDate: '2026-07-26',
    dropoffTime: '12:00',
    status: 'DELIVERED',
    createdAt: '2026-07-22 14:00',
    destinationCoords: { lat: 14.6570, lng: 121.0300 },
    currentLocation: { lat: 14.6570, lng: 121.0300 },
    quotation: { amount: 3200, breakdown: [{ label: 'Base Delivery Fee', amount: 1200 }, { label: 'Distance Fee', amount: 600 }, { label: 'Truck Type Surcharge', amount: 400 }, { label: 'Fuel Surcharge', amount: 300 }, { label: 'Loading/Unloading Fee', amount: 700 }], notes: 'Light cargo — multiple boxes', validUntil: '2026-07-25' },
    crew: {
      driver: { id: 'DRV-005', name: 'Felipe Gonzaga', phone: '+63 920 111 2233', rating: 4.5, trips: 67, avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80' },
      helpers: [{ id: 'HLP-005', name: 'Ricky Santos', avatarUrl: 'https://images.unsplash.com/photo-1541535881962-3bb380b08458?auto=format&fit=crop&w=180&q=80' }],
      truck: { plateNumber: 'JKL 3456', truckType: 'L300', capacity: '1.5 tons' },
    },
    assignedAt: 'Jul 24, 2026, 09:00 AM',
  },
  {
    id: 'DEL-040',
    customerName: 'Antonio Bautista',
    companyName: 'LBC Express',
    pickupAddress: 'LBC Main Hub, Brgy. San Nicolas, Pasig',
    deliveryAddress: 'LBC Branch, Brgy. Poblacion, San Pablo, Laguna',
    itemType: 'Dry Food',
    pickupDate: '2026-08-05',
    pickupTime: '08:00',
    dropoffDate: '2026-08-06',
    dropoffTime: '12:00',
    status: 'COUNTER_OFFER',
    createdAt: '2026-08-01 10:30',
    destinationCoords: { lat: 14.3587, lng: 121.0789 },
    currentLocation: { lat: 14.5600, lng: 121.0600 },
    quotation: {
      amount: 18500,
      breakdown: {
        directExpenses: {
          depreciation: '2,000.00',
          dieselRate: '62.00',
          repairsAndMaintenance: { batteries: '2,500.00', tires: '4,000.00' },
          salariesAndWages: { driver: '1,000.00', helper1: '600.00', helper2: '500.00' },
          tripAllowance: '400.00',
          lodgingAllowance: '300.00',
          tollParking: '250.00',
        },
        indirectExpenses: {
          adminFees: '600.00',
          insurance: '1,500.00',
          motorVehicleReg: '900.00',
          garageRental: '1,200.00',
        },
        calculated: {
          distanceKm: 72.3,
          totalDays: 2,
          dieselTotal: 4482.6,
          directTotal: 13932.6,
          indirectTotal: 4200,
          operatingTotal: 18132.6,
          income: 2719.89,
          proposedRate: 20852.49,
        },
      },
    },
    customerWants: 16000,
    crew: null,
  },
  {
    id: 'DEL-041',
    customerName: 'Marlon Torres',
    companyName: 'DHL Express',
    pickupAddress: 'DHL Hub, Brgy. San Martin, Parañaque',
    deliveryAddress: 'DHL Branch, Brgy. Poblacion, Lipa, Batangas',
    itemType: 'Dry Food',
    pickupDate: '2026-08-10',
    pickupTime: '06:00',
    dropoffDate: '2026-08-11',
    dropoffTime: '14:00',
    status: 'UPDATED_QUOTATION',
    createdAt: '2026-08-05 09:00',
    destinationCoords: { lat: 13.9418, lng: 121.1624 },
    currentLocation: { lat: 14.5100, lng: 121.0000 },
    quotation: {
      amount: 12500,
      breakdown: {
        directExpenses: {
          depreciation: '1,200.00',
          dieselRate: '55.00',
          repairsAndMaintenance: { batteries: '1,800.00', tires: '2,500.00' },
          salariesAndWages: { driver: '700.00', helper1: '450.00', helper2: '' },
          tripAllowance: '300.00',
          lodgingAllowance: '200.00',
          tollParking: '150.00',
        },
        indirectExpenses: {
          adminFees: '400.00',
          insurance: '1,000.00',
          motorVehicleReg: '600.00',
          garageRental: '800.00',
        },
        calculated: {
          distanceKm: 85.6,
          totalDays: 2,
          dieselTotal: 4708,
          directTotal: 8470,
          indirectTotal: 2800,
          operatingTotal: 11270,
          income: 1690.5,
          proposedRate: 12960.5,
        },
      },
    },
    customerWants: 10000,
    updatedQuotation: {
      amount: 11000,
      breakdown: {
        directExpenses: {
          depreciation: '1,000.00',
          dieselRate: '55.00',
          repairsAndMaintenance: { batteries: '1,500.00', tires: '2,000.00' },
          salariesAndWages: { driver: '600.00', helper1: '400.00', helper2: '' },
          tripAllowance: '250.00',
          lodgingAllowance: '150.00',
          tollParking: '100.00',
        },
        indirectExpenses: {
          adminFees: '350.00',
          insurance: '800.00',
          motorVehicleReg: '500.00',
          garageRental: '600.00',
        },
        calculated: {
          distanceKm: 85.6,
          totalDays: 2,
          dieselTotal: 4708,
          directTotal: 7290,
          indirectTotal: 2250,
          operatingTotal: 9540,
          income: 1431,
          proposedRate: 10971,
        },
      },
    },
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
  { id: 'behavior', label: 'DriveWise Analysis', icon: Activity },
  { id: 'route', label: 'Route Deviation Monitoring', icon: Map },
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

const COMPLETED_REPORT_DATA = {
  'DEL-004': {
    routeDeviation: {
      planned: [
        [14.560, 121.070],
        [14.557, 121.060],
        [14.555, 121.053],
        [14.553, 121.048],
        [14.550, 121.047],
      ],
      actual: [
        [14.560, 121.070],
        [14.557, 121.060],
        [14.562, 121.055],
        [14.555, 121.052],
        [14.553, 121.048],
        [14.550, 121.047],
      ],
      plannedDistance: '5.8 km',
      actualDistance: '6.4 km',
      deviationDistance: '0.6 km',
      deviationPercent: 10.3,
      aiSummary: 'Minor route deviation detected. The driver briefly deviated north near the C5-Meralco intersection, adding approximately 0.6 km to the planned route. This appears to be a navigation correction rather than an intentional detour. No significant impact on delivery time or safety.',
      aiVerdict: 'Minor Deviation',
      aiVerdictTone: 'amber',
    },
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
        { label: 'Departed for Pickup', time: '08:00', completed: true },
        { label: 'Arrived at Pickup Location', time: '08:15', completed: true },
        { label: 'Departed for Drop Off', time: '08:30', completed: true },
        { label: 'Arrived at Drop Off Location', time: '09:10', completed: true },
        { label: 'Delivery Completed', time: '09:15', completed: true },
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
    routeDeviation: {
      planned: [
        [14.300, 120.960],
        [14.320, 120.970],
        [14.350, 120.985],
        [14.380, 121.000],
        [14.400, 121.015],
        [14.420, 121.031],
      ],
      actual: [
        [14.300, 120.960],
        [14.310, 120.965],
        [14.330, 120.945],
        [14.360, 120.965],
        [14.390, 121.010],
        [14.410, 121.025],
        [14.420, 121.031],
      ],
      plannedDistance: '18.2 km',
      actualDistance: '22.8 km',
      deviationDistance: '4.6 km',
      deviationPercent: 25.3,
      aiSummary: 'Significant route deviation detected. The driver took an alternative route through General Trias residential areas instead of staying on Aguinaldo Highway, adding 4.6 km to the planned route. This deviation is notable and may indicate driver unfamiliarity with the area or a deliberate choice to avoid traffic. Recommend reviewing the trip log for this delivery to assess any impact on schedule or fuel efficiency.',
      aiVerdict: 'Significant Deviation',
      aiVerdictTone: 'red',
    },
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
        { label: 'Departed for Pickup', time: '05:30', completed: true },
        { label: 'Arrived at Pickup Location', time: '05:45', completed: true },
        { label: 'Departed for Drop Off', time: '06:00', completed: true },
        { label: 'Arrived at Drop Off Location', time: '06:48', completed: true },
        { label: 'Delivery Completed', time: '06:55', completed: true },
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

      {reportTab === 'behavior' && (
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

      {reportTab === 'route' && (
        <div className="space-y-3">
          <RouteDeviationMap
            plannedRoute={report.routeDeviation.planned}
            actualRoute={report.routeDeviation.actual}
            pickupCoords={report.routeDeviation.planned[0]}
            dropoffCoords={report.routeDeviation.planned[report.routeDeviation.planned.length - 1]}
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Planned Distance</p>
              <p className="text-sm font-bold text-slate-900">{report.routeDeviation.plannedDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Actual Distance</p>
              <p className="text-sm font-bold text-slate-900">{report.routeDeviation.actualDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Deviation</p>
              <p className="text-sm font-bold text-slate-900">{report.routeDeviation.deviationDistance}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-center">
              <p className="text-xs text-slate-500">Deviation %</p>
              <p className="text-sm font-bold text-slate-900">{report.routeDeviation.deviationPercent}%</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3 text-xs"
            style={{
              borderColor: report.routeDeviation.aiVerdictTone === 'red' ? '#fecaca' : '#fde68a',
              backgroundColor: report.routeDeviation.aiVerdictTone === 'red' ? '#fef2f2' : '#fffbeb',
            }}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${
              report.routeDeviation.aiVerdictTone === 'red' ? 'bg-red-500' : 'bg-amber-500'
            }`}>
              <Navigation className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-semibold ${
                report.routeDeviation.aiVerdictTone === 'red' ? 'text-red-800' : 'text-amber-800'
              }`}>
                AI Route Analysis: {report.routeDeviation.aiVerdict}
              </p>
              <p className={`mt-1 leading-relaxed ${
                report.routeDeviation.aiVerdictTone === 'red' ? 'text-red-700' : 'text-amber-700'
              }`}>
                {report.routeDeviation.aiSummary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-white border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#059669' }} />
              <span className="text-slate-600">Planned Route</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-3 w-6 rounded-sm" style={{ background: '#2563eb' }} />
              <span className="text-slate-600">Actual Route</span>
            </div>
            <span className="ml-auto text-[10px] text-slate-400 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              S = Start, E = End
            </span>
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
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('createdAt_desc')
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
  const [negotiationAmount, setNegotiationAmount] = useState('')
  const [negotiationCallSchedule, setNegotiationCallSchedule] = useState('')
  const [assignment, setAssignment] = useState({ driverId: '', helperIds: [], plateNumber: '', _showDrivers: false, _showHelpers: false, _showTrucks: false })
  const [hasApproved, setHasApproved] = useState(false)
  const [quotationSubmitted, setQuotationSubmitted] = useState(false)
  const [expandedReport, setExpandedReport] = useState(null)
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
  const [showProgressDetails, setShowProgressDetails] = useState(false)
  const [page, setPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(() => Math.max(4, Math.floor((window.innerHeight - 280) / 68)))

  useEffect(() => {
    const handleResize = () => setItemsPerPage(Math.max(4, Math.floor((window.innerHeight - 280) / 68)))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => { setPage(1) }, [search, statusFilter, sortBy])

  const inboxRows = useMemo(
    () => requests.filter((r) => ['FOR_REVIEW', 'QUOTED', 'COUNTER_OFFER', 'UPDATED_QUOTATION', 'ASSIGNED'].includes(r.status)),
    [requests],
  )

  const pendingAssignments = useMemo(
    () => requests.filter((r) => r.status === 'APPROVED'),
    [requests],
  )

  const [assignSearch, setAssignSearch] = useState('')
  const [assignSortBy, setAssignSortBy] = useState('createdAt_desc')
  const [assignPage, setAssignPage] = useState(1)

  const filteredAssign = useMemo(() => {
    const q = assignSearch.trim().toLowerCase()
    let result = pendingAssignments
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
    result = [...result].sort((a, b) => {
      switch (assignSortBy) {
        case 'createdAt_asc':
          return a.createdAt.localeCompare(b.createdAt)
        case 'customerName_asc':
          return a.customerName.localeCompare(b.customerName)
        case 'customerName_desc':
          return b.customerName.localeCompare(a.customerName)
        case 'createdAt_desc':
        default:
          return b.createdAt.localeCompare(a.createdAt)
      }
    })
    return result
  }, [pendingAssignments, assignSearch, assignSortBy])

  const assignTotalPages = Math.max(1, Math.ceil(filteredAssign.length / itemsPerPage))
  const assignSafePage = Math.min(assignPage, assignTotalPages)
  const paginatedAssign = filteredAssign.slice((assignSafePage - 1) * itemsPerPage, assignSafePage * itemsPerPage)

  const filteredInbox = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = inboxRows
    if (statusFilter !== 'ALL') {
      result = result.filter((r) => r.status === statusFilter)
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
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'createdAt_asc':
          return a.createdAt.localeCompare(b.createdAt)
        case 'customerName_asc':
          return a.customerName.localeCompare(b.customerName)
        case 'customerName_desc':
          return b.customerName.localeCompare(a.customerName)
        case 'createdAt_desc':
        default:
          return b.createdAt.localeCompare(a.createdAt)
      }
    })
    return result
  }, [inboxRows, search, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredInbox.length / itemsPerPage))
  const safePage = Math.min(page, totalPages)
  const paginatedInbox = filteredInbox.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

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
    setHasApproved(request.status !== 'FOR_REVIEW')
    // Quotation step is considered done if the request already has a quotation
    setQuotationSubmitted(Boolean(request.quotation))
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

  const fm = (v) => {
    const n = parseMoney(v)
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
      status: 'QUOTED',
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
    updateRequest(selectedRequest.id, { status: 'APPROVED' })
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

  const approveRequest = () => {
    if (!selectedRequest) return
    updateRequest(selectedRequest.id, { status: 'APPROVED' })
    setHasApproved(true)
    setQuotationSubmitted(true)
  }

  const openDeclineDialog = () => {
    if (!selectedRequest) return
    setShowDeclineDialog(true)
  }
  const confirmDecline = () => {
    if (!selectedRequest) return
    updateRequest(selectedRequest.id, { status: 'DECLINED' })
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
      status: 'UPDATED_QUOTATION',
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
        <div className="flex flex-col gap-4 overflow-y-auto pb-6">
          <div className="sticky top-0 z-30 -mt-2 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-5 py-2 shadow-sm sm:-mt-4">
            <button
              onClick={() => setSelectedRequest(null)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600 bg-transparent border-none cursor-pointer p-0"
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
                      {selectedRequest.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{selectedRequest.customerName}</p>
                </div>
              </div>
              {selectedRequest.status === 'FOR_REVIEW' && (
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
                      {currentStage.status === 'completed' ? currentStage.completedLabel || currentStage.label : currentStage.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {currentStage.status === 'completed' ? 'Completed' : currentStage.status === 'current' ? 'In Progress' : 'Pending'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 ml-11">
                  {currentStage.substeps.filter(s => s.detail || s.label).map((substep, si) => (
                    <div key={si} className="flex items-start gap-2 text-sm">
                      <span className={`mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border ${
                        substep.detail ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                      }`}>
                        {substep.detail && <Check className="h-2 w-2 text-white" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${substep.detail ? 'text-slate-900' : 'text-slate-400'}`}>
                          {substep.cancelPoint && selectedRequest.status === 'CANCELLED' ? (
                            <span className="text-rose-600 font-medium">{substep.cancelReason || 'Cancelled'}</span>
                          ) : (
                            <>
                              {substep.label}
                              {substep.detail && <span className="text-slate-500 ml-1">{substep.detail}</span>}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

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
                    {progressData.map((stage, si) => (
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
                          {stage.substeps.map((substep, si2) => (
                            <div key={si2} className="flex items-start gap-2 text-sm">
                              <span className={`mt-1.5 flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full ${
                                substep.detail || (stage.status === 'completed') ? 'bg-emerald-500' :
                                stage.status === 'current' ? 'bg-blue-500' :
                                'bg-slate-200'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <p className={`${
                                  substep.detail || stage.status === 'completed' ? 'text-slate-900' :
                                  stage.status === 'current' ? 'text-slate-700' :
                                  'text-slate-400'
                                }`}>
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
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-blue-600" />
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Delivery Request Details</h3>
                  </div>
                  <button
                    onClick={() => setShowDetails(s => !s)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition bg-transparent border-none cursor-pointer"
                  >
                    {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
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
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4 text-sky-600" />
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {adjustingQuotation
                          ? 'Adjusted Quotation'
                          : selectedRequest.status === 'COUNTER_OFFER'
                          ? 'Quotation Review'
                          : selectedRequest.status === 'UPDATED_QUOTATION'
                          ? 'Quotation History'
                          : 'Quotation'}
                      </h3>
                    </div>
                    {(!selectedRequest.quotation || !quotationSubmitted) && !adjustingQuotation && (
                      <button
                        onClick={submitQuotation}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition"
                      >
                        <Send className="h-4 w-4" />
                        Submit Quotation
                      </button>
                    )}
                  </div>
                  <div className="p-4 space-y-4">

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
                      <div className="space-y-4">

                        {/* — Direct Expenses — */}
                        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4">
                          <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-blue-800 mb-4">
                            <span className="h-3 w-3 rounded-full bg-blue-600" />
                            Direct Expenses
                          </h4>

                          <div className="flex items-center justify-between gap-3 py-2 border-b border-blue-100">
                            <span className="text-sm font-medium text-slate-700">Depreciation Expenses</span>
                            <input type="text" value={quotationForm.directExpenses.depreciation}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, depreciation: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, depreciation: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>

                          <div className="flex items-center justify-between gap-3 py-2 border-b border-blue-100">
                            <span className="text-sm font-medium text-slate-700">Diesel Rate</span>
                            <input type="text" value={quotationForm.directExpenses.dieselRate}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, dieselRate: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, dieselRate: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <p className="text-sm text-blue-700 ml-1 mt-1 mb-2">
                            a. Total diesel expenses:{' '}
                            <span className="font-semibold">
                              ₱{(
                                parseMoney(quotationForm.directExpenses.dieselRate) *
                                (selectedRequest ? parseFloat(getTotalDistance(selectedRequest)) || 0 : 0)
                              ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-blue-500 ml-1">
                              ({quotationForm.directExpenses.dieselRate || '0'} × {selectedRequest ? getTotalDistance(selectedRequest) : '0'})
                            </span>
                          </p>

                          <p className="text-sm font-semibold text-blue-700 ml-0.5 mb-2 mt-3">Repairs and Maintenance</p>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">a. Batteries</span>
                            <input type="text" value={quotationForm.directExpenses.repairsAndMaintenance.batteries}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, repairsAndMaintenance: { ...p.directExpenses.repairsAndMaintenance, batteries: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, repairsAndMaintenance: { ...p.directExpenses.repairsAndMaintenance, batteries: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">b. Tires</span>
                            <input type="text" value={quotationForm.directExpenses.repairsAndMaintenance.tires}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, repairsAndMaintenance: { ...p.directExpenses.repairsAndMaintenance, tires: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, repairsAndMaintenance: { ...p.directExpenses.repairsAndMaintenance, tires: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>

                          <p className="text-sm font-semibold text-blue-700 ml-0.5 mb-2 mt-3">Salaries and Wages</p>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">a. Driver</span>
                            <input type="text" value={quotationForm.directExpenses.salariesAndWages.driver}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, driver: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, driver: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">b. Helper (1)</span>
                            <input type="text" value={quotationForm.directExpenses.salariesAndWages.helper1}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, helper1: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, helper1: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          {isLargeTruck(selectedRequest) && (
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">c. Helper (2)</span>
                            <input type="text" value={quotationForm.directExpenses.salariesAndWages.helper2}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, helper2: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, helper2: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          )}

                          <div className="flex items-center justify-between gap-3 py-1.5 mt-1">
                            <span className="text-sm font-medium text-slate-700">Trip Allowance</span>
                            <input type="text" value={quotationForm.directExpenses.tripAllowance}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, tripAllowance: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, tripAllowance: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700">Lodging Allowance</span>
                            <input type="text" value={quotationForm.directExpenses.lodgingAllowance}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, lodgingAllowance: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, lodgingAllowance: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700">Toll/Parking (Delivery Truck)</span>
                            <input type="text" value={quotationForm.directExpenses.tollParking}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, tollParking: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, tollParking: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>

                          <div className="mt-3 flex items-center justify-between rounded-lg bg-blue-200/60 px-4 py-3">
                            <span className="text-sm font-bold text-blue-900">Total Direct Expenses</span>
                            <span className="text-base font-bold text-blue-900">₱{fm(getDirectTotal())}</span>
                          </div>
                        </div>

                        {/* — Indirect Expenses — */}
                        <div className="rounded-xl border-2 border-amber-200 bg-amber-50/60 p-4">
                          <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-800 mb-4">
                            <span className="h-3 w-3 rounded-full bg-amber-600" />
                            Indirect Expenses
                          </h4>

                          <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
                            <span className="text-sm font-medium text-slate-700">Administration Fees</span>
                            <input type="text" value={quotationForm.indirectExpenses.adminFees}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, adminFees: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, adminFees: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-amber-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
                            <span className="text-sm font-medium text-slate-700">Insurance (Vehicle)</span>
                            <input type="text" value={quotationForm.indirectExpenses.insurance}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, insurance: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, insurance: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-amber-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
                            <span className="text-sm font-medium text-slate-700">Motor Vehicle Registration</span>
                            <input type="text" value={quotationForm.indirectExpenses.motorVehicleReg}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, motorVehicleReg: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, motorVehicleReg: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-amber-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2">
                            <span className="text-sm font-medium text-slate-700">Rental (Garage)</span>
                            <input type="text" value={quotationForm.indirectExpenses.garageRental}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, garageRental: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, garageRental: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-amber-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 bg-white" placeholder="0.00" />
                          </div>

                          <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-200/60 px-4 py-3">
                            <span className="text-sm font-bold text-amber-900">Total Indirect Expenses</span>
                            <span className="text-base font-bold text-amber-900">₱{fm(getIndirectTotal())}</span>
                          </div>
                        </div>

                        {/* — Summary — */}
                        <div className="rounded-xl border-2 border-slate-300 bg-slate-100/70 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700">Total Operating Expenses</span>
                            <span className="text-base font-bold text-slate-900">₱{fm(getOperatingTotal())}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700">Income (15%)</span>
                            <span className="text-base font-bold text-emerald-700">₱{fm(getIncome())}</span>
                          </div>
                          <div className="flex items-center justify-between border-t-2 border-slate-300 pt-2">
                            <span className="text-sm font-bold text-slate-900 uppercase">Proposed Rate</span>
                            <span className="text-lg font-bold text-sky-700">₱{fm(getProposedRate())}</span>
                          </div>
                        </div>

                        <button
                          onClick={submitQuotation}
                          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition"
                        >
                          <Send className="h-4 w-4" />
                          Submit Quotation
                        </button>
                      </div>
                    )}

                    {/* === CASE 2: Read-only form (submitted — QUOTED or COUNTER_OFFER) === */}
                    {(selectedRequest.quotation && quotationSubmitted) && !adjustingQuotation && (
                      <>
                        {/* Collapsible toggle for COUNTER_OFFER and UPDATED_QUOTATION */}
                        {(selectedRequest.status === 'COUNTER_OFFER' || selectedRequest.status === 'UPDATED_QUOTATION') && (
                          <button
                            onClick={() => setShowInitialQuotation(!showInitialQuotation)}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition bg-transparent border-none cursor-pointer"
                          >
                            <ChevronDown className={`h-4 w-4 transition ${showInitialQuotation ? 'rotate-180' : ''}`} />
                            {showInitialQuotation ? 'Hide' : 'Show'} Initial Quotation
                          </button>
                        )}

                        {/* Read-only form content (shown by default for QUOTED, collapsible for COUNTER_OFFER and UPDATED_QUOTATION) */}
                        {(showInitialQuotation || (selectedRequest.status !== 'COUNTER_OFFER' && selectedRequest.status !== 'UPDATED_QUOTATION')) && (
                          <div className="space-y-4">

                            {/* — Initial Quotation header for COUNTER_OFFER / UPDATED_QUOTATION — */}
                            {(selectedRequest.status === 'COUNTER_OFFER' || selectedRequest.status === 'UPDATED_QUOTATION') && (
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
                        {selectedRequest.status === 'QUOTED' && !selectedRequest.customerWants && (
                          <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 mt-4">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                            <p className="text-sm text-sky-800">Waiting for customer to review quotation.</p>
                          </div>
                        )}

                        {/* COUNTER_OFFER: Customer's Counter Offer section */}
                        {selectedRequest.status === 'COUNTER_OFFER' && (
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

                        {/* UPDATED_QUOTATION: Show initial quotation + customer's counter offer record + updated quotation */}
                        {selectedRequest.status === 'UPDATED_QUOTATION' && (
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
                      <div className="space-y-4">

                        {/* — Direct Expenses (editable, pre-filled) — */}
                        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-4">
                          <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-blue-800 mb-4">
                            <span className="h-3 w-3 rounded-full bg-blue-600" />
                            Direct Expenses
                          </h4>

                          <div className="flex items-center justify-between gap-3 py-2 border-b border-blue-100">
                            <span className="text-sm font-medium text-slate-700">Depreciation Expenses</span>
                            <input type="text" value={quotationForm.directExpenses.depreciation}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, depreciation: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, depreciation: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>

                          <div className="flex items-center justify-between gap-3 py-2 border-b border-blue-100">
                            <span className="text-sm font-medium text-slate-700">Diesel Rate</span>
                            <input type="text" value={quotationForm.directExpenses.dieselRate}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, dieselRate: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, dieselRate: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <p className="text-sm text-blue-700 ml-1 mt-1 mb-2">
                            a. Total diesel expenses:{' '}
                            <span className="font-semibold">
                              ₱{(
                                parseMoney(quotationForm.directExpenses.dieselRate) *
                                (selectedRequest ? parseFloat(getTotalDistance(selectedRequest)) || 0 : 0)
                              ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-blue-500 ml-1">
                              ({quotationForm.directExpenses.dieselRate || '0'} × {selectedRequest ? getTotalDistance(selectedRequest) : '0'})
                            </span>
                          </p>

                          <p className="text-sm font-semibold text-blue-700 ml-0.5 mb-2 mt-3">Repairs and Maintenance</p>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">a. Batteries</span>
                            <input type="text" value={quotationForm.directExpenses.repairsAndMaintenance.batteries}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, repairsAndMaintenance: { ...p.directExpenses.repairsAndMaintenance, batteries: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, repairsAndMaintenance: { ...p.directExpenses.repairsAndMaintenance, batteries: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">b. Tires</span>
                            <input type="text" value={quotationForm.directExpenses.repairsAndMaintenance.tires}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, repairsAndMaintenance: { ...p.directExpenses.repairsAndMaintenance, tires: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, repairsAndMaintenance: { ...p.directExpenses.repairsAndMaintenance, tires: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>

                          <p className="text-sm font-semibold text-blue-700 ml-0.5 mb-2 mt-3">Salaries and Wages</p>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">a. Driver</span>
                            <input type="text" value={quotationForm.directExpenses.salariesAndWages.driver}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, driver: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, driver: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">b. Helper (1)</span>
                            <input type="text" value={quotationForm.directExpenses.salariesAndWages.helper1}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, helper1: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, helper1: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          {isLargeTruck(selectedRequest) && (
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700 pl-4">c. Helper (2)</span>
                            <input type="text" value={quotationForm.directExpenses.salariesAndWages.helper2}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, helper2: r } } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, salariesAndWages: { ...p.directExpenses.salariesAndWages, helper2: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          )}

                          <div className="flex items-center justify-between gap-3 py-1.5 mt-1">
                            <span className="text-sm font-medium text-slate-700">Trip Allowance</span>
                            <input type="text" value={quotationForm.directExpenses.tripAllowance}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, tripAllowance: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, tripAllowance: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700">Lodging Allowance</span>
                            <input type="text" value={quotationForm.directExpenses.lodgingAllowance}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, lodgingAllowance: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, lodgingAllowance: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-sm font-medium text-slate-700">Toll/Parking (Delivery Truck)</span>
                            <input type="text" value={quotationForm.directExpenses.tollParking}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, tollParking: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, directExpenses: { ...p.directExpenses, tollParking: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-blue-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300 bg-white" placeholder="0.00" />
                          </div>

                          <div className="mt-3 flex items-center justify-between rounded-lg bg-blue-200/60 px-4 py-3">
                            <span className="text-sm font-bold text-blue-900">Total Direct Expenses</span>
                            <span className="text-base font-bold text-blue-900">₱{fm(getDirectTotal())}</span>
                          </div>
                        </div>

                        {/* — Indirect Expenses (editable, pre-filled) — */}
                        <div className="rounded-xl border-2 border-amber-200 bg-amber-50/60 p-4">
                          <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-800 mb-4">
                            <span className="h-3 w-3 rounded-full bg-amber-600" />
                            Indirect Expenses
                          </h4>

                          <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
                            <span className="text-sm font-medium text-slate-700">Administration Fees</span>
                            <input type="text" value={quotationForm.indirectExpenses.adminFees}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, adminFees: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, adminFees: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-amber-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
                            <span className="text-sm font-medium text-slate-700">Insurance (Vehicle)</span>
                            <input type="text" value={quotationForm.indirectExpenses.insurance}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, insurance: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, insurance: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-amber-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-100">
                            <span className="text-sm font-medium text-slate-700">Motor Vehicle Registration</span>
                            <input type="text" value={quotationForm.indirectExpenses.motorVehicleReg}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, motorVehicleReg: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, motorVehicleReg: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-amber-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 bg-white" placeholder="0.00" />
                          </div>
                          <div className="flex items-center justify-between gap-3 py-2">
                            <span className="text-sm font-medium text-slate-700">Rental (Garage)</span>
                            <input type="text" value={quotationForm.indirectExpenses.garageRental}
                              onChange={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, garageRental: r } })) }}
                              onBlur={(e) => { const r = e.target.value.replace(/[^0-9.]/g, ''); if (r && !isNaN(parseFloat(r))) setQuotationForm(p => ({ ...p, indirectExpenses: { ...p.indirectExpenses, garageRental: parseFloat(r).toLocaleString('en-US', { minimumFractionDigits: 2 }) } })) }}
                              className="w-40 rounded-lg border border-amber-200 px-3 py-2 text-sm text-right font-mono outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300 bg-white" placeholder="0.00" />
                          </div>

                          <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-200/60 px-4 py-3">
                            <span className="text-sm font-bold text-amber-900">Total Indirect Expenses</span>
                            <span className="text-base font-bold text-amber-900">₱{fm(getIndirectTotal())}</span>
                          </div>
                        </div>

                        {/* — Summary — */}
                        <div className="rounded-xl border-2 border-slate-300 bg-slate-100/70 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700">Total Operating Expenses</span>
                            <span className="text-base font-bold text-slate-900">₱{fm(getOperatingTotal())}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-700">Income (15%)</span>
                            <span className="text-base font-bold text-emerald-700">₱{fm(getIncome())}</span>
                          </div>
                          <div className="flex items-center justify-between border-t-2 border-slate-300 pt-2">
                            <span className="text-sm font-bold text-slate-900 uppercase">Proposed Rate</span>
                            <span className="text-lg font-bold text-sky-700">₱{fm(getProposedRate())}</span>
                          </div>
                        </div>

                        <button
                          onClick={handleSubmitUpdatedQuotation}
                          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition"
                        >
                          <Send className="h-4 w-4" />
                          Submit Updated Quotation
                        </button>
                      </div>
                    )}

                  </div>
                </div>
              )}

                  {['APPROVED', 'ASSIGNED', 'FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(selectedRequest.status) && selectedRequest.quotation && (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <p className="text-sm text-emerald-800 font-medium">
                          Quotation Approved
                        </p>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
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
                      </div>
                    </div>
                  )}

              {hasApproved && quotationSubmitted && ['APPROVED', 'ASSIGNED', 'FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(selectedRequest.status) && (
                <div
                  className={`rounded-2xl border bg-white bg-gradient-to-b p-4 transition-colors ${
                    selectedRequest.crew?.driver && selectedRequest.crew?.truck?.plateNumber
                      ? 'border-emerald-400 from-emerald-50 to-white'
                      : 'border-indigo-200 from-indigo-50 to-white'
                  }`}
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Dispatch and Assignment</h3>
                    <p className="mt-1 text-xs text-slate-600">Choose the best-fit crew and truck for this approved request.</p>
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
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAssignment(prev => ({ ...prev, _showDrivers: !prev._showDrivers }))}
                        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200"
                      >
                        {selectedDriver ? (
                          <>
                            <img src={selectedDriver.avatarUrl} alt={selectedDriver.name} className="h-10 w-10 rounded-lg object-cover" />
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
                                setAssignment(prev => ({ ...prev, driverId: driver.id, _showDrivers: false }))
                              }}
                              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-indigo-50 ${
                                assignment.driverId === driver.id ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''
                              }`}
                            >
                              <img src={driver.avatarUrl} alt={driver.name} className="h-9 w-9 rounded-lg object-cover" />
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available Trucks</p>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAssignment(prev => ({ ...prev, _showTrucks: !prev._showTrucks }))}
                        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200"
                      >
                        {selectedTruck ? (
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <img src={selectedTruck.imageUrl} alt={selectedTruck.plateNumber} className="h-10 w-16 rounded-lg object-cover" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{selectedTruck.plateNumber}</p>
                              <p className="text-xs text-slate-500">{selectedTruck.truckType} • {selectedTruck.capacity}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="flex-1 text-sm text-slate-400">Select a truck...</span>
                        )}
                        <svg className={`ml-auto h-5 w-5 shrink-0 text-slate-400 transition ${assignment._showTrucks ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {assignment._showTrucks && (
                        <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {mockTrucks.filter(t => t.status === 'available' || t.plateNumber === assignment.plateNumber).map(truck => (
                            <button
                              key={truck.plateNumber}
                              type="button"
                              onClick={() => setAssignment(prev => ({ ...prev, plateNumber: truck.plateNumber, _showTrucks: false }))}
                              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-indigo-50 ${
                                assignment.plateNumber === truck.plateNumber ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''
                              }`}
                            >
                              <img src={truck.imageUrl} alt={truck.plateNumber} className="h-10 w-16 rounded-lg object-cover shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">{truck.plateNumber}</p>
                                <p className="text-xs text-slate-500">{truck.truckType} • {truck.capacity}</p>
                              </div>
                              {assignment.plateNumber === truck.plateNumber && (
                                <svg className="h-5 w-5 shrink-0 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available Helpers (max 2)</p>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAssignment(prev => ({ ...prev, _showHelpers: !prev._showHelpers }))}
                        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200"
                      >
                        {selectedHelpers.length > 0 ? (
                          <div className="flex flex-1 flex-wrap items-center gap-2">
                            {selectedHelpers.map(h => (
                              <span key={h.id} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                                <img src={h.avatarUrl} alt={h.name} className="h-5 w-5 rounded object-cover" />
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
                                <img src={helper.avatarUrl} alt={helper.name} className="h-9 w-9 rounded-lg object-cover" />
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
                    title={!canConfirmAssignment ? 'Select a driver, truck, and at least one helper.' : undefined}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Users className="h-4 w-4" />
                    {selectedRequest.crew?.driver ? 'Update Drivers and Helpers' : 'Confirm Drivers and Helpers'}
                  </button>
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
                          <img src={selectedDriver.avatarUrl} alt={selectedDriver.name} className="h-10 w-10 rounded-lg object-cover" />
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
                                <img src={h.avatarUrl} alt={h.name} className="h-8 w-8 rounded-lg object-cover" />
                                <p className="text-sm text-slate-900">{h.name}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="border-t border-slate-200 pt-3 flex items-center gap-3">
                          <img src={selectedTruck.imageUrl} alt={selectedTruck.plateNumber} className="h-10 w-16 rounded-lg object-cover" />
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
        <div className="flex h-full flex-col gap-4 overflow-hidden">
          <div className="flex shrink-0 flex-wrap gap-3">
          <button
            onClick={() => setActiveModule('inbox')}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              activeModule === 'inbox' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            Delivery Requests Inbox ({inboxRows.length})
          </button>
          <button
            onClick={() => setActiveModule('assignment')}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              activeModule === 'assignment' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            Assign Delivery Crew ({pendingAssignments.length})
          </button>
          <button
            onClick={() => setActiveModule('tracking')}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              activeModule === 'tracking' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            Deliveries ({ongoingDeliveries.length + completedDeliveries.length})
          </button>
        </div>

        {activeModule === 'inbox' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by ID, customer, company, or address..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">For Review</option>
                  <option value="QUOTED">Quoted</option>
                  <option value="COUNTER_OFFER">Counter Offer</option>
                  <option value="UPDATED_QUOTATION">Updated Quotation</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
                >
                  <option value="createdAt_desc">Newest First</option>
                  <option value="createdAt_asc">Oldest First</option>
                  <option value="customerName_asc">Customer A–Z</option>
                  <option value="customerName_desc">Customer Z–A</option>
                </select>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="shrink-0 hidden grid-cols-[0.55fr_0.65fr_1.1fr_1.6fr_1.6fr_0.55fr_0.3fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
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
                    className="grid cursor-pointer gap-4 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[0.55fr_0.65fr_1.1fr_1.6fr_1.6fr_0.55fr_0.3fr] lg:items-center"
                  >
                    <div className="flex justify-center">
                      <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${statusBadge[row.status]}`}>
                        {row.status.replaceAll('_', ' ')}
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

              {totalPages > 1 && (
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
              )}
            </div>
          </section>
        )}

        {activeModule === 'assignment' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={assignSearch}
                    onChange={(e) => {
                      setAssignSearch(e.target.value)
                      setAssignPage(1)
                    }}
                    placeholder="Search by ID, customer, company, or address..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm text-slate-500 whitespace-nowrap">{pendingAssignments.length} request{pendingAssignments.length !== 1 ? 's' : ''}</span>
                  <select
                    value={assignSortBy}
                    onChange={(e) => { setAssignSortBy(e.target.value); setAssignPage(1) }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
                  >
                    <option value="createdAt_desc">Newest First</option>
                    <option value="createdAt_asc">Oldest First</option>
                    <option value="customerName_asc">Customer A–Z</option>
                    <option value="customerName_desc">Customer Z–A</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="shrink-0 hidden grid-cols-[0.55fr_0.65fr_1.1fr_1.6fr_1.6fr_0.7fr_0.3fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
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
                    onClick={() => {
                      setSelectedRequest(row)
                      setHasApproved(true)
                      setQuotationSubmitted(true)
                    }}
                    className="grid cursor-pointer gap-4 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[0.55fr_0.65fr_1.1fr_1.6fr_1.6fr_0.7fr_0.3fr] lg:items-center"
                  >
                    <div className="flex justify-center">
                      <span className="inline-flex shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-indigo-700">
                        APPROVED
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

              {assignTotalPages > 1 && (
                <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
                  <p className="text-sm text-slate-500">
                    Page {assignPage} of {assignTotalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAssignPage(1)}
                      disabled={assignPage === 1}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                      title="First page"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>
                    <button
                      onClick={() => setAssignPage((p) => Math.max(1, p - 1))}
                      disabled={assignPage === 1}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div className="flex items-center gap-1 px-1">
                      {(() => {
                        const pages = []
                        if (assignTotalPages <= 7) {
                          for (let i = 1; i <= assignTotalPages; i++) pages.push(i)
                        } else {
                          pages.push(1)
                          if (assignPage > 3) pages.push('...')
                          for (let i = Math.max(2, assignPage - 1); i <= Math.min(assignTotalPages - 1, assignPage + 1); i++) pages.push(i)
                          if (assignPage < assignTotalPages - 2) pages.push('...')
                          pages.push(assignTotalPages)
                        }
                        return pages.map((num, idx) =>
                          num === '...' ? (
                            <span key={`ellipsis-a-${idx}`} className="flex h-8 w-8 items-center justify-center text-sm text-slate-400">...</span>
                          ) : (
                            <button
                              key={num}
                              onClick={() => setAssignPage(num)}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                                num === assignPage
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
                      onClick={() => setAssignPage((p) => Math.min(assignTotalPages, p + 1))}
                      disabled={assignPage === assignTotalPages}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                    <button
                      onClick={() => setAssignPage(assignTotalPages)}
                      disabled={assignPage === assignTotalPages}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Last page"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeModule === 'tracking' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
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
        )}
    </SupLayout>
  )
}

export default SupDeliveries
