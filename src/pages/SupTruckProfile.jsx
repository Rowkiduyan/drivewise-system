import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
// import AddTruckModal from "../components/AddTruckModal.jsx"; // Disabled for supervisor view
// Icon imports for maintenance type mapping
// Icon imports for maintenance type mapping and UI elements
import {
  ArrowLeft,
  Truck,
  Calendar,
  Gauge,
  Wrench,
  Droplet,
  RotateCw,
  Disc,
  Cpu,
  BatteryCharging,
  Cog,
  Wind,
} from "lucide-react";
import { MANILA_TIMEZONE } from "../lib/manilaTime.js";
import {
  getMaintenanceCardStatus,
  getMaintenanceStatusTone,
  getLastMaintenanceDate,
  getLatestMaintenance,
  getPreviousMileageFromRecords,
} from "../components/trucks/utils/maintenance.js";
import { supabase } from "../lib/supabaseClient.js"; // Enabled for supervisor view to fetch real data
import ViewModal from "../components/ViewModal.jsx";

// Utility to format a stored date string (yyyy-MM or yyyy-MM-dd) as "MM/YYYY".
// UTC-anchored -- this is a date-only value with no real time component, so
// reading it back via UTC getters (rather than the browser's own local
// timezone) is the correct, timezone-independent approach.
const formatMonthYear = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${month}/${year}`;
};

// ---------------------------------------------------------------------------
// Dummy trip and maintenance history — frontend only, no backend/API/database.
// The truck being viewed is passed in via navigation state from the Trucks
// list (see SupTrucks.jsx), so this page doesn't need its own copy of the
// fleet roster.
// ---------------------------------------------------------------------------

const MAINTENANCE_TYPE_ICONS = {
  "Oil Change": Droplet,
  "Tire Rotation": RotateCw,
  "Brake Inspection": Disc,
  "Engine Diagnostic": Cpu,
  "Battery Check": BatteryCharging,
  "Transmission Service": Cog,
  "Air Filter Replacement": Wind,
  "Tire Replacement": RotateCw,
  "Preventive Maintenance": Droplet,
};

function TypeTag({ type }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
      {type}
    </span>
  );
}

const TRIP_STATUS_BADGE_CLASSES = {
  Completed: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200",
  Ongoing: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  Cancelled: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  "For Pickup": "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  "Out for Delivery":
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  Delivered: "bg-cyan-50 text-emerald-700 ring-1 ring-inset ring-cyan-200",
};

function TripStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        TRIP_STATUS_BADGE_CLASSES[status] || TRIP_STATUS_BADGE_CLASSES.Cancelled
      }`}
    >
      {status}
    </span>
  );
}

// Shared status-tone palette reused by the KPI tiles — keeps rose/amber/
// emerald/blue meaning "critical / due soon / healthy / informational"
// consistent everywhere on this page.
const TONE_ICON_CLASSES = {
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  slate: "bg-slate-100 text-slate-500",
};

const TONE_TEXT_CLASSES = {
  rose: "text-rose-700",
  amber: "text-amber-700",
  emerald: "text-emerald-700",
  blue: "text-blue-700",
  slate: "text-slate-700",
};

const MAINTENANCE_STATUS_BADGE_CLASSES = {
  Completed:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  Scheduled: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Overdue: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  "In Progress": "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
};

function MaintenanceStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        MAINTENANCE_STATUS_BADGE_CLASSES[status] ||
        MAINTENANCE_STATUS_BADGE_CLASSES.Scheduled
      }`}
    >
      {status}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-300 py-2.5 last:border-0">
      <span className="inline-flex items-center gap-2 text-sm text-slate-500">
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, className = "" }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-blue-600" />}
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {title}
        </h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatTile({ label, icon: Icon, tone = "slate", children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-row items-center justify-center gap-2">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE_ICON_CLASSES[tone]}`}
        >
          {Icon && <Icon className="h-3.5 w-3.5 text-blue-600" />}
        </div>
        <span className="text-[0.8rem] font-semibold uppercase tracking-[0.1em] text-slate-500 text-center">
          {label}
        </span>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trips", label: "Deliveries" },
  { id: "maintenance", label: "Maintenance" },
];

// Order matches the required UI: All, For Pickup, Out for Delivery, Delivered, Completed
// "Cancelled" is omitted because it is not needed in this context.
const TRIP_STATUS_FILTERS = [
  "All",
  "For Pickup",
  "Out for Delivery",
  "Delivered",
  "Completed",
];

