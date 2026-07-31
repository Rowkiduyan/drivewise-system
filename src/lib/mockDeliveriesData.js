// Local mock database for deliveries.
// Acts as a stand-in for the real online database while the frontend is being
// wired up. Table names and column names follow snake_case.
//
// Usage from pages:
//   import { customer_deliveries } from '../lib/mockDeliveriesData.js'

// Table: customer_deliveries
// Mirrors the customer request delivery form (see CustomerRequestDelivery.jsx).
// Columns are the raw fields a customer submits when requesting a delivery.
export const customer_deliveries = [
  {
    id: 'DEL-001',
    approved_amount: null,
    customer_name: 'Juan Dela Cruz',
    company_name: '7-Eleven',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: 'AUV',
    cargo_weight: 500,
    pickup_date: '2026-07-25',
    pickup_time: '09:00',
    dropoff_date: '2026-07-25',
    dropoff_time: '12:00',
    pickup_location: '140 M. Suarez Avenue, Brgy. San Miguel, Pasig, Metro Manila',
    dropoff_location: '123 Main Street, Brgy. Central, Quezon City, Metro Manila',
    budget_min: 3000,
    budget_max: 5000,
    notes: 'Fragile items — handle with care',
    status: 'FOR_REVIEW',
    created_at: '2026-07-22 10:30',
  },
  {
    id: 'DEL-002',
    approved_amount: 3584,
    customer_name: 'Maria Santos',
    company_name: 'Arla',
    item_type: 'Frozen Goods',
    other_item_type: null,
    truck_type: '2T_REF',
    cargo_weight: 1200,
    pickup_date: '2026-07-25',
    pickup_time: '14:00',
    dropoff_date: '2026-07-25',
    dropoff_time: '17:00',
    pickup_location: '456 Industrial Complex, Brgy. San Antonio, Makati',
    dropoff_location: '789 Residential Area, Brgy. Poblacion, Muntinlupa',
    budget_min: 3200,
    budget_max: 4000,
    notes: 'Includes cold chain handling',
    status: 'APPROVED',
    created_at: '2026-07-21 08:00',
  },
  {
    id: 'DEL-003',
    approved_amount: null,
    customer_name: 'Carlo Gomez',
    company_name: 'Jollibee',
    item_type: 'Fast Food',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 450,
    pickup_date: '2026-07-24',
    pickup_time: '07:00',
    dropoff_date: '2026-07-24',
    dropoff_time: '10:00',
    pickup_location: '321 Warehouse District, Brgy. Valenzuela, Caloocan',
    dropoff_location: '654 Business Park, Brgy. Bicutan, Parañaque',
    budget_min: 4800,
    budget_max: 8000,
    notes: 'Rush delivery requested',
    status: 'QUOTED',
    created_at: '2026-07-20 14:00',
  },
  {
    id: 'DEL-004',
    approved_amount: 4454,
    customer_name: 'Ana Ramirez',
    company_name: "McDonald's",
    item_type: 'Frozen Goods',
    other_item_type: null,
    truck_type: '2T_REF',
    cargo_weight: 1000,
    pickup_date: '2026-07-20',
    pickup_time: '08:30',
    dropoff_date: '2026-07-20',
    dropoff_time: '12:00',
    pickup_location: 'Pasig Hub, Brgy. San Joaquin, Pasig',
    dropoff_location: 'BGC Branch, Brgy. Fort Bonifacio, Taguig',
    budget_min: 4000,
    budget_max: 5000,
    notes: 'Standard delivery',
    status: 'COMPLETED',
    created_at: '2026-07-18 10:00',
  },
  {
    id: 'DEL-005',
    approved_amount: 3559,
    customer_name: 'Roberto Dimagiba',
    company_name: 'Chowking',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: '2T_REF',
    cargo_weight: 850,
    pickup_date: '2026-07-19',
    pickup_time: '06:00',
    dropoff_date: '2026-07-19',
    dropoff_time: '09:00',
    pickup_location: 'Cavite Depot, Brgy. San Antonio, Cavite',
    dropoff_location: 'Alabang Branch, Brgy. Alabang, Muntinlupa',
    budget_min: 3200,
    budget_max: 4000,
    notes: 'Early morning delivery',
    status: 'COMPLETED',
    created_at: '2026-07-17 09:00',
  },
  {
    id: 'DEL-006',
    approved_amount: null,
    customer_name: 'Lisa Mendiola',
    company_name: 'KFC',
    item_type: 'Fast Food',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 400,
    pickup_date: '2026-07-17',
    pickup_time: '11:00',
    dropoff_date: '2026-07-17',
    dropoff_time: '14:00',
    pickup_location: 'Manila Warehouse, Brgy. Santa Cruz, Manila',
    dropoff_location: 'Ortigas Branch, Brgy. San Antonio, Pasig',
    budget_min: 2800,
    budget_max: 3500,
    notes: 'Standard rate',
    status: 'CANCELLED',
    created_at: '2026-07-15 13:00',
  },
  {
    id: 'DEL-007',
    approved_amount: null,
    customer_name: 'Pedro Gonzales',
    company_name: 'Shell Depot',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 750,
    pickup_date: '2026-07-28',
    pickup_time: '08:00',
    dropoff_date: '2026-07-28',
    dropoff_time: '11:00',
    pickup_location: 'Shell Gas Complex, Brgy. Tabang, Guiguinto, Bulacan',
    dropoff_location: 'Balagtas Station, Brgy. Poblacion, Balagtas, Bulacan',
    budget_min: 3000,
    budget_max: 4500,
    notes: 'Fuel depot pickup',
    status: 'FOR_REVIEW',
    created_at: '2026-07-25 09:00',
  },
  {
    id: 'DEL-008',
    approved_amount: null,
    customer_name: 'Sofia Reyes',
    company_name: 'SM Appliance Center',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: '4T_DRY',
    cargo_weight: 1500,
    pickup_date: '2026-07-28',
    pickup_time: '10:00',
    dropoff_date: '2026-07-28',
    dropoff_time: '13:00',
    pickup_location: 'SM Warehouse, Brgy. San Jose, San Fernando, Pampanga',
    dropoff_location: 'SM Clark, Brgy. Balibago, Angeles City, Pampanga',
    budget_min: 5000,
    budget_max: 8000,
    notes: 'Large appliances on pallets',
    status: 'FOR_REVIEW',
    created_at: '2026-07-25 11:30',
  },
  {
    id: 'DEL-011',
    approved_amount: null,
    customer_name: 'Ramon Bautista',
    company_name: 'Pizza Hut',
    item_type: 'Fast Food',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 500,
    pickup_date: '2026-07-27',
    pickup_time: '09:00',
    dropoff_date: '2026-07-27',
    dropoff_time: '12:00',
    pickup_location: 'Pizza Hut Commissary, Brgy. San Antonio, Makati',
    dropoff_location: 'Pizza Hut Katipunan, Brgy. Loyola Heights, Quezon City',
    budget_min: 12000,
    budget_max: 15000,
    notes: 'Busy lunch-hour window',
    status: 'COUNTER_OFFER',
    created_at: '2026-07-24 08:15',
  },
  {
    id: 'DEL-015',
    approved_amount: 4341,
    customer_name: 'Mark Anthony Hernandez',
    company_name: 'Puregold',
    item_type: 'Frozen Goods',
    other_item_type: null,
    truck_type: '2T_REF',
    cargo_weight: 1500,
    pickup_date: '2026-07-31',
    pickup_time: '08:00',
    dropoff_date: '2026-07-31',
    dropoff_time: '12:00',
    pickup_location: 'Puregold Warehouse, Brgy. Tambo, Parañaque',
    dropoff_location: 'Puregold Sucat, Brgy. San Dionisio, Parañaque',
    budget_min: 4000,
    budget_max: 5000,
    notes: 'Includes cold storage handling',
    status: 'APPROVED',
    created_at: '2026-07-28 09:20',
  },
  {
    id: 'DEL-017',
    approved_amount: 3240,
    customer_name: 'Emilio Jacinto',
    company_name: 'Petron Corporation',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: '4T_DRY',
    cargo_weight: 800,
    pickup_date: '2026-08-01',
    pickup_time: '06:00',
    dropoff_date: '2026-08-01',
    dropoff_time: '09:00',
    pickup_location: 'Petron Depot, Brgy. San Roque, Marikina',
    dropoff_location: 'Petron Gas Station EDSA, Brgy. San Lorenzo, Makati',
    budget_min: 3000,
    budget_max: 4000,
    notes: 'Early morning delivery',
    status: 'APPROVED',
    created_at: '2026-07-29 08:30',
  },
  {
    id: 'DEL-018',
    approved_amount: 5083,
    customer_name: 'Lorna Santiago',
    company_name: 'Goldilocks',
    item_type: 'Frozen Goods',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 900,
    pickup_date: '2026-07-26',
    pickup_time: '04:00',
    dropoff_date: '2026-07-26',
    dropoff_time: '08:00',
    pickup_location: 'Goldilocks Commissary, Brgy. Pinyahan, Quezon City',
    dropoff_location: 'Goldilocks SM Dasma, Brgy. Paliparan III, Dasmariñas, Cavite',
    budget_min: 4500,
    budget_max: 6000,
    notes: 'Long distance delivery with refrigeration',
    status: 'COMPLETED',
    created_at: '2026-07-23 14:00',
  },
  {
    id: 'DEL-019',
    approved_amount: null,
    customer_name: 'Nestor Cabrera',
    company_name: 'Mini Stop',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 700,
    pickup_date: '2026-07-28',
    pickup_time: '11:00',
    dropoff_date: '2026-07-28',
    dropoff_time: '14:00',
    pickup_location: 'Mini Stop Warehouse, Brgy. San Isidro, Cainta, Rizal',
    dropoff_location: 'Mini Stop Angono, Brgy. San Vicente, Angono, Rizal',
    budget_min: 6000,
    budget_max: 8000,
    notes: 'Standard dry goods delivery',
    status: 'QUOTED',
    created_at: '2026-07-26 11:00',
  },
  {
    id: 'DEL-020',
    approved_amount: 2714,
    customer_name: 'Catherine De Leon',
    company_name: 'Army Navy',
    item_type: 'Fast Food',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 350,
    pickup_date: '2026-07-29',
    pickup_time: '07:00',
    dropoff_date: '2026-07-29',
    dropoff_time: '10:00',
    pickup_location: 'Army Navy Commissary, Brgy. Bel-Air, Makati',
    dropoff_location: 'Army Navy BGC, Brgy. Fort Bonifacio, Taguig',
    budget_min: 2500,
    budget_max: 3500,
    notes: 'Weekday delivery',
    status: 'APPROVED',
    created_at: '2026-07-26 15:00',
  },
  {
    id: 'DEL-024',
    approved_amount: 5754,
    customer_name: 'Helen Reyes',
    company_name: 'Puregold',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: '4T_DRY',
    cargo_weight: 1800,
    pickup_date: '2026-07-26',
    pickup_time: '09:00',
    dropoff_date: '2026-07-26',
    dropoff_time: '14:00',
    pickup_location: 'Puregold Warehouse, Brgy. San Bartolome, Novaliches, Quezon City',
    dropoff_location: 'Puregold Sucat Branch, Brgy. San Dionisio, Parañaque',
    budget_min: 5000,
    budget_max: 6500,
    notes: 'Includes Saturday surcharge',
    status: 'FOR_PICKUP',
    created_at: '2026-07-23 11:00',
  },
  {
    id: 'DEL-025',
    approved_amount: 7357,
    customer_name: 'Danny Chua',
    company_name: 'San Miguel Corporation',
    item_type: 'Beverages',
    other_item_type: null,
    truck_type: '4T_DRY',
    cargo_weight: 1500,
    pickup_date: '2026-07-26',
    pickup_time: '06:00',
    dropoff_date: '2026-07-26',
    dropoff_time: '11:00',
    pickup_location: 'SMC Plant, Brgy. Bagbaguin, Meycauayan, Bulacan',
    dropoff_location: 'SMC Depot, Brgy. Poblacion, Valenzuela City',
    budget_min: 6500,
    budget_max: 9000,
    notes: 'Bulk delivery — palletised',
    status: 'OUT_FOR_DELIVERY',
    created_at: '2026-07-24 09:00',
  },
  {
    id: 'DEL-026',
    approved_amount: 3185,
    customer_name: 'Lorna Perez',
    company_name: 'National Book Store',
    item_type: 'School Supplies',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 600,
    pickup_date: '2026-07-26',
    pickup_time: '07:30',
    dropoff_date: '2026-07-26',
    dropoff_time: '12:00',
    pickup_location: 'NBS Warehouse, Brgy. San Rafael, Cubao, Quezon City',
    dropoff_location: 'NBS SM North EDSA Branch, Brgy. Bagong Pag-asa, Quezon City',
    budget_min: 2800,
    budget_max: 4000,
    notes: 'Light cargo — multiple boxes',
    status: 'DELIVERED',
    created_at: '2026-07-22 14:00',
  },
  {
    id: 'DEL-040',
    approved_amount: null,
    customer_name: 'Antonio Bautista',
    company_name: 'LBC Express',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: '4T_DRY',
    cargo_weight: 2000,
    pickup_date: '2026-08-05',
    pickup_time: '08:00',
    dropoff_date: '2026-08-06',
    dropoff_time: '12:00',
    pickup_location: 'LBC Main Hub, Brgy. San Nicolas, Pasig',
    dropoff_location: 'LBC Branch, Brgy. Poblacion, San Pablo, Laguna',
    budget_min: 16000,
    budget_max: 20000,
    notes: 'Long-haul provincial delivery',
    status: 'COUNTER_OFFER',
    created_at: '2026-08-01 10:30',
  },
  {
    id: 'DEL-041',
    approved_amount: null,
    customer_name: 'Marlon Torres',
    company_name: 'DHL Express',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: '4T_DRY',
    cargo_weight: 1800,
    pickup_date: '2026-08-10',
    pickup_time: '06:00',
    dropoff_date: '2026-08-11',
    dropoff_time: '14:00',
    pickup_location: 'DHL Hub, Brgy. San Martin, Parañaque',
    dropoff_location: 'DHL Branch, Brgy. Poblacion, Lipa, Batangas',
    budget_min: 10000,
    budget_max: 13000,
    notes: 'Multi-day provincial delivery',
    status: 'UPDATED_QUOTATION',
    created_at: '2026-08-05 09:00',
  },
  {
    id: 'DEL-009',
    approved_amount: null,
    customer_name: 'Jenny Cruz',
    company_name: 'Puregold',
    item_type: 'Dry Food',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 700,
    pickup_date: '2026-07-22',
    pickup_time: '09:00',
    dropoff_date: '2026-07-22',
    dropoff_time: '13:00',
    pickup_location: 'Puregold Warehouse, Brgy. San Roque, Parañaque',
    dropoff_location: 'Puregold Sucat Branch, Brgy. San Dionisio, Parañaque',
    budget_min: 3000,
    budget_max: 4500,
    notes: null,
    status: 'CANCELLED',
    created_at: '2026-07-20 09:30',
  },
  {
    id: 'DEL-010',
    approved_amount: null,
    customer_name: 'Kevin Ramos',
    company_name: 'Watsons',
    item_type: 'Pharmaceuticals',
    other_item_type: null,
    truck_type: 'AUV',
    cargo_weight: 350,
    pickup_date: '2026-07-21',
    pickup_time: '10:00',
    dropoff_date: '2026-07-21',
    dropoff_time: '14:00',
    pickup_location: 'Watsons Distribution, Brgy. San Antonio, Makati',
    dropoff_location: 'Watsons Mall Branch, Brgy. Greenhills, San Juan',
    budget_min: 2800,
    budget_max: 4000,
    notes: 'Temperature-sensitive items',
    status: 'CANCELLED',
    created_at: '2026-07-18 14:00',
  },
  {
    id: 'DEL-012',
    approved_amount: 5200,
    customer_name: 'Maricel Santos',
    company_name: 'Robinsons Supermarket',
    item_type: 'Beverages',
    other_item_type: null,
    truck_type: 'L300',
    cargo_weight: 1100,
    pickup_date: '2026-07-22',
    pickup_time: '06:00',
    dropoff_date: '2026-07-22',
    dropoff_time: '11:00',
    pickup_location: 'Robinsons Warehouse, Brgy. Maybunga, Pasig',
    dropoff_location: 'Robinsons Galleria Branch, Brgy. Ortigas Center, Pasig',
    budget_min: 4200,
    budget_max: 6000,
    notes: 'Morning window delivery',
    status: 'CANCELLED',
    created_at: '2026-07-17 11:00',
  },
]

