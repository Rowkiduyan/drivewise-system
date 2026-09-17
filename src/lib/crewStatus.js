// Shared crew availability status, derived live from two real sources:
//   1. crew_availability — the weekly working days each member sets
//   2. delivery_requests in an ACTIVE trip status (assigned but not yet
//      completed) — members on one of those trips are "Assigned" on the
//      dates that trip actually covers (pickup_date → dropoff_date), not
//      for every date forever. This lets a supervisor assign a crew member
//      to a delivery on a different day than one they're already on.
// Consumers: SupDeliveryCrew.jsx (roster quick view), SupDeliveries.jsx
// (assignment pickers), SupCrewProfile.jsx.

// Trip statuses where the assigned driver/helpers are actively committed.
// Real delivery_requests.status values only (DATABASE.md's documented
// milestone flow) -- 'OUT_FOR_DELIVERY' is never one of them, it's only
// ever the Driver/Helper UI's own internal collapsed label
// (DriverDeliveries.jsx/HelperDeliveries.jsx's DB_TO_*_STATUS maps); using
// it here as a real DB filter value was a bug (found 2026-09-09) -- it
// never matched any row, and ARRIVED_DROPOFF was missing outright, so a
// crew member actively out on the drop-off leg of a real delivery was
// silently treated as "Available" by every consumer of this list
// (SupCrewProfile.jsx, SupDeliveries.jsx, SupDeliveryCrew.jsx), risking a
// real double-booking.
export const CREW_ACTIVE_STATUSES = [
  'ASSIGNED',
  'OUT_FOR_PICKUP',
  'ARRIVED_PICKUP',
  'OUT_FOR_DROPOFF',
  'ARRIVED_DROPOFF',
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

// ---------------------------------------------------------------------------
// Weekly Performance — SupDeliveryCrew.jsx's roster table column.
//
// Per-session risk classification, same High Risk / Moderate / Safe
// thresholds SupCrewProfile.jsx's "This Week (7 Days)" panel and current-trip
// status card already use for a single driver's own profile page. Extracted
// here (2026-09-17, when Weekly Performance was first wired to real data) so
// both views share one definition of "risky trip" instead of each keeping
// their own copy that could quietly drift apart.
// ---------------------------------------------------------------------------
export function getSessionRiskLevel(alertCount) {
  if (alertCount >= 4) return { tone: 'red', label: 'High Risk' }
  if (alertCount >= 2) return { tone: 'amber', label: 'Moderate' }
  return { tone: 'emerald', label: 'Safe' }
}

// Weight each risk tier contributes toward the 0-100 weekly score. High Risk
// sessions get zero weight rather than a partial penalty -- these are the
// trips that matter most, so a week dominated by them should read as bad,
// not just "slightly lower."
const RISK_LEVEL_SCORE_WEIGHT = { Safe: 1, Moderate: 0.5, 'High Risk': 0 }

export const WEEKLY_PERFORMANCE_WINDOW_DAYS = 7

// Percentage-based, not point-deduction: `score = 100 * (safeCount + 0.5 *
// moderateCount) / totalSessions`. This normalizes for how many trips a
// driver actually ran in the window, so a high-volume driver with a couple
// of moderate trips isn't penalized more harshly than a low-volume driver
// with the same *proportion* of incidents -- a flat "-N points per bad trip"
// scheme would do exactly that. Returns null (not 0) when there's no session
// data at all -- zero trips this week is unmeasured, not a perfect or
// failing week, same as how the profile page's own panel shows "No trips
// recorded" instead of fabricating a number for that case.
//
// sessionAlertCounts: array of each session's total_alerts count (drivers
// only -- Helpers have no sessions.driver_id rows and should never reach
// this function; callers should pass null/skip instead of an empty array
// for a Helper, since an empty array here means "driver drove zero trips",
// a different, still-real fact).
export function computeWeeklyPerformanceScore(sessionAlertCounts) {
  if (!sessionAlertCounts || sessionAlertCounts.length === 0) return null
  const weightedSum = sessionAlertCounts.reduce(
    (sum, alertCount) =>
      sum + RISK_LEVEL_SCORE_WEIGHT[getSessionRiskLevel(alertCount).label],
    0,
  )
  return Math.round((weightedSum / sessionAlertCounts.length) * 100)
}

// 'YYYY-MM-DD' key for a Date or an existing 'YYYY-MM-DD' string.
export function formatDateKey(value) {
  if (typeof value === 'string') {
    // Already an ISO date — normalize defensively (strip any time part).
    return value.slice(0, 10)
  }
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Today's 'YYYY-MM-DD' key (local date).
export function todayDateKey() {
  return formatDateKey(new Date())
}

// Weekday (0=Sun..6=Sat) for a 'YYYY-MM-DD' key, independent of timezone —
// the date components are fixed, so a midnight-local parse yields the right
// day of week.
export function dayOfWeekOfKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

// member: { recordId, workingDays } — recordId is what delivery_requests'
// assigned_driver_id/assigned_helper_ids columns store; workingDays comes
// from crew_availability via list-crew.
// busyByRecordId: { [recordId]: Array<{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }> }
//   — the date ranges of each active trip the member is on. Ranges are
//   inclusive and compared lexicographically (valid for ISO date strings).
//   NOTE: a plain object, NOT a Map — `Map` is shadowed in SupDeliveries.jsx's
//   module scope by a lucide-react icon import, so `new Map()` throws there.
// dateKey: 'YYYY-MM-DD' of the delivery being assigned. Defaults to today.
//
// Returns a CREW_STATUS_META entry plus:
//   currentlyBusy — member is on some active trip (maybe a different date)
//   currentTrip  — that trip's { start, end } (for an informational note)
export function getCrewAvailability(member, busyByRecordId, dateKey = todayDateKey()) {
  const trips =
    busyByRecordId && typeof busyByRecordId === 'object'
      ? busyByRecordId[member.recordId] || []
      : []
  const overlapping = trips.find((t) => t.start <= dateKey && dateKey <= t.end)
  if (overlapping) {
    return { ...CREW_STATUS_META.assigned, currentlyBusy: true, currentTrip: overlapping }
  }
  const meta =
    (member.workingDays || []).includes(dayOfWeekOfKey(dateKey))
      ? CREW_STATUS_META.available
      : CREW_STATUS_META.unavailable
  return { ...meta, currentlyBusy: trips.length > 0, currentTrip: trips[0] || null }
}
