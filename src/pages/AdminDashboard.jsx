import AdminLayout from "../layout/AdminLayout.jsx";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Info, LocateFixed, Loader2, MapPin, Maximize2, Minimize2 } from "lucide-react";
import { GoogleMap, Marker as GoogleMapMarker, useJsApiLoader } from "@react-google-maps/api";
import DateRangeFilter from "../components/DateRangeFilter.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import { MANILA_TIMEZONE } from "../lib/manilaTime.js";
import { getPmsStatus, addMaintenanceBaselines } from "../components/trucks/utils/pms.js";

// Admin's own copy of SupDashboard.jsx's Operations Overview -- same real
// data/panels (fleet ops, live GPS, drowsiness alerts, PMS), reusing the
// existing per-role-duplicate-page convention already established by
// AdminTrucks.jsx/SupTrucks.jsx and AdminTruckProfile.jsx/SupTruckProfile.jsx
// rather than sharing one parameterized component.
//
// Deliberately different from the Supervisor version in two ways:
// 1. No CriticalAlertPopup (the "Very High Risk of Drowsiness"/"Route
//    Deviation" popup+siren) -- that notification is strictly a Supervisor
//    surface, per the user (2026-09-03). This copy's useFleetOps also skips
//    the underlying detection work that only existed to feed that popup.
// 2. Admin has no /admin/deliveries or /admin/delivery-crew routes at all
//    (only user-management, device-management, trucks, profile) -- decided
//    with the user to render that data non-interactively (real numbers/rows,
//    no click-through) rather than invent new routes or point links at the
//    wrong page. Only /admin/trucks stays a real link, since it exists.

const background = null;

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
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
      {initials}
    </span>
  );
}

function Panel({ title, action, children, className = "", muted = false }) {
  return (
    <div
      className={`flex h-full flex-col rounded-lg border p-3 ${
        muted ? "border-slate-200 bg-slate-50/60" : "border-violet-100 bg-white shadow-sm"
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
          muted ? "text-slate-400" : "text-violet-700"
        }`}
      >
        {!muted && <span className="h-3 w-1 rounded-full bg-violet-600" />}
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
      className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 hover:underline"
    >
      View all →
    </Link>
  );
}

