import AdminLayout from "../layout/AdminLayout.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, LocateFixed, Loader2, MapPin, Maximize2, Minimize2 } from "lucide-react";
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

// ----- KPI strip. Unlike SupDashboard's StatTile, `to` is optional here --
// several of these tiles have no Admin route to link into (see file header),
// so they render as a plain (non-Link) tile instead of a dead/wrong link. -----
function StatTile({ label, value, to, tone, state }) {
  const toneClass = tone ? `border-l-4 ${TONE[tone].borderL}` : "";
  const body = (
    <>
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-0.5 text-xl font-bold leading-tight text-slate-900">
        {value}
      </span>
    </>
  );
  if (!to) {
    return (
      <div className={`flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 ${toneClass}`}>
        {body}
      </div>
    );
  }
  return (
    <Link
      to={to}
      state={state}
      className={`flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-violet-200 hover:bg-violet-50/40 ${toneClass}`}
    >
      {body}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Constants/helpers -- identical to SupDashboard.jsx's own (08_REALTIME_
// DASHBOARD.md governs both; Admin has the same direct RLS read access).
// ---------------------------------------------------------------------------

const DEVICE_OFFLINE_TIMEOUT_MS = 30_000;
const PAUSED_MOVE_THRESHOLD_M = 100;

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOps();
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
        name: driverNameById[session?.driver_id] || session?.driver_id || "Unknown driver",
        truck: truck?.plate_number || session?.truck_plate || "—",
        alertType: ALERT_TYPE_LABELS[a.event_type] || a.event_type,
        time: new Date(a.created_at).toLocaleTimeString("en-US", { timeZone: MANILA_TIMEZONE, hour: "2-digit", minute: "2-digit" }),
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
              title={`${row.truckPlate} — ${row.driver}`}
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
const DRIVER_SAFETY_PAGE_SIZE = 15;

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

function DriverSafetyList({ data, isLoading }) {
  const [page, setPage] = useState(1);
  const sorted = [...data].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.tripAlerts - a.tripAlerts
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / DRIVER_SAFETY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * DRIVER_SAFETY_PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + DRIVER_SAFETY_PAGE_SIZE);
  return (
    <Panel title="Driver Safety — Drowsiness Alerts">
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">No drowsiness alerts recorded yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400">
                  <th className="pb-1.5 pr-3 font-medium">Driver</th>
                  <th className="pb-1.5 pr-3 font-medium">Alert</th>
                  <th className="pb-1.5 pr-3 font-medium">Time</th>
                  <th className="pb-1.5 pr-3 font-medium">Severity</th>
                  <th className="pb-1.5 pr-3 font-medium">This Trip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((d) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
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

  // KPI strip: PMS Overdue and Fleet Available are real and link into
  // /admin/trucks (the only Admin route this data can point to). The rest
  // have no backing Admin route (no /admin/deliveries or /admin/delivery-crew)
  // so they render as plain, non-interactive tiles -- same real-data-where-
  // possible precedent as SupDashboard.jsx, minus links to pages that don't
  // exist here.
  const kpis = [
    { label: "Active Deliveries", value: fleetOps.length },
    { label: "Alerts Today", value: alertFeed.length, tone: alertFeed.length > 0 ? "amber" : undefined },
    { label: "High-Risk Drivers", value: realDriverSafety.filter((d) => d.risk === "High Risk").length, tone: "red" },
    { label: "Fleet Available", value: `${trucks.filter((t) => t.status === "Available").length}/${trucks.length}`, to: "/admin/trucks" },
    {
      label: "PMS Overdue",
      value: pmsOverdueCount,
      to: "/admin/trucks",
      tone: pmsOverdueCount > 0 ? "red" : undefined,
      state: { pmsFilter: "overdue" },
    },
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
    text: `${a.alertType} — ${a.name} (${a.truck})`,
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
