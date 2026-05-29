import SupLayout from "../layout/SupLayout.jsx";

const background = null;

function KPIHero({ items }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.title}
          className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm"
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
            <p className="mt-2 text-2xl font-bold text-slate-900">{it.value}</p>
            {it.meta && (
              <p className="text-xs text-slate-500 mt-1">{it.meta}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ title, children }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-600">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SupDashboard() {
  const heroItems = [
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
  ];

  const summary = {
    trucks: { total: 64, available: 22, inTransit: 31, maintenance: 11 },
    drivers: { total: 226, active: 184, inTrip: 31 },
  };

  const recentAlerts = [
    { id: 1, driver: "J. Doe", type: "Eye Closure", time: "10:12" },
    { id: 2, driver: "A. Smith", type: "Yawning", time: "09:48" },
    { id: 3, driver: "S. Park", type: "Head Tilt", time: "08:22" },
  ];

  const topDrivers = [
    { name: "J. Doe", alerts: 10 },
    { name: "M. Lee", alerts: 8 },
    { name: "A. Smith", alerts: 6 },
  ];

  return (
    <SupLayout
      title="Supervisor Dashboard"
      background={background}
      bg="bg-[#FAF9F6]"
    >
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
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

        <KPIHero items={heroItems} />

        <section className="grid gap-4 lg:grid-cols-3">
          <SummaryCard title="Fleet & Drivers">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Total Trucks</span>
                <span className="font-semibold">{summary.trucks.total}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Available</span>
                <span className="font-semibold">
                  {summary.trucks.available}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">In Transit</span>
                <span className="font-semibold">
                  {summary.trucks.inTransit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">
                  Under Maintenance
                </span>
                <span className="font-semibold">
                  {summary.trucks.maintenance}
                </span>
              </div>
              <div className="border-t mt-3 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Total Drivers</span>
                  <span className="font-semibold">{summary.drivers.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Active</span>
                  <span className="font-semibold">
                    {summary.drivers.active}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">
                    Currently In Trip
                  </span>
                  <span className="font-semibold">
                    {summary.drivers.inTrip}
                  </span>
                </div>
              </div>
            </div>
          </SummaryCard>

          <SummaryCard title="Recent Alerts">
            <ul className="space-y-2">
              {recentAlerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{a.driver}</p>
                    <p className="text-xs text-slate-500">
                      {a.type} • {a.time}
                    </p>
                  </div>
                  <div className="text-xs text-red-500 font-semibold">
                    Alert
                  </div>
                </li>
              ))}
            </ul>
          </SummaryCard>

          <SummaryCard title="Top Alerted Drivers">
            <ol className="list-decimal list-inside space-y-2">
              {topDrivers.map((d) => (
                <li key={d.name} className="flex items-center justify-between">
                  <span className="text-sm">{d.name}</span>
                  <span className="font-semibold text-slate-800">
                    {d.alerts}
                  </span>
                </li>
              ))}
            </ol>
          </SummaryCard>
        </section>
      </div>
    </SupLayout>
  );
}

export default SupDashboard;
