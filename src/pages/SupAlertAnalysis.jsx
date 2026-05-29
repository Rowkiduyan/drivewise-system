import { useEffect, useMemo, useState } from "react";
import SupLayout from "../layout/SupLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";

const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: "Prolonged Eye Closure",
  pattern_eye_closure_yawn: "Eye Closure + Yawn",
  pattern_repeated_eye_closure: "Repeated Eye Closure",
};

function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatPeakWindow(hour) {
  if (hour === null) {
    return "--";
  }
  const endHour = (hour + 2) % 24;
  return `${formatHour(hour)}-${formatHour(endHour)}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
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

function SupAlertAnalysis() {
  const [alerts, setAlerts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [timePage, setTimePage] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    async function load() {
      setIsLoading(true);
      setError("");

      const [alertsRes, sessionsRes] = await Promise.all([
        supabase
          .from("alerts")
          .select("id, created_at, event_type, duration, session_id")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
        supabase
          .from("sessions")
          .select(
            "session_id, created_at, start_time, end_time, total_alerts, session_duration",
          )
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      if (alertsRes.error || sessionsRes.error) {
        setError(
          alertsRes.error?.message ||
            sessionsRes.error?.message ||
            "Unable to load data.",
        );
        setAlerts([]);
        setSessions([]);
      } else {
        setAlerts(alertsRes.data || []);
        setSessions(sessionsRes.data || []);
      }

      setIsLoading(false);
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const { kpis, alertTypes, hourly, flaggedSessions, maxAlerts } =
    useMemo(() => {
      const totalAlerts = alerts.length;
      const highRisk = alerts.filter(
        (item) => item.event_type === "pattern_repeated_eye_closure",
      ).length;
      const sessionCount = sessions.length;
      const avgAlerts = sessionCount
        ? (totalAlerts / sessionCount).toFixed(1)
        : "0.0";

      const hourlyCounts = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        alerts: 0,
      }));
      const alertsByType = {};
      const alertsBySession = {};

      alerts.forEach((item) => {
        const hour = new Date(item.created_at).getHours();
        hourlyCounts[hour].alerts += 1;

        if (item.event_type) {
          alertsByType[item.event_type] =
            (alertsByType[item.event_type] || 0) + 1;
        }

        if (item.session_id) {
          if (!alertsBySession[item.session_id]) {
            alertsBySession[item.session_id] = {
              count: 0,
              last: item.created_at,
            };
          }
          alertsBySession[item.session_id].count += 1;
          if (item.created_at > alertsBySession[item.session_id].last) {
            alertsBySession[item.session_id].last = item.created_at;
          }
        }
      });

      const peakEntry = hourlyCounts.reduce(
        (best, current) => (current.alerts > best.alerts ? current : best),
        { hour: null, alerts: -1 },
      );

      const typesRows = Object.keys(ALERT_TYPE_LABELS).map((key) => {
        const count = alertsByType[key] || 0;
        const share = totalAlerts
          ? `${Math.round((count / totalAlerts) * 100)}%`
          : "0%";
        return { type: ALERT_TYPE_LABELS[key], count, share };
      });

      const sessionLookup = sessions.reduce((acc, session) => {
        acc[session.session_id] = session;
        return acc;
      }, {});

      const sessionRows = Object.entries(alertsBySession)
        .map(([sessionId, info]) => {
          const session = sessionLookup[sessionId];
          const total = session?.total_alerts ?? info.count;
          const status =
            total >= 10 ? "Escalate" : total >= 5 ? "Review" : "Monitor";
          return {
            sessionId,
            alerts: total,
            duration: session?.session_duration,
            last: info.last,
            status,
          };
        })
        .sort((a, b) => b.alerts - a.alerts)
        .slice(0, 5);

      const filteredHours = hourlyCounts.map((entry) => ({
        hour: formatHour(entry.hour),
        alerts: entry.alerts,
      }));

      return {
        kpis: [
          {
            label: "Total alerts (7d)",
            value: String(totalAlerts),
            hint: "Across all sessions",
          },
          {
            label: "High-risk events",
            value: String(highRisk),
            hint: "Repeated eye-closure events",
          },
          {
            label: "Avg alerts / session",
            value: avgAlerts,
            hint: "Sessions in last 7 days",
          },
          {
            label: "Peak window",
            value: formatPeakWindow(peakEntry.hour),
            hint: "Most alerts by hour",
          },
        ],
        alertTypes: typesRows,
        hourly: filteredHours,
        flaggedSessions: sessionRows,
        maxAlerts: Math.max(...filteredHours.map((h) => h.alerts), 0),
      };
    }, [alerts, sessions]);

  const HOURS_PER_PAGE = 8;
  const totalTimePages = Math.max(Math.ceil(hourly.length / HOURS_PER_PAGE), 1);
  const currentTimePage = Math.min(timePage, totalTimePages - 1);
  const pagedHours = hourly.slice(
    currentTimePage * HOURS_PER_PAGE,
    currentTimePage * HOURS_PER_PAGE + HOURS_PER_PAGE,
  );

  return (
    <SupLayout title="Alert Analysis" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Alert Analysis
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Explore alert patterns by type, time window, and driver risk to
            prioritize interventions.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <StatCard
              key={k.label}
              label={k.label}
              value={isLoading ? "..." : k.value}
              hint={k.hint}
            />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Alert Types" right="Last 7 days">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Count</th>
                    <th className="px-4 py-3 font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {alertTypes.map((row) => (
                    <tr key={row.type} className="bg-white">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.type}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {isLoading ? "..." : row.count}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {isLoading ? "..." : row.share}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Alerts by Time" right="Hour buckets">
            <div className="space-y-3">
              {pagedHours.map((row) => {
                const pct = maxAlerts
                  ? Math.round((row.alerts / maxAlerts) * 100)
                  : 0;
                return (
                  <div key={row.hour} className="flex items-center gap-3">
                    <div className="w-14 text-xs font-medium text-slate-700">
                      {row.hour}
                    </div>
                    <div className="flex-1">
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${pct}%` }}
                          aria-label={`${row.hour} ${row.alerts} alerts`}
                        />
                      </div>
                    </div>
                    <div className="w-10 text-right text-xs font-semibold text-slate-700">
                      {isLoading ? "..." : row.alerts}
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-slate-500">
                Use this view to align breaks, swaps, and coaching with
                high-frequency windows.
              </p>
              <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                <span>
                  Page {currentTimePage + 1} of {totalTimePages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setTimePage((prev) => Math.max(prev - 1, 0))}
                    disabled={currentTimePage === 0 || isLoading}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() =>
                      setTimePage((prev) =>
                        Math.min(prev + 1, totalTimePages - 1),
                      )
                    }
                    disabled={
                      currentTimePage >= totalTimePages - 1 || isLoading
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <Panel title="Flagged Sessions" right="Sorted by alerts">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Session</th>
                  <th className="px-4 py-3 font-medium">Alerts</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Last alert</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(isLoading ? [] : flaggedSessions).map((row) => (
                  <tr key={row.sessionId} className="bg-white">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.sessionId}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.alerts}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDuration(row.duration)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatTimestamp(row.last)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          {
                            Escalate: "bg-red-50 text-red-700",
                            Monitor: "bg-amber-50 text-amber-700",
                            Review: "bg-blue-50 text-blue-700",
                          }[row.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!isLoading && flaggedSessions.length === 0 ? (
                  <tr className="bg-white">
                    <td
                      className="px-4 py-6 text-center text-sm text-slate-500"
                      colSpan={5}
                    >
                      No sessions found in the last 7 days.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </SupLayout>
  );
}

export default SupAlertAnalysis;
