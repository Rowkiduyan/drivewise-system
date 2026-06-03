import { useState } from "react";
import SupLayout from "../layout/SupLayout.jsx";

const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: "Prolonged Eye Closure",
  pattern_eye_closure_yawn: "Eye Closure + Yawn",
  pattern_repeated_eye_closure: "Repeated Eye Closure",
};

function formatDuration(seconds) {
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

function formatTimestamp(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border border-blue-200/70 bg-white p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-blue-600">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Panel({ title, children, right }) {
  return (
    <section className="rounded-3xl border border-blue-200/70 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-blue-600">
            {title}
          </p>
        </div>
        {right ? <div className="text-xs text-slate-500">{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SupAnalysisIndiv() {
  const [alertPage, setAlertPage] = useState(0);

  const kpis = [
    { label: "Total alerts (7d)", value: "18", hint: "Dummy sample" },
    { label: "High-risk events", value: "3", hint: "Repeated eye-closure" },
    { label: "Avg alerts / session", value: "2.1", hint: "Dummy sessions" },
    { label: "Total sessions", value: "8", hint: "Captured sessions" },
  ];

  const alertTypes = [
    { type: ALERT_TYPE_LABELS.prolonged_eye_closure, share: "44%", percent: 44 },
    { type: ALERT_TYPE_LABELS.pattern_eye_closure_yawn, share: "33%", percent: 33 },
    { type: ALERT_TYPE_LABELS.pattern_repeated_eye_closure, share: "23%", percent: 23 },
  ];

  const recentSessions = [
    {
      sessionId: "S-4821",
      alerts: 3,
      duration: 5400,
      start: "2026-05-31T06:10:00Z",
      end: "2026-05-31T07:40:00Z",
    },
    {
      sessionId: "S-4820",
      alerts: 2,
      duration: 3600,
      start: "2026-05-30T12:00:00Z",
      end: "2026-05-30T13:00:00Z",
    },
    {
      sessionId: "S-4819",
      alerts: 1,
      duration: 2700,
      start: "2026-05-29T08:15:00Z",
      end: "2026-05-29T09:00:00Z",
    },
  ];

  const latestAlerts = [
    {
      id: "A-110",
      type: ALERT_TYPE_LABELS.pattern_eye_closure_yawn,
      duration: 42,
      createdAt: "2026-05-31T06:42:00Z",
      sessionId: "S-4821",
    },
    {
      id: "A-109",
      type: ALERT_TYPE_LABELS.prolonged_eye_closure,
      duration: 18,
      createdAt: "2026-05-31T06:20:00Z",
      sessionId: "S-4821",
    },
    {
      id: "A-108",
      type: ALERT_TYPE_LABELS.pattern_repeated_eye_closure,
      duration: 55,
      createdAt: "2026-05-30T12:48:00Z",
      sessionId: "S-4820",
    },
    {
      id: "A-107",
      type: ALERT_TYPE_LABELS.pattern_eye_closure_yawn,
      duration: 33,
      createdAt: "2026-05-30T12:10:00Z",
      sessionId: "S-4820",
    },
    {
      id: "A-106",
      type: ALERT_TYPE_LABELS.prolonged_eye_closure,
      duration: 21,
      createdAt: "2026-05-29T08:40:00Z",
      sessionId: "S-4819",
    },
    {
      id: "A-105",
      type: ALERT_TYPE_LABELS.pattern_repeated_eye_closure,
      duration: 60,
      createdAt: "2026-05-28T18:12:00Z",
      sessionId: "S-4818",
    },
  ];

  const totalDuration = 11700;
  const hasAlertToday = false;

  const ALERTS_PER_PAGE = 5;
  const totalAlertPages = Math.max(
    Math.ceil(latestAlerts.length / ALERTS_PER_PAGE),
    1,
  );
  const currentAlertPage = Math.min(alertPage, totalAlertPages - 1);
  const pagedAlerts = latestAlerts.slice(
    currentAlertPage * ALERTS_PER_PAGE,
    currentAlertPage * ALERTS_PER_PAGE + ALERTS_PER_PAGE,
  );

  return (
    <SupLayout title="Supervisor Analysis" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6">
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
                Juan D. Santos
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    hasAlertToday
                      ? "bg-red-100 text-red-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {hasAlertToday ? "Alert today" : "No alerts today"}
                </span>
              </h1>
              <p className="mt-2 max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
                Specific driver analysis built from alerts and session data.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                Active driver
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Review focus
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-blue-200/70 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-xl font-semibold text-blue-700">
                  JS
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-blue-600">
                    Driver profile
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    Juan D. Santos
                  </p>
                  <p className="text-sm text-slate-500">
                    Last 7 days of alert activity
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Total time {formatDuration(totalDuration)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Sessions {recentSessions.length}
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {kpis.map((kpi) => (
                <StatCard
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  hint={kpi.hint}
                />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-blue-200/70 bg-white p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-blue-600">
              Focus metrics
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Most frequent alert
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {alertTypes[0]?.type || "No alerts"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Alert mix</p>
                <div className="mt-2 space-y-3">
                  {alertTypes.map((row) => (
                    <div key={row.type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>{row.type}</span>
                        <span>{row.share}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${row.percent}%` }}
                          aria-label={`${row.type} ${row.share}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Recent Alerts" right="Latest events">
            <div className="space-y-3">
              {pagedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">
                      {alert.type}
                    </p>
                    {(() => {
                      const displayDuration = formatDuration(alert.duration);
                      if (displayDuration === "--" || displayDuration === "0m") {
                        return null;
                      }
                      return (
                        <span className="text-xs font-semibold text-amber-600">
                          {displayDuration}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>Session {alert.sessionId || "--"}</span>
                    <span>{formatTimestamp(alert.createdAt)}</span>
                  </div>
                </div>
              ))}
              {latestAlerts.length > ALERTS_PER_PAGE ? (
                <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                  <span>
                    Page {currentAlertPage + 1} of {totalAlertPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() =>
                        setAlertPage((prev) => Math.max(prev - 1, 0))
                      }
                      disabled={currentAlertPage === 0}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() =>
                        setAlertPage((prev) =>
                          Math.min(prev + 1, totalAlertPages - 1),
                        )
                      }
                      disabled={currentAlertPage >= totalAlertPages - 1}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="Session Log" right="Last 7 days">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Start</th>
                    <th className="px-4 py-3 font-medium">End</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {recentSessions.map((session) => (
                    <tr key={session.sessionId} className="bg-white">
                      <td className="px-4 py-3 text-slate-700">
                        {formatTimestamp(session.start)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatTimestamp(session.end)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDuration(session.duration)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {session.alerts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </SupLayout>
  );
}

export default SupAnalysisIndiv;
