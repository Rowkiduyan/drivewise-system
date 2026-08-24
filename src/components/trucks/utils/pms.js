import {
  DEFAULT_MAINTENANCE_INTERVAL_KM,
  DEFAULT_MAINTENANCE_INTERVAL_MONTHS,
  WARNING_THRESHOLD_KM,
  WARNING_THRESHOLD_DAYS,
} from "../../../constants/pms.js";

/**
 * Compute PMS status for a truck.
 * Returns one of "overdue", "upcoming", or "healthy".
 */
export function getPmsStatus(truck) {
  const now = new Date();
  const mileageDiff =
    (truck.current_mileage ?? 0) - (truck.previous_mileage ?? 0);
  const daysDiff =
    (now - new Date(truck.previous_maintenance_date)) / (1000 * 60 * 60 * 24);

  const targetKm =
    truck.maintenance_interval_km ?? DEFAULT_MAINTENANCE_INTERVAL_KM;
  const targetMonths =
    truck.maintenance_interval_months ?? DEFAULT_MAINTENANCE_INTERVAL_MONTHS;
  const targetDays = targetMonths * 30; // approximate month length

  // Overdue if mileage or time exceeds target
  if (mileageDiff >= targetKm || daysDiff >= targetDays) {
    return "overdue";
  }

  // Upcoming if within warning thresholds
  const upcomingKm = targetKm - WARNING_THRESHOLD_KM;
  const upcomingDays = targetDays - WARNING_THRESHOLD_DAYS;
  if (mileageDiff >= upcomingKm || daysDiff >= upcomingDays) {
    return "upcoming";
  }

  return "healthy";
}
