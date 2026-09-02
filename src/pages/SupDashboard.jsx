import SupLayout from "../layout/SupLayout.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, LocateFixed, Loader2, MapPin, Maximize2, Minimize2 } from "lucide-react";
import { GoogleMap, Marker as GoogleMapMarker, useJsApiLoader } from "@react-google-maps/api";
import DateRangeFilter from "../components/DateRangeFilter.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import { MANILA_TIMEZONE } from "../lib/manilaTime.js";
import { getPmsStatus } from "../components/trucks/utils/pms.js";

const background = null;

// Small, deliberately limited tone palette — blue is the Supervisor brand
// accent; emerald/amber/red are reserved for status/severity meaning only.
const TONE = {
  emerald: { text: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500", bar: "bg-emerald-400", borderL: "border-l-emerald-400" },
  sky: { text: "text-sky-700", bg: "bg-sky-50", dot: "bg-sky-500", bar: "bg-sky-400", borderL: "border-l-sky-400" },
  amber: { text: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500", bar: "bg-amber-400", borderL: "border-l-amber-400" },
  red: { text: "text-red-700", bg: "bg-red-50", dot: "bg-red-500", bar: "bg-red-400", borderL: "border-l-red-400" },
  blue: { text: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500", bar: "bg-blue-400", borderL: "border-l-blue-400" },
  slate: { text: "text-slate-600", bg: "bg-slate-100", dot: "bg-slate-400", bar: "bg-slate-300", borderL: "border-l-slate-300" },
};

function Badge({ tone = "slate", children }) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${t.bg} ${t.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

function Avatar({ name }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
      {initials}
    </span>
  );
}

// Compact panel wrapper. `muted` de-emphasizes secondary/bottom-tier content.
function Panel({ title, action, children, className = "", muted = false }) {
  return (
    <div
      className={`flex h-full flex-col rounded-lg border p-3 ${
        muted ? "border-slate-200 bg-slate-50/60" : "border-blue-100 bg-white shadow-sm"
      } ${className}`}
    >
      <div className="mb-2 flex items-center justify-between border-b border-slate-200/70 pb-1.5">
        <h3
          className={`text-[11px] font-bold uppercase tracking-wider ${
            muted ? "text-slate-400" : "text-slate-600"
          }`}
        >
          {title}
        </h3>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function SectionHeader({ children, right, muted = false }) {
  return (
    <div className="flex items-center justify-between">
      <h2
        className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
          muted ? "text-slate-400" : "text-blue-700"
        }`}
      >
        {!muted && <span className="h-3 w-1 rounded-full bg-blue-600" />}
        {children}
      </h2>
      {right}
    </div>
  );
}

function ViewAllLink({ to }) {
  return (
    <Link
      to={to}
      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
    >
      View all →
    </Link>
  );
}

// ----- KPI strip: the whole "what needs attention" summary, each tile links
// straight to the page where it's resolved so there's no separate task list
// duplicating the same numbers. -----
function StatTile({ label, value, to, tone, state }) {
  return (
    <Link
      to={to}
      state={state}
      className={`flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-blue-200 hover:bg-blue-50/40 ${
        tone ? `border-l-4 ${TONE[tone].borderL}` : ""
      }`}
    >
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-0.5 text-xl font-bold leading-tight text-slate-900">
        {value}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Phase 8 — Realtime Dashboard constants/helpers (08_REALTIME_DASHBOARD.md).
// ---------------------------------------------------------------------------

// PROJECT_CONSTRAINTS.md
const DEVICE_OFFLINE_TIMEOUT_MS = 30_000;
// 08_REALTIME_DASHBOARD.md's "Deferred here from 03B..." section — not yet
// tuned against real drift data.
const PAUSED_MOVE_THRESHOLD_M = 100;

// A delivery whose milestone status is past ASSIGNED but not yet DELIVERED —
// the window in which a Trip (Session) can be Active or Paused.
const IN_PROGRESS_STATUSES = ["OUT_FOR_PICKUP", "ARRIVED_PICKUP", "OUT_FOR_DROPOFF", "ARRIVED_DROPOFF"];

const MILESTONE_TONE = {
  OUT_FOR_PICKUP: { label: "Out for Pickup", tone: "sky" },
  ARRIVED_PICKUP: { label: "Arrived Pickup", tone: "sky" },
  OUT_FOR_DROPOFF: { label: "Out for Dropoff", tone: "blue" },
  ARRIVED_DROPOFF: { label: "Arrived Dropoff", tone: "blue" },
};

const TRIP_STATE_TONE = { Active: "emerald", Paused: "amber" };

const DEVICE_STATE_TONE = {
  Online: "emerald",
  Offline: "red",
  "Waiting for Device": "sky",
  "Monitoring Unavailable": "amber",
};

// 06_DROWSINESS_ALERT_PIPELINE.md's four event types. No `severity` column
// exists anywhere in the schema (DATABASE.md's `alerts` entry) — this is a
// UI-only judgment call, consistent with face_not_detected already being
// treated as the least urgent of the four elsewhere (DriverDeliveries.jsx
// skips its audio clip for the same reason).
const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: "Prolonged Eye Closure",
  pattern_eye_closure_yawn: "Eye Closure + Yawn",
  pattern_repeated_eye_closure: "Repeated Eye Closure",
  face_not_detected: "Eyes Not Detected",
};
const ALERT_SEVERITY = {
  prolonged_eye_closure: "High",
  pattern_repeated_eye_closure: "High",
  pattern_eye_closure_yawn: "Medium",
  face_not_detected: "Low",
};
const SEVERITY_RANK = { High: 3, Medium: 2, Low: 1 };

const GOOGLE_MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
// Metro Manila fallback center, used only until at least one truck reports a
// live position.
const FLEET_MAP_DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

// Haversine distance in meters — mirrors `driver-trip`'s `distanceKm` (same
// formula, kept in km there for mileage) since Edge Functions and the
// frontend don't share modules in this repo.
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatAgo(isoString, now) {
  if (!isoString) return "Never";
  const diffMs = now - new Date(isoString).getTime();
  if (diffMs < 0) return "Just now";
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// Resolves a delivery's Device state (Online/Offline/Waiting for
// Device/Monitoring Unavailable) and Trip state (Active/Paused) per
// 08_REALTIME_DASHBOARD.md's "Monitoring Status"/"Important Rules" sections.
function resolveOpsState({ openSession, closedSessions, device, now }) {
  const hasEverHadSession = openSession || closedSessions.length > 0;
  if (!hasEverHadSession) return null;

  if (openSession) {
    const hasHeartbeatForSession =
      device?.last_ping && new Date(device.last_ping).getTime() >= new Date(openSession.start_time).getTime();
    let deviceState;
    if (!hasHeartbeatForSession) {
      const sinceStart = now - new Date(openSession.start_time).getTime();
      deviceState = sinceStart > DEVICE_OFFLINE_TIMEOUT_MS ? "Monitoring Unavailable" : "Waiting for Device";
    } else {
      const sincePing = now - new Date(device.last_ping).getTime();
      deviceState = sincePing <= DEVICE_OFFLINE_TIMEOUT_MS ? "Online" : "Offline";
    }
    return { tripState: "Active", deviceState, pauseStartedAt: null };
  }

  // Paused: past ASSIGNED, no open Active session, but at least one Session
  // has existed for this delivery (hasOpenSession's false branch, same
  // computation as get-driver-deliveries/get-helper-deliveries).
  let deviceState;
  if (!device?.last_ping) {
    deviceState = "Monitoring Unavailable";
  } else {
    const sincePing = now - new Date(device.last_ping).getTime();
    deviceState = sincePing <= DEVICE_OFFLINE_TIMEOUT_MS ? "Online" : "Offline";
  }
  const lastClosed = [...closedSessions].sort(
    (a, b) => new Date(b.end_time || b.created_at) - new Date(a.end_time || a.created_at),
  )[0];
  return { tripState: "Paused", deviceState, pauseStartedAt: lastClosed?.end_time || null };
}

// ---------------------------------------------------------------------------
// Live fleet-ops data hook — seed-fetch + Realtime subscriptions against
// devices/sessions/delivery_requests/alerts/gps_logs, all readable directly
// by a Supervisor session per the schema/access check already done in
// 08_REALTIME_DASHBOARD.md's Implementation Plan.
// ---------------------------------------------------------------------------
function useFleetOps() {
  const [trucks, setTrucks] = useState([]);
  const [driverNameById, setDriverNameById] = useState({});
  const [clientNameById, setClientNameById] = useState({});
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [positionsByDeliveryId, setPositionsByDeliveryId] = useState({});
  const [movementByDeliveryId, setMovementByDeliveryId] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Live-updating clock so Online/Offline/Waiting/Monitoring-Unavailable and
  // "last heartbeat" freshness advance even with no new Realtime events.
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Static-ish reference data (crew names, client names, truck roster) —
  // fetched once; nothing in this phase's spec requires these to be live.
  useEffect(() => {
    let isMounted = true;
    async function loadRefs() {
      const [{ data: crewData }, { data: clientsData }, { data: trucksData }] = await Promise.all([
        supabase.functions.invoke("admin-users", { body: { action: "list-crew" } }),
        supabase.functions.invoke("admin-users", { body: { action: "list-clients" } }),
        supabase.from("trucks").select("*"),
      ]);
      if (!isMounted) return;
      const names = {};
      for (const m of crewData?.crew || []) {
        if (!m.record_id) continue;
        names[m.record_id.trim()] = [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(" ").trim();
      }
      setDriverNameById(names);
      const clients = {};
      for (const c of clientsData?.clients || []) clients[c.id] = c.name;
      setClientNameById(clients);
      setTrucks(trucksData || []);
    }
    loadRefs();
    return () => {
      isMounted = false;
    };
  }, []);

  // devices/sessions/delivery_requests — the three tables whose changes
  // actually move Device/Trip state. Reloaded together on any change to any
  // of the three, same "just refetch" pattern SupDeliveries.jsx already uses
  // for its own delivery_requests subscription.
  const loadOps = useCallback(async () => {
    const [{ data: devicesData }, { data: sessionsData }, { data: deliveriesData }] = await Promise.all([
      // Explicit column list, not select('*') -- `authenticated`'s grant on
      // devices is column-scoped and deliberately excludes
      // device_secret_hash (DATABASE.md's devices "Grants" note); selecting
      // '*' tries to read that column too and Postgres 403s the whole
      // request rather than just omitting it (SUPABASE_GOTCHAS.md #1's same
      // grant-checked-before-RLS mechanism, hit here via a column grant
      // instead of a table grant).
      supabase.from("devices").select("id, device_id, plate_number, device_status, created_at, last_ping"),
      supabase.from("sessions").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("delivery_requests").select("*").in("status", IN_PROGRESS_STATUSES),
    ]);
    setDevices(devicesData || []);
    setSessions(sessionsData || []);
    setDeliveries(deliveriesData || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Seed-fetch on mount, same external-system-sync shape already accepted
    // elsewhere in this codebase (DriverDeliveries.jsx/HelperDeliveries.jsx)
    // — not a derived-state anti-pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOps();
    const channel = supabase
      .channel("sup-dashboard-ops")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, loadOps)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, loadOps)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests" }, loadOps)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOps]);

  // Latest Alerts feed — seed-fetch + append on INSERT, same shape as
  // DriverDeliveries.jsx's own alerts subscription.
  useEffect(() => {
    let isMounted = true;
    supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (isMounted) setRecentAlerts(data || []);
      });
    const channel = supabase
      .channel("sup-dashboard-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) => {
        setRecentAlerts((prev) => [payload.new, ...prev].slice(0, 50));
      })
      .subscribe();
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Deliveries currently Paused (no open Session, at least one closed one) —
  // drives both the paused-but-moving movement seed below and the anomaly
  // banner. Recomputed whenever deliveries/sessions change.
  const pausedInfo = useMemo(() => {
    const map = {};
    for (const d of deliveries) {
      const deliverySessions = sessions.filter((s) => s.delivery_request_id === d.id);
      const openSession = deliverySessions.find((s) => s.status === "Active");
      if (!openSession && deliverySessions.length > 0) {
        const lastClosed = [...deliverySessions].sort(
          (a, b) => new Date(b.end_time || b.created_at) - new Date(a.end_time || a.created_at),
        )[0];
        if (lastClosed?.end_time) map[d.id] = lastClosed.end_time;
      }
    }
    return map;
  }, [deliveries, sessions]);

  // Kept in sync via effect (not during render) so the gps_logs INSERT
  // handler below can read the latest position without becoming a
  // dependency of that subscription effect — same pattern as
  // DriverDeliveries.jsx's liveAlertsRef.
  const positionsRef = useRef(positionsByDeliveryId);
  useEffect(() => {
    positionsRef.current = positionsByDeliveryId;
  }, [positionsByDeliveryId]);

  // Seed current position (any in-progress delivery) and cumulative
  // paused-movement (Paused deliveries only) for anything not seeded yet.
  //
  // Both use `session_id is null` as the "this reading happened during a
  // Pause" signal, not a locally-cached pause-start timestamp -- per the
  // GPS-during-Pause design (DATABASE.md), the real gps-upload Edge
  // Function itself already leaves session_id null exactly when a reading
  // lands during a Pause, so it's a race-free signal straight from the row.
  // An earlier version compared row.timestamp against a pauseStart value
  // cached in a ref (synced via its own effect off the sessions table); live
  // testing caught a real gap in that approach -- a GPS reading arriving
  // right after Pause could beat the sessions-Realtime-event -> refetch ->
  // ref-sync chain, silently dropping that reading's distance from the
  // anomaly total even though the position itself still updated correctly.
  const seededPositionIds = useRef(new Set());
  const seededMovementIds = useRef(new Set());
  useEffect(() => {
    for (const d of deliveries) {
      if (seededPositionIds.current.has(d.id)) continue;
      seededPositionIds.current.add(d.id);
      supabase
        .from("gps_logs")
        .select("latitude, longitude, created_at")
        .eq("delivery_request_id", d.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data?.length) {
            setPositionsByDeliveryId((prev) => ({ ...prev, [d.id]: { lat: data[0].latitude, lng: data[0].longitude } }));
          }
        });
    }
    for (const deliveryId of Object.keys(pausedInfo)) {
      if (seededMovementIds.current.has(deliveryId)) continue;
      seededMovementIds.current.add(deliveryId);
      supabase
        .from("gps_logs")
        .select("latitude, longitude, created_at")
        .eq("delivery_request_id", deliveryId)
        .is("session_id", null)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (!data || data.length < 2) return;
          let total = 0;
          for (let i = 1; i < data.length; i++) {
            total += distanceMeters(data[i - 1].latitude, data[i - 1].longitude, data[i].latitude, data[i].longitude);
          }
          setMovementByDeliveryId((prev) => ({ ...prev, [deliveryId]: total }));
        });
    }
  }, [deliveries, pausedInfo]);

  // Fleet-wide GPS live position — one subscription, not per-truck, since the
  // dashboard needs every truck's position, not just one. Also extends the
  // paused-movement accumulator incrementally whenever the reading itself
  // (session_id null) marks it as having happened during a Pause.
  useEffect(() => {
    const channel = supabase
      .channel("sup-dashboard-gps")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gps_logs" }, (payload) => {
        const row = payload.new;
        const deliveryId = row.delivery_request_id;
        const prevPos = positionsRef.current[deliveryId];
        if (row.session_id == null && prevPos) {
          const delta = distanceMeters(prevPos.lat, prevPos.lng, row.latitude, row.longitude);
          setMovementByDeliveryId((prev) => ({ ...prev, [deliveryId]: (prev[deliveryId] || 0) + delta }));
        }
        setPositionsByDeliveryId((prev) => ({ ...prev, [deliveryId]: { lat: row.latitude, lng: row.longitude } }));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ----- Derived: one row per in-progress delivery with a real Session
  // history (skips a delivery whose status advanced but never actually had
  // Start Trip pressed — "no session at all" per the doc's state table). -----
  const fleetOps = useMemo(() => {
    return deliveries
      .map((d) => {
        const deliverySessions = sessions.filter((s) => s.delivery_request_id === d.id);
        const openSession = deliverySessions.find((s) => s.status === "Active");
        const closedSessions = deliverySessions.filter((s) => s.status !== "Active");
        const truck = trucks.find((t) => t.plate_number === d.assigned_truck_plate) || null;
        const device = devices.find((dev) => dev.plate_number === d.assigned_truck_plate) || null;
        const state = resolveOpsState({ openSession, closedSessions, device, now: nowTick });
        if (!state) return null;
        return {
          id: d.id,
          driver: driverNameById[d.assigned_driver_id] || d.assigned_driver_id || "Unassigned",
          truckPlate: d.assigned_truck_plate || "—",
          truckLabel: truck ? `${truck.brand} ${truck.model}` : "",
          client: clientNameById[d.customer_auth_id] || "Client",
          milestone: d.status,
          tripState: state.tripState,
          deviceState: state.deviceState,
          lastHeartbeat: device?.last_ping || null,
          position: positionsByDeliveryId[d.id] || null,
          movementMeters: movementByDeliveryId[d.id] || 0,
          isAnomalous: state.tripState === "Paused" && (movementByDeliveryId[d.id] || 0) > PAUSED_MOVE_THRESHOLD_M,
        };
      })
      .filter(Boolean);
  }, [deliveries, sessions, trucks, devices, driverNameById, clientNameById, positionsByDeliveryId, movementByDeliveryId, nowTick]);

  // ----- Derived: Latest Alerts feed, joined to driver/truck via the
  // session cache already loaded above. -----
  const alertFeed = useMemo(() => {
    const sessionById = new Map(sessions.map((s) => [s.session_id, s]));
    const countBySession = {};
    for (const a of recentAlerts) countBySession[a.session_id] = (countBySession[a.session_id] || 0) + 1;
    return recentAlerts.map((a) => {
      const session = sessionById.get(a.session_id);
      const truck = trucks.find((t) => t.plate_number === session?.truck_plate);
      return {
        id: a.id,
        name: driverNameById[session?.driver_id] || session?.driver_id || "Unknown driver",
        truck: truck?.plate_number || session?.truck_plate || "—",
        alertType: ALERT_TYPE_LABELS[a.event_type] || a.event_type,
        time: new Date(a.created_at).toLocaleTimeString("en-US", { timeZone: MANILA_TIMEZONE, hour: "2-digit", minute: "2-digit" }),
        severity: ALERT_SEVERITY[a.event_type] || "Medium",
        tripAlerts: countBySession[a.session_id] || 1,
        deliveryId: session?.delivery_request_id || null,
      };
    });
  }, [recentAlerts, sessions, trucks, driverNameById]);

  // ----- Derived: real per-driver alert rollup, same shape as
  // WeeklySafetySummary's mock rows ({ name, alerts, risk }) -- computed
  // from the same real alertFeed above, not a separate query. No date-range
  // filtering yet (recentAlerts is just "last 50, most recent"), so this
  // rolls up the same real totals into Today/7 Days/30 Days alike; a real
  // per-range breakdown is 08B_ANALYTICS_AND_REPORTING.md's job, not this
  // dashboard's.
  const realDriverSafety = useMemo(() => {
    const byDriver = new Map();
    for (const a of alertFeed) {
      const key = a.name;
      const entry = byDriver.get(key) || { name: key, alerts: 0, highest: "Low" };
      entry.alerts += 1;
      if (SEVERITY_RANK[a.severity] > SEVERITY_RANK[entry.highest]) entry.highest = a.severity;
      byDriver.set(key, entry);
    }
    return Array.from(byDriver.values()).map((entry) => ({
      name: entry.name,
      alerts: entry.alerts,
      risk: entry.highest === "High" ? "High Risk" : entry.highest === "Medium" ? "Moderate" : "Safe",
    }));
  }, [alertFeed]);

  return { fleetOps, alertFeed, realDriverSafety, isLoading, now: nowTick, trucks };
}

// ----- Active deliveries (live ops) -----
function ActiveDeliveries({ data, isLoading, now, focusedTruckId, onFocusTruck }) {
  return (
    <Panel title="Active Deliveries" action={<ViewAllLink to="/supervisor/deliveries" />}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading live fleet…
        </div>
      ) : data.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">No deliveries in progress right now.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400">
                <th className="pb-1.5 pr-2 font-medium">Driver</th>
                <th className="pb-1.5 pr-2 font-medium">Truck</th>
                <th className="pb-1.5 pr-2 font-medium">Client</th>
                <th className="pb-1.5 pr-2 font-medium">Status</th>
                <th className="pb-1.5 pr-2 font-medium">Trip</th>
                <th className="pb-1.5 pr-2 font-medium">Device</th>
                <th className="pb-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row) => {
                const milestone = MILESTONE_TONE[row.milestone] || { label: row.milestone, tone: "slate" };
                const isFocused = row.id === focusedTruckId;
                return (
                  <tr key={row.id} className={isFocused ? "bg-blue-50/60" : "hover:bg-slate-50"}>
                    <td className="py-1.5 pr-2 font-medium text-slate-800">{row.driver}</td>
                    <td className="py-1.5 pr-2 text-slate-600">{row.truckPlate}</td>
                    <td className="py-1.5 pr-2 text-slate-600">{row.client}</td>
                    <td className="py-1.5 pr-2">
                      <Badge tone={milestone.tone}>{milestone.label}</Badge>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Badge tone={TRIP_STATE_TONE[row.tripState]}>{row.tripState}</Badge>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Badge tone={DEVICE_STATE_TONE[row.deviceState]}>{row.deviceState}</Badge>
                      <p className="mt-0.5 text-[10px] text-slate-400">Heartbeat: {formatAgo(row.lastHeartbeat, now)}</p>
                    </td>
                    <td className="py-1.5">
                      {row.position && (
                        <button
                          type="button"
                          onClick={() => onFocusTruck(row.id)}
                          title={`Center map on ${row.truckPlate}`}
                          className={`rounded-md border p-1 transition-colors ${
                            isFocused
                              ? "border-blue-300 bg-blue-100 text-blue-700"
                              : "border-slate-200 text-slate-400 hover:border-blue-200 hover:text-blue-600"
                          }`}
                        >
                          <LocateFixed className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ----- Live fleet: trucks + crew status, one compact panel (mock — left
// untouched per 08_REALTIME_DASHBOARD.md's reuse decision, out of scope). -----
function StatusBar({ segments, total }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
      {segments.map((seg) => (
        <div
          key={seg.label}
          className={TONE[seg.tone].bar}
          style={{ width: `${total ? (seg.value / total) * 100 : 0}%` }}
        />
      ))}
    </div>
  );
}

function StatusRow({ title, total, unitLabel, segments }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-medium text-slate-600">{title}</span>
        <span>
          <span className="font-semibold text-slate-800">{total}</span> {unitLabel}
        </span>
      </div>
      <div className="mt-1.5">
        <StatusBar segments={segments} total={total} />
      </div>
      <p className="mt-1 text-[10.5px] text-slate-500">
        {segments.map((seg) => `${seg.value} ${seg.label}`).join(" · ")}
      </p>
    </div>
  );
}

function LiveFleet({ trucks, crew }) {
  const truckTotal = trucks.available + trucks.onDelivery + trucks.maintenance + trucks.offline;
  const crewTotal = crew.available + crew.onDelivery + crew.offDuty;
  const truckSegments = [
    { label: "Available", value: trucks.available, tone: "emerald" },
    { label: "On Delivery", value: trucks.onDelivery, tone: "sky" },
    { label: "Maintenance", value: trucks.maintenance, tone: "amber" },
    { label: "Offline", value: trucks.offline, tone: "red" },
  ];
  const crewSegments = [
    { label: "Available", value: crew.available, tone: "emerald" },
    { label: "On Delivery", value: crew.onDelivery, tone: "sky" },
    { label: "Off Duty", value: crew.offDuty, tone: "slate" },
  ];
  return (
    <Panel title="Live Fleet" action={<ViewAllLink to="/supervisor/trucks" />}>
      <div className="flex flex-col gap-3">
        <StatusRow title="Trucks" total={truckTotal} unitLabel="total" segments={truckSegments} />
        <StatusRow title="Crew" total={crewTotal} unitLabel="on roster" segments={crewSegments} />
      </div>
    </Panel>
  );
}

// ----- Live GPS map: one marker per truck currently on an in-progress
// delivery. Net-new per 08_REALTIME_DASHBOARD.md's Map Display section —
// simpler than Driver nav's LiveNavigationMap: no tilt/rotation/turn-by-turn/
// route rendering, just a live position per truck. -----
function LiveFleetMap({ data, isLoading, focusedTruckId, focusToken }) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const withPosition = data.filter((row) => row.position);
  // Captured once, never reactive -- a `center` prop that changes on every
  // GPS tick would call map.setCenter() constantly and fight the
  // fitBounds/panTo effect below (same lesson as LiveNavigationMap's
  // initialCenter in DriverDeliveries.jsx, minus the tilt/heading angle).
  const [initialCenter] = useState(() => withPosition[0]?.position || FLEET_MAP_DEFAULT_CENTER);
  const mapRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  // Fullscreen mode (same fixed-positioning pattern as Driver's
  // LiveNavigationMap in DriverDeliveries.jsx, no browser Fullscreen API).
  // The "center on this truck" control normally lives in ActiveDeliveries'
  // Device column (a sibling panel, covered while maximized), so a
  // fullscreen-only truck quick-select list is rendered below instead of
  // losing that ability while maximized -- panToTruck bypasses the
  // parent-owned focusedTruckId/focusToken state entirely since this map
  // already holds its own mapRef.
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Only the set of truck ids, not their positions -- refitting the camera
  // on every single GPS tick (as often as once a second per truck) would
  // constantly yank the view out from under a supervisor manually panning
  // it. Only reframes when a truck newly appears/disappears from the view.
  const truckIdsKey = withPosition.map((row) => row.id).sort().join(",");

  useEffect(() => {
    if (!isMapReady || !mapRef.current || withPosition.length === 0) return;
    if (withPosition.length === 1) {
      mapRef.current.panTo(withPosition[0].position);
      mapRef.current.setZoom(17);
    } else {
      const bounds = new window.google.maps.LatLngBounds();
      for (const row of withPosition) bounds.extend(row.position);
      mapRef.current.fitBounds(bounds, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMapReady, truckIdsKey]);

  // "Center on this truck" (the locate icon in ActiveDeliveries' Device
  // column) -- a deliberate one-shot user action, so it's its own effect,
  // not folded into the fitBounds effect above. Keyed on focusToken (a
  // counter bumped on every click), not just focusedTruckId -- clicking the
  // *same* truck a second time after manually panning away sets the same id
  // both times, which React treats as no change and the effect would never
  // re-fire; the token guarantees a dependency change on every click
  // regardless of whether the id repeats.
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !focusedTruckId) return;
    const row = withPosition.find((r) => r.id === focusedTruckId);
    if (!row) return;
    mapRef.current.panTo(row.position);
    mapRef.current.setZoom(17);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMapReady, focusToken]);

  // Used by both the fullscreen quick-select list below and, indirectly, the
  // focusedTruckId effect above's own inline pan/zoom (kept as its own
  // function so the fullscreen list has a way to recenter without a path
  // back to the parent's focus state).
  const panToTruck = (row) => {
    if (!mapRef.current) return;
    mapRef.current.panTo(row.position);
    mapRef.current.setZoom(17);
  };

  // heightClass: "h-80" in the normal Panel-wrapped layout, "h-full" filling
  // the fullscreen container instead -- see GOOGLE_MAP_CONTAINER_STYLE's own
  // 100%/100% comment, it already just fills whatever this wrapper is.
  const mapBody = (heightClass) =>
    isLoading ? (
      <div className={`flex ${heightClass} items-center justify-center text-xs text-slate-400`}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    ) : !isLoaded ? (
      <div className={`flex ${heightClass} items-center justify-center text-slate-400`}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ) : withPosition.length === 0 ? (
      <div className={`flex ${heightClass} items-center justify-center text-center text-xs text-slate-400`}>
        No live GPS positions yet.
      </div>
    ) : (
      <div className={`${heightClass} w-full overflow-hidden rounded-md`}>
        <GoogleMap
          mapContainerStyle={GOOGLE_MAP_CONTAINER_STYLE}
          center={initialCenter}
          zoom={17}
          onLoad={(map) => {
            mapRef.current = map;
            setIsMapReady(true);
          }}
          options={{ disableDefaultUI: true, gestureHandling: "greedy", mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID }}
        >
          {withPosition.map((row) => (
            <GoogleMapMarker
              key={row.id}
              position={row.position}
              title={`${row.truckPlate} — ${row.driver}`}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: row.isAnomalous ? "#dc2626" : row.tripState === "Paused" ? "#d97706" : "#2563eb",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 2,
              }}
            />
          ))}
        </GoogleMap>
      </div>
    );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white p-3">
        <div className="mb-2 flex items-center justify-between border-b border-slate-200/70 pb-1.5">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Live GPS</h3>
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Exit fullscreen"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="min-w-0 flex-1">{mapBody("h-full")}</div>
          {/* Quick-select list -- keeps "center on a truck" reachable while
              maximized, since ActiveDeliveries' own locate-icon control (a
              sibling panel) is covered by this fixed overlay. */}
          {withPosition.length > 0 && (
            <div className="w-56 shrink-0 overflow-y-auto rounded-md border border-slate-200 p-2">
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Trucks
              </p>
              <div className="space-y-1">
                {withPosition.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => panToTruck(row)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-blue-50"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        row.isAnomalous ? "bg-red-600" : row.tripState === "Paused" ? "bg-amber-600" : "bg-blue-600"
                      }`}
                    />
                    <span className="truncate">
                      {row.truckPlate} — {row.driver}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Panel
      title="Live GPS"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Maximize"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
        </div>
      }
    >
      {/* Explicit height here, not on Panel's own outer div -- Panel's base
          classes already set h-full there, and this component isn't inside
          a grid row with a sibling to stretch against, so a conflicting
          height override on Panel itself resolves against an auto-height
          ancestor and silently collapses to ~0 (found live-testing this
          panel: it rendered completely empty, no spinner or empty-state text
          visible, despite the data/logic all being correct). */}
      {mapBody("h-80")}
    </Panel>
  );
}

// ----- Paused-but-moving anomaly banner: its own visual state, distinct from
// the Latest Alerts feed (drowsiness) per 08_REALTIME_DASHBOARD.md's
// "Decided 2026-08-12" note — a security/theft concern, not driver-attention. -----
function PausedMovementBanner({ data }) {
  const anomalies = data.filter((row) => row.isAnomalous);
  if (anomalies.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
      {anomalies.map((row) => (
        <div key={row.id} className="flex items-start gap-2 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>
            <span className="font-semibold">{row.truckPlate}</span> ({row.driver}) moved{" "}
            <span className="font-semibold">{Math.round(row.movementMeters)}m</span> while Paused — possible
            unauthorized movement.
          </span>
        </div>
      ))}
    </div>
  );
}

// ----- Driver safety: drowsiness priority list (replaces the old chart) -----
const SEVERITY_TONE = { High: "red", Medium: "amber", Low: "emerald" };

function DriverSafetyList({ data, isLoading }) {
  const sorted = [...data].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.tripAlerts - a.tripAlerts
  );
  return (
    <Panel title="Driver Safety — Drowsiness Alerts" action={<ViewAllLink to="/supervisor/deliveries" />}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">No drowsiness alerts recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400">
                <th className="pb-1.5 pr-3 font-medium">Driver</th>
                <th className="pb-1.5 pr-3 font-medium">Alert</th>
                <th className="pb-1.5 pr-3 font-medium">Time</th>
                <th className="pb-1.5 pr-3 font-medium">Severity</th>
                <th className="pb-1.5 pr-3 font-medium">This Trip</th>
                <th className="pb-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={d.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{d.name}</p>
                        <p className="truncate text-[11px] text-slate-500">{d.truck}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{d.alertType}</td>
                  <td className="py-2 pr-3 text-slate-400">{d.time}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={SEVERITY_TONE[d.severity]}>{d.severity}</Badge>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{d.tripAlerts} alerts</td>
                  <td className="py-2">
                    <Link
                      to={d.deliveryId ? `/supervisor/deliveries?deliveryId=${d.deliveryId}` : "/supervisor/deliveries"}
                      className="whitespace-nowrap rounded-md border border-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      View Trip
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ----- Bottom tier: recent activity + weekly rollup (secondary, quieter) -----
function RecentActivity({ items }) {
  return (
    <Panel title="Recent Activity" muted>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-xs">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${TONE[item.tone].dot}`} />
            <span className="flex-1 text-slate-600">{item.text}</span>
            <span className="shrink-0 text-[10.5px] text-slate-400">{item.time}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const RISK_TONE = { Safe: "emerald", Moderate: "amber", "High Risk": "red" };

function WeeklySafetySummary({ data, dateRange, onDateRangeChange }) {
  return (
    <Panel
      title="Weekly Safety Summary"
      muted
      action={<DateRangeFilter selected={dateRange} onChange={onDateRangeChange} />}
    >
      <ol className="divide-y divide-slate-100">
        {data.map((d, idx) => (
          <li key={d.name} className="flex items-center justify-between py-1.5 text-xs first:pt-0 last:pb-0">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500">
                {idx + 1}
              </span>
              {d.name}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-slate-500">{d.alerts} alerts</span>
              <Badge tone={RISK_TONE[d.risk]}>{d.risk}</Badge>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function SupDashboard() {
  const [dateRange, setDateRange] = useState("7 Days");
  const { fleetOps, alertFeed, realDriverSafety, isLoading, now, trucks } = useFleetOps();
  const [focusedTruckId, setFocusedTruckId] = useState(null);
  const [focusToken, setFocusToken] = useState(0);
  const handleFocusTruck = (id) => {
    setFocusedTruckId(id);
    setFocusToken((t) => t + 1);
  };

  // Real (not mock) PMS-overdue count, shortcutting straight into the Trucks
  // list pre-filtered to Overdue -- getPmsStatus/pmsFilter mirror what
  // MaintenanceSummaryWidget/SupTrucks.jsx already use for the same
  // computation, just surfaced here too so a Supervisor doesn't have to
  // navigate into Trucks first to see whether anything needs attention.
  const pmsOverdueCount = useMemo(
    () => trucks.filter((t) => getPmsStatus(t) === "overdue").length,
    [trucks],
  );

  // ----- KPI strip: doubles as the "needs attention" summary — each tile
  // routes to the page that resolves it, so there's no separate task list.
  // Left as mock per 08_REALTIME_DASHBOARD.md's reuse decision (out of scope
  // for this phase), except PMS Overdue which is real (see above). -----
  const kpis = [
    { label: "Active Deliveries", value: 18, to: "/supervisor/deliveries" },
    { label: "Pending Assignments", value: 5, to: "/supervisor/deliveries", tone: "amber" },
    { label: "Requests Inbox", value: 9, to: "/supervisor/deliveries" },
    { label: "Alerts Today", value: 14, to: "/supervisor/deliveries", tone: "amber" },
    { label: "High-Risk Drivers", value: 3, to: "/supervisor/delivery-crew", tone: "red" },
    { label: "Fleet Available", value: "22/48", to: "/supervisor/trucks" },
    {
      label: "PMS Overdue",
      value: pmsOverdueCount,
      to: "/supervisor/trucks",
      tone: pmsOverdueCount > 0 ? "red" : undefined,
      state: { pmsFilter: "overdue" },
    },
  ];

  const fleetStatus = { available: 22, onDelivery: 18, maintenance: 5, offline: 3 };
  const crewStatus = { available: 10, onDelivery: 16, offDuty: 4 };

  const recentActivity = [
    { id: 1, text: "Trip to Shaw Traders marked Delivered — TR-45", time: "5m ago", tone: "emerald" },
    { id: 2, text: "J. Doe assigned to TR-12 for SM Supply Co.", time: "22m ago", tone: "blue" },
    { id: 3, text: "Truck TR-27 flagged for maintenance", time: "1h ago", tone: "amber" },
    { id: 4, text: "New delivery request from Ortigas Retail", time: "1h ago", tone: "slate" },
    { id: 5, text: "Trip cancelled — Pasig Logistics", time: "2h ago", tone: "red" },
  ];

  // ----- Historical rollup, keyed by date range (mock — out of scope). -----
  const topRiskDriversByRange = {
    Today: [{ name: "J. Doe", alerts: 10, risk: "High Risk" }],
    "7 Days": [
      { name: "J. Doe", alerts: 10, risk: "High Risk" },
      { name: "M. Lee", alerts: 8, risk: "High Risk" },
      { name: "A. Smith", alerts: 6, risk: "High Risk" },
    ],
    "30 Days": [
      { name: "J. Doe", alerts: 30, risk: "High Risk" },
      { name: "M. Lee", alerts: 25, risk: "High Risk" },
      { name: "A. Smith", alerts: 22, risk: "Moderate" },
    ],
  };
  // Real per-driver alert data (e.g. DR-0020's driver) layered on top of the
  // mock rollup above, not replacing it -- same "real data if present,
  // otherwise the existing mock" precedent used elsewhere on this page.
  // De-duped by name (a real driver already present in the mock list keeps
  // the mock's row rather than double-counting).
  const mockRiskDrivers = topRiskDriversByRange[dateRange];
  const topRiskDrivers = [
    ...realDriverSafety.filter((real) => !mockRiskDrivers.some((mock) => mock.name === real.name)),
    ...mockRiskDrivers,
  ].sort((a, b) => b.alerts - a.alerts);

  return (
    <SupLayout title="Supervisor Dashboard" background={background} bg="bg-[#F6F7FB]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-blue-700">
              Operations Overview
            </p>
            <p className="text-xs text-slate-500">Live fleet, delivery &amp; driver-safety status</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/supervisor/deliveries"
              className="rounded-md bg-blue-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-800"
            >
              Assign Vehicles
            </Link>
            <nav className="flex items-center gap-2 text-[11px] font-medium text-blue-600">
              <Link to="/supervisor/deliveries" className="hover:underline">Deliveries</Link>
              <span className="text-slate-300">·</span>
              <Link to="/supervisor/delivery-crew" className="hover:underline">Crew</Link>
              <span className="text-slate-300">·</span>
              <Link to="/supervisor/trucks" className="hover:underline">Trucks</Link>
            </nav>
          </div>
        </div>

        {/* Top: KPI summary */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {kpis.map((kpi) => (
            <StatTile key={kpi.label} {...kpi} />
          ))}
        </div>

        {/* Middle: live operations */}
        <SectionHeader
          right={
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              LIVE
            </span>
          }
        >
          Live Operations
        </SectionHeader>
        <PausedMovementBanner data={fleetOps} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ActiveDeliveries
              data={fleetOps}
              isLoading={isLoading}
              now={now}
              focusedTruckId={focusedTruckId}
              onFocusTruck={handleFocusTruck}
            />
          </div>
          <div className="lg:col-span-4">
            <LiveFleet trucks={fleetStatus} crew={crewStatus} />
          </div>
        </div>
        <LiveFleetMap data={fleetOps} isLoading={isLoading} focusedTruckId={focusedTruckId} focusToken={focusToken} />
        <DriverSafetyList data={alertFeed} isLoading={isLoading} />

        {/* Bottom: recent activity + performance summary (secondary) */}
        <SectionHeader muted>Recent Activity &amp; Performance</SectionHeader>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <RecentActivity items={recentActivity} />
          </div>
          <div className="lg:col-span-5">
            <WeeklySafetySummary
              data={topRiskDrivers}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          </div>
        </div>
      </div>
    </SupLayout>
  );
}

export default SupDashboard;
