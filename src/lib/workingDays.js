// Shared helpers for crew weekly working days (crew_availability).
// 0=Sunday..6=Saturday, matching JavaScript's Date.getDay() and the
// day_of_week check constraint in 20260826000000_crew_availability.sql.

export const WORKING_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WORKING_DAY_FULL_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// [1,2,3] -> "Mon, Tue, Wed"; empty -> null so callers can show their own
// placeholder.
export function formatWorkingDays(days) {
  if (!days || days.length === 0) return null;
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => WORKING_DAY_LABELS[day])
    .join(", ");
}

// Weekday of a YYYY-MM-DD date string, evaluated as local calendar time
// (never parsed as UTC -- that would shift the weekday for Manila users).
export function weekdayOfDate(dateStr) {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00`).getDay();
}
