import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { Search, ChevronRight } from "lucide-react";
import { MANILA_TIMEZONE } from "../lib/manilaTime.js";
import { formatWorkingDays } from "../lib/workingDays.js";
import {
  CREW_ACTIVE_STATUSES,
  CREW_STATUS_META,
  getCrewAvailability,
  todayDateKey,
  formatDateKey,
  computeWeeklyPerformanceScore,
  WEEKLY_PERFORMANCE_WINDOW_DAYS,
} from "../lib/crewStatus.js";

// ---------------------------------------------------------------------------
// Crew roster — loaded from the admin-users Edge Function's `list-crew`
// action (Driver/Helper users merged with their driver_records/
// helper_records row). See DATABASE.md "Per-role profile tables" and
// AUTHENTICATION.md for why this can't be a direct client-side query.
// ---------------------------------------------------------------------------

// Shift/status have no backing table yet (see DATABASE.md "Current Notes")
// and stay fixed placeholders. Client Specialty is real — sourced from
// crew_client_specialties/customer_records via the admin-users Edge
// Function's list-crew (per-crew assignments) and list-clients (the full
// client roster, for the filter dropdown).

// UTC-anchored, matching DriverProfile.jsx's calculateAge -- birthdate is a
// date-only value with no real time component, so reading it back via UTC
// getters (rather than the browser's own local timezone) is the correct,
// timezone-independent approach.
function getAgeFromBirthday(birthday, referenceDate = new Date()) {
  const age = referenceDate.getUTCFullYear() - birthday.getUTCFullYear();
  const monthDifference = referenceDate.getUTCMonth() - birthday.getUTCMonth();
  const dayDifference = referenceDate.getUTCDate() - birthday.getUTCDate();

  return monthDifference > 0 || (monthDifference === 0 && dayDifference >= 0)
    ? age
    : age - 1;
}

function buildDisplayName(firstName, middleName, lastName) {
  const nameParts = [firstName];
  if (middleName) {
    nameParts.push(`${middleName.trim().charAt(0).toUpperCase()}.`);
  }
  return `${lastName || ""}, ${nameParts.filter(Boolean).join(" ")}`.trim();
}

// Maps one row from the `list-crew` Edge Function response (users merged
// with their driver_records/helper_records row) into the shape this page
// and SupCrewProfile.jsx expect. Status has no real data source yet (see
// module comment above) and is left as a neutral placeholder rather than a
// fabricated value. Client Specialties and Working Days are real —
// specialties via crew_client_specialties/customer_records, working days via
// crew_availability, both attached by the Edge Function's list-crew.
// weeklyPerformance defaults to null here and is filled in separately, after
// this roster loads, by the weeklyPerformanceByDriverId merge below (see
// that effect's comment for the scoring logic) — a Driver's score needs
// `sessions` data this Edge Function response doesn't carry, and a Helper
// never gets one at all (Helpers don't drive, so there's no session data to
// score them on).
function mapCrewRow(row) {
  const birthDate = row.birthdate ? new Date(row.birthdate) : null;

  return {
    id: row.id,
    recordId: row.record_id || "",
    fullName: buildDisplayName(row.first_name, row.middle_name, row.last_name),
    position: row.role,
    clientSpecialties: row.client_specialties || [],
    workingDays: row.working_days || [],
    contactNumber: row.contact_number || "",
    employeeId: row.record_id || "",
    birthday: birthDate
      ? birthDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
      : null,
    age: birthDate ? getAgeFromBirthday(birthDate) : null,
    dateJoined: row.created_at
      ? new Date(row.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: MANILA_TIMEZONE })
      : "",
    personalEmail: row.email || "",
    workEmail: row.login_email || "",
    weeklyPerformance: null,
  };
}

function getInitials(fullName) {
  const [last = "", rest = ""] = fullName.split(",").map((part) => part.trim());
  const first = rest.split(" ")[0] || "";
  return (`${last.charAt(0)}${first.charAt(0)}`.toUpperCase()) || "?";
}

function StatusBadge({ status }) {
  const meta = CREW_STATUS_META[status] || CREW_STATUS_META.unavailable;
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}
    >
      {meta.label}
    </span>
  );
}

