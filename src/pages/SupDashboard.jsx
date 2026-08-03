import SupLayout from "../layout/SupLayout.jsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import DateRangeFilter from "../components/DateRangeFilter.jsx";

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
function StatTile({ label, value, to, tone }) {
  return (
    <Link
      to={to}
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

// ----- Active deliveries (live ops) -----
const DELIVERY_STATUS_TONE = {
  FOR_PICKUP: { label: "For Pickup", tone: "sky" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", tone: "blue" },
  DELIVERED: { label: "Delivered", tone: "emerald" },
};

function ActiveDeliveries({ data }) {
  return (
    <Panel title="Active Deliveries" action={<ViewAllLink to="/supervisor/deliveries" />}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400">
              <th className="pb-1.5 pr-2 font-medium">Driver</th>
              <th className="pb-1.5 pr-2 font-medium">Truck</th>
              <th className="pb-1.5 pr-2 font-medium">Client</th>
              <th className="pb-1.5 pr-2 font-medium">Status</th>
              <th className="pb-1.5 font-medium">ETA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row) => {
              const status = DELIVERY_STATUS_TONE[row.status];
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="py-1.5 pr-2 font-medium text-slate-800">{row.driver}</td>
                  <td className="py-1.5 pr-2 text-slate-600">{row.truck}</td>
                  <td className="py-1.5 pr-2 text-slate-600">{row.client}</td>
                  <td className="py-1.5 pr-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td className="py-1.5 text-slate-600">{row.eta}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ----- Live fleet: trucks + crew status, one compact panel -----
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

// ----- Driver safety: drowsiness priority list (replaces the old chart) -----
const SEVERITY_RANK = { High: 3, Medium: 2, Low: 1 };
const SEVERITY_TONE = { High: "red", Medium: "amber", Low: "emerald" };

function DriverSafetyList({ data }) {
  const sorted = [...data].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.tripAlerts - a.tripAlerts
  );
  return (
    <Panel title="Driver Safety — Drowsiness Alerts" action={<ViewAllLink to="/supervisor/deliveries" />}>
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
                    to="/supervisor/deliveries"
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

  // ----- KPI strip: doubles as the "needs attention" summary — each tile
  // routes to the page that resolves it, so there's no separate task list. -----
  const kpis = [
    { label: "Active Deliveries", value: 18, to: "/supervisor/deliveries" },
    { label: "Pending Assignments", value: 5, to: "/supervisor/deliveries", tone: "amber" },
    { label: "Requests Inbox", value: 9, to: "/supervisor/deliveries" },
    { label: "Alerts Today", value: 14, to: "/supervisor/deliveries", tone: "amber" },
    { label: "High-Risk Drivers", value: 3, to: "/supervisor/delivery-crew", tone: "red" },
    { label: "Fleet Available", value: "22/48", to: "/supervisor/trucks" },
  ];

  // ----- Live/current-state mock data (not tied to the date-range filter) -----
  const liveDeliveries = [
    { id: 1, driver: "J. Doe", truck: "TR-12", client: "SM Supply Co.", status: "OUT_FOR_DELIVERY", eta: "12 min" },
    { id: 2, driver: "M. Lee", truck: "TR-27", client: "Ortigas Retail", status: "FOR_PICKUP", eta: "28 min" },
    { id: 3, driver: "A. Smith", truck: "TR-33", client: "Pasig Logistics", status: "OUT_FOR_DELIVERY", eta: "9 min" },
    { id: 4, driver: "S. Park", truck: "TR-45", client: "Shaw Traders", status: "DELIVERED", eta: "Arrived" },
    { id: 5, driver: "M. Tan", truck: "TR-19", client: "C5 Distribution", status: "FOR_PICKUP", eta: "41 min" },
  ];

  const driverSafety = [
    { id: 1, name: "J. Doe", truck: "TR-12", alertType: "Prolonged Eye Closure", time: "10:12", severity: "High", tripAlerts: 4 },
    { id: 2, name: "A. Smith", truck: "TR-33", alertType: "Eye Closure + Yawn", time: "09:48", severity: "Medium", tripAlerts: 2 },
    { id: 3, name: "M. Tan", truck: "TR-19", alertType: "Repeated Eye Closure", time: "09:10", severity: "Medium", tripAlerts: 2 },
    { id: 4, name: "S. Park", truck: "TR-45", alertType: "Eye Closure + Yawn", time: "08:22", severity: "Low", tripAlerts: 1 },
    { id: 5, name: "M. Lee", truck: "TR-27", alertType: "No alerts this trip", time: "—", severity: "Low", tripAlerts: 0 },
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

  // ----- Historical rollup, keyed by date range -----
  const topRiskDriversByRange = {
    Today: [{ name: "J. Doe", alerts: 10, risk: "High Risk" }],
    "7 Days": [
      { name: "J. Doe", alerts: 10, risk: "High Risk" },
      { name: "M. Lee", alerts: 8, risk: "High Risk" },
      { name: "A. Smith", alerts: 6, risk: "Moderate" },
    ],
    "30 Days": [
      { name: "J. Doe", alerts: 30, risk: "High Risk" },
      { name: "M. Lee", alerts: 25, risk: "High Risk" },
      { name: "A. Smith", alerts: 22, risk: "Moderate" },
    ],
  };
  const topRiskDrivers = topRiskDriversByRange[dateRange];

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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ActiveDeliveries data={liveDeliveries} />
          </div>
          <div className="lg:col-span-4">
            <LiveFleet trucks={fleetStatus} crew={crewStatus} />
          </div>
        </div>
        <DriverSafetyList data={driverSafety} />

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
