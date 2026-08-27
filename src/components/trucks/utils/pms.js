import {
  DEFAULT_MAINTENANCE_INTERVAL_KM,
  DEFAULT_MAINTENANCE_INTERVAL_MONTHS,
  WARNING_THRESHOLD_KM,
  WARNING_THRESHOLD_DAYS,
} from "../../../constants/pms.js";

/**
 * Compute PMS status for a truck.
 * Returns one of "overdue", "scheduled", or "completed".
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
  const scheduledKm = targetKm - WARNING_THRESHOLD_KM;
  const scheduledDays = targetDays - WARNING_THRESHOLD_DAYS;
  if (mileageDiff >= scheduledKm || daysDiff >= scheduledDays) {
    return "scheduled";
  }

  return "completed";
}

/**
 * Get the display label for a PMS status.
 * Maps internal status to standardized labels used across the UI.
 */
export function getPmsStatusDisplayLabel(status) {
  const key = status?.toLowerCase();
  const labels = {
    overdue: "Overdue",
    scheduled: "Scheduled",
    completed: "Completed",
  };
  return (
    labels[key] || status?.charAt(0).toUpperCase() + status.slice(1) || "-"
  );
}
