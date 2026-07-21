import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";
import {
  ArrowLeft,
  Route,
  MoreVertical,
  Trash2,
  X,
  Search,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  EyeOff,
  Repeat,
  Activity,
  Clock,
  ListChecks,
  ClipboardList,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Dummy trip history — frontend only, no backend/API/database.
// The crew member being viewed is passed in via navigation state from the
// Delivery Crew list (see SupDeliveryCrew.jsx), so this page doesn't need
// its own copy of the crew roster.
// ---------------------------------------------------------------------------

const CLIENT_SPECIALTIES = [
  "Jollibee", "McDonald's", "Chowking", "KFC", "Mang Inasal", "Greenwich",
  "Shakey's", "Red Ribbon", "Goldilocks", "Max's Restaurant",
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

// Small seeded generator so a given crew member's trips stay the same while
// you're viewing the page, instead of reshuffling on every re-render.
function buildMockTrips(crew) {
  let state = 0;
  for (let i = 0; i < crew.id.length; i += 1) state = (state * 31 + crew.id.charCodeAt(i)) >>> 0;
  if (state <= 0) state = 1;
  const rng = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const now = new Date("2026-07-19T08:00:00");
  const tripCount = 8 + Math.floor(rng() * 5); // 8-12

  return Array.from({ length: tripCount }, (_, i) => {
    const isOngoing = i === 0 && crew.status === "On Delivery";
    const status = isOngoing ? "Ongoing" : pick(TRIP_STATUS_POOL);
    const date = new Date(now.getTime() - i * (18 + rng() * 20) * 60 * 60 * 1000);
    const client = crew.clientSpecialties?.length
      ? pick(crew.clientSpecialties)
      : pick(CLIENT_SPECIALTIES);

    return {
      id: `TRIP-${2100 - i}`,
      dateLabel: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      client,
      route: pick(TRIP_ROUTES),
      status,
    };
  });
}

function getInitials(fullName) {
  const [last = "", rest = ""] = fullName.split(",").map((part) => part.trim());
  const first = rest.split(" ")[0] || "";
  return (`${last.charAt(0)}${first.charAt(0)}`.toUpperCase()) || "?";
}

const STATUS_BADGE_CLASSES = {
  Available: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  "On Delivery": "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  "Off Duty": "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        STATUS_BADGE_CLASSES[status] || STATUS_BADGE_CLASSES["Off Duty"]
      }`}
    >
      {status}
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

const TRIP_STATUS_BADGE_CLASSES = {
  Completed: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
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

// ---------------------------------------------------------------------------
// Performance tab — alert/session analysis, moved in from the old
// SupAnalysisSpecific.jsx page so it renders inline instead of navigating away.
// ---------------------------------------------------------------------------

const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: "Prolonged Eye Closure",
  pattern_eye_closure_yawn: "Eye Closure + Yawn",
  pattern_repeated_eye_closure: "Repeated Eye Closure",
};

const ALERT_TYPE_ICONS = {
  prolonged_eye_closure: EyeOff,
  pattern_eye_closure_yawn: AlertTriangle,
  pattern_repeated_eye_closure: Repeat,
};

// Alert rows carry the human-readable label (see ALERT_TYPE_LABELS), not the
// raw event_type key, so icons are looked up by label rather than key.
const ALERT_TYPE_ICON_BY_LABEL = Object.fromEntries(
  Object.entries(ALERT_TYPE_LABELS).map(([key, label]) => [label, ALERT_TYPE_ICONS[key]]),
);

const HERO_TONE_CLASSES = {
  red: "border-red-200 bg-red-50/50",
  amber: "border-amber-200 bg-amber-50/50",
  emerald: "border-emerald-200 bg-emerald-50/50",
};

// Same High Risk / Moderate / Safe thresholds already used inline for the
// current-trip status card, exposed as a helper so the Trip Log table can
// flag risky trips the same way without duplicating the rule.
function getRiskLevel(alertCount) {
  if (alertCount >= 4) return { tone: "red", label: "High Risk" };
  if (alertCount >= 2) return { tone: "amber", label: "Moderate" };
  return { tone: "emerald", label: "Safe" };
}

const RISK_BADGE_CLASSES = {
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
};

const RISK_ICONS = { red: ShieldAlert, amber: AlertTriangle, emerald: ShieldCheck };

function RiskBadge({ tone, label }) {
  const Icon = RISK_ICONS[tone] || ShieldCheck;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
        RISK_BADGE_CLASSES[tone] || RISK_BADGE_CLASSES.emerald
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function formatAlertDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "--";
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function formatAlertTimestamp(value) {
  if (!value) {
    return "--";
  }
  const raw = String(value);
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!isoMatch) {
    return raw;
  }
  const year = Number(isoMatch[1]);
  const monthIndex = Number(isoMatch[2]) - 1;
  const day = Number(isoMatch[3]);
  const hour24 = Number(isoMatch[4]);
  const minute = isoMatch[5];
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 >= 12 ? "pm" : "am";
  const monthLabels = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthLabel = monthLabels[monthIndex] || "";
  if (!monthLabel || !year) {
    return `${hour12}:${minute} ${suffix}`;
  }
  return `${monthLabel} ${day}, ${hour12}:${minute} ${suffix}`;
}

function PerformancePanel({ title, icon: Icon, children, right }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-blue-600" />}
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
        </div>
        {right ? <div className="text-xs text-slate-500">{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const METRIC_TILE_ICON_CLASSES = {
  slate: "bg-slate-100 text-slate-500",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-600",
};

function MetricTile({ label, value, hint, icon: Icon, tone = "slate" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${METRIC_TILE_ICON_CLASSES[tone]}`}>
          {Icon && <Icon className="h-3.5 w-3.5" />}
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      </div>
      <p className="mt-2.5 text-xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
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
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
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

// Three-dot menu with just two actions: Add opens the add-clients modal,
// Delete switches the list below into delete mode (each row grows a trash
// icon). Kept as plain menu items rather than the list itself, since Add
// and Delete lead to two different interactions (a modal vs. inline
// per-row confirmation).
function SpecialtyMenu({ isOpen, onToggle, onClose, onSelectAdd, onSelectDelete, canDelete }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Manage client specialties"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute right-0 z-20 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button
              type="button"
              onClick={onSelectAdd}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={onSelectDelete}
              disabled={!canDelete}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// One row in the Client Specialties stacked list. In delete mode it shows a
// trash icon; clicking it opens a confirmation modal (rendered by the page)
// rather than deleting immediately.
function SpecialtyListItem({ client, isDeleteMode, onRequestDelete }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-slate-900">{client}</span>
      {isDeleteMode && (
        <button
          type="button"
          onClick={onRequestDelete}
          aria-label={`Delete ${client}`}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const TABS_BASE = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance", driversOnly: true },
  { id: "trips", label: "Trip History" },
];

const TRIP_STATUS_OPTIONS = ["Completed", "Ongoing", "Cancelled"];
const TRIPS_PAGE_SIZE = 6;

function SupCrewProfile() {
  const location = useLocation();
  const crew = location.state?.crew;

  const [activeTab, setActiveTab] = useState("overview");
  const [clientSpecialties, setClientSpecialties] = useState(crew?.clientSpecialties || []);
  const [availableClients, setAvailableClients] = useState([]);
  const [isSpecialtyMenuOpen, setIsSpecialtyMenuOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [clientsToAdd, setClientsToAdd] = useState([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [clientPendingDelete, setClientPendingDelete] = useState(null);
  const [isSpecialtyBusy, setIsSpecialtyBusy] = useState(false);
  const [specialtyError, setSpecialtyError] = useState("");
  const [tripStatusFilter, setTripStatusFilter] = useState("All");
  const [tripSearchTerm, setTripSearchTerm] = useState("");
  const [tripPage, setTripPage] = useState(1);
  const [alerts, setAlerts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isPerformanceLoading, setIsPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState("");

  // clients + crew_client_specialties (see DATABASE.md) — fetched via the
  // admin-users Edge Function since the client can't read those tables
  // directly (same access model as list-crew).
  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list-clients" },
      });

      if (isMounted && !error) {
        setAvailableClients(data.clients || []);
      }
    }

    loadClients();
    return () => {
      isMounted = false;
    };
  }, []);

  // This crew member's already-assigned clients — fetched fresh rather than
  // trusting crew.clientSpecialties from navigation state, which SupDeliveryCrew.jsx
  // always passes as [] (see its mapCrewRow comment).
  useEffect(() => {
    let isMounted = true;

    async function loadCrewClients() {
      if (!crew) {
        return;
      }

      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list-crew-clients", authId: crew.id },
      });

      if (isMounted && !error) {
        setClientSpecialties((data.clients || []).map((client) => client.name));
      }
    }

    loadCrewClients();
    return () => {
      isMounted = false;
    };
  }, [crew]);

  const clientFallbackNames = useMemo(
    () => availableClients.map((client) => client.name),
    [availableClients],
  );
  const trips = useMemo(
    () => (crew ? buildMockTrips(crew, clientFallbackNames) : []),
    [crew, clientFallbackNames],
  );

  useEffect(() => {
    let isMounted = true;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    async function loadPerformance() {
      setIsPerformanceLoading(true);
      setPerformanceError("");

      const [alertsRes, sessionsRes] = await Promise.all([
        supabase
          .from("alerts")
          .select("id, created_at, event_type, duration, session_id")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
        supabase
          .from("sessions")
          .select("session_id, created_at, start_time, end_time, total_alerts, session_duration")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      if (alertsRes.error || sessionsRes.error) {
        setPerformanceError(
          alertsRes.error?.message || sessionsRes.error?.message || "Unable to load data.",
        );
        setAlerts([]);
        setSessions([]);
      } else {
        setAlerts(alertsRes.data || []);
        setSessions(sessionsRes.data || []);
      }

      setIsPerformanceLoading(false);
    }

    loadPerformance();
    return () => {
      isMounted = false;
    };
  }, []);

  const {
    performanceKpis,
    alertTypes,
    recentSessions,
    latestAlerts,
    hourly,
    maxAlerts,
  } = useMemo(() => {
    const totalAlerts = alerts.length;
    const sessionCount = sessions.length;
    const totalSessionAlerts = sessions.reduce((sum, session) => sum + (session.total_alerts || 0), 0);
    const avgAlertsPerTrip = sessionCount ? (totalSessionAlerts / sessionCount).toFixed(1) : "0.0";
    const latestSession = sessions[0];
    const hasOngoingTrip = latestSession && !latestSession.end_time;
    const tripStatusLabel = hasOngoingTrip ? "Ongoing Trip" : "Last Completed Trip";
    const latestSessionId = latestSession?.session_id;
    const latestSessionAlerts = latestSessionId
      ? alerts.filter((item) => item.session_id === latestSessionId)
      : [];
    const latestDetection = latestSessionAlerts[0]?.event_type;
    const detectedLabels = Array.from(
      new Set(
        latestSessionAlerts
          .map((item) => item.event_type)
          .filter(Boolean)
          .map((eventType) => ALERT_TYPE_LABELS[eventType] || eventType),
      ),
    );
    const tripAlertCount = hasOngoingTrip ? latestSessionAlerts.length : latestSession?.total_alerts ?? 0;
    let tripStatusValue = "--";
    let tripStatusTone = "";
    let tripStatusBadge = "";
    let tripStatusBadgeClass = "";
    if (latestSession) {
      const startLabel = latestSession.start_time ? formatAlertTimestamp(latestSession.start_time) : "--";
      const endLabel = latestSession.end_time ? formatAlertTimestamp(latestSession.end_time) : "--";
      if (tripAlertCount >= 4) {
        tripStatusTone = "red";
        tripStatusBadge = "High Risk";
        tripStatusBadgeClass = "text-red-700";
      } else if (tripAlertCount >= 2) {
        tripStatusTone = "amber";
        tripStatusBadge = "Moderate";
        tripStatusBadgeClass = "text-amber-700";
      } else {
        tripStatusTone = "emerald";
        tripStatusBadge = "Safe";
        tripStatusBadgeClass = "text-emerald-700";
      }
      const detectionLabel = latestDetection ? ALERT_TYPE_LABELS[latestDetection] || latestDetection : "--";
      const detectedList = detectedLabels.length ? (
        <ul className="list-disc pl-4 text-sm text-slate-700">
          {detectedLabels.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-slate-700">--</span>
      );
      const details = hasOngoingTrip
        ? [
            { label: "Started", value: startLabel },
            { label: "Current alerts", value: tripAlertCount },
            { label: "Current detection", value: detectionLabel },
            { label: "Alerts Detected", value: detectedList },
          ]
        : [
            { label: "Start", value: startLabel },
            { label: "End", value: endLabel },
            { label: "Total alerts", value: tripAlertCount },
            { label: "Last Detection", value: detectionLabel },
            { label: "Alerts Detected", value: detectedList },
          ];
      tripStatusValue = (
        <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
          {details.map((item) => (
            <div key={item.label} className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <p className="text-sm text-slate-700">{item.value}</p>
            </div>
          ))}
        </div>
      );
    }

    const alertsByType = {};
    const hourlyCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, alerts: 0 }));
    alerts.forEach((item) => {
      const hour = new Date(item.created_at).getHours();
      hourlyCounts[hour].alerts += 1;
      if (item.event_type) {
        alertsByType[item.event_type] = (alertsByType[item.event_type] || 0) + 1;
      }
    });

    const typesRows = Object.keys(ALERT_TYPE_LABELS).map((key) => {
      const count = alertsByType[key] || 0;
      const percent = totalAlerts ? Math.round((count / totalAlerts) * 100) : 0;
      return { type: ALERT_TYPE_LABELS[key], count, share: `${percent}%`, percent };
    });

    const recentRows = sessions.slice(0, 6).map((session) => ({
      sessionId: session.session_id,
      alerts: session.total_alerts ?? 0,
      duration: session.session_duration,
      start: session.start_time,
      end: session.end_time,
    }));

    const latestRows = alerts.map((item) => ({
      id: item.id,
      type: ALERT_TYPE_LABELS[item.event_type] || item.event_type || "Unknown",
      duration: item.duration,
      createdAt: item.created_at,
      sessionId: item.session_id,
    }));

    const hourlyRows = hourlyCounts.map((entry) => ({
      hour: `${String(entry.hour).padStart(2, "0")}:00`,
      alerts: entry.alerts,
    }));
    const peakHourRow = hourlyRows.reduce(
      (peak, row) => (row.alerts > peak.alerts ? row : peak),
      { hour: "--", alerts: 0 },
    );

    return {
      performanceKpis: [
        {
          label: tripStatusLabel,
          value: tripStatusValue,
          tone: tripStatusTone,
          className: "sm:col-span-2",
          statusLabel: tripStatusBadge,
          statusClassName: tripStatusBadgeClass,
        },
        { label: "Total alerts (7d)", value: String(totalAlerts), hint: "Using current data only" },
        { label: "Avg alerts / trip", value: avgAlertsPerTrip, hint: "From trip totals" },
        { label: "Peak drowsiness time", value: peakHourRow.hour, hint: "" },
        { label: "Total Trips", value: String(sessionCount), hint: "Captured tracking Trips" },
      ],
      alertTypes: typesRows,
      recentSessions: recentRows,
      latestAlerts: latestRows,
      hourly: hourlyRows,
      maxAlerts: Math.max(...hourlyRows.map((row) => row.alerts), 0),
    };
  }, [alerts, sessions]);

  // Fixed order from the performanceKpis array built above: current/last
  // trip status first, then the four 7-day summary numbers.
  const [heroKpi, totalAlertsKpi, avgAlertsKpi, peakHourKpi, totalTripsKpi] = performanceKpis;

  // Display-only ordering (most frequent alert type first) and peak-hour
  // lookup for the heatmap strip — derived from data the KPI memo above
  // already produced, without altering any of its counts or thresholds.
  const sortedAlertTypes = [...alertTypes].sort((a, b) => b.count - a.count);
  const peakHour = hourly.reduce(
    (peak, row) => (row.alerts > peak.alerts ? row : peak),
    { hour: "--", alerts: 0 },
  );

  // Weekly performance — how many of this driver's last-7-days trips fell
  // into each risk tier (same getRiskLevel thresholds as the per-trip
  // badges), so a supervisor can judge the week as a whole, not just the
  // single latest/ongoing trip. Overall tone is the worst tier present:
  // one High Risk trip should still flag the week, even if most were Safe.
  const weeklyRiskCounts = sessions.reduce(
    (counts, session) => {
      const tier = getRiskLevel(session.total_alerts || 0).label;
      counts[tier] += 1;
      return counts;
    },
    { Safe: 0, Moderate: 0, "High Risk": 0 },
  );
  const weeklyRisk =
    weeklyRiskCounts["High Risk"] > 0
      ? { tone: "red", label: "High Risk" }
      : weeklyRiskCounts.Moderate > 0
      ? { tone: "amber", label: "Moderate" }
      : { tone: "emerald", label: "Safe" };

  const availableClientsToAdd = availableClients
    .map((client) => client.name)
    .filter((name) => !clientSpecialties.includes(name));

  const openAddModal = () => {
    setClientsToAdd([]);
    setSpecialtyError("");
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setClientsToAdd([]);
  };

  const selectClientToAdd = (client) => {
    if (!client) return;
    setClientsToAdd((prev) => (prev.includes(client) ? prev : [...prev, client]));
  };

  const unselectClientToAdd = (client) => {
    setClientsToAdd((prev) => prev.filter((entry) => entry !== client));
  };

  const saveAddModal = async () => {
    if (!crew || clientsToAdd.length === 0 || isSpecialtyBusy) {
      return;
    }

    setIsSpecialtyBusy(true);
    setSpecialtyError("");

    const results = await Promise.all(
      clientsToAdd.map((name) => {
        const client = availableClients.find((entry) => entry.name === name);
        if (!client) {
          return { error: { message: `Unknown client: ${name}` } };
        }
        return supabase.functions.invoke("admin-users", {
          body: { action: "add-crew-client", authId: crew.id, clientId: client.id },
        });
      }),
    );

    setIsSpecialtyBusy(false);

    const failed = results.find((result) => result.error);
    if (failed) {
      setSpecialtyError(failed.error.message || "Unable to save client specialties.");
      return;
    }

    setClientSpecialties((prev) => [...prev, ...clientsToAdd]);
    closeAddModal();
  };

  const startDeleteMode = () => {
    setClientPendingDelete(null);
    setIsDeleteMode(true);
  };

  const exitDeleteMode = () => {
    setIsDeleteMode(false);
    setClientPendingDelete(null);
  };

  const confirmDeleteClient = async (client) => {
    const clientRow = availableClients.find((entry) => entry.name === client);
    if (!crew || !clientRow) {
      setClientPendingDelete(null);
      return;
    }

    setIsSpecialtyBusy(true);
    setSpecialtyError("");

    const { error } = await supabase.functions.invoke("admin-users", {
      body: { action: "remove-crew-client", authId: crew.id, clientId: clientRow.id },
    });

    setIsSpecialtyBusy(false);
    setClientPendingDelete(null);

    if (error) {
      setSpecialtyError(error.message || "Unable to remove client specialty.");
      return;
    }

    setClientSpecialties((prev) => prev.filter((entry) => entry !== client));
  };

  const filteredTrips = trips.filter((trip) => {
    const matchesStatus = tripStatusFilter === "All" || trip.status === tripStatusFilter;
    const query = tripSearchTerm.trim().toLowerCase();
    const matchesSearch =
      !query || [trip.id, trip.client, trip.route, trip.dateLabel].join(" ").toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });

  const tripStatusCounts = {
    All: trips.length,
    Completed: trips.filter((trip) => trip.status === "Completed").length,
    Ongoing: trips.filter((trip) => trip.status === "Ongoing").length,
    Cancelled: trips.filter((trip) => trip.status === "Cancelled").length,
  };

  // Same list-pagination pattern used on the Trucks and Delivery Crew lists
  // (fixed page size, clamp current page, slice for the visible rows).
  const totalTripPages = Math.max(1, Math.ceil(filteredTrips.length / TRIPS_PAGE_SIZE));
  const safeTripPage = Math.min(tripPage, totalTripPages);
  const tripPageStart = (safeTripPage - 1) * TRIPS_PAGE_SIZE;
  const pagedTrips = filteredTrips.slice(tripPageStart, tripPageStart + TRIPS_PAGE_SIZE);

  const updateTripSearch = (value) => {
    setTripSearchTerm(value);
    setTripPage(1);
  };

  const updateTripStatusFilter = (value) => {
    setTripStatusFilter(value);
    setTripPage(1);
  };

  if (!crew) {
    return (
      <SupLayout title="Crew Profile" background={null} bg="bg-white">
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-lg font-semibold text-slate-900">No crew member selected</p>
          <p className="max-w-sm text-sm text-slate-500">
            Open a profile by selecting a crew member from the Delivery Crew list.
          </p>
          <Link
            to="/supervisor/delivery-crew"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Delivery Crew
          </Link>
        </div>
      </SupLayout>
    );
  }

  const isDriver = crew.position === "Driver";
  const tabs = TABS_BASE.filter((tab) => !tab.driversOnly || isDriver);

  return (
    <SupLayout title="Crew Profile" background={null} bg="bg-white">
      <div className="flex flex-col gap-4 pb-6">
        {/* Sticky within the scroll area, pulled up to sit close to the page
            edge rather than trailing SupLayout's generous top padding. */}
        <div className="sticky top-0 z-30 -mt-2 w-full border-b border-slate-200 bg-white py-1.5 shadow-sm sm:-mt-4">
          <Link
            to="/supervisor/delivery-crew"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>

        {/* Profile header — compact identity strip: avatar, name/status on
            the primary line, employee ID/shift as a secondary line, and
            position as the trailing detail. */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                {getInitials(crew.fullName)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
                    {crew.fullName}
                  </h1>
                  <StatusBadge status={crew.status} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {crew.employeeId} · {crew.shift}
                </p>
              </div>
            </div>
            <PositionTag position={crew.position} />
          </div>
        </section>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {tabs.map((tab) => (
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
          <SectionCard title="Personal Information">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <InfoRow label="Full Name" value={crew.fullName} />
                <InfoRow label="Position" value={crew.position} />
                <InfoRow label="Contact Number" value={crew.contactNumber} />
                <InfoRow label="Personal Email" value={crew.personalEmail || "N/A"} />
                <InfoRow label="Work Email" value={crew.workEmail || "N/A"} />
                <InfoRow label="Birthday" value={crew.birthday || "N/A"} />
                <InfoRow label="Age" value={crew.age ?? "N/A"} />
                <InfoRow label="Employment Start Date" value={crew.dateJoined} />
              </div>

              <div className="lg:border-l lg:border-slate-100 lg:pl-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Client Specialties
                  </h3>
                  {isDeleteMode ? (
                    <button
                      type="button"
                      onClick={exitDeleteMode}
                      className="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                    >
                      Done
                    </button>
                  ) : (
                    <SpecialtyMenu
                      isOpen={isSpecialtyMenuOpen}
                      onToggle={() => setIsSpecialtyMenuOpen((prev) => !prev)}
                      onClose={() => setIsSpecialtyMenuOpen(false)}
                      onSelectAdd={() => {
                        setIsSpecialtyMenuOpen(false);
                        openAddModal();
                      }}
                      onSelectDelete={() => {
                        setIsSpecialtyMenuOpen(false);
                        startDeleteMode();
                      }}
                      canDelete={clientSpecialties.length > 0}
                    />
                  )}
                </div>

                <div className="mt-1 divide-y divide-slate-100">
                  {clientSpecialties.length === 0 ? (
                    <p className="py-2.5 text-sm text-slate-500">No clients assigned yet.</p>
                  ) : (
                    clientSpecialties.map((client) => (
                      <SpecialtyListItem
                        key={client}
                        client={client}
                        isDeleteMode={isDeleteMode}
                        onRequestDelete={() => setClientPendingDelete(client)}
                      />
                    ))
                  )}
                </div>

                {specialtyError ? (
                  <p className="mt-3 text-xs text-red-600">{specialtyError}</p>
                ) : null}
              </div>
            </div>
          </SectionCard>
        )}

        {/* Performance tab — alert/session analysis for this driver */}
        {activeTab === "performance" && (
          <div className="flex flex-col gap-4">
            {performanceError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {performanceError}
              </div>
            ) : null}

            {/* Hero row — the two facts a supervisor needs first: is the
                current/most recent trip safe, and how has this driver
                trended across the whole week. Side by side so "right now"
                and "this week" can be scanned in one glance rather than
                the week's context being buried below. */}
            <div className="grid gap-4 lg:grid-cols-2">
              <section
                className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
                  HERO_TONE_CLASSES[heroKpi.tone] || "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {heroKpi.label}
                  </span>
                  {!isPerformanceLoading && heroKpi.statusLabel ? (
                    <RiskBadge tone={heroKpi.tone} label={heroKpi.statusLabel} />
                  ) : null}
                </div>
                <div className="mt-4">
                  {isPerformanceLoading ? (
                    <p className="text-sm text-slate-500">Loading trip status…</p>
                  ) : typeof heroKpi.value === "string" ? (
                    <p className="text-sm text-slate-500">No trip data in the last 7 days.</p>
                  ) : (
                    heroKpi.value
                  )}
                </div>
              </section>

              <section
                className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
                  HERO_TONE_CLASSES[weeklyRisk.tone] || "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    This Week (7 Days)
                  </span>
                  {!isPerformanceLoading && sessions.length > 0 ? (
                    <RiskBadge tone={weeklyRisk.tone} label={weeklyRisk.label} />
                  ) : null}
                </div>
                <div className="mt-4">
                  {isPerformanceLoading ? (
                    <p className="text-sm text-slate-500">Loading weekly summary…</p>
                  ) : sessions.length === 0 ? (
                    <p className="text-sm text-slate-500">No trips recorded in the last 7 days.</p>
                  ) : (
                    <>
                      <div
                        className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-slate-100"
                        role="img"
                        aria-label={`${weeklyRiskCounts.Safe} safe, ${weeklyRiskCounts.Moderate} moderate, and ${weeklyRiskCounts["High Risk"]} high risk trips this week`}
                      >
                        {weeklyRiskCounts.Safe > 0 && (
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{ width: `${(weeklyRiskCounts.Safe / sessions.length) * 100}%` }}
                          />
                        )}
                        {weeklyRiskCounts.Moderate > 0 && (
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${(weeklyRiskCounts.Moderate / sessions.length) * 100}%` }}
                          />
                        )}
                        {weeklyRiskCounts["High Risk"] > 0 && (
                          <div
                            className="h-full rounded-full bg-red-400"
                            style={{ width: `${(weeklyRiskCounts["High Risk"] / sessions.length) * 100}%` }}
                          />
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-base font-bold text-emerald-700">{weeklyRiskCounts.Safe}</p>
                          <p className="text-xs text-slate-500">Safe</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-amber-700">{weeklyRiskCounts.Moderate}</p>
                          <p className="text-xs text-slate-500">Moderate</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-red-700">{weeklyRiskCounts["High Risk"]}</p>
                          <p className="text-xs text-slate-500">High Risk</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>

            {/* 7-day summary */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricTile
                label={totalAlertsKpi.label}
                icon={AlertTriangle}
                tone="amber"
                value={isPerformanceLoading ? "…" : totalAlertsKpi.value}
                hint={totalAlertsKpi.hint}
              />
              <MetricTile
                label={avgAlertsKpi.label}
                icon={Activity}
                tone="blue"
                value={isPerformanceLoading ? "…" : avgAlertsKpi.value}
                hint={avgAlertsKpi.hint}
              />
              <MetricTile
                label={peakHourKpi.label}
                icon={Clock}
                tone="blue"
                value={isPerformanceLoading ? "…" : peakHourKpi.value}
                hint={peakHourKpi.hint}
              />
              <MetricTile
                label={totalTripsKpi.label}
                icon={Route}
                tone="slate"
                value={isPerformanceLoading ? "…" : totalTripsKpi.value}
                hint={totalTripsKpi.hint}
              />
            </section>

            {/* Alert pattern analysis */}
            <div className="grid gap-4 lg:grid-cols-2">
              <PerformancePanel title="Alert Type Breakdown" icon={ListChecks}>
                <p className="text-xs text-slate-500">
                  Most frequent —{" "}
                  <span className="font-semibold text-slate-700">
                    {isPerformanceLoading
                      ? "…"
                      : sortedAlertTypes[0]?.count
                      ? sortedAlertTypes[0].type
                      : "No alerts"}
                  </span>
                </p>
                <div className="mt-3 space-y-3">
                  {sortedAlertTypes.map((row) => {
                    const TypeIcon = ALERT_TYPE_ICON_BY_LABEL[row.type] || Activity;
                    return (
                      <div key={row.type} className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                            <TypeIcon className="h-3.5 w-3.5 text-slate-400" />
                            {row.type}
                          </span>
                          <span>{isPerformanceLoading ? "…" : `${row.count} · ${row.share}`}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${row.percent}%` }}
                            aria-label={`${row.type} ${row.share}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PerformancePanel>

              <PerformancePanel
                title="24-Hour Alert Pattern"
                icon={Clock}
                right={!isPerformanceLoading && peakHour.alerts > 0 ? `Peak: ${peakHour.hour}` : null}
              >
                {isPerformanceLoading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : maxAlerts === 0 ? (
                  <p className="text-sm text-slate-500">No alerts recorded in the last 7 days.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex min-w-[480px] items-end gap-1.5">
                      {hourly.map((row, idx) => {
                        const isPeak = row.hour === peakHour.hour && row.alerts > 0;
                        const heightPct = row.alerts > 0 ? Math.max((row.alerts / maxAlerts) * 100, 12) : 0;
                        const showLabel = isPeak || idx % 3 === 0;
                        return (
                          <div
                            key={row.hour}
                            className="flex flex-1 flex-col items-center gap-1"
                            title={`${row.hour} — ${row.alerts} alert${row.alerts === 1 ? "" : "s"}`}
                          >
                            <div className="flex h-16 w-full items-end rounded-md bg-slate-100">
                              <div
                                className={`w-full rounded-md transition ${isPeak ? "bg-blue-600" : "bg-blue-400"}`}
                                style={{ height: `${heightPct}%` }}
                                aria-label={`${row.hour} ${row.alerts} alerts`}
                              />
                            </div>
                            <span
                              className={`text-[10px] ${
                                isPeak ? "font-semibold text-blue-700" : "text-slate-400"
                              }`}
                            >
                              {showLabel ? row.hour.slice(0, 2) : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </PerformancePanel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PerformancePanel
                title="Recent Alerts"
                icon={AlertTriangle}
                right={!isPerformanceLoading ? `${latestAlerts.length} in 7 days` : null}
              >
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {(isPerformanceLoading ? [] : latestAlerts).map((alert) => {
                    const TypeIcon = ALERT_TYPE_ICON_BY_LABEL[alert.type] || Activity;
                    const displayDuration = formatAlertDuration(alert.duration);
                    const hasDuration = displayDuration !== "--" && displayDuration !== "0m";
                    return (
                      <div
                        key={alert.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-inset ring-slate-200">
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{alert.type}</p>
                          <p className="truncate text-xs text-slate-500">{formatAlertTimestamp(alert.createdAt)}</p>
                        </div>
                        {hasDuration ? (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            {displayDuration}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  {!isPerformanceLoading && latestAlerts.length === 0 ? (
                    <p className="text-sm text-slate-500">No alerts found in the last 7 days.</p>
                  ) : null}
                </div>
              </PerformancePanel>

              <PerformancePanel title="Trip Log" icon={ClipboardList} right="Last 7 days">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Start</th>
                        <th className="px-4 py-3 font-semibold">End</th>
                        <th className="px-4 py-3 font-semibold">Duration</th>
                        <th className="px-4 py-3 font-semibold">Alerts</th>
                        <th className="px-4 py-3 font-semibold">Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(isPerformanceLoading ? [] : recentSessions).map((session) => {
                        const risk = getRiskLevel(session.alerts);
                        return (
                          <tr key={session.sessionId} className="bg-white transition hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-700">{formatAlertTimestamp(session.start)}</td>
                            <td className="px-4 py-3 text-slate-700">{formatAlertTimestamp(session.end)}</td>
                            <td className="px-4 py-3 text-slate-700">{formatAlertDuration(session.duration)}</td>
                            <td className="px-4 py-3 text-slate-700">{session.alerts}</td>
                            <td className="px-4 py-3">
                              <RiskBadge tone={risk.tone} label={risk.label} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!isPerformanceLoading && recentSessions.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No sessions found in the last 7 days.</p>
                ) : null}
              </PerformancePanel>
            </div>
          </div>
        )}

        {isAddModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-specialty-title"
            onClick={closeAddModal}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="add-specialty-title" className="text-base font-semibold text-slate-900">
                Add Client Specialties
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Pick clients one at a time to assign to this crew member.
              </p>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700" htmlFor="client-to-add">
                  Client
                </label>
                <select
                  id="client-to-add"
                  value=""
                  onChange={(event) => selectClientToAdd(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a client…</option>
                  {availableClientsToAdd
                    .filter((client) => !clientsToAdd.includes(client))
                    .map((client) => (
                      <option key={client} value={client}>
                        {client}
                      </option>
                    ))}
                </select>

                <p className="mt-4 text-sm font-medium text-slate-700">
                  Selected{clientsToAdd.length > 0 ? ` (${clientsToAdd.length})` : ""}:
                </p>
                {/* Fixed height (~5 rows) so the modal doesn't grow with every
                    pick — beyond 5 selections the list scrolls in place. */}
                <div className="mt-1.5 h-[190px] overflow-y-auto rounded-xl border border-slate-200">
                  {clientsToAdd.length === 0 ? (
                    <div className="flex h-full items-center justify-center px-3">
                      <p className="text-sm text-slate-400">No clients picked yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {clientsToAdd.map((client) => (
                        <div key={client} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm text-slate-900">{client}</span>
                          <button
                            type="button"
                            onClick={() => unselectClientToAdd(client)}
                            aria-label={`Remove ${client} from selection`}
                            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAddModal}
                  disabled={clientsToAdd.length === 0 || isSpecialtyBusy}
                  className="rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isSpecialtyBusy ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {clientPendingDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-specialty-title"
            onClick={() => setClientPendingDelete(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="delete-specialty-title" className="text-base font-semibold text-slate-900">
                Delete client specialty
              </h3>
              <p className="mt-1.5 text-sm text-slate-500">
                Are you sure you want to delete <span className="font-medium text-slate-700">{clientPendingDelete}</span> from
                this crew member?
              </p>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClientPendingDelete(null)}
                  className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeleteClient(clientPendingDelete)}
                  disabled={isSpecialtyBusy}
                  className="rounded-xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  {isSpecialtyBusy ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trip History tab — a search + status dropdown toolbar (same
            pattern as the fleet Trucks list) replaces the old row of
            per-status filter pills, so reviewing history doesn't feel like
            switching between separate tabs — everything narrows in place
            within one always-visible table. */}
        {activeTab === "trips" && (
          <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <label className="sr-only" htmlFor="trip-search">
                    Search trip history
                  </label>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="trip-search"
                    type="text"
                    value={tripSearchTerm}
                    onChange={(event) => updateTripSearch(event.target.value)}
                    placeholder="Search by client, route, or trip ID..."
                    className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <label className="sr-only" htmlFor="trip-status-filter">
                  Status
                </label>
                <select
                  id="trip-status-filter"
                  value={tripStatusFilter}
                  onChange={(event) => updateTripStatusFilter(event.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-52"
                >
                  <option value="All">All Statuses ({tripStatusCounts.All})</option>
                  {TRIP_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status} ({tripStatusCounts[status]})
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-5 py-3 font-semibold">Trip</th>
                      <th className="px-5 py-3 font-semibold">Client</th>
                      <th className="px-5 py-3 font-semibold">Route</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedTrips.map((trip) => (
                      <tr key={trip.id} className="transition hover:bg-slate-50">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-900">{trip.id}</p>
                          <p className="text-xs text-slate-500">{trip.dateLabel}</p>
                        </td>
                        <td className="px-5 py-3.5 text-slate-700">{trip.client}</td>
                        <td className="px-5 py-3.5 text-slate-700">
                          <span className="inline-flex items-center gap-1.5">
                            <Route className="h-3.5 w-3.5 text-slate-400" />
                            {trip.route}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <TripStatusBadge status={trip.status} />
                        </td>
                      </tr>
                    ))}

                    {filteredTrips.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                          No trips match your search or filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {filteredTrips.length > 0 && (
                <nav
                  className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:px-5"
                  aria-label="Trip history pagination"
                >
                  <p className="text-[11px] font-medium text-slate-500 sm:text-xs">
                    Showing {tripPageStart + 1}–{Math.min(tripPageStart + TRIPS_PAGE_SIZE, filteredTrips.length)} of{" "}
                    {filteredTrips.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeTripPage === 1}
                      onClick={() => setTripPage((page) => Math.max(1, page - 1))}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-[11px] font-medium text-slate-500 sm:text-xs">
                      Page {safeTripPage} of {totalTripPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeTripPage === totalTripPages}
                      onClick={() => setTripPage((page) => Math.min(totalTripPages, page + 1))}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </nav>
              )}
            </section>
          </div>
        )}
      </div>
    </SupLayout>
  );
}

export default SupCrewProfile;