// Table: delivery_drivers
// Registered delivery drivers available for assignment.
export const delivery_drivers = [
  {
    id: 'DRV-001',
    name: 'Carlos Mendoza',
    status: 'available',
    phone: '+63 912 311 1222',
    rating: 4.8,
    trips: 126,
    default_helper_ids: ['HLP-001'],
  },
  {
    id: 'DRV-002',
    name: 'Miguel Santos',
    status: 'available',
    phone: '+63 917 832 4100',
    rating: 4.7,
    trips: 104,
    default_helper_ids: ['HLP-002'],
  },
  {
    id: 'DRV-003',
    name: 'Antonio Flores',
    status: 'on_delivery',
    phone: '+63 915 789 0123',
    rating: 4.6,
    trips: 89,
    default_helper_ids: ['HLP-003'],
  },
  {
    id: 'DRV-004',
    name: 'Ramon Bautista',
    status: 'on_delivery',
    phone: '+63 918 456 7890',
    rating: 4.9,
    trips: 215,
    default_helper_ids: ['HLP-004'],
  },
  {
    id: 'DRV-005',
    name: 'Felipe Gonzaga',
    status: 'on_delivery',
    phone: '+63 920 111 2233',
    rating: 4.5,
    trips: 67,
    default_helper_ids: ['HLP-005'],
  },
]

