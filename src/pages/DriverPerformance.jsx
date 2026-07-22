import { useMemo, useState } from 'react'
import DriverLayout from '../layout/DriverLayout.jsx'
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  EyeOff,
  Repeat,
  Activity,
  Clock,
  ListChecks,
  ClipboardList,
  Route,
  Lightbulb,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Same performance data source and calculations as the Performance tab on
// SupCrewProfile.jsx (alerts + sessions from the last 7 days), just presented
// from the driver's own point of view instead of a supervisor reviewing a
// crew member. No backend/query/threshold changes — only the layout below
// differs from the supervisor version.
// ---------------------------------------------------------------------------

const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: 'Prolonged Eye Closure',
  pattern_eye_closure_yawn: 'Eye Closure + Yawn',
  pattern_repeated_eye_closure: 'Repeated Eye Closure',
}

const ALERT_TYPE_ICONS = {
  prolonged_eye_closure: EyeOff,
  pattern_eye_closure_yawn: AlertTriangle,
  pattern_repeated_eye_closure: Repeat,
}

const ALERT_TYPE_ICON_BY_LABEL = Object.fromEntries(
  Object.entries(ALERT_TYPE_LABELS).map(([key, label]) => [label, ALERT_TYPE_ICONS[key]]),
)

const HERO_TONE_CLASSES = {
  red: 'border-red-200 bg-red-50/50',
  amber: 'border-amber-200 bg-amber-50/50',
  emerald: 'border-emerald-200 bg-emerald-50/50',
}

// Same High Risk / Moderate / Safe thresholds used on the supervisor view.
function getRiskLevel(alertCount) {
  if (alertCount >= 4) return { tone: 'red', label: 'High Risk' }
  if (alertCount >= 2) return { tone: 'amber', label: 'Moderate' }
  return { tone: 'emerald', label: 'Safe' }
}

const RISK_BADGE_CLASSES = {
  red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
}

const RISK_ICONS = { red: ShieldAlert, amber: AlertTriangle, emerald: ShieldCheck }

const RISK_TEXT_CLASSES = { red: 'text-red-700', amber: 'text-amber-700', emerald: 'text-emerald-700' }

