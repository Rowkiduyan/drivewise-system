import { useEffect, useMemo, useState } from 'react'
import SupLayout from '../layout/SupLayout.jsx'
import { supabase } from '../lib/supabaseClient.js'

const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: 'Prolonged Eye Closure',
  pattern_eye_closure_yawn: 'Eye Closure + Yawn',
  pattern_repeated_eye_closure: 'Repeated Eye Closure'
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--'
  }
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) {
    return `${minutes}m`
  }
  return `${hours}h ${minutes}m`
}

function formatTimestamp(value) {
  if (!value) {
    return '--'
  }
  const date = new Date(value)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border border-blue-200/70 bg-white p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-blue-600">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function Panel({ title, children, right }) {
  return (
    <section className="rounded-3xl border border-blue-200/70 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-blue-600">{title}</p>
        </div>
        {right ? <div className="text-xs text-slate-500">{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function SupAnalysisSpecific() {
  const [alerts, setAlerts] = useState([])
  const [sessions, setSessions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [alertPage, setAlertPage] = useState(0)

  useEffect(() => {
    let isMounted = true
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    async function load() {
      setIsLoading(true)
      setError('')

      const [alertsRes, sessionsRes] = await Promise.all([
        supabase
          .from('alerts')
          .select('id, created_at, event_type, duration, session_id')
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        supabase
          .from('sessions')
          .select('session_id, created_at, start_time, end_time, total_alerts, session_duration')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
      ])

      if (!isMounted) {
        return
      }

      if (alertsRes.error || sessionsRes.error) {
        setError(alertsRes.error?.message || sessionsRes.error?.message || 'Unable to load data.')
        setAlerts([])
        setSessions([])
      } else {
        setAlerts(alertsRes.data || [])
        setSessions(sessionsRes.data || [])
      }

      setIsLoading(false)
    }

    load()
    return () => {
      isMounted = false
    }
  }, [])

  const { kpis, alertTypes, recentSessions, latestAlerts, totalDuration } = useMemo(() => {
    const totalAlerts = alerts.length
    const highRisk = alerts.filter((item) => item.event_type === 'pattern_repeated_eye_closure').length
    const sessionCount = sessions.length
    const avgAlerts = sessionCount ? (totalAlerts / sessionCount).toFixed(1) : '0.0'
    const totalSeconds = sessions.reduce((sum, session) => sum + (session.session_duration || 0), 0)

    const alertsByType = {}
    alerts.forEach((item) => {
      if (item.event_type) {
        alertsByType[item.event_type] = (alertsByType[item.event_type] || 0) + 1
      }
    })

    const typesRows = Object.keys(ALERT_TYPE_LABELS).map((key) => {
      const count = alertsByType[key] || 0
      const percent = totalAlerts ? Math.round((count / totalAlerts) * 100) : 0
      const share = `${percent}%`
      return { type: ALERT_TYPE_LABELS[key], count, share, percent }
    })

    const recentRows = sessions
      .slice(0, 6)
      .map((session) => ({
        sessionId: session.session_id,
        alerts: session.total_alerts ?? 0,
        duration: session.session_duration,
        start: session.start_time,
        end: session.end_time
      }))

    const latestRows = alerts.map((item) => ({
      id: item.id,
      type: ALERT_TYPE_LABELS[item.event_type] || item.event_type || 'Unknown',
      duration: item.duration,
      createdAt: item.created_at,
      sessionId: item.session_id
    }))

    return {
      kpis: [
        { label: 'Total alerts (7d)', value: String(totalAlerts), hint: 'Using current data only' },
        { label: 'High-risk events', value: String(highRisk), hint: 'Repeated eye-closure events' },
        { label: 'Avg alerts / session', value: avgAlerts, hint: 'Sessions in last 7 days' },
        { label: 'Total sessions', value: String(sessionCount), hint: 'Captured tracking sessions' }
      ],
      alertTypes: typesRows,
      recentSessions: recentRows,
      latestAlerts: latestRows,
      totalDuration: totalSeconds
    }
  }, [alerts, sessions])

  const ALERTS_PER_PAGE = 5
  const totalAlertPages = Math.max(Math.ceil(latestAlerts.length / ALERTS_PER_PAGE), 1)
  const currentAlertPage = Math.min(alertPage, totalAlertPages - 1)
  const pagedAlerts = latestAlerts.slice(
    currentAlertPage * ALERTS_PER_PAGE,
    currentAlertPage * ALERTS_PER_PAGE + ALERTS_PER_PAGE
  )

  return (
    <SupLayout title="Supervisor Analysis" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600">Supervisor Interface</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold sm:text-4xl">Alexis Duain</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Specific driver analysis built from the current alert and session data.
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

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-blue-200/70 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-xl font-semibold text-blue-700">
                  AD
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-blue-600">Driver profile</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">Alexis Duain</p>
                  <p className="text-sm text-slate-500">Last 7 days of alert activity</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Total time {isLoading ? '...' : formatDuration(totalDuration)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Sessions {isLoading ? '...' : sessions.length}
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {kpis.map((kpi) => (
                <StatCard key={kpi.label} label={kpi.label} value={isLoading ? '...' : kpi.value} hint={kpi.hint} />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-blue-200/70 bg-white p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-blue-600">Focus metrics</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Most frequent alert</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {isLoading ? '...' : alertTypes[0]?.type || 'No alerts'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Alert mix</p>
                <div className="mt-2 space-y-3">
                  {alertTypes.map((row) => (
                    <div key={row.type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>{row.type}</span>
                        <span>{isLoading ? '...' : row.share}</span>
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
              {(isLoading ? [] : pagedAlerts).map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{alert.type}</p>
                    {(() => {
                      const displayDuration = formatDuration(alert.duration)
                      if (displayDuration === '--' || displayDuration === '0m') {
                        return null
                      }
                      return (
                        <span className="text-xs font-semibold text-amber-600">
                          {displayDuration}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>Session {alert.sessionId || '--'}</span>
                    <span>{formatTimestamp(alert.createdAt)}</span>
                  </div>
                </div>
              ))}
              {!isLoading && latestAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">No alerts found in the last 7 days.</p>
              ) : null}
              {!isLoading && latestAlerts.length > ALERTS_PER_PAGE ? (
                <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                  <span>
                    Page {currentAlertPage + 1} of {totalAlertPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setAlertPage((prev) => Math.max(prev - 1, 0))}
                      disabled={currentAlertPage === 0}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setAlertPage((prev) => Math.min(prev + 1, totalAlertPages - 1))}
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
                  {(isLoading ? [] : recentSessions).map((session) => (
                    <tr key={session.sessionId} className="bg-white">
                      <td className="px-4 py-3 text-slate-700">{formatTimestamp(session.start)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatTimestamp(session.end)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatDuration(session.duration)}</td>
                      <td className="px-4 py-3 text-slate-700">{session.alerts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isLoading && recentSessions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No sessions found in the last 7 days.</p>
            ) : null}
          </Panel>
        </div>
      </div>
    </SupLayout>
  )
}

export default SupAnalysisSpecific