// Table: delivery_helpers
// Registered loading helpers available for assignment.
export const delivery_helpers = [
  {
    id: 'HLP-001',
    name: 'Pedro Garcia',
    status: 'available',
  },
  {
    id: 'HLP-002',
    name: 'Luis Torres',
    status: 'available',
  },
  {
    id: 'HLP-003',
    name: 'Rico Aquino',
    status: 'on_delivery',
  },
  {
    id: 'HLP-004',
    name: 'Victor Cruz',
    status: 'on_delivery',
  },
  {
    id: 'HLP-005',
    name: 'Ricky Santos',
    status: 'on_delivery',
  },
]

// Table: delivery_trucks
// Fleet vehicles available for dispatch.
export const delivery_trucks = [
  {
    plate_number: 'ABC 1234',
    truck_type: 'AUV',
    status: 'available',
    capacity: '1.2 tons',
    commodity_type: 'Ordinary',
    default_driver_id: 'DRV-001',
  },
  {
    plate_number: 'XYZ 5678',
    truck_type: '2T_REF',
    status: 'available',
    capacity: '2.0 tons',
    commodity_type: 'Chilled',
    default_driver_id: 'DRV-002',
  },
  {
    plate_number: 'DEF 9012',
    truck_type: 'L300',
    status: 'available',
    capacity: '1.0 ton',
    commodity_type: 'Ordinary',
    default_driver_id: 'DRV-003',
  },
  {
    plate_number: 'JKL 7890',
    truck_type: '2T_DRY',
    status: 'on_delivery',
    capacity: '2.0 tons',
    commodity_type: 'Ordinary',
    default_driver_id: 'DRV-004',
  },
  {
    plate_number: 'DEF 5678',
    truck_type: '4T_DRY',
    status: 'on_delivery',
    capacity: '4.0 tons',
    commodity_type: 'Ordinary',
    default_driver_id: 'DRV-003',
  },
  {
    plate_number: 'GHI 9012',
    truck_type: '6T_DRY',
    status: 'on_delivery',
    capacity: '6.0 tons',
    commodity_type: 'Ordinary',
    default_driver_id: 'DRV-004',
  },
  {
    plate_number: 'JKL 3456',
    truck_type: 'L300',
    status: 'on_delivery',
    capacity: '1.5 tons',
    commodity_type: 'Ordinary',
    default_driver_id: 'DRV-005',
  },
]

