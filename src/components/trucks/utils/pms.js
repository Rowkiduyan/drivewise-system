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
  const previousMaintenanceDate = truck.previous_maintenance_date;
  if (!previousMaintenanceDate) return "completed";

  const now = new Date();
  const mileageDiff =
    (truck.current_mileage ?? 0) - (truck.previous_mileage ?? 0);
  const daysDiff =
    (now - new Date(previousMaintenanceDate)) / (1000 * 60 * 60 * 24);

  if (!Number.isFinite(daysDiff)) return "completed";

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
 * Use the newest completed maintenance record as the PMS baseline.
 * This keeps list views correct when older truck baseline fields are stale.
 */
export function addMaintenanceBaselines(trucks, maintenanceRecords) {
  const latestByTruck = new Map();

  for (const record of maintenanceRecords || []) {
    if (record.status !== "Completed" || !record.truck_id) continue;

    const recordDate = record.end_date || record.start_date;
    if (!recordDate) continue;

    const current = latestByTruck.get(record.truck_id);
    if (
      !current ||
      new Date(recordDate) > new Date(current.end_date || current.start_date)
    ) {
      latestByTruck.set(record.truck_id, record);
    }
  }

  return trucks.map((truck) => {
    const latest = latestByTruck.get(truck.id);
    if (!latest) return truck;

    return {
      ...truck,
      previous_mileage:
        latest.mileage_at_service ?? truck.previous_mileage ?? 0,
      previous_maintenance_date:
        latest.end_date || latest.start_date || truck.previous_maintenance_date,
    };
  });
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