// ----- KPI strip. Unlike SupDashboard's StatTile, these are never links --
// none of this data has an Admin route to point to (see file header), and
// making a couple of the five tiles clickable while the rest weren't made
// the row look unbalanced (per the user, 2026-09-17), so all five render as
// plain tiles for a consistent look. -----
function StatTile({ label, value, tone }) {
  const toneClass = tone ? `border-l-4 ${TONE[tone].borderL}` : "";
  return (
    <div className={`flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 ${toneClass}`}>
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-0.5 text-xl font-bold leading-tight text-slate-900">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants/helpers -- identical to SupDashboard.jsx's own (08_REALTIME_
// DASHBOARD.md governs both; Admin has the same direct RLS read access).
// ---------------------------------------------------------------------------

const DEVICE_OFFLINE_TIMEOUT_MS = 30_000;
const PAUSED_MOVE_THRESHOLD_M = 100;

// Phone-GPS broadcast freshness window (2026-09-04, mirrors SupDashboard.jsx's
// own -- see that file's Live GPS section / STATUS.md's 2026-09-03 entry for
// the full design). A phone position older than this falls back to the Pi's
// gps_logs-sourced position instead.
const PHONE_POSITION_STALE_MS = 20_000;

const IN_PROGRESS_STATUSES = ["OUT_FOR_PICKUP", "ARRIVED_PICKUP", "OUT_FOR_DROPOFF", "ARRIVED_DROPOFF"];

const MILESTONE_TONE = {
  OUT_FOR_PICKUP: { label: "Out for Pickup", tone: "sky" },
  ARRIVED_PICKUP: { label: "Arrived Pickup", tone: "sky" },
  OUT_FOR_DROPOFF: { label: "Out for Drop-off", tone: "blue" },
  ARRIVED_DROPOFF: { label: "Arrived Drop-off", tone: "blue" },
};

const TRIP_STATE_TONE = { Active: "emerald", Paused: "amber" };

const DEVICE_STATE_TONE = {
  Online: "emerald",
  Offline: "red",
  "Waiting for Device": "sky",
  "Monitoring Unavailable": "amber",
};

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
const FLEET_MAP_DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

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
// Live fleet-ops data hook -- same seed-fetch + Realtime subscriptions as
// SupDashboard.jsx's useFleetOps, minus everything that only existed to feed
// the Supervisor-only CriticalAlertPopup (the 5-alert-count "Very High Risk
// of Drowsiness" check and the route-deviation check inside the gps_logs
// INSERT handler, and the criticalAlerts queue itself).
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
  // Phone-GPS live view (mirrors SupDashboard.jsx's own -- see
  // STATUS.md's 2026-09-03 entry for the full design). Ephemeral Realtime
  // broadcast only, per delivery; never touches gps_logs/mileage/Route
  // Comparison. Preferred over positionsByDeliveryId (the Pi's gps_logs
  // feed) when recent, falling back to it otherwise.
  const [phonePositionsByDeliveryId, setPhonePositionsByDeliveryId] = useState({});
  const phoneChannelsRef = useRef({});
  const [isLoading, setIsLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  const deliveriesRef = useRef(deliveries);
  useEffect(() => {
    deliveriesRef.current = deliveries;
  }, [deliveries]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Static-ish reference data (crew names, client names, truck roster) --
  // fetched once, baseline-corrected the same way SupTrucks.jsx/AdminTrucks.jsx
  // are (a truck's raw previous_mileage/previous_maintenance_date columns go
  // stale as soon as a newer completed maintenance_records row exists).
  useEffect(() => {
    let isMounted = true;
    async function loadRefs() {
      const [{ data: crewData }, { data: clientsData }, { data: trucksData }, { data: maintenanceRecords }] = await Promise.all([
        supabase.functions.invoke("admin-users", { body: { action: "list-crew" } }),
        supabase.functions.invoke("admin-users", { body: { action: "list-clients" } }),
        supabase.from("trucks").select("*"),
        supabase.from("maintenance_records").select("truck_id, status, mileage_at_service, start_date, end_date"),
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
      setTrucks(addMaintenanceBaselines(trucksData || [], maintenanceRecords || []));
    }
    loadRefs();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadOps = useCallback(async () => {
    const [{ data: devicesData }, { data: sessionsData }, { data: deliveriesData }] = await Promise.all([
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
    Promise.resolve().then(() => {
      loadOps();
    });
    const channel = supabase
      .channel("admin-dashboard-ops")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, loadOps)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, loadOps)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests" }, loadOps)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOps]);

  // Latest Alerts feed -- seed-fetch + append on INSERT. No critical-alert
  // threshold check here (that's Supervisor-only); this just keeps the real
  // Driver Safety list current.
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
      .channel("admin-dashboard-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) => {
        setRecentAlerts((prev) => [payload.new, ...prev].slice(0, 50));
      })
      .subscribe();
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Phone-GPS broadcast subscriptions: one Realtime channel per in-progress
  // delivery (`phone-gps-<deliveryId>`, matching DriverDeliveries.jsx's
  // sender), joined/left as the deliveries list itself changes. Mirrors
  // SupDashboard.jsx's own copy exactly.
  useEffect(() => {
    const currentIds = new Set(deliveries.map((d) => d.id));
    for (const d of deliveries) {
      if (phoneChannelsRef.current[d.id]) continue;
      const channel = supabase
        .channel(`phone-gps-${d.id}`)
        .on("broadcast", { event: "phone_position" }, (msg) => {
          setPhonePositionsByDeliveryId((prev) => ({
            ...prev,
            [d.id]: { lat: msg.payload.lat, lng: msg.payload.lng, receivedAt: Date.now() },
          }));
        })
        .subscribe();
      phoneChannelsRef.current[d.id] = channel;
    }
    for (const id of Object.keys(phoneChannelsRef.current)) {
      if (currentIds.has(id)) continue;
      supabase.removeChannel(phoneChannelsRef.current[id]);
      delete phoneChannelsRef.current[id];
      setPhonePositionsByDeliveryId((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [deliveries]);

  // Unmount-only cleanup for whatever's left in phoneChannelsRef -- see
  // SupDashboard.jsx's identical effect for why this is separate from the
  // one above.
  useEffect(() => {
    return () => {
      for (const channel of Object.values(phoneChannelsRef.current)) {
        supabase.removeChannel(channel);
      }
      phoneChannelsRef.current = {};
    };
  }, []);

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

  const positionsRef = useRef(positionsByDeliveryId);
  useEffect(() => {
    positionsRef.current = positionsByDeliveryId;
  }, [positionsByDeliveryId]);

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

  // Fleet-wide GPS live position -- unlike SupDashboard's copy, no route-
  // deviation check here (that only fed the Supervisor-only popup).
  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-gps")
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
          truckPlate: d.assigned_truck_plate || "",
          truckLabel: truck ? `${truck.brand} ${truck.model}` : "",
          client: clientNameById[d.customer_auth_id] || "Client",
          milestone: d.status,
          tripState: state.tripState,
          deviceState: state.deviceState,
          lastHeartbeat: device?.last_ping || null,
          // Phone GPS preferred when a broadcast has arrived recently,
          // falling back to the Pi's gps_logs-sourced position otherwise --
          // display only, mirrors SupDashboard.jsx. movementMeters/
          // isAnomalous stay gps_logs-only (keyed on the Pi's own
          // session_id-is-null marker).
          position: (() => {
            const phone = phonePositionsByDeliveryId[d.id];
            if (phone && nowTick - phone.receivedAt < PHONE_POSITION_STALE_MS) {
              return { lat: phone.lat, lng: phone.lng };
            }
            return positionsByDeliveryId[d.id] || null;
          })(),
          positionSource:
            phonePositionsByDeliveryId[d.id] &&
            nowTick - phonePositionsByDeliveryId[d.id].receivedAt < PHONE_POSITION_STALE_MS
              ? "phone"
              : positionsByDeliveryId[d.id]
                ? "pi"
                : null,
          movementMeters: movementByDeliveryId[d.id] || 0,
          isAnomalous: state.tripState === "Paused" && (movementByDeliveryId[d.id] || 0) > PAUSED_MOVE_THRESHOLD_M,
        };
      })
      .filter(Boolean);
  }, [deliveries, sessions, trucks, devices, driverNameById, clientNameById, positionsByDeliveryId, phonePositionsByDeliveryId, movementByDeliveryId, nowTick]);

  const alertFeed = useMemo(() => {
    const sessionById = new Map(sessions.map((s) => [s.session_id, s]));
    const ascending = [...recentAlerts].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const runningCountById = new Map();
    const countBySession = {};
    for (const a of ascending) {
      countBySession[a.session_id] = (countBySession[a.session_id] || 0) + 1;
      runningCountById.set(a.id, countBySession[a.session_id]);
    }
    return recentAlerts.map((a) => {
      const session = sessionById.get(a.session_id);
      const truck = trucks.find((t) => t.plate_number === session?.truck_plate);
      return {
        id: a.id,
        // Groups this alert with the rest of its trip's alerts in
        // DriverSafetyList below -- a raw session id, not display text.
        sessionId: a.session_id || null,
        name: driverNameById[session?.driver_id] || session?.driver_id || "Unknown driver",
        truck: truck?.plate_number || session?.truck_plate || "",
        alertType: ALERT_TYPE_LABELS[a.event_type] || a.event_type,
        time: new Date(a.created_at).toLocaleTimeString("en-US", { timeZone: MANILA_TIMEZONE, hour: "2-digit", minute: "2-digit" }),
        // Kept alongside the display-only `time` string above (which loses
        // both the date and sort order) -- DriverSafetyList's per-trip
        // expansion needs a real sortable/comparable instant to show alerts
        // newest-to-oldest.
        createdAt: a.created_at,
        severity: ALERT_SEVERITY[a.event_type] || "Medium",
        tripAlerts: runningCountById.get(a.id) || 1,
        deliveryId: session?.delivery_request_id || null,
      };
    });
  }, [recentAlerts, sessions, trucks, driverNameById]);

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

// ----- Active deliveries (live ops). No ViewAllLink action -- there's no
// /admin/deliveries page to send it to. -----
function ActiveDeliveries({ data, isLoading, now, focusedTruckId, onFocusTruck }) {
  return (
    <Panel title="Active Deliveries">
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
                  <tr key={row.id} className={isFocused ? "bg-violet-50/60" : "hover:bg-slate-50"}>
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
                              ? "border-violet-300 bg-violet-100 text-violet-700"
                              : "border-slate-200 text-slate-400 hover:border-violet-200 hover:text-violet-600"
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
    <Panel title="Live Fleet" action={<ViewAllLink to="/admin/trucks" />}>
      <div className="flex flex-col gap-3">
        <StatusRow title="Trucks" total={truckTotal} unitLabel="total" segments={truckSegments} />
        <StatusRow title="Crew" total={crewTotal} unitLabel="on roster" segments={crewSegments} />
      </div>
    </Panel>
  );
}

function LiveFleetMap({ data, isLoading, focusedTruckId, focusToken }) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const withPosition = data.filter((row) => row.position);
  const [initialCenter] = useState(() => withPosition[0]?.position || FLEET_MAP_DEFAULT_CENTER);
  const mapRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !focusedTruckId) return;
    const row = withPosition.find((r) => r.id === focusedTruckId);
    if (!row) return;
    mapRef.current.panTo(row.position);
    mapRef.current.setZoom(17);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMapReady, focusToken]);

  const panToTruck = (row) => {
    if (!mapRef.current) return;
    mapRef.current.panTo(row.position);
    mapRef.current.setZoom(17);
  };

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
              title={`${row.truckPlate ? `${row.truckPlate} — ` : ""}${row.driver} (${row.positionSource === "phone" ? "Phone GPS" : "Pi GPS"})`}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: row.isAnomalous ? "#dc2626" : row.tripState === "Paused" ? "#d97706" : "#7c3aed",
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
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-violet-50"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        row.isAnomalous ? "bg-red-600" : row.tripState === "Paused" ? "bg-amber-600" : "bg-violet-600"
                      }`}
                    />
                    <span className="truncate">
                      {row.truckPlate ? `${row.truckPlate} — ` : ""}
                      {row.driver}
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
      {mapBody("h-80")}
    </Panel>
  );
}

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

// ----- Driver safety: drowsiness priority list, same paginated shape as
// SupDashboard.jsx's DriverSafetyList. The last column has no "View Trip"
// link -- no /admin/deliveries page exists to send it to. -----
const SEVERITY_TONE = { High: "red", Medium: "amber", Low: "emerald" };
const DRIVER_SAFETY_PAGE_SIZE = 5;

function DriverSafetyPaginationBar({ page, setPage, totalPages }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-slate-100 pt-2 mt-1">
      <p className="text-[11px] text-slate-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="First page"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
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
              for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
              if (page < totalPages - 2) pages.push("...");
              pages.push(totalPages);
            }
            return pages.map((num, idx) =>
              num === "..." ? (
                <span key={`ellipsis-${idx}`} className="flex h-6 w-6 items-center justify-center text-xs text-slate-400">
                  ...
                </span>
              ) : (
                <button
                  key={num}
                  onClick={() => setPage(num)}
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-medium transition ${
                    num === page ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
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
          className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Last page"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Alerts grouped by trip (delivery) -- one row per trip instead of one row
// per alert or one row per driver, so a frequent offender's table entry
// doesn't repeat the same name down the table (the original bug, fixed
// 2026-09-22 per an explicit user request/screenshot against
// SupDashboard.jsx's identical panel) *and* doesn't conflate two genuinely
// different trips for the same driver into one dropdown (this file's
// original per-driver grouping's own separate gap, raised and fixed the
// same day -- "in their specific trip" was the guiding phrase for the fix).
// Falls back to `sessionId`, then the alert's own `id`, as the grouping key
// whenever `deliveryId` is missing, so a legacy/malformed alert with no
// delivery link still gets its own single-alert "trip" row instead of being
// silently dropped or merged into the wrong group. Each row expands
// (chevron toggle) to reveal that trip's individual alerts, newest-to-oldest.
//
// Keyed on `deliveryId`, not `sessionId` -- corrected 2026-09-22 same day,
// from a real screenshot showing the same driver/truck as two separate
// cards a few minutes apart. `driver-trip`'s `resume-trip` action always
// mints a brand-new `session_id` on every pause/resume (`crypto.
// randomUUID()`, same `delivery_request_id`), and `end-trip` does the same
// again to open a Return-Trip monitoring session (14_RETURN_TRIP_
// MONITORING.md) -- so one real delivery/trip can span several session
// rows. Grouping by session (the original key) split that one trip's alert
// history across each pause/resume boundary, which is exactly what "their
// specific trip" wasn't supposed to mean. Mirrors SupDashboard.jsx's
// identical panel (same fix applied to both).
function groupAlertsIntoTrips(data) {
  const byKey = new Map();
  for (const a of data) {
    const key = a.deliveryId || a.sessionId || a.id;
    const entry = byKey.get(key);
    if (entry) {
      entry.alerts.push(a);
    } else {
      byKey.set(key, { key, name: a.name, truck: a.truck, deliveryId: a.deliveryId, alerts: [a] });
    }
  }
  return Array.from(byKey.values()).map((entry) => {
    // Newest-to-oldest -- `time` alone can't sort correctly (it's a
    // formatted "02:34 PM" string with no date), so this uses the raw
    // `createdAt` instant instead.
    const alerts = [...entry.alerts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    let severity = "Low";
    for (const a of alerts) {
      if (SEVERITY_RANK[a.severity] > SEVERITY_RANK[severity]) severity = a.severity;
    }
    return {
      key: entry.key,
      name: entry.name,
      truck: entry.truck,
      deliveryId: entry.deliveryId,
      // The trip's own summary row shows the most recent alert's own
      // type/time/severity -- all three fields describe that one same
      // alert (2026-09-22, explicit user feedback: the badge showing the
      // trip-wide worst severity next to a *different* alert's type/time
      // read as inconsistent/mismatched -- "the label of the recent alert
      // should be the one labeled not the highest"). `severity` (the worst
      // anywhere in the trip) is kept only for sort order below, so a trip
      // with one dangerous moment still bubbles up even once things calmed
      // down -- it's just no longer shown as the summary row's own badge.
      severity,
      count: alerts.length,
      latestTime: alerts[0]?.time,
      latestSeverity: alerts[0]?.severity,
      alerts,
    };
  });
}

// Two alerts can legitimately land in the same displayed minute -- the Pi
// fires "Eyes Not Detected" once per continuous no-face episode and resets
// the moment a face is seen again for even a single frame (pi/
// drowsiness_monitor.py), so a flickery camera view can produce several
// genuinely distinct alerts a few seconds apart. `a.time` only shows
// hour:minute, which made these look like duplicate/spammed rows (explicit
// user question after a screenshot: "is this a bug? ... alerts like eyes
// not detected which both happened at 2:30"). Not a bug -- confirmed no
// dedup/rate-limiting exists anywhere in the pipeline (alert-upload/
// index.ts inserts whatever the Pi sends) and the Pi's own fire-once-per-
// episode flag only resets on actual face re-detection, so each row is a
// real, separate episode. UI-only fix (explicit user decision, over also
// tightening the Pi's re-trigger logic): show seconds for any alert whose
// displayed minute collides with another alert in the same trip, so they
// read as distinct events instead of an apparent duplicate/glitch. Mirrors
// SupDashboard.jsx's identical panel (same fix applied to both).
function formatAlertTimesWithCollisions(alerts) {
  const countByMinute = new Map();
  for (const a of alerts) countByMinute.set(a.time, (countByMinute.get(a.time) || 0) + 1);
  return alerts.map((a) => ({
    ...a,
    displayTime:
      countByMinute.get(a.time) > 1
        ? new Date(a.createdAt).toLocaleTimeString("en-US", {
            timeZone: MANILA_TIMEZONE,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : a.time,
  }));
}

// A trip's individual alerts, newest-to-oldest, nested under its driver card
// below rather than laid out as another table (2026-09-22 redesign, explicit
// user request: the driver/header row had too much dead horizontal space
// while this list felt cramped and repetitive). Each row is a real
// `grid-cols-4` matching the header row below's own 4 columns exactly --
// (1) a vertical connector line sitting where the header's Driver column
// is, (2) Alert Type, (3) Time, (4) Severity -- per explicit follow-up user
// feedback ("the vertical colored line should be in the first column
// aligned to the driver name and all... align it to their headers"). The
// trailing invisible spacer (matching the header row's `w-20` count
// element, class-for-class) is what actually makes the two grids the same
// width, so the columns land at the same x-position. This per-row structure
// is deliberately kept exactly as-is (explicit user instruction: "the
// structure is already fine, do not change it") -- only the line itself was
// changed to close its per-row gaps, see the inline comment below. Mirrors
// SupDashboard.jsx's identical panel (same fix applied to both).
function AlertTimeline({ alerts }) {
  const withDisplayTimes = formatAlertTimesWithCollisions(alerts);
  return (
    <div>
      {withDisplayTimes.map((a, i) => {
        // A trip (delivery) can span several `sessions` rows -- pause/
        // resume and the Return-Trip leg each open a brand-new session_id
        // under the same delivery (see groupAlertsIntoTrips' own comment).
        // Marks where that happens within the alert history, explicit user
        // request: "is there a way to put an indicator when lets say a trip
        // got resumed or a session opened up." Left column deliberately
        // empty here (no line-drawing cell) -- the connector line visibly
        // pausing at this row is itself part of the indicator, not a
        // rendering gap.
        const isNewSession = i > 0 && a.sessionId !== withDisplayTimes[i - 1].sessionId;
        return (
          <Fragment key={a.id}>
            {isNewSession && (
              <div className="flex items-center gap-4 py-1">
                <div className="grid flex-1 grid-cols-4 items-center gap-4">
                  <div />
                  <div className="col-span-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    New session started
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-4 py-1.5">
              <div className="grid flex-1 grid-cols-4 items-center gap-4">
                {/* Left blank -- the connector line that used to live here
                    was removed per explicit user decision ("nevermind just
                    remove the vertical line and leave that column blank"),
                    after several rounds trying to make it render as one
                    continuous line. Kept as an empty column (not collapsed
                    out of the grid) so Alert Type/Time/Severity below still
                    line up with the header row's own 4 columns. */}
                <div />
                <span className="min-w-0 truncate text-xs text-slate-600">{a.alertType}</span>
                <span className="min-w-0 text-[11px] text-slate-400">{a.displayTime}</span>
                {/* Local pill, not the shared <Badge> -- explicit user
                    request was specific to this list ("remove the circle
                    icon on the picture and center the word on the
                    highlight"), and <Badge> is reused elsewhere on this
                    dashboard (device/trip status, etc.) where the dot is
                    still wanted, so this only changes severity's display
                    here rather than every Badge on the page. */}
                <span
                  className={`flex w-full items-center justify-center rounded px-1.5 py-1 text-[10.5px] font-semibold ${TONE[SEVERITY_TONE[a.severity]].bg} ${TONE[SEVERITY_TONE[a.severity]].text}`}
                >
                  {a.severity}
                </span>
              </div>
              <div className="invisible w-20 shrink-0 text-right text-xs" aria-hidden="true">
                0 alerts
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// One driver/trip's collapsed summary + (when expanded) its alert history --
// a self-contained card rather than a <tr> pair, so the expanded list reads
// as content *inside* this driver's card instead of a visually separate
// table underneath it (2026-09-22 redesign, explicit user request). The
// header row's data fields now sit in a true equal-width `grid-cols-4`
// (Driver, Alert Type, Time, Severity -- Alert Type/Time split into their
// own columns rather than stacked together, so this grid has the same 4
// columns as the expanded AlertTimeline list below and the two visually
// align, per explicit follow-up user feedback: "align it to their
// headers"). The alert count is deliberately kept outside this 4-column
// grid, as a small fixed-width trailing element -- it's a count/action, not
// the same kind of data as the four columns. (AlertTimeline reserves an
// identical invisible spacer for this same element, which is what keeps
// its own grid the same width as this one.) No View Trip link here --
// unlike SupDashboard.jsx's version, there's no /admin/deliveries page to
// send it to.
function DriverSafetyRow({ trip, isExpanded, onToggle }) {
  const isMultiAlert = trip.count > 1;
  return (
    <div
      className={`rounded-lg border transition-colors ${
        isExpanded ? "border-slate-200 bg-slate-50/50" : "border-slate-100"
      }`}
    >
      <div
        className={`flex items-center gap-4 rounded-lg px-2.5 py-2 cursor-pointer ${
          isExpanded ? "" : "hover:bg-slate-50"
        }`}
        onClick={onToggle}
      >
        <div className="grid flex-1 grid-cols-4 items-center gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={trip.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{trip.name}</p>
              <p className="truncate text-[11px] text-slate-500">{trip.truck}</p>
            </div>
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs text-slate-700">{trip.alerts[0]?.alertType}</p>
            {/* Labels this row's data as the latest alert specifically --
                explicit user request, after the header/dropdown split made
                it worth spelling out: "add an indicator that the first row
                is the recent alert." */}
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Most recent</p>
          </div>

          <p className="min-w-0 text-[11px] text-slate-400">{trip.latestTime}</p>

          <div className="min-w-0">
            {/* The latest alert's own severity, matching the Alert
                Type/Time shown alongside it -- reverted 2026-09-22 from
                showing the trip-wide worst severity here (with a "highest
                this trip" caption), per explicit user feedback that the
                badge should describe the same alert its row's other two
                fields already do, not a different aggregate one. The worst
                severity anywhere in the trip is still tracked (`trip.
                severity`) and still drives sort order below -- it's just
                not shown as this badge anymore.
                Same local no-dot/centered/full-width pill as the expanded
                list below, not the shared <Badge> -- explicit follow-up
                user request: "apply the same design to the first row
                should be highlight only too without the circle." */}
            <span
              className={`flex w-full items-center justify-center rounded px-1.5 py-1 text-[10.5px] font-semibold ${TONE[SEVERITY_TONE[trip.latestSeverity]].bg} ${TONE[SEVERITY_TONE[trip.latestSeverity]].text}`}
            >
              {trip.latestSeverity}
            </span>
          </div>
        </div>

        <div className="w-20 shrink-0 text-right text-xs text-slate-500">
          {trip.count} {trip.count === 1 ? "alert" : "alerts"}
          {isMultiAlert && (
            <span className="ml-1 inline-block text-slate-400">{isExpanded ? "▲" : "▼"}</span>
          )}
        </div>
      </div>

      {isExpanded && isMultiAlert && (
        <div className="px-2.5 pb-1">
          {/* `pb-1` only, no top padding -- the gap between the header row
              above and the dropdown's first row read as too big (explicit
              user feedback), so this side is closed up; bottom padding
              stays so the list doesn't hug the card's rounded corner.
              No `border-t` here either (removed 2026-09-22, explicit user
              feedback -- "remove the line of the first row") -- the card's
              own
              rounded border plus the header/list spacing already separate
              the two sections without needing an extra divider line.
              `.slice(1)`, not the full list -- the header row above already
              shows the latest alert (Alert Type/Time), so the dropdown
              continues from the 2nd-most-recent instead of repeating it as
              its own first row. Explicit user feedback: "the purpose of the
              dropdown is to continue the list... if the dropdown is not
              expanded, the alert shown should be the latest." */}
          <AlertTimeline alerts={trip.alerts.slice(1)} />
        </div>
      )}
    </div>
  );
}

// Explains what Low/Medium/High actually mean here -- explicit user
// request ("can we have a clear guide for supervisor on what are these?"),
// since the mapping (06_DROWSINESS_ALERT_PIPELINE.md's four event types ->
// ALERT_SEVERITY above) isn't obvious from the badge alone. Click-to-toggle
// (not hover) so it works the same on any input method, closes on blur
// (clicking/tabbing away) since the popover itself has no interactive
// content to worry about a focus race with. Mirrors SupDashboard.jsx's
// identical panel (same guide added to both, per explicit user decision --
// this dashboard has no /admin/deliveries route to build a ViewAllLink for,
// so the icon renders alone in the action slot instead of alongside one).
function SeverityLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600"
        aria-label="What do these severity levels mean?"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-64 rounded-lg border border-slate-200 bg-white p-3 text-left normal-case tracking-normal text-slate-600 shadow-lg">
          <p className="mb-2 text-xs font-bold text-slate-800">What do these mean?</p>
          <div className="space-y-2 text-[11px] leading-snug">
            {/* Fixed-width badge column (`w-16`, enough for "Medium", the
                widest of the three) instead of each badge sizing to its own
                text -- otherwise "High"/"Low" being narrower than "Medium"
                pushed their descriptions to start at a different x position
                each row, which read as unaligned/non-uniform (explicit user
                feedback from a screenshot). */}
            <div className="flex items-start gap-2">
              <div className="w-16 shrink-0">
                <Badge tone={SEVERITY_TONE.High}>High</Badge>
              </div>
              <p>
                Eyes closed continuously for 3+ seconds, or closed 1.5+ seconds three or more times within 10
                seconds -- reads as a real microsleep.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-16 shrink-0">
                <Badge tone={SEVERITY_TONE.Medium}>Medium</Badge>
              </div>
              <p>Eye closure paired with a yawn within the same 10-second window -- trending toward fatigue.</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-16 shrink-0">
                <Badge tone={SEVERITY_TONE.Low}>Low</Badge>
              </div>
              <p>
                The driver's face/eyes weren't detected for 3+ seconds. Often a false signal (camera angle,
                sunglasses, lighting), not confirmed drowsiness.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DriverSafetyList({ data, isLoading }) {
  const [page, setPage] = useState(1);
  const [expandedTrip, setExpandedTrip] = useState(null);
  const grouped = useMemo(() => groupAlertsIntoTrips(data), [data]);
  const sorted = [...grouped].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.count - a.count
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / DRIVER_SAFETY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * DRIVER_SAFETY_PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + DRIVER_SAFETY_PAGE_SIZE);
  return (
    <Panel title="Driver Safety — Drowsiness Alerts" action={<SeverityLegend />}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">No drowsiness alerts recorded yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {paged.map((trip) => (
              <DriverSafetyRow
                key={trip.key}
                trip={trip}
                isExpanded={expandedTrip === trip.key}
                onToggle={() => setExpandedTrip(expandedTrip === trip.key ? null : trip.key)}
              />
            ))}
          </div>
          <DriverSafetyPaginationBar page={safePage} setPage={setPage} totalPages={totalPages} />
        </>
      )}
    </Panel>
  );
}

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

function AdminDashboard() {
  const [dateRange, setDateRange] = useState("7 Days");
  const { fleetOps, alertFeed, realDriverSafety, isLoading, now, trucks } = useFleetOps();
  const [focusedTruckId, setFocusedTruckId] = useState(null);
  const [focusToken, setFocusToken] = useState(0);
  const handleFocusTruck = (id) => {
    setFocusedTruckId(id);
    setFocusToken((t) => t + 1);
  };

  // Real PMS-overdue count, deep-linking into /admin/trucks pre-filtered to
  // Overdue (AdminTrucks.jsx reads state.pmsFilter the same way
  // SupTrucks.jsx does).
  const pmsOverdueCount = useMemo(
    () => trucks.filter((t) => getPmsStatus(t) === "overdue").length,
    [trucks],
  );

  // KPI strip: all five tiles render as plain, non-interactive tiles for a
  // consistent look -- none of this data has a backing Admin route to link
  // into anyway (no /admin/deliveries or /admin/delivery-crew), and Fleet
  // Available/PMS Overdue used to be the only two that linked into
  // /admin/trucks, which made the row look unbalanced (per the user,
  // 2026-09-17). Use the Trucks nav link or /admin/trucks directly instead.
  const kpis = [
    { label: "Active Deliveries", value: fleetOps.length },
    { label: "Alerts Today", value: alertFeed.length, tone: alertFeed.length > 0 ? "amber" : undefined },
    { label: "High-Risk Drivers", value: realDriverSafety.filter((d) => d.risk === "High Risk").length, tone: "red" },
    { label: "Fleet Available", value: `${trucks.filter((t) => t.status === "Available").length}/${trucks.length}` },
    { label: "PMS Overdue", value: pmsOverdueCount, tone: pmsOverdueCount > 0 ? "red" : undefined },
  ];

  const fleetStatus = {
    available: trucks.filter((t) => t.status === "Available").length,
    onDelivery: trucks.filter((t) => t.status === "Active").length,
    maintenance: trucks.filter((t) => t.status === "Maintenance").length,
    offline: trucks.filter((t) => t.status === "Inactive").length,
  };
  // No Admin crew roster query exists yet (list-crew only returns names, not
  // duty status) -- left as an even split placeholder, same "mock until a
  // real source exists" precedent SupDashboard.jsx used for this exact panel
  // before Phase 8 wired in real trucks/PMS data.
  const crewStatus = { available: 0, onDelivery: 0, offDuty: 0 };

  const recentActivity = alertFeed.slice(0, 5).map((a) => ({
    id: a.id,
    text: `${a.alertType} — ${a.name}${a.truck ? ` (${a.truck})` : ""}`,
    time: a.time,
    tone: SEVERITY_TONE[a.severity] === "red" ? "red" : SEVERITY_TONE[a.severity] === "amber" ? "amber" : "emerald",
  }));

  return (
    <AdminLayout title="Dashboard" background={background} bg="bg-[#F6F7FB]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-700">
              Fleet Operations Overview
            </p>
            <p className="text-xs text-slate-500">Live fleet, delivery &amp; driver-safety status</p>
          </div>
          <nav className="flex items-center gap-2 text-[11px] font-medium text-violet-600">
            <Link to="/admin/trucks" className="hover:underline">Trucks</Link>
          </nav>
        </div>

        {/* Top: KPI summary */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
              data={realDriverSafety.sort((a, b) => b.alerts - a.alerts)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminDashboard;