export const delivery_quotations = [
  {
    id: 'QTN-001',
    delivery_id: 'DEL-002',
    quotation_type: 'initial',
    amount: 3584,
    breakdown: {
      'directExpenses': {
        'depreciation': '300.00',
        'dieselRate': '55.00',
        'repairsAndMaintenance': {
          'batteries': '400.00',
          'tires': '500.00'
        },
        'salariesAndWages': {
          'driver': '250.00',
          'helper1': '150.00',
          'helper2': ''
        },
        'tripAllowance': '80.00',
        'lodgingAllowance': '50.00',
        'tollParking': '40.00'
      },
      'indirectExpenses': {
        'adminFees': '150.00',
        'insurance': '250.00',
        'motorVehicleReg': '120.00',
        'garageRental': '150.00'
      },
      'calculated': {
        'distanceKm': 12.3,
        'totalDays': 1,
        'dieselTotal': 676.5,
        'directTotal': 2446.5,
        'indirectTotal': 670,
        'operatingTotal': 3116.5,
        'income': 467.475,
        'proposedRate': 3583.975
      }
    },
    notes: 'Includes cold chain handling',
    valid_until: '2026-07-24',
    created_at: '2026-07-21 10:00',
  },
  {
    id: 'QTN-002',
    delivery_id: 'DEL-003',
    quotation_type: 'initial',
    amount: 14835,
    breakdown: {
      'directExpenses': {
        'depreciation': '1,500.00',
        'dieselRate': '58.00',
        'repairsAndMaintenance': {
          'batteries': '2,000.00',
          'tires': '3,500.00'
        },
        'salariesAndWages': {
          'driver': '800.00',
          'helper1': '500.00',
          'helper2': '400.00'
        },
        'tripAllowance': '350.00',
        'lodgingAllowance': '250.00',
        'tollParking': '200.00'
      },
      'indirectExpenses': {
        'adminFees': '500.00',
        'insurance': '1,200.00',
        'motorVehicleReg': '800.00',
        'garageRental': '1,000.00'
      },
      'calculated': {
        'distanceKm': 24.5,
        'totalDays': 1,
        'dieselTotal': 1421,
        'directTotal': 9400,
        'indirectTotal': 3500,
        'operatingTotal': 12900,
        'income': 1935,
        'proposedRate': 14835
      }
    },
    notes: null,
    valid_until: null,
    created_at: '2026-07-20 16:00',
  },
  {
    id: 'QTN-003',
    delivery_id: 'DEL-004',
    quotation_type: 'initial',
    amount: 4454,
    breakdown: {
      'directExpenses': {
        'depreciation': '400.00',
        'dieselRate': '55.00',
        'repairsAndMaintenance': {
          'batteries': '500.00',
          'tires': '650.00'
        },
        'salariesAndWages': {
          'driver': '300.00',
          'helper1': '200.00',
          'helper2': ''
        },
        'tripAllowance': '100.00',
        'lodgingAllowance': '60.00',
        'tollParking': '50.00'
      },
      'indirectExpenses': {
        'adminFees': '150.00',
        'insurance': '280.00',
        'motorVehicleReg': '180.00',
        'garageRental': '200.00'
      },
      'calculated': {
        'distanceKm': 14.6,
        'totalDays': 1,
        'dieselTotal': 803,
        'directTotal': 3063,
        'indirectTotal': 810,
        'operatingTotal': 3873,
        'income': 580.95,
        'proposedRate': 4453.95
      }
    },
    notes: 'Standard delivery',
    valid_until: '2026-07-22',
    created_at: '2026-07-18 12:00',
  },
  {
    id: 'QTN-004',
    delivery_id: 'DEL-005',
    quotation_type: 'initial',
    amount: 3559,
    breakdown: {
      'directExpenses': {
        'depreciation': '320.00',
        'dieselRate': '54.00',
        'repairsAndMaintenance': {
          'batteries': '400.00',
          'tires': '500.00'
        },
        'salariesAndWages': {
          'driver': '280.00',
          'helper1': '180.00',
          'helper2': ''
        },
        'tripAllowance': '80.00',
        'lodgingAllowance': '50.00',
        'tollParking': '40.00'
      },
      'indirectExpenses': {
        'adminFees': '120.00',
        'insurance': '220.00',
        'motorVehicleReg': '140.00',
        'garageRental': '160.00'
      },
      'calculated': {
        'distanceKm': 11.2,
        'totalDays': 1,
        'dieselTotal': 604.8,
        'directTotal': 2454.8,
        'indirectTotal': 640,
        'operatingTotal': 3094.8,
        'income': 464.22,
        'proposedRate': 3559.02
      }
    },
    notes: 'Early morning delivery',
    valid_until: '2026-07-21',
    created_at: '2026-07-17 11:00',
  },
  {
    id: 'QTN-005',
    delivery_id: 'DEL-006',
    quotation_type: 'initial',
    amount: 3104,
    breakdown: {
      'directExpenses': {
        'depreciation': '260.00',
        'dieselRate': '53.00',
        'repairsAndMaintenance': {
          'batteries': '350.00',
          'tires': '450.00'
        },
        'salariesAndWages': {
          'driver': '240.00',
          'helper1': '160.00',
          'helper2': ''
        },
        'tripAllowance': '70.00',
        'lodgingAllowance': '40.00',
        'tollParking': '30.00'
      },
      'indirectExpenses': {
        'adminFees': '110.00',
        'insurance': '200.00',
        'motorVehicleReg': '130.00',
        'garageRental': '150.00'
      },
      'calculated': {
        'distanceKm': 9.6,
        'totalDays': 1,
        'dieselTotal': 508.8,
        'directTotal': 2108.8,
        'indirectTotal': 590,
        'operatingTotal': 2698.8,
        'income': 404.82,
        'proposedRate': 3103.62
      }
    },
    notes: 'Standard rate',
    valid_until: '2026-07-19',
    created_at: '2026-07-15 15:00',
  },
  {
    id: 'QTN-006',
    delivery_id: 'DEL-011',
    quotation_type: 'initial',
    amount: 8500,
    breakdown: {
      'directExpenses': {
        'depreciation': '800.00',
        'dieselRate': '55.00',
        'repairsAndMaintenance': {
          'batteries': '1,000.00',
          'tires': '1,500.00'
        },
        'salariesAndWages': {
          'driver': '600.00',
          'helper1': '400.00',
          'helper2': ''
        },
        'tripAllowance': '250.00',
        'lodgingAllowance': '150.00',
        'tollParking': '100.00'
      },
      'indirectExpenses': {
        'adminFees': '300.00',
        'insurance': '800.00',
        'motorVehicleReg': '500.00',
        'garageRental': '600.00'
      },
      'calculated': {
        'distanceKm': 18.5,
        'totalDays': 1,
        'dieselTotal': 1017.5,
        'directTotal': 5567.5,
        'indirectTotal': 2200,
        'operatingTotal': 7767.5,
        'income': 1165.125,
        'proposedRate': 8932.625
      }
    },
    notes: null,
    valid_until: null,
    created_at: '2026-07-24 10:15',
  },
  {
    id: 'QTN-007',
    delivery_id: 'DEL-015',
    quotation_type: 'initial',
    amount: 4341,
    breakdown: {
      'directExpenses': {
        'depreciation': '320.00',
        'dieselRate': '56.00',
        'repairsAndMaintenance': {
          'batteries': '450.00',
          'tires': '600.00'
        },
        'salariesAndWages': {
          'driver': '300.00',
          'helper1': '200.00',
          'helper2': ''
        },
        'tripAllowance': '100.00',
        'lodgingAllowance': '60.00',
        'tollParking': '50.00'
      },
      'indirectExpenses': {
        'adminFees': '160.00',
        'insurance': '300.00',
        'motorVehicleReg': '150.00',
        'garageRental': '200.00'
      },
      'calculated': {
        'distanceKm': 15.8,
        'totalDays': 1,
        'dieselTotal': 884.8,
        'directTotal': 2964.8,
        'indirectTotal': 810,
        'operatingTotal': 3774.8,
        'income': 566.22,
        'proposedRate': 4341.02
      }
    },
    notes: 'Includes cold storage handling',
    valid_until: '2026-07-30',
    created_at: '2026-07-28 11:20',
  },
  {
    id: 'QTN-008',
    delivery_id: 'DEL-017',
    quotation_type: 'initial',
    amount: 3240,
    breakdown: {
      'directExpenses': {
        'depreciation': '280.00',
        'dieselRate': '54.00',
        'repairsAndMaintenance': {
          'batteries': '350.00',
          'tires': '450.00'
        },
        'salariesAndWages': {
          'driver': '250.00',
          'helper1': '180.00',
          'helper2': ''
        },
        'tripAllowance': '70.00',
        'lodgingAllowance': '40.00',
        'tollParking': '30.00'
      },
      'indirectExpenses': {
        'adminFees': '130.00',
        'insurance': '220.00',
        'motorVehicleReg': '110.00',
        'garageRental': '140.00'
      },
      'calculated': {
        'distanceKm': 10.5,
        'totalDays': 1,
        'dieselTotal': 567,
        'directTotal': 2217,
        'indirectTotal': 600,
        'operatingTotal': 2817,
        'income': 422.55,
        'proposedRate': 3239.55
      }
    },
    notes: 'Early morning delivery',
    valid_until: '2026-07-31',
    created_at: '2026-07-29 10:30',
  },
  {
    id: 'QTN-009',
    delivery_id: 'DEL-018',
    quotation_type: 'initial',
    amount: 5083,
    breakdown: {
      'directExpenses': {
        'depreciation': '450.00',
        'dieselRate': '56.00',
        'repairsAndMaintenance': {
          'batteries': '550.00',
          'tires': '700.00'
        },
        'salariesAndWages': {
          'driver': '320.00',
          'helper1': '220.00',
          'helper2': ''
        },
        'tripAllowance': '120.00',
        'lodgingAllowance': '70.00',
        'tollParking': '60.00'
      },
      'indirectExpenses': {
        'adminFees': '180.00',
        'insurance': '300.00',
        'motorVehicleReg': '200.00',
        'garageRental': '220.00'
      },
      'calculated': {
        'distanceKm': 18.4,
        'totalDays': 1,
        'dieselTotal': 1030.4,
        'directTotal': 3520.4,
        'indirectTotal': 900,
        'operatingTotal': 4420.4,
        'income': 663.06,
        'proposedRate': 5083.46
      }
    },
    notes: 'Long distance delivery with refrigeration',
    valid_until: '2026-07-25',
    created_at: '2026-07-23 16:00',
  },
  {
    id: 'QTN-010',
    delivery_id: 'DEL-019',
    quotation_type: 'initial',
    amount: 6780,
    breakdown: {
      'directExpenses': {
        'depreciation': '700.00',
        'dieselRate': '52.00',
        'repairsAndMaintenance': {
          'batteries': '800.00',
          'tires': '1,200.00'
        },
        'salariesAndWages': {
          'driver': '500.00',
          'helper1': '350.00',
          'helper2': ''
        },
        'tripAllowance': '200.00',
        'lodgingAllowance': '100.00',
        'tollParking': '80.00'
      },
      'indirectExpenses': {
        'adminFees': '250.00',
        'insurance': '600.00',
        'motorVehicleReg': '400.00',
        'garageRental': '500.00'
      },
      'calculated': {
        'distanceKm': 15.2,
        'totalDays': 1,
        'dieselTotal': 790.4,
        'directTotal': 4820.4,
        'indirectTotal': 1750,
        'operatingTotal': 6570.4,
        'income': 985.56,
        'proposedRate': 7555.96
      }
    },
    notes: null,
    valid_until: null,
    created_at: '2026-07-26 13:00',
  },
  {
    id: 'QTN-011',
    delivery_id: 'DEL-020',
    quotation_type: 'initial',
    amount: 2714,
    breakdown: {
      'directExpenses': {
        'depreciation': '240.00',
        'dieselRate': '53.00',
        'repairsAndMaintenance': {
          'batteries': '300.00',
          'tires': '400.00'
        },
        'salariesAndWages': {
          'driver': '220.00',
          'helper1': '150.00',
          'helper2': ''
        },
        'tripAllowance': '60.00',
        'lodgingAllowance': '30.00',
        'tollParking': '25.00'
      },
      'indirectExpenses': {
        'adminFees': '110.00',
        'insurance': '180.00',
        'motorVehicleReg': '90.00',
        'garageRental': '120.00'
      },
      'calculated': {
        'distanceKm': 8.2,
        'totalDays': 1,
        'dieselTotal': 434.6,
        'directTotal': 1859.6,
        'indirectTotal': 500,
        'operatingTotal': 2359.6,
        'income': 353.94,
        'proposedRate': 2713.54
      }
    },
    notes: 'Weekday delivery',
    valid_until: '2026-07-30',
    created_at: '2026-07-26 17:00',
  },
  {
    id: 'QTN-012',
    delivery_id: 'DEL-024',
    quotation_type: 'initial',
    amount: 5754,
    breakdown: {
      'directExpenses': {
        'depreciation': '500.00',
        'dieselRate': '57.00',
        'repairsAndMaintenance': {
          'batteries': '600.00',
          'tires': '750.00'
        },
        'salariesAndWages': {
          'driver': '350.00',
          'helper1': '240.00',
          'helper2': ''
        },
        'tripAllowance': '130.00',
        'lodgingAllowance': '80.00',
        'tollParking': '70.00'
      },
      'indirectExpenses': {
        'adminFees': '200.00',
        'insurance': '320.00',
        'motorVehicleReg': '220.00',
        'garageRental': '250.00'
      },
      'calculated': {
        'distanceKm': 22.7,
        'totalDays': 1,
        'dieselTotal': 1293.9,
        'directTotal': 4013.9,
        'indirectTotal': 990,
        'operatingTotal': 5003.9,
        'income': 750.585,
        'proposedRate': 5754.485
      }
    },
    notes: 'Includes Saturday surcharge',
    valid_until: '2026-07-28',
    created_at: '2026-07-23 13:00',
  },
  {
    id: 'QTN-013',
    delivery_id: 'DEL-025',
    quotation_type: 'initial',
    amount: 7357,
    breakdown: {
      'directExpenses': {
        'depreciation': '600.00',
        'dieselRate': '58.00',
        'repairsAndMaintenance': {
          'batteries': '800.00',
          'tires': '1000.00'
        },
        'salariesAndWages': {
          'driver': '400.00',
          'helper1': '280.00',
          'helper2': '200.00'
        },
        'tripAllowance': '160.00',
        'lodgingAllowance': '100.00',
        'tollParking': '90.00'
      },
      'indirectExpenses': {
        'adminFees': '250.00',
        'insurance': '400.00',
        'motorVehicleReg': '280.00',
        'garageRental': '300.00'
      },
      'calculated': {
        'distanceKm': 26.5,
        'totalDays': 1,
        'dieselTotal': 1537,
        'directTotal': 5167,
        'indirectTotal': 1230,
        'operatingTotal': 6397,
        'income': 959.55,
        'proposedRate': 7356.55
      }
    },
    notes: 'Bulk delivery — palletised',
    valid_until: '2026-07-27',
    created_at: '2026-07-24 11:00',
  },
  {
    id: 'QTN-014',
    delivery_id: 'DEL-026',
    quotation_type: 'initial',
    amount: 3185,
    breakdown: {
      'directExpenses': {
        'depreciation': '280.00',
        'dieselRate': '53.00',
        'repairsAndMaintenance': {
          'batteries': '350.00',
          'tires': '450.00'
        },
        'salariesAndWages': {
          'driver': '250.00',
          'helper1': '170.00',
          'helper2': ''
        },
        'tripAllowance': '70.00',
        'lodgingAllowance': '40.00',
        'tollParking': '30.00'
      },
      'indirectExpenses': {
        'adminFees': '120.00',
        'insurance': '210.00',
        'motorVehicleReg': '130.00',
        'garageRental': '150.00'
      },
      'calculated': {
        'distanceKm': 9.8,
        'totalDays': 1,
        'dieselTotal': 519.4,
        'directTotal': 2159.4,
        'indirectTotal': 610,
        'operatingTotal': 2769.4,
        'income': 415.41,
        'proposedRate': 3184.81
      }
    },
    notes: 'Light cargo — multiple boxes',
    valid_until: '2026-07-25',
    created_at: '2026-07-22 16:00',
  },
  {
    id: 'QTN-015',
    delivery_id: 'DEL-040',
    quotation_type: 'initial',
    amount: 18500,
    breakdown: {
      'directExpenses': {
        'depreciation': '2,000.00',
        'dieselRate': '62.00',
        'repairsAndMaintenance': {
          'batteries': '2,500.00',
          'tires': '4,000.00'
        },
        'salariesAndWages': {
          'driver': '1,000.00',
          'helper1': '600.00',
          'helper2': '500.00'
        },
        'tripAllowance': '400.00',
        'lodgingAllowance': '300.00',
        'tollParking': '250.00'
      },
      'indirectExpenses': {
        'adminFees': '600.00',
        'insurance': '1,500.00',
        'motorVehicleReg': '900.00',
        'garageRental': '1,200.00'
      },
      'calculated': {
        'distanceKm': 72.3,
        'totalDays': 2,
        'dieselTotal': 4482.6,
        'directTotal': 13932.6,
        'indirectTotal': 4200,
        'operatingTotal': 18132.6,
        'income': 2719.89,
        'proposedRate': 20852.49
      }
    },
    notes: null,
    valid_until: null,
    created_at: '2026-08-01 12:30',
  },
  {
    id: 'QTN-016',
    delivery_id: 'DEL-041',
    quotation_type: 'initial',
    amount: 12500,
    breakdown: {
      'directExpenses': {
        'depreciation': '1,200.00',
        'dieselRate': '55.00',
        'repairsAndMaintenance': {
          'batteries': '1,800.00',
          'tires': '2,500.00'
        },
        'salariesAndWages': {
          'driver': '700.00',
          'helper1': '450.00',
          'helper2': ''
        },
        'tripAllowance': '300.00',
        'lodgingAllowance': '200.00',
        'tollParking': '150.00'
      },
      'indirectExpenses': {
        'adminFees': '400.00',
        'insurance': '1,000.00',
        'motorVehicleReg': '600.00',
        'garageRental': '800.00'
      },
      'calculated': {
        'distanceKm': 85.6,
        'totalDays': 2,
        'dieselTotal': 4708,
        'directTotal': 8470,
        'indirectTotal': 2800,
        'operatingTotal': 11270,
        'income': 1690.5,
        'proposedRate': 12960.5
      }
    },
    notes: null,
    valid_until: null,
    created_at: '2026-08-05 11:00',
  },
  {
    id: 'QTN-017',
    delivery_id: 'DEL-041',
    quotation_type: 'updated',
    amount: 11000,
    breakdown: {
      'directExpenses': {
        'depreciation': '1,000.00',
        'dieselRate': '55.00',
        'repairsAndMaintenance': {
          'batteries': '1,500.00',
          'tires': '2,000.00'
        },
        'salariesAndWages': {
          'driver': '600.00',
          'helper1': '400.00',
          'helper2': ''
        },
        'tripAllowance': '250.00',
        'lodgingAllowance': '150.00',
        'tollParking': '100.00'
      },
      'indirectExpenses': {
        'adminFees': '350.00',
        'insurance': '800.00',
        'motorVehicleReg': '500.00',
        'garageRental': '600.00'
      },
      'calculated': {
        'distanceKm': 85.6,
        'totalDays': 2,
        'dieselTotal': 4708,
        'directTotal': 7290,
        'indirectTotal': 2250,
        'operatingTotal': 9540,
        'income': 1431,
        'proposedRate': 10971
      }
    },
    notes: null,
    valid_until: null,
    created_at: '2026-08-06 09:00',
  },
  {
    id: 'QTN-018',
    delivery_id: 'DEL-010',
    quotation_type: 'initial',
    amount: 2705,
    breakdown: {
      'directExpenses': {
        'depreciation': '240.00',
        'dieselRate': '52.00',
        'repairsAndMaintenance': {
          'batteries': '300.00',
          'tires': '400.00'
        },
        'salariesAndWages': {
          'driver': '220.00',
          'helper1': '150.00',
          'helper2': ''
        },
        'tripAllowance': '60.00',
        'lodgingAllowance': '30.00',
        'tollParking': '25.00'
      },
      'indirectExpenses': {
        'adminFees': '100.00',
        'insurance': '180.00',
        'motorVehicleReg': '90.00',
        'garageRental': '120.00'
      },
      'calculated': {
        'distanceKm': 8.4,
        'totalDays': 1,
        'dieselTotal': 436.8,
        'directTotal': 1861.8,
        'indirectTotal': 490,
        'operatingTotal': 2351.8,
        'income': 352.77,
        'proposedRate': 2704.57
      }
    },
    notes: 'Temperature-sensitive items',
    valid_until: '2026-07-20',
    created_at: '2026-07-18 16:00',
  },
  {
    id: 'QTN-019',
    delivery_id: 'DEL-012',
    quotation_type: 'initial',
    amount: 5200,
    breakdown: {
      'directExpenses': {
        'depreciation': '480.00',
        'dieselRate': '54.00',
        'repairsAndMaintenance': {
          'batteries': '600.00',
          'tires': '720.00'
        },
        'salariesAndWages': {
          'driver': '340.00',
          'helper1': '230.00',
          'helper2': ''
        },
        'tripAllowance': '120.00',
        'lodgingAllowance': '80.00',
        'tollParking': '70.00'
      },
      'indirectExpenses': {
        'adminFees': '200.00',
        'insurance': '320.00',
        'motorVehicleReg': '220.00',
        'garageRental': '250.00'
      },
      'calculated': {
        'distanceKm': 16.5,
        'totalDays': 1,
        'dieselTotal': 891,
        'directTotal': 3531,
        'indirectTotal': 990,
        'operatingTotal': 4521,
        'income': 678.15,
        'proposedRate': 5199.15
      }
    },
    notes: 'Morning window delivery',
    valid_until: '2026-07-20',
    created_at: '2026-07-17 13:00',
  },
]

