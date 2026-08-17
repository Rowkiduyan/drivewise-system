import { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
// import AddTruckModal from "../components/AddTruckModal.jsx"; // Disabled for supervisor view
import {
  ArrowLeft,
  Truck,
  // Pencil, // Edit functionality disabled for supervisor view
  AlertTriangle,
  CheckCircle2,
  Clock,
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
// import { supabase } from "../lib/supabaseClient.js"; // Disabled for supervisor view (no data fetch)

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

const CLIENT_SPECIALTIES = [
  "Jollibee",
  "McDonald's",
  "Chowking",
  "KFC",
  "Mang Inasal",
  "Greenwich",
  "Shakey's",
  "Red Ribbon",
  "Goldilocks",
  "Max's Restaurant",
];

const TRIP_ROUTES = [
  "Manila Warehouse → Quezon Ave Branch",
  "Cavite Depot → Alabang Branch",
  "Manila Warehouse → Ortigas Branch",
  "Pasig Hub → BGC Branch",
  "Cavite Depot → Las Piñas Branch",
  "Manila Warehouse → Cubao Branch",
  "Pasig Hub → Marikina Branch",
  "Cavite Depot → Parañaque Branch",
];

const TRIP_STATUS_POOL = ["Completed", "Completed", "Completed", "Cancelled"];

const MAINTENANCE_TYPES = [
  "Oil Change",
  "Tire Rotation",
  "Brake Inspection",
  "Engine Diagnostic",
  "Battery Check",
  "Transmission Service",
  "Air Filter Replacement",
];

const MAINTENANCE_SHOPS = [
  "Fleet Care Manila",
  "AutoWorks Cavite",
  "Isuzu Service Center QC",
  "Hino Service Pasig",
  "TruckFix Alabang",
];

const MAINTENANCE_TYPE_ICONS = {
  "Oil Change": Droplet,
  "Tire Rotation": RotateCw,
  "Brake Inspection": Disc,
  "Engine Diagnostic": Cpu,
  "Battery Check": BatteryCharging,
  "Transmission Service": Cog,
  "Air Filter Replacement": Wind,
};

// Fixed "today" so the mock trip/maintenance data (and every countdown
// derived from it) stays stable across re-renders instead of drifting
// with the real clock.
const NOW = new Date("2026-07-19T08:00:00");

// Small seeded generator so a given truck's mock history stays the same
// while you're viewing the page, instead of reshuffling on every re-render.
function createSeededRng(idString) {
  let state = 0;
  for (let i = 0; i < idString.length; i += 1)
    state = (state * 31 + idString.charCodeAt(i)) >>> 0;
  if (state <= 0) state = 1;
  return function next() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function buildMockTrips(truck) {
  const rng = createSeededRng(`${truck.id}-trips`);
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const tripCount = 8 + Math.floor(rng() * 5); // 8-12

  return Array.from({ length: tripCount }, (_, i) => {
    const isOngoing = i === 0 && truck.status === "On Delivery";
    const status = isOngoing ? "Ongoing" : pick(TRIP_STATUS_POOL);
    const date = new Date(
      NOW.getTime() - i * (18 + rng() * 20) * 60 * 60 * 1000,
    );
    const client = truck.clientSpecialties?.length
      ? pick(truck.clientSpecialties)
      : pick(CLIENT_SPECIALTIES);

    return {
      id: `TRIP-${2100 - i}`,
      dateLabel: date.toLocaleDateString("en-US", {
        timeZone: MANILA_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      client,
      route: pick(TRIP_ROUTES),
      status,
    };
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildMockMaintenance(truck) {
  const rng = createSeededRng(`${truck.id}-maintenance`);
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const recordCount = 6 + Math.floor(rng() * 5); // 6-10

  return Array.from({ length: recordCount }, (_, i) => {
    const isUpcoming = i < 2 && truck.status !== "Offline";
    const status = isUpcoming ? pick(["Scheduled", "Overdue"]) : "Completed";

    let actualDate;
    if (status === "Overdue") {
      actualDate = new Date(NOW.getTime() - (2 + rng() * 8) * DAY_MS);
    } else if (status === "Scheduled") {
      actualDate = new Date(
        NOW.getTime() + (i + 1) * (5 + rng() * 10) * DAY_MS,
      );
    } else {
      actualDate = new Date(NOW.getTime() - i * (12 + rng() * 18) * DAY_MS);
    }

    const daysFromNow = Math.round(
      (actualDate.getTime() - NOW.getTime()) / DAY_MS,
    );
    // Odometer data removed to align with backend schema.
    const odometer = 0; // placeholder value

    return {
      id: `MTN-${3100 - i}`,
      date: actualDate,
      dateLabel: actualDate.toLocaleDateString("en-US", {
        timeZone: MANILA_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      type: pick(MAINTENANCE_TYPES),
      shop: pick(MAINTENANCE_SHOPS),
      status,
      odometer,
      daysFromNow,
    };
  });
}

function getMaintenanceUrgency(record) {
  const { status, daysFromNow } = record;
  if (status === "Overdue") {
    return {
      label:
        daysFromNow === 0 ? "Due today" : `${Math.abs(daysFromNow)}d overdue`,
      tone: "rose",
    };
  }
  if (status === "Scheduled") {
    if (daysFromNow <= 7) {
      return {
        label: daysFromNow === 0 ? "Due today" : `Due in ${daysFromNow}d`,
        tone: "amber",
      };
    }
    return { label: `Due in ${daysFromNow}d`, tone: "blue" };
  }
  return { label: "Completed", tone: "emerald" };
}

function TypeTag({ type }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
      {type}
    </span>
  );
}

const TRIP_STATUS_BADGE_CLASSES = {
  Completed:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  Ongoing: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Cancelled: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
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

// Shared status-tone palette reused by the maintenance alert banner, urgency
// chips, and KPI tiles — keeps rose/amber/emerald/blue meaning "critical /
// due soon / healthy / informational" consistent everywhere on this page.
const TONE_BADGE_CLASSES = {
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  slate: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
};

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

function UrgencyChip({ record }) {
  const { label, tone } = getMaintenanceUrgency(record);
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_BADGE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

const MAINTENANCE_STATUS_BADGE_CLASSES = {
  Completed:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  Scheduled: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Overdue: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE_ICON_CLASSES[tone]}`}
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
          {label}
        </span>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trips", label: "Trip History" },
  { id: "maintenance", label: "Maintenance" },
];

const TRIP_STATUS_FILTERS = ["All", "Completed", "Ongoing", "Cancelled"];
const MAINTENANCE_STATUS_FILTERS = ["All", "Completed", "Scheduled", "Overdue"];
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

function AdminTruckProfile() {
  const location = useLocation();
  const truck = location.state?.truck;

  const [activeTab, setActiveTab] = useState("overview");
  const [tripStatusFilter, setTripStatusFilter] = useState("All");
  const [tripPage, setTripPage] = useState(1);
  const [maintenanceStatusFilter, setMaintenanceStatusFilter] = useState("All");
  // Edit modal disabled for supervisor view – read‑only profile
  // const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
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

  const trips = useMemo(() => (truck ? buildMockTrips(truck) : []), [truck]);
  const maintenanceRecords = useMemo(
    () => (truck ? buildMockMaintenance(truck) : []),
    [truck],
  );

  const upcomingMaintenance = useMemo(
    () =>
      maintenanceRecords
        .filter((record) => record.status !== "Completed")
        .sort((a, b) => a.date - b.date),
    [maintenanceRecords],
  );
  const completedMaintenance = useMemo(
    () =>
      maintenanceRecords
        .filter((record) => record.status === "Completed")
        .sort((a, b) => b.date - a.date),
    [maintenanceRecords],
  );
  const overdueMaintenance = useMemo(
    () => upcomingMaintenance.filter((record) => record.status === "Overdue"),
    [upcomingMaintenance],
  );
  const nextService = upcomingMaintenance[0] || null;
  const lastService = completedMaintenance[0] || null;
  const overallCondition =
    overdueMaintenance.length > 0
      ? { label: "Needs Attention", tone: "rose", icon: AlertTriangle }
      : upcomingMaintenance.some((record) => record.daysFromNow <= 7)
        ? { label: "Service Due Soon", tone: "amber", icon: Clock }
        : { label: "Up to Date", tone: "emerald", icon: CheckCircle2 };

  const filteredTrips =
    tripStatusFilter === "All"
      ? trips
      : trips.filter((trip) => trip.status === tripStatusFilter);

  const tripStatusCounts = {
    All: trips.length,
    Completed: trips.filter((trip) => trip.status === "Completed").length,
    Ongoing: trips.filter((trip) => trip.status === "Ongoing").length,
    Cancelled: trips.filter((trip) => trip.status === "Cancelled").length,
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
    Overdue: maintenanceRecords.filter((record) => record.status === "Overdue")
      .length,
  };

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
          )}
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
              {truck.max_capacity && (
                <InfoRow label="Max Capacity (kg)" value={truck.max_capacity} />
              )}
              {truck.current_mileage && (
                <InfoRow
                  label="Current Mileage (km)"
                  value={truck.current_mileage}
                />
              )}
              {truck.maintenance_mileage_interval && (
                <InfoRow
                  label="Maintenance Mileage Interval (km)"
                  value={truck.maintenance_mileage_interval}
                />
              )}
              {truck.maintenance_interval && (
                <InfoRow
                  label="Maintenance Interval (months)"
                  value={truck.maintenance_interval}
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
                    <th className="px-5 py-3 font-semibold">Trip ID</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Client</th>
                    <th className="px-5 py-3 font-semibold">Route</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedTrips.map((trip) => (
                    <tr key={trip.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {trip.id}
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {trip.dateLabel}
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {trip.client}
                      </td>
                      <td className="px-5 py-4 text-slate-700">{trip.route}</td>
                      <td className="px-5 py-4">
                        <TripStatusBadge status={trip.status} />
                      </td>
                    </tr>
                  ))}

                  {filteredTrips.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
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
          <div className="flex flex-col gap-4">
            {/* Condition overview — the four numbers a supervisor needs to
                gauge this truck's maintenance health at a glance. */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Condition"
                icon={overallCondition.icon}
                tone={overallCondition.tone}
              >
                <p
                  className={`text-base font-bold ${TONE_TEXT_CLASSES[overallCondition.tone]}`}
                >
                  {overallCondition.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {overdueMaintenance.length > 0
                    ? `${overdueMaintenance.length} task${overdueMaintenance.length === 1 ? "" : "s"} need attention`
                    : upcomingMaintenance.length > 0
                      ? `${upcomingMaintenance.length} upcoming`
                      : "No pending service"}
                </p>
              </StatTile>

              <StatTile
                label="Next Service"
                icon={Calendar}
                tone={
                  nextService
                    ? getMaintenanceUrgency(nextService).tone
                    : "slate"
                }
              >
                {nextService ? (
                  <>
                    <p className="truncate text-sm font-bold text-slate-900">
                      {nextService.type}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {nextService.dateLabel} ·{" "}
                      {getMaintenanceUrgency(nextService).label}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-500">
                    None scheduled
                  </p>
                )}
              </StatTile>

              <StatTile label="Last Service" icon={CheckCircle2} tone="emerald">
                {lastService ? (
                  <>
                    <p className="truncate text-sm font-bold text-slate-900">
                      {lastService.type}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {lastService.dateLabel} · {lastService ? "0 km" : "0 km"}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-500">
                    No history
                  </p>
                )}
              </StatTile>

              <StatTile label="Since Last Service" icon={Gauge} tone="blue">
                <p className="text-sm font-bold text-slate-900">
                  {(lastService
                    ? Math.max(0, truck.odometer - (lastService?.odometer || 0))
                    : truck.odometer
                  ).toLocaleString()}{" "}
                  km
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Now at{" "}
                  {truck.odometer ? truck.odometer.toLocaleString() : "0"} km
                </p>
              </StatTile>
            </section>

            {/* Upcoming Maintenance — prioritized, glanceable list rather
                than a table, since this is the "what do I need to act on"
                view; the ledger of everything belongs in History below. */}
            <SectionCard title="Upcoming Maintenance" icon={Calendar}>
              {upcomingMaintenance.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No upcoming maintenance scheduled for this truck.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {upcomingMaintenance.map((record) => {
                    const TypeIcon =
                      MAINTENANCE_TYPE_ICONS[record.type] || Wrench;
                    return (
                      <li
                        key={record.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {record.type}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {record.shop} · {record.dateLabel} · ~ 0 km
                          </p>
                        </div>
                        <UrgencyChip record={record} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            {/* Maintenance History — the full ledger, filterable by status. */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1">
                <Wrench className="h-4 w-4 text-blue-600" />
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Maintenance History
                </h2>
              </div>

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
              </div>

              <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-5 py-3 font-semibold">Record ID</th>
                      <th className="px-5 py-3 font-semibold">Date</th>
                      <th className="px-5 py-3 font-semibold">Service</th>
                      <th className="px-5 py-3 font-semibold">Shop</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMaintenance.map((record) => {
                      const TypeIcon =
                        MAINTENANCE_TYPE_ICONS[record.type] || Wrench;
                      return (
                        <tr
                          key={record.id}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="px-5 py-4 font-medium text-slate-900">
                            {record.id}
                          </td>
                          <td className="px-5 py-4 text-slate-700">
                            {record.dateLabel}
                          </td>
                          <td className="px-5 py-4 text-slate-700">
                            <span className="inline-flex items-center gap-2">
                              <TypeIcon className="h-3.5 w-3.5 text-slate-400" />
                              {record.type}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-700">0 km</td>
                          <td className="px-5 py-4 text-slate-700">
                            {record.shop}
                          </td>
                          <td className="px-5 py-4">
                            <MaintenanceStatusBadge status={record.status} />
                          </td>
                        </tr>
                      );
                    })}

                    {filteredMaintenance.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-8 text-center text-sm text-slate-500"
                        >
                          No maintenance records match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </div>
          </div>
        )}
      </div>
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

export default AdminTruckProfile;