// Map raw Supabase status values to UI‑friendly labels used in the filter bar.
// Mirrors the mapping used in the customer view.
const SUPERVISOR_STATUS_MAP = {
  PENDING_REQUEST: "Pending Request",
  QUOTATION_SUBMITTED: "Processing",
  COUNTER_OFFER_SUBMITTED: "Processing",
  FINAL_QUOTATION_SUBMITTED: "Processing",
  APPROVED: "For Pickup",
  ASSIGNED: "For Pickup",
  OUT_FOR_PICKUP: "For Pickup",
  ARRIVED_PICKUP: "For Pickup",
  OUT_FOR_DROPOFF: "Out for Delivery",
  ARRIVED_DROPOFF: "Out for Delivery",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const MAINTENANCE_STATUS_FILTERS = [
  "All",
  "Completed",
  "Scheduled",
  "In Progress",
];
const PAGE_SIZE = 10;

function PaginationBar({ page, setPage, totalPages }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
      <p className="text-sm text-slate-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="First page"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="flex items-center gap-1 px-1">
          {(() => {
            const pages = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              pages.push(1);
              if (page > 3) pages.push("...");
              for (
                let i = Math.max(2, page - 1);
                i <= Math.min(totalPages - 1, page + 1);
                i++
              )
                pages.push(i);
              if (page < totalPages - 2) pages.push("...");
              pages.push(totalPages);
            }
            return pages.map((num, idx) =>
              num === "..." ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-8 w-8 items-center justify-center text-sm text-slate-400"
                >
                  ...
                </span>
              ) : (
                <button
                  key={num}
                  onClick={() => setPage(num)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                    num === page
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {num}
                </button>
              ),
            );
          })()}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Last page"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SupTruckProfile() {
  const location = useLocation();
  const initialTruck = location.state?.truck;
  // Local mutable copy of the truck data that can be refreshed after updates.
  const [truck, setTruck] = useState(initialTruck);

  // Persist the selected tab across page reloads using localStorage.
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("supTruckActiveTab") || "overview";
  });
  useEffect(() => {
    localStorage.setItem("supTruckActiveTab", activeTab);
  }, [activeTab]);
  const [tripStatusFilter, setTripStatusFilter] = useState("All");
  const [tripPage, setTripPage] = useState(1);
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState("All");
  // Edit modal disabled for supervisor view – read‑only profile
  // const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [isViewModalOpen, setViewModalOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  // Log Maintenance Service Modal state (read-only display in supervisor view)
  const [isLogMaintenanceModalOpen, setIsLogMaintenanceModalOpen] =
    useState(false);
  const [logDate, setLogDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  // Optional end date for maintenance period
  const [logEndDate, setLogEndDate] = useState("");
  const [logMileage, setLogMileage] = useState("");
  const [logType, setLogType] = useState("Preventive Maintenance");
  const [logShop, setLogShop] = useState("");
  const [logStatus, setLogStatus] = useState("Completed");
  const [logNotes, setLogNotes] = useState("");
  // "Mark truck as Available now" checkbox (only relevant/shown when
  // logStatus is Completed) -- defaults checked since finishing a logged
  // service usually does mean the truck is back in rotation, but stays an
  // explicit per-submission choice rather than an automatic side effect,
  // since a Completed log doesn't always mean the truck is physically ready
  // (e.g. logged for record-keeping while still held for something else).
  const [logMarkAvailable, setLogMarkAvailable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Modal state for viewing long notes
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState("");
  // Auto‑set status based on dates:
  // - If an end date is provided → Completed
  // - Else if start date is today or earlier → In Progress
  // - Otherwise → Scheduled
  // Adjusted during render (React's own recommended pattern for "reset
  // state when a value changes") instead of in an effect -- logStatus is
  // still user-overridable via the Status <select> below, so this must
  // only re-suggest a value when logDate/logEndDate actually change, not
  // on every render (which `autoStatusKey` guards, mirroring the effect's
  // own [logDate, logEndDate] dependency list). Same fix as
  // AdminTruckProfile.jsx's identical twin.
  const [autoStatusKey, setAutoStatusKey] = useState(null);
  const statusKey = `${logDate}|${logEndDate}`;
  if (autoStatusKey !== statusKey) {
    setAutoStatusKey(statusKey);
    const today = new Date().toISOString().split("T")[0];
    // New status rules (same as admin view):
    // 1. End date before today → Completed.
    // 2. Start date after today → Scheduled.
    // 3. Otherwise → In Progress.
    if (logEndDate && logEndDate < today) {
      setLogStatus("Completed");
    } else if (logDate && logDate > today) {
      setLogStatus("Scheduled");
    } else {
      setLogStatus("In Progress");
    }
  }
  // When the maintenance log modal opens, pre‑fill the shop field for
  // supervisors. Same render-time-adjust pattern -- logShop is
  // user-editable once the modal is open, so this must only fire once per
  // open, not every render.
  const [shopPrefilledFor, setShopPrefilledFor] = useState(false);
  if (isLogMaintenanceModalOpen && !shopPrefilledFor) {
    setShopPrefilledFor(true);
    setLogShop("In-House");
  } else if (!isLogMaintenanceModalOpen && shopPrefilledFor) {
    setShopPrefilledFor(false);
  }
  // Devices list for mapping assigned device IDs to trucks (similar to AdminTrucks)
  // const [devices, setDevices] = useState([]); // Disabled for supervisor view
  // Fetch the latest truck data after an edit. Uses plate_number as identifier.
  // Fetch truck data function disabled for supervisor view (read‑only)
  // const fetchTruck = async () => {
  //   if (!truck?.plate_number) return;
  //   const { data, error } = await supabase
  //     .from("trucks")
  //     .select("*")
  //     .eq("plate_number", truck.plate_number)
  //     .single();
  //   if (error) {
  //     setToast({ message: error.message, type: "error" });
  //   } else if (data) {
  //     // Simple approach: reload the page to reflect updated data.
  //     // In a more refined implementation we could store truck data in state.
  //     window.location.reload();
  //   }
  // };
  // Auto‑clear toast after a short period (3 seconds)
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Device loading disabled for supervisor view (no edit functionality needed)
  // useEffect(() => {
  //   async function loadDevices() {
  //     const { data, error } = await supabase
  //       .from("devices")
  //       .select("device_id, plate_number")
  //       .order("device_id", { ascending: true });
  //     if (error) {
  //       console.error("Failed to fetch devices", error);
  //       return;
  //     }
  //     setDevices(data || []);
  //   }
  //   loadDevices();
  // }, []);

  // Open the View modal for a specific trip
  const openViewModal = (trip) => {
    setSelectedTrip(trip);
    setViewModalOpen(true);
  };
  const closeViewModal = () => {
    setViewModalOpen(false);
    setSelectedTrip(null);
  };

  // Prevent default form submission to avoid page reload which clears navigation state.
  const handleLogMaintenanceSubmit = async (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (!truck) return;
    setIsSubmitting(true);

    try {
      // Step A: Insert new log into public.maintenance_records
      // Insert new maintenance record and retrieve the inserted row for optimistic UI update
      const { data: insertedData, error: insertError } = await supabase
        .from("maintenance_records")
        .insert({
          truck_id: truck.id,
          start_date: logDate,
          ...(logEndDate ? { end_date: logEndDate } : {}),
          current_mileage: Number(logMileage),
          mileage_at_service: Number(logMileage),
          type: logType,
          shop: logShop,
          notes: logNotes,
          status: logStatus,
        })
        .select();

      if (insertError) {
        setToast({
          message: "Error inserting maintenance record: " + insertError.message,
          type: "error",
        });
        return;
      }

      // Step B: Update the parent public.trucks baseline fields. Also flips
      // status back to "Available" when the Supervisor left the checkbox
      // checked for a Completed log -- only when the truck is currently
      // "Maintenance", never overriding some other status (e.g. Inactive).
      const newCurrentMileage = Math.max(
        truck.current_mileage || 0,
        Number(logMileage),
      );
      const shouldMarkAvailable =
        logStatus === "Completed" &&
        logMarkAvailable &&
        truck.status === "Maintenance";
      const { error: updateError } = await supabase
        .from("trucks")
        .update({
          previous_maintenance_date: logDate,
          previous_mileage: Number(logMileage),
          current_mileage: newCurrentMileage,
          ...(shouldMarkAvailable ? { status: "Available" } : {}),
        })
        .eq("id", truck.id);

      if (updateError) {
        setToast({
          message: "Error updating truck baseline: " + updateError.message,
          type: "error",
        });
        return;
      }

      // Step C: Refresh State
      // Optimistically add the new record to the UI, then re-fetch to ensure consistency
      if (insertedData && insertedData.length) {
        setMaintenanceRecords((prev) => [insertedData[0], ...prev]);
      }
      // Re-fetch maintenance records to ensure the list is fully up‑to‑date
      await loadMaintenanceRecords();
      // Refresh the truck data to reflect updated baseline fields (previous_maintenance_date, mileage, etc.)
      const { data: refreshedTruck, error: truckFetchError } = await supabase
        .from("trucks")
        .select("*")
        .eq("id", truck.id)
        .single();
      if (!truckFetchError && refreshedTruck) {
        setTruck(refreshedTruck);
      }
      // Reset fields and close the modal after successful submission
      setLogDate(new Date().toISOString().split("T")[0]);
      setLogEndDate("");
      setLogMileage("");
      setLogType("Preventive Maintenance");
      setLogShop("");
      setLogStatus("Completed");
      setLogNotes("");
      setLogMarkAvailable(true);
      setIsLogMaintenanceModalOpen(false);
      // Show success toast
      setToast({
        message: shouldMarkAvailable
          ? "Maintenance service logged successfully — truck marked Available"
          : "Maintenance service logged successfully",
        type: "success",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Real trips fetched from delivery_requests linked to this truck.
  const [trips, setTrips] = useState([]);

  // Load delivery requests for the current truck.
  useEffect(() => {
    async function loadTrips() {
      if (!truck?.plate_number) return;
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*")
        .eq("assigned_truck_plate", truck.plate_number);
      // console.log("fetch delivery_requests for", truck.plate_number, "result", {
      //   data,
      //   error,
      // });
      if (error) {
        console.error("Failed to fetch trips", error);
        setToast({ message: error.message, type: "error" });
        setTrips([]);
      } else {
        // console.log("delivery_requests rows count", (data || []).length);
        let rows = data || [];
        // If filtered query returned no rows, attempt an unrestricted fetch for debugging.
        if (rows.length === 0) {
          const { data: allData, error: allError } = await supabase
            .from("delivery_requests")
            .select("*");
          // console.log(
          //   "unfiltered delivery_requests rows count",
          //   (allData || []).length,
          //   allError,
          // );
          if (!allError && allData) rows = allData;
        }
        // Exclude delivery request statuses that should not appear in the truck view.
        const EXCLUDED_RAW_STATUSES = [
          "PENDING_REQUEST",
          "QUOTATION_SUBMITTED",
          "COUNTER_OFFER_SUBMITTED",
          "FINAL_QUOTATION_SUBMITTED",
          "CANCELLED",
        ];
        rows = rows.filter((r) => !EXCLUDED_RAW_STATUSES.includes(r.status));
        // Gather unique driver and helper IDs for batch fetching.
        const driverIds = Array.from(
          new Set(rows.map((r) => r.assigned_driver_id).filter(Boolean)),
        );
        const helperIds = Array.from(
          new Set(
            rows.flatMap((r) => {
              // assigned_helper_ids may be an array or a JSON string; handle both.
              if (!r.assigned_helper_ids) return [];
              if (Array.isArray(r.assigned_helper_ids))
                return r.assigned_helper_ids;
              try {
                return JSON.parse(r.assigned_helper_ids);
              } catch {
                return [];
              }
            }),
          ),
        );
        // console.log("Helper IDs extracted:", helperIds);

        // Fetch driver records if needed.
        const { data: driverData } = driverIds.length
          ? await supabase
              .from("driver_records")
              .select("id,first_name,last_name,middle_name")
              .in("id", driverIds)
          : { data: [] };
        const driverMap = {};
        (driverData || []).forEach((d) => {
          const name = [d.first_name, d.middle_name, d.last_name]
            .filter(Boolean)
            .join(" ");
          driverMap[d.id] = name;
        });

        // Fetch helper records if needed.
        const { data: helperData } = helperIds.length
          ? await supabase
              .from("helper_records")
              .select("id,first_name,last_name,middle_name")
              .in("id", helperIds)
          : { data: [] };
        // console.log("Helper data fetched:", helperData);
        const helperMap = {};
        (helperData || []).forEach((h) => {
          const name = [h.first_name, h.middle_name, h.last_name]
            .filter(Boolean)
            .join(" ");
          helperMap[h.id] = name;
        });

        const mapped = rows.map((row) => {
          // Resolve driver name.
          const driverName = driverMap[row.assigned_driver_id] || "-";
          // Resolve helper names (may be multiple).
          let helperIdsForRow = [];
          if (row.assigned_helper_ids) {
            if (Array.isArray(row.assigned_helper_ids)) {
              helperIdsForRow = row.assigned_helper_ids;
            } else {
              try {
                helperIdsForRow = JSON.parse(row.assigned_helper_ids);
              } catch {
                helperIdsForRow = [];
              }
            }
          }
          const helperNames =
            helperIdsForRow
              .map((id) => helperMap[id])
              .filter(Boolean)
              .join(", ") || "-";

          return {
            id: row.id,
            dateLabel: new Date(row.created_at).toLocaleDateString("en-US", {
              timeZone: MANILA_TIMEZONE,
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            client: row.pickup_location || "Unknown",
            route: "N/A",
            driver: driverName,
            helpers: helperNames,
            status:
              SUPERVISOR_STATUS_MAP[row.status] || row.status || "Completed",
            // Fields required by the modal view – align with Admin mapping and ViewModal expectations
            item_type: row.item_type,
            // Prefer the new column names; fall back to legacy ones if they exist.
            pickup_location: row.pickup_location ?? row.pickup_address ?? "-",
            pickup_time: row.pickup_time ?? "-",
            dropoff_location:
              row.dropoff_location ?? row.dropoff_address ?? "-",
            dropoff_time: row.dropoff_time ?? row.delivered_at ?? "-",
          };
        });
        setTrips(mapped);
      }
    }
    loadTrips();
  }, [truck]);
  // Maintenance records are now empty by default as we've removed the mock generator
  // and the task focuses on the 5 health cards.
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const loadMaintenanceRecords = async () => {
    if (!truck?.plate_number) {
      setMaintenanceRecords([]);
      setMaintenanceLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("maintenance_records")
      .select("*")
      .eq("truck_id", truck.id)
      .order("start_date", { ascending: false });
    if (error) {
      console.error("Failed to fetch maintenance records", error);
      setToast({ message: error.message, type: "error" });
      setMaintenanceRecords([]);
    } else {
      setMaintenanceRecords(data || []);
    }
    setMaintenanceLoading(false);
  };
  useEffect(() => {
    // loadMaintenanceRecords deliberately omitted -- a plain function
    // redefined every render, not memoized; including it would refire this
    // effect every render instead of only when `truck` changes.
    loadMaintenanceRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truck]);

  // Reset mileage to 0 after a maintenance record is marked Completed
  useEffect(() => {
    if (!truck) return;
    const latest = getLatestMaintenance(maintenanceRecords);
    if (
      latest?.status === "Completed" &&
      truck.current_mileage &&
      truck.current_mileage !== 0
    ) {
      supabase
        .from("trucks")
        .update({ current_mileage: 0 })
        .eq("id", truck.id)
        .then(({ error }) => {
          if (error) {
            setToast({
              message: "Error resetting mileage: " + error.message,
              type: "error",
            });
          } else {
            // Refresh truck data
            supabase
              .from("trucks")
              .select("*")
              .eq("id", truck.id)
              .single()
              .then(({ data, error: fetchError }) => {
                if (!fetchError && data) setTruck(data);
              });
          }
        });
    }
    // truck deliberately omitted -- this effect's own body calls setTruck
    // (via the refetch above), so including truck would refire this effect
    // on its own update, risking a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenanceRecords]);

  // Auto‑complete any "In Progress" maintenance record when the truck's status
  // transitions to "Available". This mirrors the admin view behavior and ensures
  // the Maintenance tab shows a Completed status, also triggering mileage reset.
  useEffect(() => {
    if (!truck) return;
    if (truck.status !== "Available") return;
    const inProgress = maintenanceRecords.find(
      (r) => r.status === "In Progress",
    );
    if (!inProgress) return;
    supabase
      .from("maintenance_records")
      .update({
        status: "Completed",
        end_date: new Date().toISOString().split("T")[0],
      })
      .eq("id", inProgress.id)
      .then(async ({ error }) => {
        if (error) {
          setToast({
            message: "Error completing maintenance: " + error.message,
            type: "error",
          });
        } else {
          await loadMaintenanceRecords();
          // Update previous mileage and maintenance date on the truck.
          const today = new Date().toISOString().split("T")[0];
          supabase
            .from("trucks")
            .update({
              previous_mileage: inProgress.mileage_at_service,
              previous_maintenance_date: today,
            })
            .eq("id", truck.id)
            .then(() => {
              // Refresh truck data for PMS status consistency
              supabase
                .from("trucks")
                .select("*")
                .eq("id", truck.id)
                .single()
                .then(({ data, error: fetchError }) => {
                  if (!fetchError && data) setTruck(data);
                });
            });
        }
      });
    // truck (the whole object) and loadMaintenanceRecords deliberately
    // omitted -- this effect's own body calls setTruck/loadMaintenanceRecords,
    // so including them (a plain function redefined every render, and an
    // object this same effect updates) would refire this effect on its own
    // update, risking a loop. truck?.status alone is enough to react to the
    // one transition this effect cares about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truck?.status, maintenanceRecords]);

  const filteredTrips =
    tripStatusFilter === "All"
      ? trips
      : trips.filter((trip) => trip.status === tripStatusFilter);

  const tripStatusCounts = {
    All: trips.length,
    Completed: trips.filter((trip) => trip.status === "Completed").length,
    Ongoing: trips.filter((trip) => trip.status === "Ongoing").length,
    Cancelled: trips.filter((trip) => trip.status === "Cancelled").length,
    "For Pickup": trips.filter((trip) => trip.status === "For Pickup").length,
    "Out for Delivery": trips.filter(
      (trip) => trip.status === "Out for Delivery",
    ).length,
    Delivered: trips.filter((trip) => trip.status === "Delivered").length,
  };

  const totalTripPages = Math.max(
    1,
    Math.ceil(filteredTrips.length / PAGE_SIZE),
  );
  const safeTripPage = Math.min(tripPage, totalTripPages);
  const tripPageStart = (safeTripPage - 1) * PAGE_SIZE;
  const pagedTrips = filteredTrips.slice(
    tripPageStart,
    tripPageStart + PAGE_SIZE,
  );

  const updateTripStatusFilter = (status) => {
    setTripStatusFilter(status);
    setTripPage(1);
  };

  const filteredMaintenance =
    maintenanceStatusFilter === "All"
      ? maintenanceRecords
      : maintenanceRecords.filter(
          (record) => record.status === maintenanceStatusFilter,
        );

  const maintenanceStatusCounts = {
    All: maintenanceRecords.length,
    Completed: maintenanceRecords.filter(
      (record) => record.status === "Completed",
    ).length,
    Scheduled: maintenanceRecords.filter(
      (record) => record.status === "Scheduled",
    ).length,
    "In Progress": maintenanceRecords.filter(
      (record) => record.status === "In Progress",
    ).length,
  };

  // Maintenance tab status calculations (distinct from PMS)
  const maintenanceCardStatus = maintenanceLoading
    ? ""
    : getMaintenanceCardStatus(truck, maintenanceRecords);
  const pmsStatusTone = getMaintenanceStatusTone(maintenanceCardStatus);

  const latestRecord = getLatestMaintenance(maintenanceRecords);
  const lastMaintRaw = getLastMaintenanceDate(latestRecord);
  const lastMaintDate = lastMaintRaw
    ? new Date(lastMaintRaw).toLocaleDateString("en-US", {
        timeZone: MANILA_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";
  // Use the new helper to get the most recent mileage_at_service from any record
  const prevMileageRaw = getPreviousMileageFromRecords(maintenanceRecords);
  const prevMileage =
    prevMileageRaw !== null && prevMileageRaw !== undefined
      ? `${Number(prevMileageRaw).toLocaleString()} km`
      : "0 km";

  const currMileage =
    truck?.current_mileage !== null && truck?.current_mileage !== undefined
      ? `${Number(truck.current_mileage).toLocaleString()} km`
      : "0 km";

  if (!truck) {
    return (
      <SupLayout title="Truck Profile" background={null} bg="bg-[#F6F7FB]">
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-lg font-semibold text-slate-900">
            No truck selected
          </p>
          <p className="max-w-sm text-sm text-slate-500">
            Open a profile by selecting a truck from the Trucks list.
          </p>
          <Link
            to="/supervisor/trucks"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Trucks
          </Link>
        </div>
      </SupLayout>
    );
  }

  return (
    <SupLayout title="Truck Profile" background={null} bg="bg-[#F6F7FB]">
      <div className="flex flex-col gap-4 pb-6">
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200/70 bg-[#F6F7FB] px-4 pt-3 pb-2 sm:px-5">
          <Link
            to="/supervisor/trucks"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          {/* Edit button placeholder – disabled for supervisor view */}
          {/*
          <button
            type="button"
            onClick={() => setEditModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          */}
          {/* Toast message with slide‑down animation */}
          {toast && (
            <>
              <div className="fixed inset-x-0 top-4 flex justify-center z-50">
                <p
                  className={`
                      px-4 py-2 rounded-md shadow-md text-sm font-medium
                      transition-transform duration-300 ease-out
                      ${
                        toast.type === "success"
                          ? "bg-green-100 text-green-800 border border-green-300"
                          : "bg-red-100 text-red-800 border border-red-300"
                      }
                      transform translate-y-0 opacity-100
                    `}
                >
                  {toast.message}
                </p>
              </div>
            </>
          )}
          {/* View modal for delivery request details */}
          <ViewModal
            isOpen={isViewModalOpen}
            onClose={closeViewModal}
            trip={selectedTrip}
          />
        </div>

        {/* Profile header — compact identity strip: avatar, plate/status on
            the primary line, model/date acquired as a secondary line, and
            type as the trailing detail. */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
                    {truck.plate_number}
                  </h1>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {truck.model} · Acquired{" "}
                  {formatMonthYear(truck.date_acquired)}
                </p>
              </div>
            </div>
            <TypeTag type={truck.truck_type} />
          </div>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === "overview" && (
          <SectionCard title="Truck Information">
            <div>
              <InfoRow label="Plate Number" value={truck.plate_number} />
              <InfoRow label="Model" value={truck.model} />
              <InfoRow label="Truck Type" value={truck.truck_type} />
              <InfoRow
                label="Commodity Type"
                value={
                  /REF/i.test(truck.truck_type || "") ? "Chilled" : "Ordinary"
                }
              />
              <InfoRow label="Year Model" value={truck.year_model} />
              {/* Removed Assigned Driver InfoRow */}
              <InfoRow
                label="Date Acquired"
                value={formatMonthYear(truck.date_acquired)}
              />
              {/* New fields: Status and Assigned Device */}
              <InfoRow label="Status" value={truck.status ?? "-"} />
              {/* Assigned Device info disabled for supervisor view */}
              <InfoRow label="Assigned Device" value="-" />
              {/* Additional truck details fetched from Supabase */}
              {truck.brand && <InfoRow label="Brand" value={truck.brand} />}
              {truck.max_capacity > 0 && (
                <InfoRow label="Max Capacity (kg)" value={truck.max_capacity} />
              )}
              {truck.current_mileage > 0 && (
                <InfoRow
                  label="Current Mileage (km)"
                  value={truck.current_mileage}
                />
              )}
              {truck.maintenance_interval_km > 0 && (
                <InfoRow
                  label="Maintenance Mileage Interval (km)"
                  value={truck.maintenance_interval_km}
                />
              )}
              {truck.maintenance_interval_months > 0 && (
                <InfoRow
                  label="Maintenance Interval (months)"
                  value={truck.maintenance_interval_months}
                />
              )}
            </div>
          </SectionCard>
        )}

        {/* Trip History tab */}
        {activeTab === "trips" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {TRIP_STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => updateTripStatusFilter(status)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
                    tripStatusFilter === status
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-white"
                  }`}
                >
                  <span>{status}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      tripStatusFilter === status
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {tripStatusCounts[status]}
                  </span>
                </button>
              ))}
            </div>

            <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-5 py-3 text-center font-semibold">ID</th>
                    <th className="px-5 py-3 text-center font-semibold">Date</th>
                    <th className="px-5 py-3 text-center font-semibold">Driver</th>
                    <th className="px-5 py-3 text-center font-semibold">Helper</th>
                    <th className="px-5 py-3 text-center font-semibold">Status</th>
                    <th className="px-5 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedTrips.map((trip) => (
                    <tr key={trip.id} className="transition hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900 text-center">
                        {trip.id}
                      </td>
                      <td className="px-3 py-2 text-slate-700 text-center">
                        {trip.dateLabel}
                      </td>
                      <td className="px-3 py-2 text-slate-700 text-center">
                        {trip.driver || "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-700 text-center">
                        {trip.helpers || "-"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <TripStatusBadge status={trip.status} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {/* Placeholder for future actions (e.g., view details) */}
                        <button
                          className="rounded-md bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          type="button"
                          onClick={() => openViewModal(trip)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filteredTrips.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center text-sm text-slate-500"
                      >
                        No trips match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <PaginationBar
                page={safeTripPage}
                setPage={setTripPage}
                totalPages={totalTripPages}
              />
            </section>
          </div>
        )}

        {/* Maintenance tab */}
        {activeTab === "maintenance" && (
          <div className="flex flex-col gap-6">
            {/* Maintenance Health Cards */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Maintenance Status"
                icon={Wrench}
                tone={pmsStatusTone}
              >
                <div className="flex flex-col gap-1">
                  <p
                    className={`text-lg font-bold leading-tight text-center ${TONE_TEXT_CLASSES[pmsStatusTone]}`}
                  >
                    {maintenanceCardStatus}
                  </p>
                </div>
              </StatTile>

              <StatTile label="Last Maintenance" icon={Calendar}>
                <div className="flex flex-col gap-1">
                  <p className="text-lg font-bold text-center text-slate-900">
                    {lastMaintDate}
                  </p>
                </div>
              </StatTile>

              <StatTile label="Previous Mileage" icon={Gauge}>
                <div className="flex flex-col gap-1">
                  <p className="text-lg font-bold text-center text-slate-900">
                    {prevMileage}
                  </p>
                </div>
              </StatTile>

              <StatTile label="Current Mileage" icon={Gauge}>
                <div className="flex flex-col gap-1">
                  <p className="text-lg font-bold text-center text-slate-900">
                    {currMileage}
                  </p>
                  <p className="text-xs font-medium text-center text-blue-600">
                    Every 10,000km
                  </p>
                </div>
              </StatTile>
            </section>

            {/* Log Maintenance Service Modal */}
            {isLogMaintenanceModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-4 w-full max-w-sm shadow-xl">
                  <h3 className="text-xl font-semibold mb-2">Add Record</h3>
                  <form
                    onSubmit={handleLogMaintenanceSubmit}
                    className="space-y-2"
                  >
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        name="date"
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        End Date (optional)
                      </label>
                      <input
                        type="date"
                        name="endDate"
                        value={logEndDate}
                        onChange={(e) => setLogEndDate(e.target.value)}
                        min={logDate}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Mileage at Service (km)
                      </label>
                      <input
                        type="number"
                        name="mileage"
                        value={logMileage}
                        onChange={(e) => setLogMileage(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Service Type
                      </label>
                      <select
                        name="type"
                        value={logType}
                        onChange={(e) => setLogType(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="Preventive Maintenance">
                          Preventive Maintenance
                        </option>
                        <option value="Oil Change">Oil Change</option>
                        <option value="Brake Inspection">
                          Brake Inspection
                        </option>
                        <option value="Tire Replacement">
                          Tire Replacement
                        </option>
                        <option value="Engine Diagnostic">
                          Engine Diagnostic
                        </option>
                        <option value="Battery Check">Battery Check</option>
                        <option value="Transmission Service">
                          Transmission Service
                        </option>
                        <option value="Air Filter Replacement">
                          Air Filter Replacement
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Shop / Provider
                      </label>
                      <input
                        type="text"
                        name="shop"
                        value={logShop}
                        onChange={(e) => setLogShop(e.target.value)}
                        placeholder="e.g., In-House Garage, Casa Auto Shop"
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Status
                      </label>
                      <select
                        name="status"
                        value={logStatus}
                        onChange={(e) => setLogStatus(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="Completed">Completed</option>
                        <option value="Scheduled">Scheduled</option>
                        <option value="In Progress">In Progress</option>
                      </select>
                    </div>
                    {logStatus === "Completed" &&
                      truck?.status === "Maintenance" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="logMarkAvailable"
                            checked={logMarkAvailable}
                            onChange={(e) =>
                              setLogMarkAvailable(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <label
                            htmlFor="logMarkAvailable"
                            className="text-sm text-slate-700"
                          >
                            Mark truck as Available now
                          </label>
                        </div>
                      )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Remarks / Notes
                      </label>
                      <textarea
                        name="notes"
                        value={logNotes}
                        onChange={(e) => setLogNotes(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      ></textarea>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          // Close modal and reset all input fields to their default values
                          setIsLogMaintenanceModalOpen(false);
                          setLogDate(new Date().toISOString().split("T")[0]);
                          setLogEndDate("");
                          setLogMileage("");
                          setLogType("Preventive Maintenance");
                          setLogShop("");
                          setLogStatus("Completed");
                          setLogNotes("");
                          setLogMarkAvailable(true);
                        }}
                        className="flex-1 px-4 py-2 border rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? "Logging..." : "Log Service"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Maintenance History Table */}
            <SectionCard title="Maintenance History" icon={Wrench}>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {MAINTENANCE_STATUS_FILTERS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setMaintenanceStatusFilter(status)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
                        maintenanceStatusFilter === status
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-white"
                      }`}
                    >
                      <span>{status}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          maintenanceStatusFilter === status
                            ? "bg-white/20 text-white"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {maintenanceStatusCounts[status]}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsLogMaintenanceModalOpen(true)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 ml-auto`}
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    <span>Add Record</span>
                  </button>
                </div>

                <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <th className="px-5 py-3 text-center font-semibold">
                          Start Date
                        </th>
                        <th className="px-5 py-3 text-center font-semibold">
                          End Date
                        </th>
                        <th className="px-5 py-3 text-center font-semibold">
                          Type
                        </th>
                        <th className="px-5 py-3 text-center font-semibold">
                          Mileage
                        </th>
                        <th className="px-5 py-3 text-center font-semibold">
                          Shop
                        </th>
                        <th className="px-5 py-3 text-center font-semibold">
                          Date Added
                        </th>
                        <th className="px-5 py-3 text-center font-semibold">
                          Status
                        </th>
                        <th className="px-5 py-3 text-center font-semibold">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMaintenance.map((record) => (
                        <tr
                          key={record.id}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="px-3 py-2 text-slate-700 text-center">
                            {record.start_date
                              ? new Date(record.start_date).toLocaleDateString(
                                  "en-US",
                                  {
                                    timeZone: MANILA_TIMEZONE,
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-center">
                            {record.end_date
                              ? new Date(record.end_date).toLocaleDateString(
                                  "en-US",
                                  {
                                    timeZone: MANILA_TIMEZONE,
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-center">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const Icon =
                                  MAINTENANCE_TYPE_ICONS[record.type];
                                return Icon ? (
                                  <Icon className="h-3.5 w-3.5 text-slate-400" />
                                ) : null;
                              })()}
                              {record.type}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-center">
                            {record.mileage_at_service !== null &&
                            record.mileage_at_service !== undefined
                              ? `${Number(record.mileage_at_service).toLocaleString()} km`
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-center">
                            {record.shop === "In-house Maintenance"
                              ? "In-House"
                              : record.shop}
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-center">
                            {record.created_at
                              ? new Date(record.created_at).toLocaleDateString(
                                  "en-US",
                                  {
                                    timeZone: MANILA_TIMEZONE,
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <MaintenanceStatusBadge status={record.status} />
                          </td>
                          <td className="px-3 py-2 text-slate-700 text-center">
                            {record.notes ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedNote(record.notes);
                                  setIsNoteModalOpen(true);
                                }}
                                className="rounded-md bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                View
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                      {filteredMaintenance.length === 0 && (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-5 py-8 text-center text-sm text-slate-500"
                          >
                            No records match this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
      {/* Notes view modal */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto overflow-x-hidden flex flex-col p-4">
            <div className="flex items-center justify-between border-b pb-2 mb-4">
              <h3 className="text-lg font-semibold">Notes</h3>
              <button
                type="button"
                onClick={() => setIsNoteModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <p className="whitespace-pre-wrap break-words">{selectedNote}</p>
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setIsNoteModalOpen(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit modal disabled for supervisor view */}
      {/*
      {isEditModalOpen && (
        <AddTruckModal
          isOpen={isEditModalOpen}
          onClose={() => setEditModalOpen(false)}
          mode="edit"
          initialData={truck}
          onSuccess={() => {
            // Show success toast, then refresh data.
            // Include plate number in success toast for updated truck
            setToast({
              message: `Truck ${truck.plate_number} updated successfully`,
              type: "success",
            });
            // Refreshing the page after edit caused the toast to disappear instantly.
            // Instead, simply close the edit modal and rely on the existing toast.
            setEditModalOpen(false);
          }}
        />
      )}
      */}
    </SupLayout>
  );
}

export default SupTruckProfile;