// Table: delivery_cancellations
// Records the cancellation details for every delivery request that was
// cancelled. `cancelled_from_status` stores the status the request was in
// when it was cancelled, so the full trail before cancellation is preserved.
export const delivery_cancellations = [
  {
    delivery_id: 'DEL-006',
    cancelled_at: '2026-07-16 10:00',
    cancelled_by: 'customer',
    cancelled_from_status: 'QUOTED',
    cancellation_reason: 'Change of schedule',
  },
  {
    delivery_id: 'DEL-009',
    cancelled_at: '2026-07-21 09:45',
    cancelled_by: 'customer',
    cancelled_from_status: 'FOR_REVIEW',
    cancellation_reason: 'Found another transport provider',
  },
  {
    delivery_id: 'DEL-010',
    cancelled_at: '2026-07-19 11:30',
    cancelled_by: 'customer',
    cancelled_from_status: 'QUOTED',
    cancellation_reason: 'Pricing or budget concerns',
  },
  {
    delivery_id: 'DEL-012',
    cancelled_at: '2026-07-21 15:20',
    cancelled_by: 'supervisor',
    cancelled_from_status: 'FOR_PICKUP',
    cancellation_reason: 'No longer needed',
  },
]

// Table: delivery_monitoring
// Live tracking snapshots for deliveries currently in transit. Crew and
// vehicle identity are stored as foreign keys (driver_id, helper_ids,
// truck_plate_number) that resolve against delivery_drivers, delivery_helpers
// and delivery_trucks, so crew details are never duplicated here.
export const delivery_monitoring = [
  {
    delivery_id: 'DEL-024',
    driver_id: 'DRV-003',
    helper_ids: ['HLP-003'],
    truck_plate_number: 'DEF 5678',
    current_lat: 14.6575,
    current_lng: 121.0254,
    speed_kmh: 35,
    last_update: '2026-07-26 10:05',
    status: 'EN_ROUTE_TO_PICKUP',
  },
  {
    delivery_id: 'DEL-025',
    driver_id: 'DRV-004',
    helper_ids: ['HLP-004'],
    truck_plate_number: 'GHI 9012',
    current_lat: 14.685,
    current_lng: 120.97,
    speed_kmh: 48,
    last_update: '2026-07-26 10:07',
    status: 'EN_ROUTE_TO_DROPOFF',
  },
  {
    delivery_id: 'DEL-026',
    driver_id: 'DRV-005',
    helper_ids: ['HLP-005'],
    truck_plate_number: 'JKL 3456',
    current_lat: 14.657,
    current_lng: 121.03,
    speed_kmh: 0,
    last_update: '2026-07-26 10:10',
    status: 'ARRIVED_AT_DROPOFF',
  },
]

