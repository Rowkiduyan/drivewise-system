import SupLayout from "../layout/SupLayout.jsx";
import { useState } from "react";
import DateRangeFilter from "../components/DateRangeFilter.jsx";
// Recharts for data visualisation
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
// React‑Leaflet for live fleet map
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const background = null;

function KPIHero({ items }) {
  // Compact grid: tighter gaps, uniform card height
  return (
    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.title}
          className="flex items-center gap-3 rounded-lg bg-white p-3 shadow h-full"
        >
          <div className={`h-12 w-2 rounded-full ${it.color}`} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600">{it.title}</p>
              <p
                className={`text-sm font-semibold ${it.delta >= 0 ? "text-green-600" : "text-red-500"}`}
              >
                {it.delta >= 0 ? `▲ ${it.delta}%` : `▼ ${Math.abs(it.delta)}%`}
              </p>
            </div>
            <p className="mt-1 text-xl font-bold text-slate-900">{it.value}</p>
            {it.meta && (
              <p className="text-xs text-slate-500 mt-1">{it.meta}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/*** New widget components ***/

// 2.1 Live alert stream widget
function AlertStream({ data }) {
  return (
    <SummaryCard title="Live Drowsiness Alert Stream">
      <ul className="space-y-2 max-h-48 overflow-y-auto">
        {data.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between p-2 rounded hover:bg-slate-50"
          >
            <div className="flex-1">
              <p className="text-sm font-medium">{a.driver}</p>
              <p className="text-xs text-slate-500">
                {a.type} • {a.time}
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${a.severity === "high" ? "bg-red-200 text-red-800" : a.severity === "medium" ? "bg-amber-200 text-amber-800" : "bg-emerald-200 text-emerald-800"}`}
            >
              {a.severity.charAt(0).toUpperCase() + a.severity.slice(1)}
            </span>
            <button className="ml-2 text-xs font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-800 hover:bg-slate-300">
              Acknowledge
            </button>
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}

// 2.2 Drowsiness trend chart widget
function DrowsinessTrend({ data }) {
  return (
    <SummaryCard title="Drowsiness Trend (Last 7 days)">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <XAxis dataKey="day" stroke="var(--tw-text-slate-600)" />
          <YAxis stroke="var(--tw-text-slate-600)" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="alerts"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </SummaryCard>
  );
}

// 2.3 Top high‑risk drivers widget
function TopRiskDrivers({ data }) {
  return (
    <SummaryCard title="Top High‑Risk Drivers">
      <ol className="list-decimal list-inside space-y-2">
        {data.map((d, idx) => (
          <li key={d.name} className="flex items-center justify-between">
            <span className="text-sm">
              {idx + 1}. {d.name}
            </span>
            <span className="font-semibold text-slate-800">{d.alerts}</span>
          </li>
        ))}
      </ol>
    </SummaryCard>
  );
}

// 3.1 Vehicle status bar widget
function VehicleStatusBar({ data }) {
  const total = data.available + data.inTransit + data.maintenance;
  const percent = (count) => ((count / total) * 100).toFixed(1);
  return (
    <SummaryCard title="Vehicle Availability Summary">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span>Available</span>
          <span>{data.available}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>In Transit</span>
          <span>{data.inTransit}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Under Maintenance</span>
          <span>{data.maintenance}</span>
        </div>
        <div className="w-full bg-ember-100 rounded-full h-3 overflow-hidden mt-2">
          <div
            className="bg-emerald-400 h-full"
            style={{ width: `${percent(data.available)}%` }}
          />
          <div
            className="bg-sky-400 h-full"
            style={{ width: `${percent(data.inTransit)}%` }}
          />
          <div
            className="bg-red-400 h-full"
            style={{ width: `${percent(data.maintenance)}%` }}
          />
        </div>
        <div className="text-xs text-slate-500 text-center mt-1">
          {total} Vehicles
        </div>
      </div>
    </SummaryCard>
  );
}

// 3.2 Roster table widget
function RosterTable({ data }) {
  return (
    <SummaryCard title="Drivers & Helpers List">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-1 text-left font-medium text-slate-600">
                Driver
              </th>
              <th className="px-2 py-1 text-left font-medium text-slate-600">
                Helper
              </th>
              <th className="px-2 py-1 text-left font-medium text-slate-600">
                Vehicle
              </th>
              <th className="px-2 py-1 text-left font-medium text-slate-600">
                Shift
              </th>
              <th className="px-2 py-1 text-left font-medium text-slate-600">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-2 py-1">{row.driver}</td>
                <td className="px-2 py-1">{row.helper}</td>
                <td className="px-2 py-1">{row.vehicle}</td>
                <td className="px-2 py-1">{row.shift}</td>
                <td className="px-2 py-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${row.status === "In Transit" ? "bg-sky-200 text-sky-800" : row.status === "Idle" ? "bg-emerald-200 text-emerald-800" : "bg-amber-200 text-amber-800"}`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SummaryCard>
  );
}

// 4. Live fleet map widget
function LiveFleetMap({ locations }) {
  // Placeholder map – markers use default Leaflet icons; status shown in popup.
  return (
    <SummaryCard title="Live Fleet Tracking & Routes">
      <div className="h-64 w-full rounded-lg overflow-hidden">
        <MapContainer
          center={[37.7749, -122.4194]}
          zoom={4}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {locations.map((loc) => (
            <Marker key={loc.id} position={loc.position}>
              <Popup>
                <div className="flex flex-col items-start">
                  <span className="font-medium">{loc.name}</span>
                  <span className="text-xs text-slate-500">
                    Status: {loc.status}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </SummaryCard>
  );
}

function SummaryCard({ title, children }) {
  // Uniform card height, flex column to align content vertically
  return (
    <div className="rounded-lg bg-white p-3 shadow border border-ember-200 flex flex-col h-full hover:shadow-lg transition-shadow">
      <p className="text-xs font-medium text-slate-600 border-b border-slate-200 pb-1 mb-2">
        {title}
      </p>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function SupDashboard() {
  const [dateRange, setDateRange] = useState("7 Days");
  // Mock data sets keyed by date range – enables UI to react to filter changes
  const heroDataByRange = {
    Today: [
      {
        title: "Drowsiness Alerts",
        value: "12",
        delta: 1,
        color: "bg-amber-400",
      },
      { title: "High-Risk Drivers", value: "1", delta: 0, color: "bg-red-400" },
      {
        title: "On-Time Delivery",
        value: "95%",
        delta: 0.5,
        color: "bg-emerald-400",
      },
      { title: "Total Deliveries", value: "45", delta: 0, color: "bg-sky-400" },
    ],
    "7 Days": [
      {
        title: "Drowsiness Alerts",
        value: "128",
        delta: 5,
        color: "bg-amber-400",
      },
      { title: "High-Risk Drivers", value: "6", delta: 0, color: "bg-red-400" },
      {
        title: "On-Time Delivery",
        value: "92%",
        delta: 1.2,
        color: "bg-emerald-400",
      },
      {
        title: "Total Deliveries",
        value: "1,234",
        delta: -0.3,
        color: "bg-sky-400",
      },
    ],
    "30 Days": [
      {
        title: "Drowsiness Alerts",
        value: "512",
        delta: 12,
        color: "bg-amber-400",
      },
      {
        title: "High-Risk Drivers",
        value: "18",
        delta: 2,
        color: "bg-red-400",
      },
      {
        title: "On-Time Delivery",
        value: "88%",
        delta: -1.5,
        color: "bg-emerald-400",
      },
      {
        title: "Total Deliveries",
        value: "5,678",
        delta: 3.1,
        color: "bg-sky-400",
      },
    ],
  };
  const heroItems = heroDataByRange[dateRange];

  // ----- Mock placeholder data keyed by date range -----
  const alertStreamByRange = {
    Today: [
      {
        id: 1,
        driver: "J. Doe",
        type: "Eye Closure",
        time: "10:12",
        severity: "high",
      },
    ],
    "7 Days": [
      {
        id: 1,
        driver: "J. Doe",
        type: "Eye Closure",
        time: "10:12",
        severity: "high",
      },
      {
        id: 2,
        driver: "A. Smith",
        type: "Yawning",
        time: "09:48",
        severity: "medium",
      },
      {
        id: 3,
        driver: "S. Park",
        type: "Head Tilt",
        time: "08:22",
        severity: "low",
      },
    ],
    "30 Days": [
      {
        id: 1,
        driver: "J. Doe",
        type: "Eye Closure",
        time: "10:12",
        severity: "high",
      },
      {
        id: 2,
        driver: "A. Smith",
        type: "Yawning",
        time: "09:48",
        severity: "medium",
      },
      {
        id: 3,
        driver: "S. Park",
        type: "Head Tilt",
        time: "08:22",
        severity: "low",
      },
      {
        id: 4,
        driver: "M. Lee",
        type: "Eye Closure",
        time: "07:55",
        severity: "high",
      },
    ],
  };
  const drowsinessTrendByRange = {
    Today: [{ day: "Today", alerts: 12 }],
    "7 Days": [
      { day: "Mon", alerts: 12 },
      { day: "Tue", alerts: 9 },
      { day: "Wed", alerts: 15 },
      { day: "Thu", alerts: 8 },
      { day: "Fri", alerts: 20 },
      { day: "Sat", alerts: 5 },
      { day: "Sun", alerts: 3 },
    ],
    "30 Days": Array.from({ length: 30 }, (_, i) => ({
      day: `Day ${i + 1}`,
      alerts: (i % 5) + 5,
    })),
  };
  const topRiskDriversByRange = {
    Today: [{ name: "J. Doe", alerts: 10 }],
    "7 Days": [
      { name: "J. Doe", alerts: 10 },
      { name: "M. Lee", alerts: 8 },
      { name: "A. Smith", alerts: 6 },
    ],
    "30 Days": [
      { name: "J. Doe", alerts: 30 },
      { name: "M. Lee", alerts: 25 },
      { name: "A. Smith", alerts: 22 },
    ],
  };
  const rosterDataByRange = {
    Today: [
      {
        id: 1,
        driver: "J. Doe",
        helper: "K. Chan",
        vehicle: "TR‑12",
        shift: "2h 15m",
        status: "In Transit",
      },
    ],
    "7 Days": [
      {
        id: 1,
        driver: "J. Doe",
        helper: "K. Chan",
        vehicle: "TR‑12",
        shift: "2h 15m",
        status: "In Transit",
      },
      {
        id: 2,
        driver: "M. Lee",
        helper: "L. Wu",
        vehicle: "TR‑27",
        shift: "1h 40m",
        status: "Idle",
      },
      {
        id: 3,
        driver: "A. Smith",
        helper: "-",
        vehicle: "TR‑33",
        shift: "3h 05m",
        status: "Resting",
      },
    ],
    "30 Days": [
      {
        id: 1,
        driver: "J. Doe",
        helper: "K. Chan",
        vehicle: "TR‑12",
        shift: "2h 15m",
        status: "In Transit",
      },
      {
        id: 2,
        driver: "M. Lee",
        helper: "L. Wu",
        vehicle: "TR‑27",
        shift: "1h 40m",
        status: "Idle",
      },
      {
        id: 3,
        driver: "A. Smith",
        helper: "-",
        vehicle: "TR‑33",
        shift: "3h 05m",
        status: "Resting",
      },
      {
        id: 4,
        driver: "S. Park",
        helper: "M. Tan",
        vehicle: "TR‑45",
        shift: "4h 10m",
        status: "In Transit",
      },
    ],
  };
  const vehicleStatusByRange = {
    Today: { available: 1, inTransit: 1, maintenance: 0 },
    "7 Days": { available: 22, inTransit: 31, maintenance: 11 },
    "30 Days": { available: 30, inTransit: 45, maintenance: 5 },
  };
  const fleetLocationsByRange = {
    Today: [
      {
        id: 1,
        name: "Truck 12",
        position: [37.7749, -122.4194],
        status: "normal",
      },
    ],
    "7 Days": [
      {
        id: 1,
        name: "Truck 12",
        position: [37.7749, -122.4194],
        status: "normal",
      },
      {
        id: 2,
        name: "Truck 27",
        position: [34.0522, -118.2437],
        status: "alert",
      },
      {
        id: 3,
        name: "Truck 33",
        position: [40.7128, -74.006],
        status: "normal",
      },
    ],
    "30 Days": [
      {
        id: 1,
        name: "Truck 12",
        position: [37.7749, -122.4194],
        status: "normal",
      },
      {
        id: 2,
        name: "Truck 27",
        position: [34.0522, -118.2437],
        status: "alert",
      },
      {
        id: 3,
        name: "Truck 33",
        position: [40.7128, -74.006],
        status: "normal",
      },
      {
        id: 4,
        name: "Truck 44",
        position: [41.8781, -87.6298],
        status: "maintenance",
      },
    ],
  };
  const alertStream = alertStreamByRange[dateRange];
  const drowsinessTrend = drowsinessTrendByRange[dateRange];
  const topRiskDrivers = topRiskDriversByRange[dateRange];
  const rosterData = rosterDataByRange[dateRange];
  const vehicleStatus = vehicleStatusByRange[dateRange];
  const fleetLocations = fleetLocationsByRange[dateRange];

  return (
    <SupLayout
      title="Supervisor Dashboard"
      background={background}
      bg="bg-[#FAF9F6]"
    >
      {/* Centered max‑width container for a compact layout */}
      <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6 flex flex-col gap-3">
        {/* Header Section */}
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Dashboard
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Real-time overview of fleet operations, driver safety, and delivery
            performance.
          </p>
        </header>

        {/* SECTION 1 – System Overview */}
        <div className="flex items-center justify-between mt-4 mb-1">
          <h2 className="text-base font-medium text-slate-800">
            System Overview
          </h2>
          <DateRangeFilter selected={dateRange} onChange={setDateRange} />
        </div>
        <KPIHero items={heroItems} />

        {/* SECTION 2 – Driver Drowsiness & Safety Monitoring */}
        <h2 className="text-base font-medium text-slate-800 mt-4 mb-1">
          Driver Drowsiness & Safety Monitoring
        </h2>
        <section className="grid gap-3 lg:grid-cols-3">
          {/* Live Alert Stream */}
          <AlertStream data={alertStream} />
          {/* Drowsiness Trend Chart */}
          <DrowsinessTrend data={drowsinessTrend} />
          {/* Top High‑Risk Drivers */}
          <TopRiskDrivers data={topRiskDrivers} />
        </section>

        {/* SECTION 3 – Fleet & Personnel Status */}
        <h2 className="text-base font-medium text-slate-800 mt-4 mb-1">
          Fleet & Personnel Status
        </h2>
        <section className="grid gap-3 lg:grid-cols-2">
          <VehicleStatusBar data={vehicleStatus} />
          <RosterTable data={rosterData} />
        </section>

        {/* SECTION 4 – Live Fleet Tracking & Routes */}
        <h2 className="text-base font-medium text-slate-800 mt-4 mb-1">
          Live Fleet Tracking & Routes
        </h2>
        <section className="grid gap-3">
          <LiveFleetMap locations={fleetLocations} />
        </section>
      </div>
    </SupLayout>
  );
}

export default SupDashboard;
