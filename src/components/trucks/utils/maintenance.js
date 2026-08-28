/**
 * Utility functions for the Maintenance tab.
 * These are distinct from the PMS utilities which calculate whether a truck
 * is overdue, scheduled, or completed based on mileage and dates.
 * The maintenance tab focuses on the status of the most recent maintenance
 * record (e.g., "In Progress", "Completed", "Scheduled").
 */

import { getPmsStatus } from "./pms.js";

/**
 * Return the most recent maintenance record from an array sorted in
 * descending order (newest first). Returns `null` if the array is empty.
 */
export function getLatestMaintenance(maintenanceRecords) {
  if (!Array.isArray(maintenanceRecords) || maintenanceRecords.length === 0) {
    return null;
  }
  return maintenanceRecords[0];
}

/**
 * Determine the status to display on the Maintenance Status card.
 * Preference is given to the status of the latest maintenance record.
 * If no record exists, fall back to the PMS calculation based on the
 * truck's mileage and dates.
 */
export function getMaintenanceCardStatus(truck, maintenanceRecords) {
  const latest = getLatestMaintenance(maintenanceRecords);
  if (latest && latest.status) {
    return latest.status;
  }
  // If there is no maintenance record, display "N/A" as the fallback.
  return "N/A";
}

/**
 * Map a maintenance status to a Tailwind tone class used by `StatTile`.
 * Supports both custom statuses ("In Progress", "Completed", "Scheduled")
 * and the original PMS statuses ("overdue", "scheduled", "completed").
 */
export function getMaintenanceStatusTone(status) {
  const mapping = {
    "In Progress": "amber",
    Completed: "emerald",
    Scheduled: "amber",
    overdue: "rose",
    scheduled: "amber",
    completed: "emerald",
  };
  return mapping[status] || "slate";
}

/**
 * Return the date (ISO string) that should be displayed for the "Last Maintenance" card.
 * For a completed record we prefer the `end_date`; otherwise we fall back to `start_date`.
 * Returns `null` when no record is provided.
 */
export function getLastMaintenanceDate(latestRecord) {
  if (!latestRecord) return null;
  if (latestRecord.status === "Completed" && latestRecord.end_date) {
    return latestRecord.end_date;
  }
  return latestRecord.start_date || null;
}

/**
 * Return the mileage recorded at the time of service for the latest maintenance record.
 * The database column is `mileage_at_service`. Returns `null` if unavailable.
 */
export function getPreviousMileage(latestRecord) {
  if (!latestRecord) return null;
  return latestRecord.mileage_at_service ?? null;
}

/**
 * Return the mileage recorded at service for the most recent maintenance
 * record that actually contains a `mileage_at_service` value. This is useful
 * when the newest record (by start_date) does not have that column – for
 * example, older records created before the column existed. The function
 * falls back to the same logic as `getPreviousMileage` when a suitable
 * record is found, otherwise returns `null`.
 */
export function getPreviousMileageFromRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return null;
  // Records are already sorted by start_date descending in the UI fetch.
  // Find the first record with a defined mileage_at_service.
  const recordWithMileage = records.find(
    (rec) =>
      rec.mileage_at_service !== undefined && rec.mileage_at_service !== null,
  );
  return recordWithMileage ? recordWithMileage.mileage_at_service : null;
}
