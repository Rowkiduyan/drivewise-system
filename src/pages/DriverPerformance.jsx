import { useEffect, useMemo, useState } from 'react'
import DriverLayout from '../layout/DriverLayout.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { formatManilaTimestamp, formatManilaShortDate, formatManilaShortTime, getManilaHour, getManilaWeekday } from '../lib/manilaTime.js'
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
  CameraOff,
  Info,
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
  face_not_detected: 'Eyes Not Detected',
}

const ALERT_TYPE_ICONS = {
  prolonged_eye_closure: EyeOff,
  pattern_eye_closure_yawn: AlertTriangle,
  pattern_repeated_eye_closure: Repeat,
  face_not_detected: CameraOff,
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

function RiskBadge({ tone, label, compact = false }) {
  const Icon = RISK_ICONS[tone] || ShieldCheck
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold ${
        compact ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-xs'
      } ${RISK_BADGE_CLASSES[tone] || RISK_BADGE_CLASSES.emerald}`}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
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

// All three pinned to Asia/Manila (see lib/manilaTime.js) -- previously
// regex-extracted the raw digit characters straight out of the UTC-stored
// ISO string with no timezone conversion at all, displaying the UTC clock
// reading mislabeled as local time (8 hours behind real Manila time).
function formatAlertTimestamp(value) {
  return formatManilaTimestamp(value)
}

// Compact "Jul 22" / "7:10am" variants, for the mobile Trip Log card list
// where a full "July 22, 7:10 am" per timestamp (x2 per row) doesn't fit.
function formatShortDate(value) {
  return formatManilaShortDate(value)
}

function formatShortTime(value) {
  return formatManilaShortTime(value)
}

function PerformancePanel({ title, icon: Icon, children, right }) {
  return (
    <section className="rounded-2xl border border-amber-200/70 bg-white p-3 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-amber-600 sm:h-4 sm:w-4" />}
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">{title}</p>
        </div>
        {right ? <div className="shrink-0 text-[10px] text-slate-500 sm:text-xs">{right}</div> : null}
      </div>
      <div className="mt-2.5 sm:mt-3.5">{children}</div>
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
    <div className="rounded-2xl border border-amber-200/70 bg-white p-2.5 shadow-sm sm:p-3.5">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md sm:h-7 sm:w-7 sm:rounded-lg ${METRIC_TILE_ICON_CLASSES[tone]}`}>
          {Icon && <Icon className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" />}
        </div>
        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500 sm:text-xs sm:tracking-[0.1em]">{label}</span>
      </div>
      <p className="mt-1.5 text-base font-bold text-slate-900 sm:mt-2 sm:text-xl">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">{hint}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small sample fallback (frontend-only, no backend/API call) — shown only
// when the real query below comes back with zero sessions in the last 7
// days (a driver who hasn't completed any trips yet), so the page
// demonstrates its layout instead of just reading "no trip data" on a fresh
// account. Deliberately a handful of rows, not a full fabricated week, and
// clearly labeled as sample data (see the banner below) rather than passed
// off as real history -- misrepresenting a driver's own safety record isn't
// the kind of thing this app should ever do, even as a placeholder.
// Timestamps are generated relative to "now" at module load rather than
// hardcoded dates, so they always fall inside whatever "last 7 days" window
// is actually being queried, no matter when this is viewed.
// ---------------------------------------------------------------------------

function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

const SAMPLE_SESSIONS = [
  {
    session_id: 'SAMPLE-2',
    created_at: hoursAgoIso(20),
    start_time: hoursAgoIso(20),
    end_time: hoursAgoIso(19.3),
    total_alerts: 1,
    session_duration: 2520,
  },
  {
    session_id: 'SAMPLE-1',
    created_at: hoursAgoIso(68),
    start_time: hoursAgoIso(68),
    end_time: hoursAgoIso(67.2),
    total_alerts: 2,
    session_duration: 2880,
  },
]

const SAMPLE_ALERTS = [
  { id: 'SAMPLE-A3', created_at: hoursAgoIso(19.6), event_type: 'prolonged_eye_closure', duration: 40, session_id: 'SAMPLE-2' },
  { id: 'SAMPLE-A2', created_at: hoursAgoIso(67.6), event_type: 'pattern_eye_closure_yawn', duration: 35, session_id: 'SAMPLE-1' },
  { id: 'SAMPLE-A1', created_at: hoursAgoIso(67.9), event_type: 'prolonged_eye_closure', duration: 50, session_id: 'SAMPLE-1' },
]

// Same performance data source as SupCrewProfile.jsx's Performance tab
// (alerts + sessions from the last 7 days), but properly scoped to the
// calling driver's own rows rather than that page's unscoped query --
// `sessions` has RLS ("assigned crew can read own sessions", see RLS.md)
// keying off the caller's own driver_records.id, so a plain query already
// returns only this driver's sessions. `alerts` has no such per-driver RLS
// (see DATABASE.md's alerts Grants note -- `authenticated` gets a blanket
// `select`), so it's explicitly filtered to this driver's own session_ids
// afterward rather than trusted to scope itself.
function useDriverPerformanceData() {
  const [alerts, setAlerts] = useState([])
  const [sessions, setSessions] = useState([])
  const [isPerformanceLoading, setIsPerformanceLoading] = useState(true)
  const [performanceError, setPerformanceError] = useState('')
  const [isSampleData, setIsSampleData] = useState(false)

  useEffect(() => {
    let isMounted = true
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    async function loadPerformance() {
      setIsPerformanceLoading(true)
      setPerformanceError('')

      const sessionsRes = await supabase
        .from('sessions')
        .select('session_id, created_at, start_time, end_time, total_alerts, session_duration')
        .gte('created_at', since)
        .order('created_at', { ascending: false })

      if (!isMounted) return

      if (sessionsRes.error) {
        setPerformanceError(sessionsRes.error.message)
        setSessions(SAMPLE_SESSIONS)
        setAlerts(SAMPLE_ALERTS)
        setIsSampleData(true)
        setIsPerformanceLoading(false)
        return
      }

      const realSessions = sessionsRes.data || []
      if (realSessions.length === 0) {
        // No real trips in the window at all -- show the small sample set
        // instead of an empty page. Deliberately not done when sessions
        // exist but have zero alerts (a genuinely clean week) -- that's
        // real data, not something to paper over with fake alerts.
        setSessions(SAMPLE_SESSIONS)
        setAlerts(SAMPLE_ALERTS)
        setIsSampleData(true)
        setIsPerformanceLoading(false)
        return
      }

      const sessionIds = realSessions.map((s) => s.session_id)
      const alertsRes = await supabase
        .from('alerts')
        .select('id, created_at, event_type, duration, session_id')
        .in('session_id', sessionIds)
        .gte('created_at', since)
        .order('created_at', { ascending: false })

      if (!isMounted) return

      if (alertsRes.error) {
        setPerformanceError(alertsRes.error.message)
        setAlerts([])
      } else {
        setAlerts(alertsRes.data || [])
      }
      setSessions(realSessions)
      setIsSampleData(false)
      setIsPerformanceLoading(false)
    }

    loadPerformance()
    return () => {
      isMounted = false
    }
  }, [])

  return { alerts, sessions, isPerformanceLoading, performanceError, isSampleData }
}

function DriverPerformance() {
  const { alerts, sessions, isPerformanceLoading, performanceError, isSampleData } = useDriverPerformanceData()

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
      const startDateLabel = latestSession.start_time ? formatShortDate(latestSession.start_time) : '--'
      const startTimeLabel = latestSession.start_time ? formatShortTime(latestSession.start_time) : '--'
      const endTimeLabel = latestSession.end_time ? formatShortTime(latestSession.end_time) : '--'
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
      const detectionLabel = latestDetection ? ALERT_TYPE_LABELS[latestDetection] || latestDetection : null

      // Same fields as before (start/end, alert count, last detection, the
      // list of detected types) but laid out as compact inline label:value
      // pairs + tag pills instead of five stacked label-above-value blocks
      // — the old layout took ~5 full rows on mobile for what's really
      // just three pieces of information.
      tripStatusValue = (
        <div className="space-y-2 sm:space-y-2.5">
          <p className="text-xs text-slate-600 sm:text-sm">
            {hasOngoingTrip ? (
              <>
                Started{' '}
                <span className="font-semibold text-slate-900">
                  {startDateLabel}, {startTimeLabel}
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-900">{startDateLabel}</span>
                <span className="text-slate-400"> &bull; </span>
                <span className="font-semibold text-slate-900">
                  {startTimeLabel}&ndash;{endTimeLabel}
                </span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                {hasOngoingTrip ? 'Current alerts' : 'Total alerts'}
              </span>
              <span className="text-sm font-bold text-slate-900">{tripAlertCount}</span>
            </span>
            {detectionLabel ? (
              <span className="inline-flex min-w-0 items-baseline gap-1.5">
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                  {hasOngoingTrip ? 'Detecting' : 'Last detection'}
                </span>
                <span className="truncate text-xs font-semibold text-slate-700">{detectionLabel}</span>
              </span>
            ) : null}
          </div>
          {detectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {detectedLabels.map((entry) => (
                <span
                  key={entry}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                >
                  {entry}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )
    }

    const alertsByType = {}
    const hourlyCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, alerts: 0 }))
    alerts.forEach((item) => {
      // Manila-pinned (see lib/manilaTime.js) -- .getHours() reads the
      // browser's own local timezone, not necessarily Manila's.
      const hour = getManilaHour(item.created_at)
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
    const dayLabel = session.start_time ? getManilaWeekday(session.start_time) : '--'
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
      <div className="flex w-full min-w-0 flex-col gap-3 pb-8 sm:gap-5 sm:pb-10">
        {performanceError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 sm:p-4 sm:text-sm">
            {performanceError}
          </div>
        ) : null}

        {!isPerformanceLoading && isSampleData ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 sm:gap-3 sm:p-4 sm:text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>
              Showing sample data — you haven't completed any trips in the last 7 days yet. Your real performance
              stats will appear here once you have.
            </p>
          </div>
        ) : null}

        {/* Hero row — "right now" and "this week" side by side */}
        <div className="grid gap-2.5 sm:gap-4 lg:grid-cols-2">
          <section
            className={`rounded-2xl border p-3 shadow-sm sm:p-5 ${
              HERO_TONE_CLASSES[heroKpi?.tone] || 'border-amber-200/70 bg-white'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.2em]">
                {heroKpi?.label}
              </span>
              {!isPerformanceLoading && heroKpi?.statusLabel ? (
                <RiskBadge tone={heroKpi.tone} label={heroKpi.statusLabel} />
              ) : null}
            </div>
            <div className="mt-2.5 sm:mt-3.5">
              {isPerformanceLoading ? (
                <p className="text-xs text-slate-500 sm:text-sm">Loading your trip status…</p>
              ) : typeof heroKpi?.value === 'string' ? (
                <p className="text-xs text-slate-500 sm:text-sm">No trip data in the last 7 days.</p>
              ) : (
                heroKpi.value
              )}
            </div>
          </section>

          <section
            className={`rounded-2xl border p-3 shadow-sm sm:p-5 ${
              HERO_TONE_CLASSES[weeklyRisk.tone] || 'border-amber-200/70 bg-white'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.2em]">
                This Week (7 Days)
              </span>
              {!isPerformanceLoading && sessions.length > 0 ? (
                <RiskBadge tone={weeklyRisk.tone} label={weeklyRisk.label} />
              ) : null}
            </div>
            <div className="mt-2.5 sm:mt-3.5">
              {isPerformanceLoading ? (
                <p className="text-xs text-slate-500 sm:text-sm">Loading your weekly summary…</p>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-slate-500 sm:text-sm">No trips recorded in the last 7 days.</p>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-900 sm:text-sm">
                    Your performance this week was{' '}
                    <span className={RISK_TEXT_CLASSES[weeklyRisk.tone] || 'text-slate-900'}>
                      {weeklyRisk.label}
                    </span>
                    .
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
                    {weeklyRisk.tone === 'red' && worstSession
                      ? `Your ${formatAlertTimestamp(worstSession.start_time)} trip had ${
                          worstSession.total_alerts
                        } alerts — the most this week.`
                      : weeklyRisk.tone === 'amber' && worstSession
                      ? `Your busiest trip this week had ${worstSession.total_alerts} alerts.`
                      : 'No high-alert trips this week — keep it up.'}
                  </p>

                  {/* Per-trip trend, oldest to newest — exactly 7 days, so a
                      fixed 7-column grid always fits without needing to
                      scroll or force a min-width like the 24-hour chart. */}
                  <div className="mt-2.5 grid grid-cols-7 gap-1.5 sm:mt-3.5 sm:gap-2">
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
                          className="flex flex-col items-center gap-1"
                          title={`${day.dayLabel} — ${day.alerts} alert${day.alerts === 1 ? '' : 's'}`}
                        >
                          <span className="text-[9px] font-semibold text-slate-500 sm:text-[10px]">
                            {day.alerts > 0 ? day.alerts : ''}
                          </span>
                          <div className="flex h-11 w-full items-end rounded-md bg-slate-100 sm:h-16">
                            <div
                              className={`w-full rounded-md transition ${barColor}`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-400 sm:text-[10px]">{day.dayLabel}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Insight — a plain-language read on the same data above, so drivers
            don't have to interpret the chart/breakdown themselves. */}
        {hasInsight ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200/70 bg-amber-50 p-2.5 text-xs text-amber-900 sm:gap-3 sm:p-4 sm:text-sm">
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
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
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
        <div className="grid gap-2.5 sm:gap-4 lg:grid-cols-2">
          <PerformancePanel title="Alert Type Breakdown" icon={ListChecks}>
            <p className="text-[11px] text-slate-500 sm:text-xs">
              Most frequent —{' '}
              <span className="font-semibold text-slate-700">
                {isPerformanceLoading
                  ? '…'
                  : sortedAlertTypes[0]?.count
                  ? sortedAlertTypes[0].type
                  : 'No alerts'}
              </span>
            </p>
            <div className="mt-2 space-y-2 sm:mt-3 sm:space-y-2.5">
              {sortedAlertTypes.map((row) => {
                const TypeIcon = ALERT_TYPE_ICON_BY_LABEL[row.type] || Activity
                return (
                  <div key={row.type} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 sm:text-xs">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium text-slate-700">
                        <TypeIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{row.type}</span>
                      </span>
                      <span className="shrink-0">{isPerformanceLoading ? '…' : `${row.count} · ${row.share}`}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-amber-500"
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
              <p className="text-xs text-slate-500 sm:text-sm">Loading…</p>
            ) : maxAlerts === 0 ? (
              <p className="text-xs text-slate-500 sm:text-sm">No alerts recorded in the last 7 days.</p>
            ) : (
              // Fluid, no forced min-width/overflow-x-auto — all 24 bars
              // always fit the card width, even on a narrow phone. Labels
              // thin out to every 4th hour (plus the peak) so they stay
              // legible instead of overlapping at mobile widths.
              <div className="flex items-end gap-[3px] sm:gap-1.5">
                {hourly.map((row, idx) => {
                  const isPeak = row.hour === peakHour.hour && row.alerts > 0
                  const heightPct = row.alerts > 0 ? Math.max((row.alerts / maxAlerts) * 100, 12) : 0
                  const showLabel = isPeak || idx % 4 === 0
                  return (
                    <div
                      key={row.hour}
                      className="flex flex-1 flex-col items-center gap-1"
                      title={`${row.hour} — ${row.alerts} alert${row.alerts === 1 ? '' : 's'}`}
                    >
                      <div className="flex h-11 w-full items-end rounded-sm bg-slate-100 sm:h-16 sm:rounded-md">
                        <div
                          className={`w-full rounded-[1px] transition sm:rounded-md ${isPeak ? 'bg-amber-600' : 'bg-amber-300'}`}
                          style={{ height: `${heightPct}%` }}
                          aria-label={`${row.hour} ${row.alerts} alerts`}
                        />
                      </div>
                      <span
                        className={`text-[8px] sm:text-[10px] ${
                          isPeak ? 'font-semibold text-amber-700' : 'text-slate-400'
                        }`}
                      >
                        {showLabel ? row.hour.slice(0, 2) : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </PerformancePanel>
        </div>

        <div className="grid gap-2.5 sm:gap-4 lg:grid-cols-2">
          <PerformancePanel
            title="Recent Alerts"
            icon={AlertTriangle}
            right={!isPerformanceLoading ? `${latestAlerts.length} in 7 days` : null}
          >
            <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1 sm:max-h-[360px] sm:space-y-2">
              {(isPerformanceLoading ? [] : latestAlerts).map((alert) => {
                const TypeIcon = ALERT_TYPE_ICON_BY_LABEL[alert.type] || Activity
                const displayDuration = formatAlertDuration(alert.duration)
                const hasDuration = displayDuration !== '--' && displayDuration !== '0m'
                return (
                  <div
                    key={alert.id}
                    className="flex items-center gap-2 rounded-lg border border-amber-100/70 bg-amber-50/60 px-2.5 py-1.5 sm:gap-3 sm:rounded-xl sm:px-3.5 sm:py-2.5"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-inset ring-amber-200 sm:h-8 sm:w-8">
                      <TypeIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900 sm:text-sm">{alert.type}</p>
                      <p className="truncate text-[10px] text-slate-500 sm:text-xs">{formatAlertTimestamp(alert.createdAt)}</p>
                    </div>
                    {hasDuration ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 sm:px-2.5 sm:py-1 sm:text-xs">
                        {displayDuration}
                      </span>
                    ) : null}
                  </div>
                )
              })}
              {!isPerformanceLoading && latestAlerts.length === 0 ? (
                <p className="text-xs text-slate-500 sm:text-sm">No alerts found in the last 7 days.</p>
              ) : null}
            </div>
          </PerformancePanel>

          <PerformancePanel title="Trip Log" icon={ClipboardList} right="Last 7 days">
            {/* Mobile: a compact card list — the desktop table's 5 columns
                (each holding a full "July 22, 7:10 am" timestamp) can't fit
                a phone width without horizontal scroll, so this reorganizes
                the same fields into two stacked lines per trip instead of
                just shrinking the table. */}
            <div className="space-y-1.5 sm:hidden">
              {(isPerformanceLoading ? [] : recentSessions).map((session) => {
                const risk = getRiskLevel(session.alerts)
                return (
                  <div
                    key={session.sessionId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-100/70 bg-white px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{formatShortDate(session.start)}</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">
                        {formatShortTime(session.start)}–{formatShortTime(session.end)} · {formatAlertDuration(session.duration)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">{session.alerts} alert{session.alerts === 1 ? '' : 's'}</span>
                      <RiskBadge tone={risk.tone} label={risk.label} compact />
                    </div>
                  </div>
                )
              })}
              {!isPerformanceLoading && recentSessions.length === 0 ? (
                <p className="text-xs text-slate-500">No sessions found in the last 7 days.</p>
              ) : null}
            </div>

            {/* Desktop: full table, same data. */}
            <div className="hidden overflow-hidden rounded-2xl border border-amber-200/70 sm:block">
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
              {!isPerformanceLoading && recentSessions.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">No sessions found in the last 7 days.</p>
              ) : null}
            </div>
          </PerformancePanel>
        </div>
      </div>
    </DriverLayout>
  )
}

export default DriverPerformance