function PositionTag({ position }) {
  const isDriver = position === "Driver";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        isDriver ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {position}
    </span>
  );
}

// Weekly Performance — color-coded so supervisors can spot frequent
// eye-closure/drowsiness patterns at a glance without reading every number.
// Score itself comes from computeWeeklyPerformanceScore (lib/crewStatus.js);
// these are just the display tiers. Helpers don't drive, so they always show
// "N/A" instead of a badge (see PerformanceBadge/mapCrewRow's null default).
function getPerformanceTier(score) {
  if (score >= 85) {
    return { label: "Good", classes: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" };
  }
  if (score >= 70) {
    return { label: "Watch", classes: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" };
  }
  return { label: "At Risk", classes: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200" };
}

function PerformanceBadge({ score }) {
  // null means either a Helper (never scored -- they don't drive) or a
  // Driver with zero sessions in the trailing window (unmeasured, not a
  // perfect or failing week) -- see computeWeeklyPerformanceScore. Shown as
  // "N/A" rather than a blank cell, same fallback as Client Specialty below.
  if (score == null) {
    return <span className="text-sm text-slate-400">N/A</span>;
  }

  const tier = getPerformanceTier(score);
  return (
    <span
      title={`${tier.label} — 7-day average alertness score`}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tier.classes}`}
    >
      {score}/100
    </span>
  );
}

// Filter dropdown — used for Status, Position, and Client. A native <select>
// scales to any number of options without wrapping or crowding the toolbar
// (unlike the pill/tab groups it replaces), and gets keyboard navigation and
// a native mobile picker for free, so no custom popover/menu is needed.
function FilterSelect({ id, label, value, onChange, options, counts, allLabel }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-auto min-w-[7.5rem] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
      >
        <option value="All">
          {allLabel}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option} ({counts[option] ?? 0})
          </option>
        ))}
      </select>
    </>
  );
}

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
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
        </button>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-1 px-1">
          {(() => {
            const pages = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              pages.push(1);
              if (page > 3) pages.push('...');
              for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
              if (page < totalPages - 2) pages.push('...');
              pages.push(totalPages);
            }
            return pages.map((num, idx) =>
              num === '...' ? (
                <span key={`ellipsis-${idx}`} className="flex h-8 w-8 items-center justify-center text-sm text-slate-400">...</span>
              ) : (
                <button
                  key={num}
                  onClick={() => setPage(num)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                    num === page
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {num}
                </button>
              )
            );
          })()}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Last page"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ["Available", "Assigned", "Unavailable"];
const POSITION_OPTIONS = ["Driver", "Helper"];
const PAGE_SIZE = 10;

function SupDeliveryCrew() {
  const navigate = useNavigate();
  const [roster, setRoster] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedPosition, setSelectedPosition] = useState("All");
  const [selectedClient, setSelectedClient] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [clientOptions, setClientOptions] = useState([]);
  // Record ids (D001/H001) of crew currently on an ACTIVE trip — derived
  // from delivery_requests, refreshed live via Realtime below.
  const [busyRecordIds, setBusyRecordIds] = useState(() => ({}));
  // Helper record id → the driver member they're assigned with on an active
  // trip (powers each helper's "with driver" line).
  const [helperDriverByRecordId, setHelperDriverByRecordId] = useState(() => new Map());
  // Helper record id → the driver member from their saved Delivery Crew
  // profile (driver_default_assignments), used as a fallback when not on a trip.
  const [helperDefaultDriverByRecordId, setHelperDefaultDriverByRecordId] = useState(() => new Map());
  // Crew list view: "all" | "week" (free this week) | "helper-driver".
  const [viewMode, setViewMode] = useState("all");

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list-clients" },
      });

      if (isMounted && !error) {
        setClientOptions((data.clients || []).map((client) => client.name));
      }
    }

    loadClients();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCrew() {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list-crew" },
      });

      if (!isMounted) {
        return;
      }

      if (error) {
        setLoadError(error.message || "Unable to load delivery crew.");
        setIsLoading(false);
        return;
      }

      setLoadError("");
      setRoster((data.crew || []).map(mapCrewRow));
      setIsLoading(false);
    }

    loadCrew();

    return () => {
      isMounted = false;
    };
  }, []);

  // Weekly Performance — real score per Driver, computed from their own
  // `sessions` rows (Supervisors can read every session, see RLS.md) over
  // the trailing WEEKLY_PERFORMANCE_WINDOW_DAYS. Bulk equivalent of
  // SupCrewProfile.jsx's own per-driver "This Week (7 Days)" fetch: that page
  // scopes to one driver_id at a time since it's only ever showing one
  // profile, this one fetches every driver's sessions in a single query
  // instead of one request per roster row.
  //
  // computeWeeklyPerformanceScore (lib/crewStatus.js) turns each driver's
  // list of per-session total_alerts into one 0-100 number: `100 *
  // (safeCount + 0.5 * moderateCount) / totalSessions`, using the same
  // Safe/Moderate/High-Risk (<2 / 2-3 / 4+ alerts) thresholds the profile
  // page's own risk badges already use. Percentage-based rather than a flat
  // point deduction per bad trip, so a high-volume driver with a couple of
  // moderate trips isn't penalized more harshly than a low-volume driver
  // with the same *proportion* of incidents. A driver with zero sessions in
  // the window gets null ("N/A"), not a fabricated 0 or 100 — no data isn't
  // the same as a perfect or failing week.
  //
  // Helpers never get an entry here (sessions.driver_id has nothing for
  // them) and stay at mapCrewRow's default null — they don't drive, so
  // there's nothing to score them on.
  const [weeklyPerformanceByDriverId, setWeeklyPerformanceByDriverId] =
    useState({});
  useEffect(() => {
    let isMounted = true;

    async function loadWeeklyPerformance() {
      const since = new Date(
        Date.now() - WEEKLY_PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await supabase
        .from("sessions")
        .select("driver_id, total_alerts")
        .gte("created_at", since);

      if (!isMounted || error || !data) {
        return;
      }

      const alertCountsByDriverId = {};
      for (const row of data) {
        if (!row.driver_id) continue;
        (alertCountsByDriverId[row.driver_id] ||= []).push(
          row.total_alerts || 0,
        );
      }

      const scores = {};
      for (const [driverId, alertCounts] of Object.entries(
        alertCountsByDriverId,
      )) {
        scores[driverId] = computeWeeklyPerformanceScore(alertCounts);
      }
      setWeeklyPerformanceByDriverId(scores);
    }

    loadWeeklyPerformance();

    return () => {
      isMounted = false;
    };
  }, []);

  // Live crew-assignment status: which record ids are on an ACTIVE trip
  // right now, and (for helpers) which driver they're riding with. Derived
  // from delivery_requests directly (Supervisor read policy), refreshed on
  // every request change via Realtime so assignment decisions always see
  // current availability without a manual reload.
  useEffect(() => {
    let isMounted = true;

    async function loadAssignments() {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("id, assigned_driver_id, assigned_helper_ids, pickup_date, dropoff_date")
        .in("status", CREW_ACTIVE_STATUSES);

      if (!isMounted || error || !data) {
        return;
      }

      // Date-aware busy map (plain object — Map is shadowed by a lucide icon
      // import in SupDeliveries.jsx, kept consistent here): recordId -> active
      // trip date ranges, so the roster reflects "Assigned" only for trips
      // covering today.
      const busy = {};
      const addBusy = (recordId, start, end) => {
        if (!recordId || !start || !end) return;
        const list = busy[recordId] || [];
        list.push({ start: String(start).slice(0, 10), end: String(end).slice(0, 10) });
        busy[recordId] = list;
      };
      const helperDriver = new Map();
      const driverById = new Map(
        roster.map((member) => [member.recordId, member]),
      );

      for (const row of data) {
        if (row.assigned_driver_id) {
          addBusy(row.assigned_driver_id, row.pickup_date, row.dropoff_date);
          for (const helperId of row.assigned_helper_ids || []) {
            addBusy(helperId, row.pickup_date, row.dropoff_date);
            // Only remember the FIRST active driver per helper — a helper
            // can't be on two active trips at once in practice.
            if (!helperDriver.has(helperId)) {
              helperDriver.set(helperId, driverById.get(row.assigned_driver_id) || null);
            }
          }
        }
      }

      setBusyRecordIds(busy);
      setHelperDriverByRecordId(helperDriver);

      // Also load saved default crew assignments (Delivery Crew profile) so a
      // helper's "assigned driver" is shown even when not currently on a trip.
      try {
        const { data: defaults } = await supabase
          .from("driver_default_assignments")
          .select("driver_record_id, helper_record_ids");
        const helperDefault = new Map();
        for (const row of defaults || []) {
          for (const hid of row.helper_record_ids || []) {
            if (hid && !helperDefault.has(hid)) {
              helperDefault.set(hid, driverById.get(row.driver_record_id) || null);
            }
          }
        }
        if (isMounted) setHelperDefaultDriverByRecordId(helperDefault);
      } catch {
        // Default-assignment lookup is best-effort.
      }
    }

    loadAssignments();

    const channel = supabase
      .channel(`crew-assignments-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_requests" },
        () => {
          loadAssignments();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
    // roster dependency: the helper→driver map needs the full roster loaded
    // to resolve record ids into members.
  }, [roster]);

  // Derive each member's live availability (Available / Assigned /
  // Unavailable) from their weekly working days + current active trips, and
  // attach their real Weekly Performance score (Drivers only; Helpers keep
  // mapCrewRow's default null since they have no session data).
  const rosterWithStatus = useMemo(
    () =>
      roster.map((member) => ({
        ...member,
        status: getCrewAvailability(member, busyRecordIds, todayDateKey()).key,
        statusLabel: getCrewAvailability(member, busyRecordIds, todayDateKey()).label,
        weeklyPerformance:
          weeklyPerformanceByDriverId[member.recordId] ?? null,
      })),
    [roster, busyRecordIds, weeklyPerformanceByDriverId],
  );

  const statusCounts = useMemo(
    () => ({
      All: rosterWithStatus.length,
      Available: rosterWithStatus.filter((crew) => crew.status === "available").length,
      Assigned: rosterWithStatus.filter((crew) => crew.status === "assigned").length,
      Unavailable: rosterWithStatus.filter((crew) => crew.status === "unavailable").length,
    }),
    [rosterWithStatus],
  );

  const positionCounts = useMemo(
    () => ({
      All: rosterWithStatus.length,
      Driver: rosterWithStatus.filter((crew) => crew.position === "Driver").length,
      Helper: rosterWithStatus.filter((crew) => crew.position === "Helper").length,
    }),
    [rosterWithStatus],
  );

  const clientCounts = useMemo(() => {
    const counts = { All: rosterWithStatus.length };
    clientOptions.forEach((client) => {
      counts[client] = rosterWithStatus.filter((crew) => crew.clientSpecialties.includes(client)).length;
    });
    return counts;
  }, [rosterWithStatus, clientOptions]);

  // Current week window (Mon–Sun, Manila) for the "Available This Week"
  // shortcut. A member is free this week when none of their active trips
  // overlap the window.
  const { weekStartKey, weekEndKey, weekLabel } = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return {
      weekStartKey: formatDateKey(start),
      weekEndKey: formatDateKey(end),
      weekLabel: `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: MANILA_TIMEZONE })} – ${end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: MANILA_TIMEZONE })}`,
    };
  }, []);

  // Extends rosterWithStatus with free-this-week and a helper's assigned driver
  // (active trip first, then saved Delivery Crew profile).
  const rosterWithView = useMemo(
    () =>
      rosterWithStatus.map((member) => {
        const trips = busyRecordIds[member.recordId] || [];
        const freeThisWeek = !trips.some((t) => t.start <= weekEndKey && weekStartKey <= t.end);
        let assignedDriver = null;
        if (member.position === "Helper") {
          assignedDriver =
            helperDriverByRecordId.get(member.recordId) || helperDefaultDriverByRecordId.get(member.recordId) || null;
        }
        return { ...member, freeThisWeek, assignedDriver };
      }),
    [rosterWithStatus, busyRecordIds, helperDriverByRecordId, helperDefaultDriverByRecordId, weekStartKey, weekEndKey],
  );

  const filteredCrew = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return rosterWithView.filter((crew) => {
      const matchesSearch = !query
        ? true
        : [crew.fullName, crew.position, crew.statusLabel, ...crew.clientSpecialties, crew.employeeId]
            .join(" ")
            .toLowerCase()
            .includes(query);

      const matchesStatus =
        selectedStatus === "All" ||
        crew.status === selectedStatus.toLowerCase();
      const matchesPosition = selectedPosition === "All" || crew.position === selectedPosition;
      const matchesClient =
        selectedClient === "All" || crew.clientSpecialties.includes(selectedClient);
      const matchesView =
        viewMode === "all"
          ? true
          : viewMode === "week"
            ? crew.freeThisWeek
            : viewMode === "helper-driver"
              ? crew.position === "Helper"
              : true;

      return matchesSearch && matchesStatus && matchesPosition && matchesClient && matchesView;
    }).sort((leftCrew, rightCrew) => leftCrew.fullName.localeCompare(rightCrew.fullName));
  }, [rosterWithView, searchTerm, selectedStatus, selectedPosition, selectedClient, viewMode]);

  // Quick-view tiles — crew availability at a glance without opening a single
  // profile. "This week" coverage is the Working Days column.
  const quickView = useMemo(
    () => ({
      available: rosterWithView.filter((crew) => crew.status === "available").length,
      assigned: rosterWithView.filter((crew) => crew.status === "assigned").length,
      unavailable: rosterWithView.filter((crew) => crew.status === "unavailable").length,
      week: rosterWithView.filter((crew) => crew.freeThisWeek).length,
      total: rosterWithView.length,
    }),
    [rosterWithView],
  );

  const totalPages = Math.max(1, Math.ceil(filteredCrew.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedCrew = filteredCrew.slice(pageStart, pageStart + PAGE_SIZE);

  const updateSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const updateStatus = (value) => {
    setSelectedStatus(value);
    setCurrentPage(1);
  };

  const updatePosition = (value) => {
    setSelectedPosition(value);
    setCurrentPage(1);
  };

  const updateClient = (value) => {
    setSelectedClient(value);
    setCurrentPage(1);
  };

  const openProfile = (crew) => {
    navigate("/supervisor/delivery-crew/profile", { state: { crew } });
  };

  return (
    <SupLayout title="Delivery Crew" background={null} bg="bg-[#F6F7FB]">
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* Quick view — today's availability at a glance. Counts are live:
            they move a member between tiles automatically as trips start/end
            (Realtime) or as members edit their weekly working days. */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Available Today", value: quickView.available, dot: CREW_STATUS_META.available.dot, mode: null },
            { label: "Assigned on Trips", value: quickView.assigned, dot: CREW_STATUS_META.assigned.dot, mode: null },
            { label: "Unavailable Today", value: quickView.unavailable, dot: CREW_STATUS_META.unavailable.dot, mode: null },
            { label: "Available This Week", value: quickView.week, dot: "bg-emerald-400", mode: "week" },
            { label: "Total Crew", value: quickView.total, dot: "bg-slate-300", mode: null },
          ].map((tile) => {
            const isActive = tile.mode && viewMode === tile.mode;
            return (
              <button
                key={tile.label}
                type="button"
                onClick={() => setViewMode(isActive ? "all" : (tile.mode || viewMode))}
                className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                  isActive ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200 hover:border-slate-300"
                } ${tile.mode ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tile.dot}`} />
                <div>
                  <p className="text-xl font-bold leading-none text-slate-900">{tile.value}</p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{tile.label}</p>
                </div>
              </button>
            );
          })}
        </section>

        {/* View shortcuts: browse everyone, jump to who's free this week, or see
            helpers alongside the driver they're assigned to. Same underline
            tab style as the truck/crew profile pages (Overview/Deliveries/
            Maintenance) for visual consistency across the app -- explicit
            user request, 2026-09-17. */}
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
          {[
            { mode: "all", label: "All Crew" },
            { mode: "week", label: "Available This Week" },
            { mode: "helper-driver", label: "Helpers & Drivers" },
          ].map((tab) => (
            <button
              key={tab.mode}
              type="button"
              onClick={() => {
                setViewMode(tab.mode);
                setCurrentPage(1);
              }}
              className={`whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-semibold transition ${
                viewMode === tab.mode
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
          {viewMode === "week" && (
            <span className="ml-1 text-xs text-slate-400">{weekLabel}</span>
          )}
        </div>

        {/* Search and Filter Toolbar — search and filters share one row, with
            filters right-aligned. This is the common modern dashboard layout
            (e.g. Linear, Notion tables): the search stays the primary, most
            prominent control while filters sit as a secondary cluster the
            eye reaches after. Wraps to a stacked layout on small screens. */}
        <section className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative w-full lg:flex-1">
              <label className="sr-only" htmlFor="crew-search">
                Search crew records
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="crew-search"
                type="text"
                value={searchTerm}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="Search by name, client, or status..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
              />
            </div>

            {/* Filters — one dropdown per dimension, all styled identically so
                the set reads as one system and scales cleanly if more filters
                (e.g. Shift) are added later. Reset only renders once a filter
                is applied, so the toolbar stays uncluttered at rest. */}
            <div className="flex flex-wrap items-center gap-2 lg:flex-none lg:justify-end">
              <FilterSelect
                id="status-filter"
                label="Status"
                value={selectedStatus}
                onChange={updateStatus}
                options={STATUS_OPTIONS}
                counts={statusCounts}
                allLabel="Status"
              />
              <FilterSelect
                id="position-filter"
                label="Position"
                value={selectedPosition}
                onChange={updatePosition}
                options={POSITION_OPTIONS}
                counts={positionCounts}
                allLabel="Position"
              />
              <FilterSelect
                id="client-filter"
                label="Client"
                value={selectedClient}
                onChange={updateClient}
                options={clientOptions}
                counts={clientCounts}
                allLabel="Client"
              />
            </div>
          </div>
        </section>

        {/* Crew List */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
              {isLoading ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  Loading delivery crew…
                </div>
              ) : loadError ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-red-600">
                  {loadError}
                </div>
              ) : filteredCrew.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  No crew records match your search. Try adjusting your filters.
                </div>
              ) : viewMode === "helper-driver" ? (
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Helper
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Assigned Driver
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Driver Contact
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Status
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 py-3 pl-2 pr-5 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        &nbsp;
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedCrew.map((crew) => (
                      <tr
                        key={crew.id}
                        onClick={() => openProfile(crew)}
                        className="cursor-pointer transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">
                              {getInitials(crew.fullName)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{crew.fullName}</p>
                              <p className="truncate text-[11px] text-slate-400">Helper</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          {crew.assignedDriver ? (
                            <p className="text-sm font-medium text-indigo-700">{crew.assignedDriver.fullName}</p>
                          ) : (
                            <p className="text-sm text-slate-400">Not assigned to a driver</p>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">
                          {crew.assignedDriver ? crew.assignedDriver.contactNumber : ""}
                        </td>
                        <td className="px-5 py-2.5">
                          <StatusBadge status={crew.status} />
                        </td>
                        <td className="py-2.5 pl-2 pr-5 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Crew Member
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Position
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Weekly Performance
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Client Specialty
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Working Days
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Contact
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Status
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 py-3 pl-2 pr-5 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        &nbsp;
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedCrew.map((crew) => (
                      <tr
                        key={crew.id}
                        onClick={() => openProfile(crew)}
                        className="cursor-pointer transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">
                              {getInitials(crew.fullName)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {crew.fullName}
                              </p>
                              {/* Helper team line — which driver this helper is
                                  currently assigned with on an active trip. */}
                              {crew.position === "Helper" && helperDriverByRecordId.get(crew.recordId) && (
                                <p className="truncate text-[11px] text-indigo-600">
                                  with {helperDriverByRecordId.get(crew.recordId).fullName}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          <PositionTag position={crew.position} />
                        </td>
                        <td className="px-5 py-2.5">
                          <PerformanceBadge score={crew.weeklyPerformance} />
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">
                          {crew.clientSpecialties.length > 0
                            ? crew.clientSpecialties.join(", ")
                            : <span className="text-slate-400">None</span>}
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">
                          {formatWorkingDays(crew.workingDays) || ""}
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">{crew.contactNumber}</td>
                        <td className="px-5 py-2.5">
                          <StatusBadge status={crew.status} />
                        </td>
                        <td className="py-2.5 pl-2 pr-5 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            <PaginationBar page={safePage} setPage={setCurrentPage} totalPages={totalPages} />
          </div>
        </div>
      </div>
    </SupLayout>
  );
}

export default SupDeliveryCrew;