// Table: delivery_alert_monitoring
// DriveWise real-time driver-safety telemetry. A Raspberry Pi camera plus
// on-device AI performs real-time eye/facial-feature detection (prolonged and
// repeated eye closure, drowsiness-linked yawning, and eye-detection failures).
// On any trigger the seat vibration unit and audio alerts fire immediately, and
// the route module recommends rest stops based on driving time/distance and the
// detected drowsiness level.
export const delivery_alert_monitoring = [
  {
    delivery_id: 'DEL-024',
    camera_status: 'ACTIVE',
    eye_detection: 'DETECTED',
    drowsiness_level: 'LOW',
    prolonged_eye_closure: 0,
    repeated_eye_closure: 1,
    yawn_count: 2,
    eye_detection_failures: 0,
    avg_closure_duration_ms: 280,
    seat_vibration: 'ACTIVE',
    audio_alert: 'ACTIVE',
    last_alert: 'Yawn detected',
    last_alert_at: '2026-07-26 10:04',
    driving_hours: 1.4,
    driving_distance_km: 52,
    recommended_rest_stop: 'Petron SLEX KM 37',
    rest_stop_distance_km: 9,
    alert_history: [
      { type: 'Repeated eye closure', time: '2026-07-26 09:52', severity: 'WARNING' },
      { type: 'Yawn detected', time: '2026-07-26 09:58', severity: 'INFO' },
      { type: 'Yawn detected', time: '2026-07-26 10:04', severity: 'INFO' },
    ],
  },
  {
    delivery_id: 'DEL-025',
    camera_status: 'ACTIVE',
    eye_detection: 'DETECTED',
    drowsiness_level: 'MODERATE',
    prolonged_eye_closure: 1,
    repeated_eye_closure: 4,
    yawn_count: 3,
    eye_detection_failures: 1,
    avg_closure_duration_ms: 410,
    seat_vibration: 'ACTIVE',
    audio_alert: 'ACTIVE',
    last_alert: 'Prolonged eye closure',
    last_alert_at: '2026-07-26 10:06',
    driving_hours: 3.2,
    driving_distance_km: 148,
    recommended_rest_stop: 'Shell Balintawak',
    rest_stop_distance_km: 14,
    alert_history: [
      { type: 'Repeated eye closure', time: '2026-07-26 09:41', severity: 'WARNING' },
      { type: 'Eye detection failure', time: '2026-07-26 09:47', severity: 'WARNING' },
      { type: 'Repeated eye closure', time: '2026-07-26 09:55', severity: 'WARNING' },
      { type: 'Yawn detected', time: '2026-07-26 10:00', severity: 'INFO' },
      { type: 'Yawn detected', time: '2026-07-26 10:03', severity: 'INFO' },
      { type: 'Repeated eye closure', time: '2026-07-26 10:05', severity: 'WARNING' },
      { type: 'Prolonged eye closure', time: '2026-07-26 10:06', severity: 'CRITICAL' },
    ],
  },
  {
    delivery_id: 'DEL-026',
    camera_status: 'ACTIVE',
    eye_detection: 'FAILED',
    drowsiness_level: 'HIGH',
    prolonged_eye_closure: 2,
    repeated_eye_closure: 6,
    yawn_count: 5,
    eye_detection_failures: 3,
    avg_closure_duration_ms: 620,
    seat_vibration: 'ACTIVE',
    audio_alert: 'ACTIVE',
    last_alert: 'Eye detection failure',
    last_alert_at: '2026-07-26 10:09',
    driving_hours: 2.6,
    driving_distance_km: 117,
    recommended_rest_stop: 'Caltex Tarlac City',
    rest_stop_distance_km: 21,
    alert_history: [
      { type: 'Eye detection failure', time: '2026-07-26 09:50', severity: 'WARNING' },
      { type: 'Repeated eye closure', time: '2026-07-26 09:56', severity: 'WARNING' },
      { type: 'Yawn detected', time: '2026-07-26 10:01', severity: 'INFO' },
      { type: 'Repeated eye closure', time: '2026-07-26 10:04', severity: 'WARNING' },
      { type: 'Prolonged eye closure', time: '2026-07-26 10:06', severity: 'CRITICAL' },
      { type: 'Eye detection failure', time: '2026-07-26 10:08', severity: 'CRITICAL' },
      { type: 'Eye detection failure', time: '2026-07-26 10:09', severity: 'CRITICAL' },
    ],
  },
]

