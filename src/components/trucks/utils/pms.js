import {
  DEFAULT_PMS_INTERVAL_KM,
  DEFAULT_PMS_INTERVAL_MONTHS,
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
    (truck.current_mileage ?? 0) - (truck.last_pms_mileage ?? 0);
  const daysDiff =
    (now - new Date(truck.last_pms_date)) / (1000 * 60 * 60 * 24);

  const targetKm = truck.pms_interval_km ?? DEFAULT_PMS_INTERVAL_KM;
  const targetMonths = truck.pms_interval_months ?? DEFAULT_PMS_INTERVAL_MONTHS;
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
