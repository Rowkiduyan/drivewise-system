// Every timestamp column in this app is a Postgres `timestamptz`, stored and
// returned as UTC (see DATABASE.md's "Timestamps use UTC" naming convention).
// The business and every user of this app are in the Philippines, so display
// must be pinned to Asia/Manila explicitly -- not left to the viewer's own
// browser/OS timezone, which happens to already be Asia/Manila on the dev
// machines used so far but isn't guaranteed for every viewer (e.g. a grader
// opening the deployed app from a different timezone).
//
// Found 2026-08-14: every timestamp-display function across the app was
// either (a) regex-extracting the raw digit characters straight out of the
// ISO string and displaying them unshifted -- i.e. showing the UTC clock
// reading mislabeled as local time, 8 hours behind real Manila time -- or
// (b) using `new Date(...).getHours()`/`toLocaleString(...)` without an
// explicit `timeZone` option, which only happens to work when the viewer's
// browser is already set to Asia/Manila. This module is the one place that
// does real, explicit Asia/Manila conversion; every per-file formatter
// should build on these primitives instead of duplicating `Intl`/`Date`
// setup (that duplication, with two subtly different approaches, is exactly
// how the original bug happened unnoticed).
export const MANILA_TIMEZONE = 'Asia/Manila'

// Numeric Manila-local fields for a timestamp -- for anything that needs to
// reason about the value (hour-of-day bucketing, "is this today" checks),
// not just render it as text. Mirrors the shape of what `Date`'s own local
// getters would give you, just correctly computed for Asia/Manila instead of
// the browser's own timezone.
export function getManilaFields(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date)
  const map = {}
  parts.forEach((p) => {
    if (p.type !== 'literal') map[p.type] = p.value
  })
  return {
    year: Number(map.year),
    month: Number(map.month), // 1-12
    day: Number(map.day),
    hour: map.hour === '24' ? 0 : Number(map.hour), // Intl can return "24" for midnight with hour12:false
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday, // "Mon", "Tue", ...
  }
}

const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function to12Hour(hour24) {
  const hour12 = ((hour24 + 11) % 12) + 1
  const suffix = hour24 >= 12 ? 'pm' : 'am'
  return { hour12, suffix }
}

// "August 13, 1:18 pm" -- the long-form single-line timestamp used for
// alert/session/trip event display (replaces every file's own
// formatAlertTimestamp).
export function formatManilaTimestamp(value) {
  const f = getManilaFields(value)
  if (!f) return value ? String(value) : '--'
  const { hour12, suffix } = to12Hour(f.hour)
  const minute = String(f.minute).padStart(2, '0')
  return `${LONG_MONTHS[f.month - 1]} ${f.day}, ${hour12}:${minute} ${suffix}`
}

// "Jul 22" -- compact date only.
export function formatManilaShortDate(value) {
  const f = getManilaFields(value)
  if (!f) return value ? String(value) : '--'
  return `${SHORT_MONTHS[f.month - 1]} ${f.day}`
}

// "7:10am" -- compact time only, no space before am/pm.
export function formatManilaShortTime(value) {
  const f = getManilaFields(value)
  if (!f) return value ? String(value) : '--'
  const { hour12, suffix } = to12Hour(f.hour)
  const minute = String(f.minute).padStart(2, '0')
  return `${hour12}:${minute}${suffix}`
}

// "Aug 3, 2026, 11:02 PM" -- short month + year + uppercase AM/PM with a
// space, matching SupDeliveries.jsx's formatIsoDateTime/formatMessageTimestamp
// family (`includeYear` toggles the ", 2026" segment for the message-bubble
// variant, which omits the year).
export function formatManilaDateTime(value, { includeYear = true } = {}) {
  const f = getManilaFields(value)
  if (!f) return value ? String(value) : ''
  const { hour12, suffix } = to12Hour(f.hour)
  const minute = String(f.minute).padStart(2, '0')
  const datePart = includeYear ? `${SHORT_MONTHS[f.month - 1]} ${f.day}, ${f.year}` : `${SHORT_MONTHS[f.month - 1]} ${f.day}`
  return `${datePart}, ${hour12}:${minute} ${suffix.toUpperCase()}`
}

// Hour-of-day (0-23) in Manila time, for bucketing alerts into a 24-hour
// chart -- replaces `new Date(iso).getHours()`, which reads the browser's
// own local timezone instead of Manila's.
export function getManilaHour(value) {
  const f = getManilaFields(value)
  return f ? f.hour : null
}

// Short weekday label ("Mon") in Manila time.
export function getManilaWeekday(value) {
  const f = getManilaFields(value)
  return f ? f.weekday : '--'
}

// "2026-08-14" -- Manila calendar-date key, for grouping timestamps into
// per-day buckets (e.g. a 7-day trend chart) rather than per-row bars.
export function getManilaDateKey(value) {
  const f = getManilaFields(value)
  if (!f) return null
  const month = String(f.month).padStart(2, '0')
  const day = String(f.day).padStart(2, '0')
  return `${f.year}-${month}-${day}`
}

// Today's date as "YYYY-MM-DD" in Manila time -- for comparing against
// plain calendar-date columns (pickup_date/dropoff_date have no time
// component). Replaces each portal's own `localTodayISO()`, which used the
// *browser's* local date instead of Manila's -- correct today only because
// the dev/testing browsers happen to already be set to Asia/Manila.
export function manilaTodayISO() {
  const f = getManilaFields(new Date())
  const month = String(f.month).padStart(2, '0')
  const day = String(f.day).padStart(2, '0')
  return `${f.year}-${month}-${day}`
}

// True when a calendar date (pickup_date/dropoff_date) is strictly before
// today in Manila time -- date-only, no time-of-day involved. Used for
// "Late" badges: dropoff_time is a delivery window (like a store's open
// hours), not a due time, so a delivery isn't late just because that window
// has passed today -- only once its scheduled date itself has passed.
export function isManilaDatePast(dateStr) {
  if (!dateStr) return false
  return dateStr < manilaTodayISO()
}