// Supplementary per-request data managed by the delivery supervisor.
// Keyed by delivery id; merged into the request object at runtime (see
// SupDeliveries.jsx). `crew` holds the assigned driver/helpers/truck,
// `customerWants` the customer's counter-offer, and `assignedAt` the time the
// crew was assigned. Coordinates drive the Google-map embeds.
export const delivery_supervisor_data = {
  'DEL-001': {
    destinationCoords: { lat: 14.6465, lng: 121.0521 },
    currentLocation: { lat: 14.593, lng: 121.032 },
    crew: {
      driver: { id: 'DRV-001', name: 'Carlos Mendoza', phone: '+63 912 311 1222', rating: 4.8, trips: 126 },
      helpers: [{ id: 'HLP-001', name: 'Pedro Garcia' }],
      truck: { plateNumber: 'ABC 1234', truckType: 'AUV', capacity: '5.0 tons' },
    },
  },
  'DEL-002': {
    destinationCoords: { lat: 14.3834, lng: 121.0419 },
    currentLocation: { lat: 14.5172, lng: 121.0198 },
    crew: null,
  },
  'DEL-003': {
    destinationCoords: { lat: 14.4934, lng: 121.0405 },
    currentLocation: { lat: 14.5264, lng: 121.0108 },
    crew: null,
    customerWants: 4800,
  },
  'DEL-004': {
    destinationCoords: { lat: 14.5506, lng: 121.0471 },
    currentLocation: { lat: 14.5506, lng: 121.0471 },
    crew: {
      driver: { id: 'DRV-001', name: 'Carlos Mendoza', phone: '+63 912 311 1222', rating: 4.8, trips: 126 },
      helpers: [{ id: 'HLP-001', name: 'Pedro Garcia' }],
      truck: { plateNumber: 'ABC 1234', truckType: 'AUV', capacity: '1.2 tons' },
    },
    assignedAt: 'Jul 19, 2026, 08:00 AM',
  },
  'DEL-005': {
    destinationCoords: { lat: 14.4201, lng: 121.0312 },
    currentLocation: { lat: 14.4201, lng: 121.0312 },
    crew: {
      driver: { id: 'DRV-002', name: 'Miguel Santos', phone: '+63 917 832 4100', rating: 4.7, trips: 104 },
      helpers: [{ id: 'HLP-002', name: 'Luis Torres' }],
      truck: { plateNumber: 'XYZ 5678', truckType: '2T_REF', capacity: '2.0 tons' },
    },
    assignedAt: 'Jul 18, 2026, 10:00 AM',
  },
  'DEL-006': {
    destinationCoords: { lat: 14.5864, lng: 121.0605 },
    currentLocation: { lat: 14.5864, lng: 121.0605 },
    crew: null,
  },
  'DEL-007': {
    destinationCoords: { lat: 14.8145, lng: 120.9056 },
    currentLocation: { lat: 14.8205, lng: 120.895 },
    crew: null,
  },
  'DEL-008': {
    destinationCoords: { lat: 15.1628, lng: 120.5897 },
    currentLocation: { lat: 15.1752, lng: 120.5907 },
    crew: null,
  },
  'DEL-011': {
    destinationCoords: { lat: 14.6357, lng: 121.0747 },
    currentLocation: { lat: 14.6398, lng: 121.0668 },
    crew: null,
    customerWants: 12000,
  },
  'DEL-015': {
    destinationCoords: { lat: 14.4716, lng: 121.0178 },
    currentLocation: { lat: 14.49, lng: 121.01 },
    crew: null,
  },
  'DEL-017': {
    destinationCoords: { lat: 14.5547, lng: 121.0239 },
    currentLocation: { lat: 14.57, lng: 121.015 },
    crew: null,
  },
  'DEL-018': {
    destinationCoords: { lat: 14.3084, lng: 120.9633 },
    currentLocation: { lat: 14.3084, lng: 120.9633 },
    crew: {
      driver: { id: 'DRV-003', name: 'Ricardo Lopez', phone: '+63 919 553 1170', rating: 4.9, trips: 168 },
      helpers: [{ id: 'HLP-003', name: 'Rico Aquino' }],
      truck: { plateNumber: 'DEF 9012', truckType: 'L300', capacity: '1.0 ton' },
    },
    assignedAt: 'Jul 24, 2026, 09:00 AM',
  },
  'DEL-019': {
    destinationCoords: { lat: 14.5261, lng: 121.1536 },
    currentLocation: { lat: 14.54, lng: 121.14 },
    crew: null,
  },
  'DEL-020': {
    destinationCoords: { lat: 14.5521, lng: 121.0528 },
    currentLocation: { lat: 14.56, lng: 121.045 },
    crew: null,
  },
  'DEL-024': {
    destinationCoords: { lat: 14.4745, lng: 121.0254 },
    currentLocation: { lat: 14.6575, lng: 121.0254 },
    crew: {
      driver: { id: 'DRV-003', name: 'Antonio Flores', phone: '+63 915 789 0123', rating: 4.6, trips: 89 },
      helpers: [{ id: 'HLP-003', name: 'Rico Aquino' }],
      truck: { plateNumber: 'DEF 5678', truckType: '4T_DRY', capacity: '4.0 tons' },
    },
    assignedAt: 'Jul 25, 2026, 10:00 AM',
  },
  'DEL-025': {
    destinationCoords: { lat: 14.6864, lng: 120.9663 },
    currentLocation: { lat: 14.685, lng: 120.97 },
    crew: {
      driver: { id: 'DRV-004', name: 'Ramon Bautista', phone: '+63 918 456 7890', rating: 4.9, trips: 215 },
      helpers: [{ id: 'HLP-004', name: 'Victor Cruz' }],
      truck: { plateNumber: 'GHI 9012', truckType: '6T_DRY', capacity: '6.0 tons' },
    },
    assignedAt: 'Jul 25, 2026, 02:00 PM',
  },
  'DEL-026': {
    destinationCoords: { lat: 14.657, lng: 121.03 },
    currentLocation: { lat: 14.657, lng: 121.03 },
    crew: {
      driver: { id: 'DRV-005', name: 'Felipe Gonzaga', phone: '+63 920 111 2233', rating: 4.5, trips: 67 },
      helpers: [{ id: 'HLP-005', name: 'Ricky Santos' }],
      truck: { plateNumber: 'JKL 3456', truckType: 'L300', capacity: '1.5 tons' },
    },
    assignedAt: 'Jul 24, 2026, 09:00 AM',
  },
  'DEL-040': {
    destinationCoords: { lat: 14.3587, lng: 121.0789 },
    currentLocation: { lat: 14.56, lng: 121.06 },
    crew: null,
    customerWants: 16000,
  },
  'DEL-041': {
    destinationCoords: { lat: 13.9418, lng: 121.1624 },
    currentLocation: { lat: 14.51, lng: 121 },
    crew: null,
    customerWants: 10000,
  },
}

