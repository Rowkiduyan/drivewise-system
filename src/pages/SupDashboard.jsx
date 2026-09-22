import SupLayout from "../layout/SupLayout.jsx";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, Info, LocateFixed, Loader2, MapPin, Maximize2, Minimize2 } from "lucide-react";
import { GoogleMap, Marker as GoogleMapMarker, useJsApiLoader } from "@react-google-maps/api";
import DateRangeFilter from "../components/DateRangeFilter.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../lib/googleMapsLoaderOptions.js";
import { MANILA_TIMEZONE, manilaTodayISO } from "../lib/manilaTime.js";
import { addMaintenanceBaselines } from "../components/trucks/utils/pms.js";
import { CREW_ACTIVE_STATUSES } from "../lib/crewStatus.js";
import CriticalAlertPopup from "../components/CriticalAlertPopup.jsx";

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

// Phone-GPS broadcast freshness window (2026-09-03) — a phone position older
// than this falls back to the Pi's gps_logs-sourced position instead, same
// "don't freeze on a stale reading" reasoning DriverDeliveries.jsx's own
// phone/Pi fallback uses. Generous relative to the phone's ~2s watchPosition
// cadence — covers ordinary network/broadcast latency, not meant to be tight.
const PHONE_POSITION_STALE_MS = 20_000;

// "Very High Possibility of Route Deviation" critical-alert threshold
// (decided with the user 2026-09-02). Deliberately looser than
// DriverDeliveries.jsx's own NAV_REROUTE_TOLERANCE_DEGREES (~100m, tuned to
// eagerly recompute the driver's own turn-by-turn route) -- this is a
// Supervisor-facing popup+sound, not a routing decision, so it should only
// fire for a genuinely significant deviation, not ordinary GPS noise/a
// missed turn the driver is already correcting. ~500m at this app's
// operating latitude (same degrees-per-meter reasoning as
// NAV_REROUTE_TOLERANCE_DEGREES's own comment). Not yet tuned against real
// drift data, same caveat as PAUSED_MOVE_THRESHOLD_M above.
const SUP_ROUTE_DEVIATION_TOLERANCE_DEGREES = 0.0045;

// A delivery whose milestone status is past ASSIGNED but not yet DELIVERED —
// the window in which a Trip (Session) can be Active or Paused.
const IN_PROGRESS_STATUSES = ["OUT_FOR_PICKUP", "ARRIVED_PICKUP", "OUT_FOR_DROPOFF", "ARRIVED_DROPOFF"];