function RiskBadge({ tone, label }) {
  const Icon = RISK_ICONS[tone] || ShieldCheck
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
        RISK_BADGE_CLASSES[tone] || RISK_BADGE_CLASSES.emerald
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function formatAlertDuration(seconds) {
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

function formatAlertTimestamp(value) {
  if (!value) {
    return '--'
  }
  const raw = String(value)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!isoMatch) {
    return raw
  }
  const year = Number(isoMatch[1])
  const monthIndex = Number(isoMatch[2]) - 1
  const day = Number(isoMatch[3])
  const hour24 = Number(isoMatch[4])
  const minute = isoMatch[5]
  const hour12 = ((hour24 + 11) % 12) + 1
  const suffix = hour24 >= 12 ? 'pm' : 'am'
  const monthLabels = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const monthLabel = monthLabels[monthIndex] || ''
  if (!monthLabel || !year) {
    return `${hour12}:${minute} ${suffix}`
  }
  return `${monthLabel} ${day}, ${hour12}:${minute} ${suffix}`
}

function PerformancePanel({ title, icon: Icon, children, right }) {
  return (
    <section className="rounded-2xl border border-amber-200/70 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-amber-600" />}
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
        </div>
        {right ? <div className="text-xs text-slate-500">{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

const METRIC_TILE_ICON_CLASSES = {
  slate: 'bg-slate-100 text-slate-500',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
}

function MetricTile({ label, value, hint, icon: Icon, tone = 'slate' }) {
  return (
    <div className="rounded-2xl border border-amber-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${METRIC_TILE_ICON_CLASSES[tone]}`}>
          {Icon && <Icon className="h-3.5 w-3.5" />}
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      </div>
      <p className="mt-2.5 text-xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mock data (frontend-only placeholder, no backend/API call) — the last
// completed trip has just 1 alert (Safe/green), while the week as a whole
// includes a high-alert trip that pushes the weekly total to 15 and the
// weekly risk mix into High Risk/red.
// ---------------------------------------------------------------------------

const MOCK_SESSIONS = [
  {
    session_id: 'SESSION-7',
    created_at: '2026-07-22T07:10:00',
    start_time: '2026-07-22T07:10:00',
    end_time: '2026-07-22T07:52:00',
    total_alerts: 1,
    session_duration: 2520,
  },
  {
    session_id: 'SESSION-6',
    created_at: '2026-07-21T18:30:00',
    start_time: '2026-07-21T18:30:00',
    end_time: '2026-07-21T19:20:00',
    total_alerts: 5,
    session_duration: 3000,
  },
  {
    session_id: 'SESSION-5',
    created_at: '2026-07-20T09:15:00',
    start_time: '2026-07-20T09:15:00',
    end_time: '2026-07-20T10:05:00',
    total_alerts: 3,
    session_duration: 3000,
  },
  {
    session_id: 'SESSION-4',
    created_at: '2026-07-19T14:00:00',
    start_time: '2026-07-19T14:00:00',
    end_time: '2026-07-19T14:45:00',
    total_alerts: 2,
    session_duration: 2700,
  },
  {
    session_id: 'SESSION-3',
    created_at: '2026-07-18T06:45:00',
    start_time: '2026-07-18T06:45:00',
    end_time: '2026-07-18T07:30:00',
    total_alerts: 1,
    session_duration: 2700,
  },
  {
    session_id: 'SESSION-2',
    created_at: '2026-07-17T16:00:00',
    start_time: '2026-07-17T16:00:00',
    end_time: '2026-07-17T16:50:00',
    total_alerts: 2,
    session_duration: 3000,
  },
  {
    session_id: 'SESSION-1',
    created_at: '2026-07-16T08:00:00',
    start_time: '2026-07-16T08:00:00',
    end_time: '2026-07-16T08:40:00',
    total_alerts: 1,
    session_duration: 2400,
  },
]

const MOCK_ALERTS = [
  { id: 'A-15', created_at: '2026-07-22T07:30:00', event_type: 'prolonged_eye_closure', duration: 40, session_id: 'SESSION-7' },

  { id: 'A-14', created_at: '2026-07-21T19:15:00', event_type: 'pattern_repeated_eye_closure', duration: 55, session_id: 'SESSION-6' },
  { id: 'A-13', created_at: '2026-07-21T19:05:00', event_type: 'pattern_eye_closure_yawn', duration: 65, session_id: 'SESSION-6' },
  { id: 'A-12', created_at: '2026-07-21T18:55:00', event_type: 'pattern_eye_closure_yawn', duration: 50, session_id: 'SESSION-6' },
  { id: 'A-11', created_at: '2026-07-21T18:45:00', event_type: 'prolonged_eye_closure', duration: 45, session_id: 'SESSION-6' },
  { id: 'A-10', created_at: '2026-07-21T18:35:00', event_type: 'prolonged_eye_closure', duration: 60, session_id: 'SESSION-6' },

  { id: 'A-9', created_at: '2026-07-20T09:55:00', event_type: 'pattern_eye_closure_yawn', duration: 35, session_id: 'SESSION-5' },
  { id: 'A-8', created_at: '2026-07-20T09:40:00', event_type: 'prolonged_eye_closure', duration: 50, session_id: 'SESSION-5' },
  { id: 'A-7', created_at: '2026-07-20T09:20:00', event_type: 'pattern_repeated_eye_closure', duration: 30, session_id: 'SESSION-5' },

  { id: 'A-6', created_at: '2026-07-19T14:30:00', event_type: 'pattern_repeated_eye_closure', duration: 45, session_id: 'SESSION-4' },
  { id: 'A-5', created_at: '2026-07-19T14:10:00', event_type: 'prolonged_eye_closure', duration: 40, session_id: 'SESSION-4' },

  { id: 'A-4', created_at: '2026-07-18T06:55:00', event_type: 'pattern_eye_closure_yawn', duration: 30, session_id: 'SESSION-3' },

  { id: 'A-3', created_at: '2026-07-17T16:35:00', event_type: 'prolonged_eye_closure', duration: 55, session_id: 'SESSION-2' },
  { id: 'A-2', created_at: '2026-07-17T16:10:00', event_type: 'prolonged_eye_closure', duration: 45, session_id: 'SESSION-2' },

  { id: 'A-1', created_at: '2026-07-16T08:10:00', event_type: 'pattern_repeated_eye_closure', duration: 35, session_id: 'SESSION-1' },
]

function DriverPerformance() {
  const [alerts] = useState(MOCK_ALERTS)
  const [sessions] = useState(MOCK_SESSIONS)
  const [isPerformanceLoading] = useState(false)
  const [performanceError] = useState('')

  const {
    performanceKpis,
    alertTypes,
    recentSessions,
    latestAlerts,
    hourly,
    maxAlerts,
  } = useMemo(() => {
    const totalAlerts = alerts.length
    const sessionCount = sessions.length
    const totalSessionAlerts = sessions.reduce((sum, session) => sum + (session.total_alerts || 0), 0)
    const avgAlertsPerTrip = sessionCount ? (totalSessionAlerts / sessionCount).toFixed(1) : '0.0'
    const latestSession = sessions[0]
    const hasOngoingTrip = latestSession && !latestSession.end_time
    const tripStatusLabel = hasOngoingTrip ? 'Ongoing Trip' : 'Last Completed Trip'
    const latestSessionId = latestSession?.session_id
    const latestSessionAlerts = latestSessionId
      ? alerts.filter((item) => item.session_id === latestSessionId)
      : []
    const latestDetection = latestSessionAlerts[0]?.event_type
    const detectedLabels = Array.from(
      new Set(
        latestSessionAlerts
          .map((item) => item.event_type)
          .filter(Boolean)
          .map((eventType) => ALERT_TYPE_LABELS[eventType] || eventType),
      ),
    )
    const tripAlertCount = hasOngoingTrip ? latestSessionAlerts.length : latestSession?.total_alerts ?? 0
    let tripStatusValue = '--'
    let tripStatusTone = ''
    let tripStatusBadge = ''
    if (latestSession) {
      const startLabel = latestSession.start_time ? formatAlertTimestamp(latestSession.start_time) : '--'
      const endLabel = latestSession.end_time ? formatAlertTimestamp(latestSession.end_time) : '--'
      if (tripAlertCount >= 4) {
        tripStatusTone = 'red'
        tripStatusBadge = 'High Risk'
      } else if (tripAlertCount >= 2) {
        tripStatusTone = 'amber'
        tripStatusBadge = 'Moderate'
      } else {
        tripStatusTone = 'emerald'
        tripStatusBadge = 'Safe'
      }
      const detectionLabel = latestDetection ? ALERT_TYPE_LABELS[latestDetection] || latestDetection : '--'
      const detectedList = detectedLabels.length ? (
        <ul className="list-disc pl-4 text-sm text-slate-700">
          {detectedLabels.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-slate-700">--</span>
      )
      const details = hasOngoingTrip
        ? [
            { label: 'Started', value: startLabel },
            { label: 'Current alerts', value: tripAlertCount },
            { label: 'Current detection', value: detectionLabel },
            { label: 'Alerts Detected', value: detectedList },
          ]
        : [
            { label: 'Start', value: startLabel },
            { label: 'End', value: endLabel },
            { label: 'Total alerts', value: tripAlertCount },
            { label: 'Last Detection', value: detectionLabel },
            { label: 'Alerts Detected', value: detectedList },
          ]
      tripStatusValue = (
        <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
          {details.map((item) => (
            <div key={item.label} className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <p className="text-sm text-slate-700">{item.value}</p>
            </div>
          ))}
        </div>
      )
    }

    const alertsByType = {}
    const hourlyCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, alerts: 0 }))
    alerts.forEach((item) => {
      const hour = new Date(item.created_at).getHours()
      hourlyCounts[hour].alerts += 1
      if (item.event_type) {
        alertsByType[item.event_type] = (alertsByType[item.event_type] || 0) + 1
      }
    })

    const typesRows = Object.keys(ALERT_TYPE_LABELS).map((key) => {
      const count = alertsByType[key] || 0
      const percent = totalAlerts ? Math.round((count / totalAlerts) * 100) : 0
      return { type: ALERT_TYPE_LABELS[key], count, share: `${percent}%`, percent }
    })

    const recentRows = sessions.slice(0, 6).map((session) => ({
      sessionId: session.session_id,
      alerts: session.total_alerts ?? 0,
      duration: session.session_duration,
      start: session.start_time,
      end: session.end_time,
    }))

    const latestRows = alerts.map((item) => ({
      id: item.id,
      type: ALERT_TYPE_LABELS[item.event_type] || item.event_type || 'Unknown',
      duration: item.duration,
      createdAt: item.created_at,
      sessionId: item.session_id,
    }))

    const hourlyRows = hourlyCounts.map((entry) => ({
      hour: `${String(entry.hour).padStart(2, '0')}:00`,
      alerts: entry.alerts,
    }))
    const peakHourRow = hourlyRows.reduce(
      (peak, row) => (row.alerts > peak.alerts ? row : peak),
      { hour: '--', alerts: 0 },
    )

    return {
      performanceKpis: [
        {
          label: tripStatusLabel,
          value: tripStatusValue,
          tone: tripStatusTone,
          statusLabel: tripStatusBadge,
        },
        { label: 'Total alerts (7d)', value: String(totalAlerts), hint: 'Using current data only' },
        { label: 'Avg alerts / trip', value: avgAlertsPerTrip, hint: 'From trip totals' },
        { label: 'Peak drowsiness time', value: peakHourRow.hour, hint: '' },
        { label: 'Total Trips', value: String(sessionCount), hint: 'Captured tracking Trips' },
      ],
      alertTypes: typesRows,
      recentSessions: recentRows,
      latestAlerts: latestRows,
      hourly: hourlyRows,
      maxAlerts: Math.max(...hourlyRows.map((row) => row.alerts), 0),
    }
  }, [alerts, sessions])

  const [heroKpi, totalAlertsKpi, avgAlertsKpi, peakHourKpi, totalTripsKpi] = performanceKpis

  const sortedAlertTypes = [...alertTypes].sort((a, b) => b.count - a.count)
  const peakHour = hourly.reduce(
    (peak, row) => (row.alerts > peak.alerts ? row : peak),
    { hour: '--', alerts: 0 },
  )

  // Weekly performance — how many of the driver's last-7-days trips fell into
  // each risk tier (same getRiskLevel thresholds as the per-trip badges), so
  // the driver can judge the week as a whole, not just the latest trip.
  const weeklyRiskCounts = sessions.reduce(
    (counts, session) => {
      const tier = getRiskLevel(session.total_alerts || 0).label
      counts[tier] += 1
      return counts
    },
    { Safe: 0, Moderate: 0, 'High Risk': 0 },
  )
  const weeklyRisk =
    weeklyRiskCounts['High Risk'] > 0
      ? { tone: 'red', label: 'High Risk' }
      : weeklyRiskCounts.Moderate > 0
      ? { tone: 'amber', label: 'Moderate' }
      : { tone: 'emerald', label: 'Safe' }

  // Day-by-day trend for the week card — oldest trip first, so the driver
  // can see *when* alerts spiked instead of just an abstract tier count.
  const weekTrend = [...sessions].reverse().map((session) => {
    const tone = getRiskLevel(session.total_alerts || 0).tone
    const dayLabel = session.start_time
      ? new Date(session.start_time).toLocaleDateString(undefined, { weekday: 'short' })
      : '--'
    return { sessionId: session.session_id, alerts: session.total_alerts || 0, tone, dayLabel }
  })
  const maxWeekAlerts = Math.max(...weekTrend.map((day) => day.alerts), 0)

  // The single riskiest trip this week, called out by name so the driver
  // knows exactly which trip drove the week's overall rating.
  const worstSession = sessions.reduce(
    (worst, session) => ((session.total_alerts || 0) > (worst?.total_alerts || 0) ? session : worst),
    null,
  )

  const hasInsight = !isPerformanceLoading && maxAlerts > 0 && sortedAlertTypes[0]?.count > 0

  return (
    <DriverLayout title="Performance" background={null}>
      <div className="flex flex-col gap-6 pb-10">
        {performanceError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {performanceError}
          </div>
        ) : null}

        {/* Hero row — "right now" and "this week" side by side */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section
            className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
              HERO_TONE_CLASSES[heroKpi?.tone] || 'border-amber-200/70 bg-white'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {heroKpi?.label}
              </span>
              {!isPerformanceLoading && heroKpi?.statusLabel ? (
                <RiskBadge tone={heroKpi.tone} label={heroKpi.statusLabel} />
              ) : null}
            </div>
            <div className="mt-4">
              {isPerformanceLoading ? (
                <p className="text-sm text-slate-500">Loading your trip status…</p>
              ) : typeof heroKpi?.value === 'string' ? (
                <p className="text-sm text-slate-500">No trip data in the last 7 days.</p>
              ) : (
                heroKpi.value
              )}
            </div>
          </section>

          <section
            className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
              HERO_TONE_CLASSES[weeklyRisk.tone] || 'border-amber-200/70 bg-white'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                This Week (7 Days)
              </span>
              {!isPerformanceLoading && sessions.length > 0 ? (
                <RiskBadge tone={weeklyRisk.tone} label={weeklyRisk.label} />
              ) : null}
            </div>
            <div className="mt-4">
              {isPerformanceLoading ? (
                <p className="text-sm text-slate-500">Loading your weekly summary…</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-slate-500">No trips recorded in the last 7 days.</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-900">
                    Your performance this week was{' '}
                    <span className={RISK_TEXT_CLASSES[weeklyRisk.tone] || 'text-slate-900'}>
                      {weeklyRisk.label}
                    </span>
                    .
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {weeklyRisk.tone === 'red' && worstSession
                      ? `Your ${formatAlertTimestamp(worstSession.start_time)} trip had ${
                          worstSession.total_alerts
                        } alerts — the most this week.`
                      : weeklyRisk.tone === 'amber' && worstSession
                      ? `Your busiest trip this week had ${worstSession.total_alerts} alerts.`
                      : 'No high-alert trips this week — keep it up.'}
                  </p>

                  {/* Per-trip trend, oldest to newest, so the driver can see
                      exactly which day drove the week's rating. */}
                  <div className="mt-4 overflow-x-auto">
                    <div className="flex min-w-[260px] items-end gap-2">
                      {weekTrend.map((day, idx) => {
                        const heightPct = day.alerts > 0 ? Math.max((day.alerts / maxWeekAlerts) * 100, 12) : 4
                        const barColor =
                          day.tone === 'red'
                            ? 'bg-red-500'
                            : day.tone === 'amber'
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        return (
                          <div
                            key={day.sessionId || idx}
                            className="flex flex-1 flex-col items-center gap-1"
                            title={`${day.dayLabel} — ${day.alerts} alert${day.alerts === 1 ? '' : 's'}`}
                          >
                            <span className="text-[10px] font-semibold text-slate-500">
                              {day.alerts > 0 ? day.alerts : ''}
                            </span>
                            <div className="flex h-16 w-full items-end rounded-md bg-slate-100">
                              <div
                                className={`w-full rounded-md transition ${barColor}`}
                                style={{ height: `${heightPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400">{day.dayLabel}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Insight — a plain-language read on the same data above, so drivers
            don't have to interpret the chart/breakdown themselves. */}
        {hasInsight ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50 p-4 text-sm text-amber-900 sm:p-5">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              Most of your alerts this week were{' '}
              <strong>{sortedAlertTypes[0].type}</strong>, clustering around{' '}
              <strong>{peakHour.hour}</strong>. Consider a short break if you're driving
              during that window.
            </p>
          </div>
        ) : null}

        {/* 7-day summary */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label={totalAlertsKpi?.label}
            icon={AlertTriangle}
            tone="amber"
            value={isPerformanceLoading ? '…' : totalAlertsKpi?.value}
            hint={totalAlertsKpi?.hint}
          />
          <MetricTile
            label={avgAlertsKpi?.label}
            icon={Activity}
            tone="amber"
            value={isPerformanceLoading ? '…' : avgAlertsKpi?.value}
            hint={avgAlertsKpi?.hint}
          />
          <MetricTile
            label={peakHourKpi?.label}
            icon={Clock}
            tone="amber"
            value={isPerformanceLoading ? '…' : peakHourKpi?.value}
            hint={peakHourKpi?.hint}
          />
          <MetricTile
            label={totalTripsKpi?.label}
            icon={Route}
            tone="slate"
            value={isPerformanceLoading ? '…' : totalTripsKpi?.value}
            hint={totalTripsKpi?.hint}
          />
        </section>

        {/* Alert pattern analysis */}
        <div className="grid gap-4 lg:grid-cols-2">
          <PerformancePanel title="Alert Type Breakdown" icon={ListChecks}>
            <p className="text-xs text-slate-500">
              Most frequent —{' '}
              <span className="font-semibold text-slate-700">
                {isPerformanceLoading
                  ? '…'
                  : sortedAlertTypes[0]?.count
                  ? sortedAlertTypes[0].type
                  : 'No alerts'}
              </span>
            </p>
            <div className="mt-3 space-y-3">
              {sortedAlertTypes.map((row) => {
                const TypeIcon = ALERT_TYPE_ICON_BY_LABEL[row.type] || Activity
                return (
                  <div key={row.type} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                        <TypeIcon className="h-3.5 w-3.5 text-slate-400" />
                        {row.type}
                      </span>
                      <span>{isPerformanceLoading ? '…' : `${row.count} · ${row.share}`}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-amber-500"
                        style={{ width: `${row.percent}%` }}
                        aria-label={`${row.type} ${row.share}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </PerformancePanel>

          <PerformancePanel
            title="24-Hour Alert Pattern"
            icon={Clock}
            right={!isPerformanceLoading && peakHour.alerts > 0 ? `Peak: ${peakHour.hour}` : null}
          >
            {isPerformanceLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : maxAlerts === 0 ? (
              <p className="text-sm text-slate-500">No alerts recorded in the last 7 days.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex min-w-[480px] items-end gap-1.5">
                  {hourly.map((row, idx) => {
                    const isPeak = row.hour === peakHour.hour && row.alerts > 0
                    const heightPct = row.alerts > 0 ? Math.max((row.alerts / maxAlerts) * 100, 12) : 0
                    const showLabel = isPeak || idx % 3 === 0
                    return (
                      <div
                        key={row.hour}
                        className="flex flex-1 flex-col items-center gap-1"
                        title={`${row.hour} — ${row.alerts} alert${row.alerts === 1 ? '' : 's'}`}
                      >
                        <div className="flex h-16 w-full items-end rounded-md bg-slate-100">
                          <div
                            className={`w-full rounded-md transition ${isPeak ? 'bg-amber-600' : 'bg-amber-300'}`}
                            style={{ height: `${heightPct}%` }}
                            aria-label={`${row.hour} ${row.alerts} alerts`}
                          />
                        </div>
                        <span
                          className={`text-[10px] ${
                            isPeak ? 'font-semibold text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {showLabel ? row.hour.slice(0, 2) : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </PerformancePanel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <PerformancePanel
            title="Recent Alerts"
            icon={AlertTriangle}
            right={!isPerformanceLoading ? `${latestAlerts.length} in 7 days` : null}
          >
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {(isPerformanceLoading ? [] : latestAlerts).map((alert) => {
                const TypeIcon = ALERT_TYPE_ICON_BY_LABEL[alert.type] || Activity
                const displayDuration = formatAlertDuration(alert.duration)
                const hasDuration = displayDuration !== '--' && displayDuration !== '0m'
                return (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 rounded-xl border border-amber-100/70 bg-amber-50/60 px-3.5 py-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-inset ring-amber-200">
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{alert.type}</p>
                      <p className="truncate text-xs text-slate-500">{formatAlertTimestamp(alert.createdAt)}</p>
                    </div>
                    {hasDuration ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {displayDuration}
                      </span>
                    ) : null}
                  </div>
                )
              })}
              {!isPerformanceLoading && latestAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">No alerts found in the last 7 days.</p>
              ) : null}
            </div>
          </PerformancePanel>

          <PerformancePanel title="Trip Log" icon={ClipboardList} right="Last 7 days">
            <div className="overflow-hidden rounded-2xl border border-amber-200/70">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Start</th>
                    <th className="px-4 py-3 font-semibold">End</th>
                    <th className="px-4 py-3 font-semibold">Duration</th>
                    <th className="px-4 py-3 font-semibold">Alerts</th>
                    <th className="px-4 py-3 font-semibold">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {(isPerformanceLoading ? [] : recentSessions).map((session) => {
                    const risk = getRiskLevel(session.alerts)
                    return (
                      <tr key={session.sessionId} className="bg-white transition hover:bg-amber-50/60">
                        <td className="px-4 py-3 text-slate-700">{formatAlertTimestamp(session.start)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatAlertTimestamp(session.end)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatAlertDuration(session.duration)}</td>
                        <td className="px-4 py-3 text-slate-700">{session.alerts}</td>
                        <td className="px-4 py-3">
                          <RiskBadge tone={risk.tone} label={risk.label} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!isPerformanceLoading && recentSessions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No sessions found in the last 7 days.</p>
            ) : null}
          </PerformancePanel>
        </div>
      </div>
    </DriverLayout>
  )
}

export default DriverPerformance