function getRiskLevel(alertCount) {
  if (alertCount >= 4) return { tone: 'red', label: 'High Risk' }
  if (alertCount >= 2) return { tone: 'amber', label: 'Moderate' }
  return { tone: 'emerald', label: 'Safe' }
}

// Post-trip report data for completed deliveries: route-deviation analysis,
// trip timeline, driver-behavior (eye-closure) analytics, and delivery history.
// Keyed by delivery id.
export const completed_delivery_reports = {
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
      deviationSegments: [
        {
          location: 'C5–Meralco Intersection',
          extraDistance: '0.6 km',
          reason: 'Navigation correction — driver turned north briefly before re-joining the planned route.',
          severity: 'Minor',
        },
      ],
      scheduleImpact: 'No impact on scheduled arrival',
      fuelImpact: 'Negligible — approx. +0.4 L diesel consumed',
      recommendations: [
        'No corrective action required. The deviation was minor and quickly corrected.',
        'Optional: brief drivers on the C5–Meralco intersection to avoid the same detour on future trips.',
      ],
    },
    trip: {
      route: 'Pasig Hub → BGC Branch',
      distance: '14.2 km',
      duration: '45 min',
      startTime: '2026-07-20T08:30:00',
      endTime: '2026-07-20T09:15:00',
      scheduledStart: '2026-07-20T08:00:00',
      scheduledEnd: '2026-07-20T09:15:00',
      departedOnTime: true,
      arrivedOnTime: true,
      lateMinutes: 0,
      waitingTime: '15 min',
      idleTime: '3 min',
      stops: [
        { location: 'Pasig Hub', time: '08:30', action: 'Departure' },
        { location: 'C5 Road Checkpoint', time: '08:48', action: 'Waypoint' },
        { location: 'BGC Branch', time: '09:15', action: 'Drop-off Completed' },
      ],
      restStops: [
        {
          location: 'Shell C5 Road',
          duration: '10 min',
          purpose: 'Rest break after drowsiness alert — rehydration and leg stretch',
          distanceFromStart: '8.1 km',
          drivingTime: '40 min',
        },
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
      drowsinessLevel: 'MODERATE',
      cameraStatus: 'ACTIVE',
      eyeDetection: 'DETECTED',
      avgClosureDuration: '47s',
      yawnCount: 1,
      eyeDetectionFailures: 0,
      alertMechanism: { seatVibration: 'ACTIVE', audioAlert: 'ACTIVE' },
      recommendedRestStop: 'Shell C5 Road',
      alertsByType: [
        { type: 'prolonged_eye_closure', count: 1, label: 'Prolonged Eye Closure' },
        { type: 'pattern_repeated_eye_closure', count: 1, label: 'Repeated Eye Closure' },
      ],
      alertHistory: [
        { type: 'Prolonged Eye Closure', time: '2026-07-20 08:42', severity: 'WARNING' },
        { type: 'Repeated Eye Closure', time: '2026-07-20 08:55', severity: 'CRITICAL' },
      ],
      sessions: [
        { start: '2026-07-20T08:30:00', end: '2026-07-20T09:15:00', alerts: 2, duration: 2700 },
      ],
      analysis:
        'The Raspberry Pi camera-based driver monitoring system tracked the driver for the full 45-minute trip. Two drowsiness triggers were recorded around the midpoint of the trip — one prolonged eye-closure and one repeated eye-closure pattern. The seat vibration unit and audio alerts fired immediately on each trigger, providing instant feedback. Eye detection remained stable with no failures. A rest stop at Shell C5 Road was recommended by the route module and the driver complied during the scheduled stop. Overall driver risk is LOW-to-MODERATE for this trip.',
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
      aiSummary: 'Significant route deviation detected. The driver took an alternative route through General Trias residential areas instead of staying on Aguinaldo Highway, adding 4.6 km to the planned route. This deviation is notable and may indicate driver unfamiliarity with the area or a deliberate choice to avoid traffic. Combined with the high drowsiness level recorded by the driver monitoring system, this trip should be reviewed closely.',
      aiVerdict: 'Significant Deviation',
      aiVerdictTone: 'red',
      deviationSegments: [
        {
          location: 'General Trias residential area',
          extraDistance: '4.6 km',
          reason: 'Driver took an alternative route through residential roads instead of staying on Aguinaldo Highway.',
          severity: 'Significant',
        },
      ],
      scheduleImpact: 'Arrival delayed by 12 minutes',
      fuelImpact: 'Approx. +1.2 L diesel consumed',
      recommendations: [
        'Review the trip log to assess impact on schedule and fuel efficiency.',
        'Provide a route familiarization session for the driver on the Cavite–Alabang corridor.',
        'Monitor driver behavior on the next trip given the elevated drowsiness level.',
      ],
    },
    trip: {
      route: 'Cavite Depot → Alabang Branch',
      distance: '22.8 km',
      duration: '55 min',
      startTime: '2026-07-19T06:00:00',
      endTime: '2026-07-19T06:55:00',
      scheduledStart: '2026-07-19T05:30:00',
      scheduledEnd: '2026-07-19T06:43:00',
      departedOnTime: true,
      arrivedOnTime: false,
      lateMinutes: 12,
      waitingTime: '15 min',
      idleTime: '7 min',
      stops: [
        { location: 'Cavite Depot', time: '06:00', action: 'Departure' },
        { location: 'General Trias Toll', time: '06:20', action: 'Waypoint' },
        { location: 'Alabang Branch', time: '06:55', action: 'Drop-off Completed' },
      ],
      restStops: [
        {
          location: 'Petron General Trias',
          duration: '12 min',
          purpose: 'Rest stop — driver fatigue detected by DriveWise',
          distanceFromStart: '14.5 km',
          drivingTime: '28 min',
        },
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
      drowsinessLevel: 'HIGH',
      cameraStatus: 'ACTIVE',
      eyeDetection: 'FAILED',
      avgClosureDuration: '52s',
      yawnCount: 3,
      eyeDetectionFailures: 2,
      alertMechanism: { seatVibration: 'ACTIVE', audioAlert: 'ACTIVE' },
      recommendedRestStop: 'Petron General Trias',
      alertsByType: [
        { type: 'prolonged_eye_closure', count: 2, label: 'Prolonged Eye Closure' },
        { type: 'pattern_eye_closure_yawn', count: 2, label: 'Eye Closure + Yawn' },
        { type: 'pattern_repeated_eye_closure', count: 1, label: 'Repeated Eye Closure' },
      ],
      alertHistory: [
        { type: 'Prolonged Eye Closure', time: '2026-07-19 06:12', severity: 'WARNING' },
        { type: 'Eye Closure + Yawn', time: '2026-07-19 06:20', severity: 'WARNING' },
        { type: 'Eye Closure + Yawn', time: '2026-07-19 06:28', severity: 'CRITICAL' },
        { type: 'Prolonged Eye Closure', time: '2026-07-19 06:35', severity: 'WARNING' },
        { type: 'Repeated Eye Closure', time: '2026-07-19 06:42', severity: 'CRITICAL' },
      ],
      sessions: [
        { start: '2026-07-19T06:00:00', end: '2026-07-19T06:55:00', alerts: 5, duration: 3300 },
      ],
      analysis:
        'The camera-based driver monitoring system recorded a HIGH drowsiness level over the 55-minute trip. Five drowsiness triggers were logged — two prolonged eye-closures, two eye-closure-plus-yawn patterns, and one repeated eye-closure episode. The seat vibration unit and audio alerts fired on every trigger. Two eye-detection failures were also recorded, suggesting the driver may have looked away from the camera (e.g., due to fatigue) or the camera momentarily lost the driver\u2019s face. A rest stop at Petron General Trias was recommended and taken. Given the elevated risk, the driver should be paired with a fresh shift and monitored closely on the next dispatch.',
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
    },
  },
}