// Mirrors SupDeliveries.jsx's own pendingAssignments/inboxRows status groups
// (its Assign Vehicle and Inbox tabs) so the KPI strip's counts agree with
// what those tabs actually show.
const PENDING_ASSIGNMENT_STATUSES = ["APPROVED", "ASSIGNED"];
const REQUESTS_INBOX_STATUSES = [
  "PENDING_REQUEST",
  "QUOTATION_SUBMITTED",
  "COUNTER_OFFER_SUBMITTED",
  "FINAL_QUOTATION_SUBMITTED",
];

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
  // Full crew roster (record_id/role/deactivated_at), not just the
  // name-only map above -- added 2026-09-22 to back the Live Fleet panel's
  // real crew status breakdown (Available/On Delivery/Off Duty), explicit
  // user request ("why is this 0? ... would that be buggy? if not do it").
  const [crewRoster, setCrewRoster] = useState([]);
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  // Delivery rows a crew member is actively committed to right now --
  // same CREW_ACTIVE_STATUSES list (and same bug this list was originally
  // fixed for, 2026-09-09: 'OUT_FOR_DELIVERY' is a UI-only label, never a
  // real status, and 'ARRIVED_DROPOFF' was previously missing) that
  // SupDeliveryCrew.jsx/SupCrewProfile.jsx/SupDeliveries.jsx already use for
  // crew availability, reused here rather than re-deriving a second,
  // possibly-inconsistent status list. Deliberately a separate query from
  // `deliveries` above (IN_PROGRESS_STATUSES) -- that list is missing
  // 'ASSIGNED', which is a real crew commitment (assigned but not yet
  // started) even though the truck hasn't rolled yet.
  const [crewActiveDeliveries, setCrewActiveDeliveries] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [pendingAssignmentsCount, setPendingAssignmentsCount] = useState(0);
  const [requestsInboxCount, setRequestsInboxCount] = useState(0);
  const [positionsByDeliveryId, setPositionsByDeliveryId] = useState({});
  const [movementByDeliveryId, setMovementByDeliveryId] = useState({});
  // Phone-GPS live view (2026-09-03, user request: easier to demo/track
  // during testing/panel presentations without needing real Pi hardware in
  // the room). Ephemeral Realtime broadcast only, per delivery -- see
  // DriverDeliveries.jsx's phoneBroadcastChannelRef for the sender side.
  // Never touches gps_logs/mileage/Route Comparison; purely an optional,
  // fresher position preferred over positionsByDeliveryId (the Pi's
  // gps_logs feed) when recent, falling back to it otherwise -- same
  // fallback shape the Driver's own LiveNavigationMap already uses.
  const [phonePositionsByDeliveryId, setPhonePositionsByDeliveryId] = useState({});
  const phoneChannelsRef = useRef({});
  const [isLoading, setIsLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Critical-alert popup queue (Very High Risk of Drowsiness / Very High
  // Possibility of Route Deviation) -- see the two INSERT handlers below.
  // Keyed by a stable string so the same underlying event can't be queued
  // twice (e.g. a second gps_logs tick landing before the first popup is
  // dismissed).
  const [criticalAlerts, setCriticalAlerts] = useState([]);
  const pushCriticalAlert = useCallback((alert) => {
    setCriticalAlerts((prev) =>
      prev.some((a) => a.key === alert.key) ? prev : [...prev, alert],
    );
  }, []);
  const dismissCriticalAlert = useCallback((key) => {
    setCriticalAlerts((prev) => prev.filter((a) => a.key !== key));
  }, []);
  // sessions/deliveries kept in refs too -- the two Realtime subscriptions
  // below (empty dep arrays, same reasoning as positionsRef above) need a
  // way to read current session->delivery/driver/client info without
  // resubscribing on every sessions/deliveries change.
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  const deliveriesRef = useRef(deliveries);
  useEffect(() => {
    deliveriesRef.current = deliveries;
  }, [deliveries]);
  // One-shot per Session -- a truck that stays off-route keeps generating
  // gps_logs ticks that would each independently re-trigger the check
  // otherwise; only the first crossing per Session should pop up.
  const deviationAlertedSessionIdsRef = useRef(new Set());

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
      const [{ data: crewData }, { data: clientsData }, { data: trucksData }, { data: maintenanceRecords }] = await Promise.all([
        supabase.functions.invoke("admin-users", { body: { action: "list-crew" } }),
        supabase.functions.invoke("admin-users", { body: { action: "list-clients" } }),
        supabase.from("trucks").select("*"),
        // Same baseline correction SupTrucks.jsx applies -- without it, a
        // truck's raw previous_mileage/previous_maintenance_date columns go
        // stale as soon as a newer completed maintenance_records row exists
        // for it, and this KPI tile silently disagrees with the Trucks page
        // (a truck just serviced still reads as Overdue here).
        supabase.from("maintenance_records").select("truck_id, status, mileage_at_service, start_date, end_date"),
      ]);
      if (!isMounted) return;
      const names = {};
      for (const m of crewData?.crew || []) {
        if (!m.record_id) continue;
        names[m.record_id.trim()] = [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(" ").trim();
      }
      setDriverNameById(names);
      setCrewRoster(crewData?.crew || []);
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

  // devices/sessions/delivery_requests — the three tables whose changes
  // actually move Device/Trip state. Reloaded together on any change to any
  // of the three, same "just refetch" pattern SupDeliveries.jsx already uses
  // for its own delivery_requests subscription.
  const loadOps = useCallback(async () => {
    const [
      { data: devicesData },
      { data: sessionsData },
      { data: deliveriesData },
      { count: pendingAssignments },
      { count: requestsInbox },
      { data: crewActiveDeliveriesData },
    ] = await Promise.all([
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
      // KPI-strip-only counts (head:true, no rows) -- kept separate from the
      // `deliveries` state above since fleetOps only wants IN_PROGRESS_STATUSES
      // rows and widening that query would drag unrelated rows through the
      // whole live-ops pipeline (positions/movement/realtime GPS matching).
      supabase.from("delivery_requests").select("id", { count: "exact", head: true }).in("status", PENDING_ASSIGNMENT_STATUSES),
      supabase.from("delivery_requests").select("id", { count: "exact", head: true }).in("status", REQUESTS_INBOX_STATUSES),
      // Backs the Live Fleet panel's crew status breakdown -- see
      // crewActiveDeliveries' own state comment above for why this is a
      // separate query/status list from `deliveries`/IN_PROGRESS_STATUSES.
      supabase.from("delivery_requests").select("status, assigned_driver_id, assigned_helper_ids, pickup_date").in("status", CREW_ACTIVE_STATUSES),
    ]);
    setDevices(devicesData || []);
    setSessions(sessionsData || []);
    setDeliveries(deliveriesData || []);
    setPendingAssignmentsCount(pendingAssignments || 0);
    setRequestsInboxCount(requestsInbox || 0);
    setCrewActiveDeliveries(crewActiveDeliveriesData || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Seed-fetch on mount, same external-system-sync shape already accepted
    // elsewhere in this codebase (DriverDeliveries.jsx/HelperDeliveries.jsx)
    // — not a derived-state anti-pattern.
    Promise.resolve().then(() => {
      loadOps();
    });
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, async (payload) => {
        setRecentAlerts((prev) => [payload.new, ...prev].slice(0, 50));

        // Very High Risk of Drowsiness (decided with the user 2026-09-02):
        // fires once a Session accumulates 5 alerts, excluding
        // face_not_detected (a detection/camera issue, not a drowsiness
        // event itself) -- not a rolling time window, a plain cumulative
        // count for that Session. Queried directly against the DB rather
        // than counted off recentAlerts, since that feed is capped at 50
        // alerts app-wide and could undercount a session whose earlier
        // alerts got pushed out by other trucks' alerts in between.
        const row = payload.new;
        if (row.event_type === "face_not_detected" || !row.session_id) return;
        const { count } = await supabase
          .from("alerts")
          .select("id", { count: "exact", head: true })
          .eq("session_id", row.session_id)
          .neq("event_type", "face_not_detected");
        if (count !== 5) return;

        const session = sessionsRef.current.find((s) => s.session_id === row.session_id);
        const delivery = session
          ? deliveriesRef.current.find((d) => d.id === session.delivery_request_id)
          : null;
        if (!delivery) return;
        pushCriticalAlert({
          key: `drowsiness-${row.session_id}`,
          type: "drowsiness",
          title: "Very High Risk of Drowsiness",
          message: `${delivery.assigned_truck_plate || "A truck"} (${delivery.id}) has logged 5 drowsiness alerts this trip.`,
          deliveryId: delivery.id,
          createdAt: row.created_at,
        });
      })
      .subscribe();
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [pushCriticalAlert]);

  // Phone-GPS broadcast subscriptions: one Realtime channel per in-progress
  // delivery (`phone-gps-<deliveryId>`, matching DriverDeliveries.jsx's
  // sender), joined/left as the deliveries list itself changes. Deliberately
  // separate from the gps_logs seeding/subscription effect below -- this is
  // an additive, optional live-view feed, not a replacement for it.
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

  // Unmount-only cleanup for whatever's left in phoneChannelsRef -- the
  // effect above only tears down channels for deliveries that *left* the
  // list on a `deliveries` change, it doesn't run a cleanup on every
  // re-render (that would thrash-resubscribe every still-in-progress
  // delivery's channel on every unrelated `deliveries` update).
  useEffect(() => {
    return () => {
      for (const channel of Object.values(phoneChannelsRef.current)) {
        supabase.removeChannel(channel);
      }
      phoneChannelsRef.current = {};
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

        // Very High Possibility of Route Deviation (decided with the user
        // 2026-09-02): only checked while a Session is actually open
        // (row.session_id set -- an active trip in progress, not a
        // Paused-trip anti-theft reading), and only against a delivery that
        // actually has a saved suggested_route to compare against (nothing
        // to deviate from otherwise -- see 01_SYSTEM_ARCHITECTURE.md's
        // "suggested route is never persisted" gap note, still open for
        // some deliveries). Silently skipped if the Maps JS geometry
        // library (loaded by LiveFleetMap's own useJsApiLoader elsewhere on
        // this same page) hasn't finished loading yet.
        if (
          row.session_id &&
          !deviationAlertedSessionIdsRef.current.has(row.session_id) &&
          window.google?.maps?.geometry
        ) {
          const delivery = deliveriesRef.current.find((d) => d.id === deliveryId);
          const suggestedRoute = Array.isArray(delivery?.suggested_route) ? delivery.suggested_route : null;
          const routePoints = suggestedRoute?.flatMap((leg) => leg.path || []) || [];
          if (routePoints.length >= 2) {
            const routePolyline = new window.google.maps.Polyline({
              path: routePoints.map(([lat, lng]) => ({ lat, lng })),
            });
            const onRoute = window.google.maps.geometry.poly.isLocationOnEdge(
              new window.google.maps.LatLng(row.latitude, row.longitude),
              routePolyline,
              SUP_ROUTE_DEVIATION_TOLERANCE_DEGREES,
            );
            if (!onRoute) {
              deviationAlertedSessionIdsRef.current.add(row.session_id);
              pushCriticalAlert({
                key: `deviation-${row.session_id}`,
                type: "deviation",
                title: "Very High Possibility of Route Deviation",
                message: `${delivery.assigned_truck_plate || "A truck"} (${delivery.id}) has moved significantly off its planned route.`,
                deliveryId: delivery.id,
                createdAt: row.created_at,
              });
            }
          }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pushCriticalAlert]);

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
          truckPlate: d.assigned_truck_plate || "",
          truckLabel: truck ? `${truck.brand} ${truck.model}` : "",
          client: clientNameById[d.customer_auth_id] || "Client",
          milestone: d.status,
          tripState: state.tripState,
          deviceState: state.deviceState,
          lastHeartbeat: device?.last_ping || null,
          // Phone GPS preferred when a broadcast has arrived recently,
          // falling back to the Pi's gps_logs-sourced position otherwise --
          // display only. movementMeters/isAnomalous below stay gps_logs-only
          // (the paused-but-moving anti-theft check is keyed on the Pi's own
          // session_id-is-null marker, which a phone broadcast has no
          // equivalent for and shouldn't be blended into).
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

  // ----- Derived: Latest Alerts feed, joined to driver/truck via the
  // session cache already loaded above. -----
  const alertFeed = useMemo(() => {
    const sessionById = new Map(sessions.map((s) => [s.session_id, s]));
    // Running per-session tally, computed oldest-first, so each alert shows
    // the count *as of that alert* (12, 13, 14, ...) instead of the final
    // total repeated identically across every row of the session.
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

  return {
    fleetOps,
    alertFeed,
    realDriverSafety,
    isLoading,
    now: nowTick,
    trucks,
    crewRoster,
    crewActiveDeliveries,
    criticalAlerts,
    dismissCriticalAlert,
    pendingAssignmentsCount,
    requestsInboxCount,
  };
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
              title={`${row.truckPlate ? `${row.truckPlate} — ` : ""}${row.driver} (${row.positionSource === "phone" ? "Phone GPS" : "Pi GPS"})`}
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

// Groups the flat alertFeed (one row per alert) into one entry per trip
// (delivery) -- fixes the confusing repeat-the-same-driver-N-times list this
// table used to render, one row per individual alert (2026-09-22, explicit
// user request from a screenshot). Falls back to `sessionId`, then the
// alert's own `id`, as the grouping key whenever `deliveryId` is missing, so
// a legacy/malformed alert with no delivery link still gets its own
// single-alert "trip" row instead of being silently dropped or merged into
// the wrong group.
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
// specific trip" (the user's own phrase from the original request) wasn't
// supposed to mean.
function groupAlertsIntoTrips(alerts) {
  const byKey = new Map();
  for (const a of alerts) {
    const key = a.deliveryId || a.sessionId || a.id;
    const entry = byKey.get(key);
    if (entry) {
      entry.alerts.push(a);
    } else {
      byKey.set(key, {
        key,
        name: a.name,
        truck: a.truck,
        deliveryId: a.deliveryId,
        alerts: [a],
      });
    }
  }
  return Array.from(byKey.values()).map((entry) => {
    // Newest-to-oldest, per explicit user request -- `time` alone can't
    // sort correctly (it's a formatted "02:34 PM" string with no date), so
    // this uses the raw `createdAt` instant instead.
    const alerts = [...entry.alerts].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
    let severity = "Low";
    for (const a of alerts) {
      if (SEVERITY_RANK[a.severity] > SEVERITY_RANK[severity]) severity = a.severity;
    }
    return {
      ...entry,
      alerts,
      totalAlerts: alerts.length,
      // The trip's own summary row shows the most recent alert's own
      // type/time/severity -- all three fields describe that one same
      // alert (2026-09-22, explicit user feedback: the badge showing the
      // trip-wide worst severity next to a *different* alert's type/time
      // read as inconsistent/mismatched -- "the label of the recent alert
      // should be the one labeled not the highest"). `severity` (the worst
      // anywhere in the trip) is kept only for sort order below, so a trip
      // with one dangerous moment still bubbles up even once things calmed
      // down -- it's just no longer shown as the summary row's own badge.
      latestAlertType: alerts[0].alertType,
      latestTime: alerts[0].time,
      latestSeverity: alerts[0].severity,
      severity,
    };
  });
}
const DRIVER_SAFETY_PAGE_SIZE = 15;

// Same page-nav format as SupTrucks.jsx's PaginationBar, just with lighter
// px/py so it fits Panel's own padding instead of assuming an edge-to-edge
// card of its own.
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
// read as distinct events instead of an apparent duplicate/glitch.
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
// trailing invisible spacer (matching the header row's count/View Trip
// action cluster, class-for-class) is what actually makes the two grids the
// same width, so the columns land at the same x-position -- without it, the
// header's flex-1 grid and this row's own full-width grid would divide
// their 4 columns differently. This per-row structure is deliberately kept
// exactly as-is (explicit user instruction: "the structure is already fine,
// do not change it") -- only the line itself was changed to close its
// per-row gaps, see the inline comment below.
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
              <div className="invisible flex shrink-0 items-center gap-3" aria-hidden="true">
                <div className="w-20">0 alerts</div>
                <span className="shrink-0 whitespace-nowrap rounded-md border border-blue-100 px-2.5 py-1 text-[11px] font-semibold">
                  View Trip
                </span>
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
// headers"). Alerts count and View Trip are deliberately kept outside this
// 4-column grid, as a small fixed-width action cluster -- they're
// actions/counts, not the same kind of data as the four columns, and
// forcing them into a 5th/6th equal column would just waste width on a
// short "3 alerts" label and a button. (AlertTimeline reserves an identical
// invisible spacer for this same cluster, which is what keeps its own grid
// the same width as this one.)
function DriverSafetyRow({ trip, isExpanded, onToggle }) {
  const isMultiAlert = trip.totalAlerts > 1;
  return (
    <div
      className={`rounded-lg border transition-colors ${
        isExpanded ? "border-slate-200 bg-slate-50/50" : "border-slate-100"
      }`}
    >
      <div
        className={`flex items-center gap-4 rounded-lg px-2.5 py-2 ${isMultiAlert ? "cursor-pointer" : ""} ${
          isExpanded ? "" : "hover:bg-slate-50"
        }`}
        onClick={isMultiAlert ? onToggle : undefined}
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
            <p className="truncate text-xs text-slate-700">{trip.latestAlertType}</p>
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

        <div className="flex shrink-0 items-center gap-3">
          <div className="w-20">
            {isMultiAlert ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                {trip.totalAlerts} alerts
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            ) : (
              <span className="text-xs text-slate-400">{trip.totalAlerts} alert</span>
            )}
          </div>

          <Link
            to={trip.deliveryId ? `/supervisor/deliveries?deliveryId=${trip.deliveryId}` : "/supervisor/deliveries"}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 whitespace-nowrap rounded-md border border-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
          >
            View Trip
          </Link>
        </div>
      </div>

      {isExpanded && (
        <div className="px-2.5 pb-1">
          {/* `pb-1` only, no top padding -- the gap between the header row
              above and the dropdown's first row read as too big (explicit
              user feedback), so this side is closed up; bottom padding
              stays so the list doesn't hug the card's rounded corner.
              No `border-t` here either (removed 2026-09-22, explicit user
              feedback -- "remove the line of the first row") -- the card's
              own rounded border plus the header/list spacing already
              separate the two sections without needing an extra divider
              line.
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
// content to worry about a focus race with. Mirrors AdminDashboard.jsx's
// identical panel (same guide added to both, per explicit user decision).
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
  // Which trip rows are expanded, showing their individual alerts -- a Set
  // (not a single "open index") so more than one trip can be expanded at
  // once, keyed by the trip's own grouping key (see groupAlertsIntoTrips).
  const [expandedTrips, setExpandedTrips] = useState(() => new Set());
  const toggleTrip = (key) => {
    setExpandedTrips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const trips = useMemo(() => groupAlertsIntoTrips(data), [data]);
  const sorted = [...trips].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.totalAlerts - a.totalAlerts
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / DRIVER_SAFETY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * DRIVER_SAFETY_PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + DRIVER_SAFETY_PAGE_SIZE);
  return (
    <Panel
      title="Driver Safety — Drowsiness Alerts"
      action={
        <div className="flex items-center gap-2">
          <SeverityLegend />
          <ViewAllLink to="/supervisor/deliveries" />
        </div>
      }
    >
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
                isExpanded={trip.totalAlerts > 1 && expandedTrips.has(trip.key)}
                onToggle={() => toggleTrip(trip.key)}
              />
            ))}
          </div>
          <DriverSafetyPaginationBar page={safePage} setPage={setPage} totalPages={totalPages} />
        </>
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
  const {
    fleetOps,
    alertFeed,
    realDriverSafety,
    isLoading,
    now,
    trucks,
    crewRoster,
    crewActiveDeliveries,
    criticalAlerts,
    dismissCriticalAlert,
    pendingAssignmentsCount,
    requestsInboxCount,
  } = useFleetOps();
  const [focusedTruckId, setFocusedTruckId] = useState(null);
  const [focusToken, setFocusToken] = useState(0);
  const handleFocusTruck = (id) => {
    setFocusedTruckId(id);
    setFocusToken((t) => t + 1);
  };

  const highRiskDriverCount = useMemo(
    () => realDriverSafety.filter((d) => d.risk === "High Risk").length,
    [realDriverSafety],
  );

  // ----- KPI strip: doubles as the "needs attention" summary — each tile
  // routes to the page that resolves it, so there's no separate task list.
  // All real (2026-09-17): Active Deliveries/High-Risk Drivers come from
  // useFleetOps' live queries above (same shape as AdminDashboard.jsx's own
  // KPI strip); Pending Assignments/Requests Inbox mirror SupDeliveries.jsx's
  // own status groups for its Assign Vehicle/Inbox tabs so these counts
  // agree with what those tabs show; Alerts Today reuses alertFeed.length,
  // same "last 50 alerts" feed AdminDashboard.jsx's own Alerts Today tile
  // counts off. Fleet Available/PMS Overdue tiles removed 2026-09-22
  // (explicit user request) -- `trucks` is still used below for the Live
  // Fleet panel's real truck-status breakdown. -----
  const kpis = [
    { label: "Active Deliveries", value: fleetOps.length, to: "/supervisor/deliveries" },
    {
      label: "Pending Assignments",
      value: pendingAssignmentsCount,
      to: "/supervisor/deliveries",
      tone: pendingAssignmentsCount > 0 ? "amber" : undefined,
    },
    { label: "Requests Inbox", value: requestsInboxCount, to: "/supervisor/deliveries" },
    { label: "Alerts Today", value: alertFeed.length, to: "/supervisor/deliveries", tone: alertFeed.length > 0 ? "amber" : undefined },
    { label: "High-Risk Drivers", value: highRiskDriverCount, to: "/supervisor/delivery-crew", tone: "red" },
  ];

  // Truck segments are real, computed from the same live `trucks` query the
  // KPI strip above uses -- fixed 2026-09-22 (explicit user request: "make
  // sure it's getting the right data from the database"), previously
  // hardcoded literal numbers with no query behind them at all. Status
  // values/categorization mirror AdminDashboard.jsx's own (already-correct)
  // Live Fleet panel, kept in sync between the two rather than diverging.
  const fleetStatus = {
    available: trucks.filter((t) => t.status === "Available").length,
    onDelivery: trucks.filter((t) => t.status === "Active").length,
    maintenance: trucks.filter((t) => t.status === "Maintenance").length,
    offline: trucks.filter((t) => t.status === "Inactive").length,
  };
  // Crew segments, now real (2026-09-22, explicit user request: "why is
  // this 0? ... would that be buggy? if not do it") -- replaces the earlier
  // { 0, 0, 0 } placeholder. Off Duty = the account is deactivated
  // (`users.deactivated_at`, returned on each crew member by `list-crew`);
  // among the rest, On Delivery = their `record_id` is the assigned driver
  // or one of the assigned helpers on a delivery that's EITHER (a)
  // currently in progress (IN_PROGRESS_STATUSES -- they're literally on the
  // trip right now, regardless of what its dates say -- a delayed trip
  // running past its own dropoff_date still counts, since the crew member
  // is still genuinely out on it) OR (b) `ASSIGNED` with a `pickup_date` of
  // today (committed to start today, even though they haven't left yet).
  // Corrected same day from an earlier, wrong version that applied a single
  // pickup_date<=today<=dropoff_date range check uniformly to every
  // CREW_ACTIVE_STATUSES row -- explicit user correction: "count drivers
  // helpers that are currently on the trip and also count the drivers and
  // helpers that are assigned to a trip today" (two distinct conditions,
  // not one blended date range). Everyone else is Available. Mirrors
  // SupDeliveryCrew.jsx's/SupCrewProfile.jsx's own crew-availability logic
  // (same CREW_ACTIVE_STATUSES import) rather than re-deriving a second,
  // possibly-diverging status list -- that list's own history
  // (09_EDGE_CASES.md's 2026-09-09 fix) is exactly why it's imported, not
  // retyped.
  const today = manilaTodayISO();
  const crewBusyRecordIds = new Set();
  for (const d of crewActiveDeliveries) {
    const currentlyOnTrip = IN_PROGRESS_STATUSES.includes(d.status);
    const assignedToday = d.status === "ASSIGNED" && d.pickup_date === today;
    if (!currentlyOnTrip && !assignedToday) continue;
    if (d.assigned_driver_id) crewBusyRecordIds.add(d.assigned_driver_id);
    for (const helperId of d.assigned_helper_ids || []) crewBusyRecordIds.add(helperId);
  }
  const crewStatus = crewRoster.reduce(
    (acc, member) => {
      if (member.deactivated_at) acc.offDuty += 1;
      else if (member.record_id && crewBusyRecordIds.has(member.record_id)) acc.onDelivery += 1;
      else acc.available += 1;
      return acc;
    },
    { available: 0, onDelivery: 0, offDuty: 0 },
  );

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
      <CriticalAlertPopup
        alerts={criticalAlerts}
        onDismiss={dismissCriticalAlert}
      />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        {/* Header row -- the "Assign Vehicles" button and Deliveries/Crew/
            Trucks quick-links row that used to sit here were removed
            2026-09-22, explicit user request. */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-blue-700">
            Operations Overview
          </p>
          <p className="text-xs text-slate-500">Live fleet, delivery &amp; driver-safety status</p>
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
