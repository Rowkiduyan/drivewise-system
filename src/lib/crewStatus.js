// Shared crew availability status, derived live from two real sources:
//   1. crew_availability — the weekly working days each member sets
//   2. delivery_requests in an ACTIVE trip status (assigned but not yet
//      completed) — members on one of those trips are "Assigned" regardless
//      of their weekly pattern.
// Consumers: SupDeliveryCrew.jsx (roster quick view), SupDeliveries.jsx
// (assignment pickers), SupCrewProfile.jsx.

// Trip statuses where the assigned driver/helpers are actively committed.
export const CREW_ACTIVE_STATUSES = [
  'ASSIGNED',
  'OUT_FOR_PICKUP',
  'ARRIVED_PICKUP',
  'OUT_FOR_DELIVERY',
]

export const CREW_STATUS_META = {
  available: {
    key: 'available',
    label: 'Available',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  assigned: {
    key: 'assigned',
    label: 'Assigned',
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
    dot: 'bg-blue-500',
  },
  unavailable: {
    key: 'unavailable',
    label: 'Unavailable',
    badge: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200',
    dot: 'bg-slate-400',
  },
}

// member: { recordId, workingDays } — recordId is what delivery_requests'
// assigned_driver_id/assigned_helper_ids columns store; workingDays comes
// from crew_availability via list-crew.
// busyRecordIds: Set of record ids currently on an active trip.
export function getCrewAvailability(member, busyRecordIds, date = new Date()) {
  if (busyRecordIds.has(member.recordId)) return CREW_STATUS_META.assigned
  if ((member.workingDays || []).includes(date.getDay())) return CREW_STATUS_META.available
  return CREW_STATUS_META.unavailable
}
