import { distanceMeters, classifyRouteDeviation } from "./suggestedRoute.js";
import { getManilaHour, formatManilaTimestamp } from "./manilaTime.js";

const ALERT_TYPE_LABELS = {
  prolonged_eye_closure: "Prolonged Eye Closure",
  pattern_eye_closure_yawn: "Eye Closure + Yawn",
  pattern_repeated_eye_closure: "Repeated Eye Closure",
  face_not_detected: "Eyes Not Detected",
};

const NAV_LEG_COLORS = [
  "#0D9488",
  "#2563EB",
  "#059669",
  "#7C3AED",
  "#EA580C",
  "#DB2777",
];

export function getRiskLevel(alertCount) {
  if (alertCount >= 4) return { tone: "red", label: "High Risk" };
  if (alertCount >= 2) return { tone: "amber", label: "Moderate" };
  return { tone: "emerald", label: "Safe" };
}

function formatAlertDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatAlertTimestamp(value) {
  return formatManilaTimestamp(value);
}

export const COMPLETED_REPORT_DATA = {
  "DEL-004": {
    routeDeviation: {
      planned: [
        [14.56, 121.07],
        [14.557, 121.06],
        [14.555, 121.053],
        [14.553, 121.048],
        [14.55, 121.047],
      ],
      actual: [
        [14.56, 121.07],
        [14.557, 121.06],
        [14.562, 121.055],
        [14.555, 121.052],
        [14.553, 121.048],
        [14.55, 121.047],
      ],
      plannedDistance: "5.8 km",
      actualDistance: "6.4 km",
      deviationDistance: "0.6 km",
      deviationPercent: 10.3,
      aiSummary:
        "Minor route deviation detected. The driver briefly deviated north near the C5-Meralco intersection, adding approximately 0.6 km to the planned route. This appears to be a navigation correction rather than an intentional detour. No significant impact on delivery time or safety.",
      aiVerdict: "Minor Deviation",
      aiVerdictTone: "amber",
    },
    trip: {
      route: "Pasig Hub → BGC Branch",
      distance: "14.2 km",
      duration: "45 min",
      startTime: "2026-07-20T08:30:00",
      endTime: "2026-07-20T09:15:00",
      stops: [
        { location: "Pasig Hub", time: "08:30", action: "Departure" },
        { location: "C5 Road Checkpoint", time: "08:48", action: "Waypoint" },
        { location: "BGC Branch", time: "09:15", action: "Drop-off Completed" },
      ],
      timeline: [
        { label: "Departed for Pickup", time: "08:00", completed: true },
        { label: "Arrived at Pickup Location", time: "08:15", completed: true },
        { label: "Departed for Drop Off", time: "08:30", completed: true },
        {
          label: "Arrived at Drop Off Location",
          time: "09:10",
          completed: true,
        },
        { label: "Delivery Completed", time: "09:15", completed: true },
      ],
    },
    behavior: {
      totalAlerts: 2,
      avgAlertsPerTrip: 2.0,
      riskLevel: getRiskLevel(2),
      alertsByType: [
        {
          type: "prolonged_eye_closure",
          count: 1,
          label: "Prolonged Eye Closure",
        },
        {
          type: "pattern_repeated_eye_closure",
          count: 1,
          label: "Repeated Eye Closure",
        },
      ],
      sessions: [
        {
          start: "2026-07-20T08:30:00",
          end: "2026-07-20T09:15:00",
          alerts: 2,
          duration: 2700,
        },
      ],
    },
    delivery: {
      totalAlerts: 2,
      totalSessions: 1,
      avgAlertDuration: "47s",
      peakAlertTime: "08:45 AM",
      eyeClosureAlerts: [
        {
          id: "A-1",
          time: "2026-07-20T08:42:00",
          type: "prolonged_eye_closure",
          duration: 45,
          severity: "Moderate",
        },
        {
          id: "A-2",
          time: "2026-07-20T08:55:00",
          type: "pattern_repeated_eye_closure",
          duration: 50,
          severity: "High",
        },
      ],
      history: [
        {
          event: "Delivery Request Created",
          timestamp: "2026-07-18T10:00:00",
          actor: "System",
        },
        {
          event: "Quotation Approved",
          timestamp: "2026-07-18T14:30:00",
          actor: "Supervisor",
        },
        {
          event: "Crew Assigned — Carlos Mendoza + ABC 1234",
          timestamp: "2026-07-19T08:00:00",
          actor: "Supervisor",
        },
        {
          event: "Picked Up from Pasig Hub",
          timestamp: "2026-07-20T08:30:00",
          actor: "Driver",
        },
        {
          event: "Delivered to BGC Branch",
          timestamp: "2026-07-20T09:15:00",
          actor: "Driver",
        },
        {
          event: "Marked as Completed",
          timestamp: "2026-07-20T09:20:00",
          actor: "System",
        },
      ],
    },
  },
  "DEL-005": {
    routeDeviation: {
      planned: [
        [14.3, 120.96],
        [14.32, 120.97],
        [14.35, 120.985],
        [14.38, 121.0],
        [14.4, 121.015],
        [14.42, 121.031],
      ],
      actual: [
        [14.3, 120.96],
        [14.31, 120.965],
        [14.33, 120.945],
        [14.36, 120.965],
        [14.39, 121.01],
        [14.41, 121.025],
        [14.42, 121.031],
      ],
      plannedDistance: "18.2 km",
      actualDistance: "22.8 km",
      deviationDistance: "4.6 km",
      deviationPercent: 25.3,
      aiSummary:
        "Significant route deviation detected. The driver took an alternative route through General Trias residential areas instead of staying on Aguinaldo Highway, adding 4.6 km to the planned route. This deviation is notable and may indicate driver unfamiliarity with the area or a deliberate choice to avoid traffic. Recommend reviewing the trip log for this delivery to assess any impact on schedule or fuel efficiency.",
      aiVerdict: "Significant Deviation",
      aiVerdictTone: "red",
    },
    trip: {
      route: "Cavite Depot → Alabang Branch",
      distance: "22.8 km",
      duration: "55 min",
      startTime: "2026-07-19T06:00:00",
      endTime: "2026-07-19T06:55:00",
      stops: [
        { location: "Cavite Depot", time: "06:00", action: "Departure" },
        { location: "General Trias Toll", time: "06:20", action: "Waypoint" },
        {
          location: "Alabang Branch",
          time: "06:55",
          action: "Drop-off Completed",
        },
      ],
      timeline: [
        { label: "Departed for Pickup", time: "05:30", completed: true },
        { label: "Arrived at Pickup Location", time: "05:45", completed: true },
        { label: "Departed for Drop Off", time: "06:00", completed: true },
        {
          label: "Arrived at Drop Off Location",
          time: "06:48",
          completed: true,
        },
        { label: "Delivery Completed", time: "06:55", completed: true },
      ],
    },
    behavior: {
      totalAlerts: 5,
      avgAlertsPerTrip: 5.0,
      riskLevel: getRiskLevel(5),
      alertsByType: [
        {
          type: "prolonged_eye_closure",
          count: 2,
          label: "Prolonged Eye Closure",
        },
        {
          type: "pattern_eye_closure_yawn",
          count: 2,
          label: "Eye Closure + Yawn",
        },
        {
          type: "pattern_repeated_eye_closure",
          count: 1,
          label: "Repeated Eye Closure",
        },
      ],
      sessions: [
        {
          start: "2026-07-19T06:00:00",
          end: "2026-07-19T06:55:00",
          alerts: 5,
          duration: 3300,
        },
      ],
    },
    delivery: {
      totalAlerts: 5,
      totalSessions: 1,
      avgAlertDuration: "52s",
      peakAlertTime: "06:30 AM",
      eyeClosureAlerts: [
        {
          id: "A-3",
          time: "2026-07-19T06:12:00",
          type: "prolonged_eye_closure",
          duration: 60,
          severity: "High",
        },
        {
          id: "A-4",
          time: "2026-07-19T06:20:00",
          type: "pattern_eye_closure_yawn",
          duration: 45,
          severity: "Moderate",
        },
        {
          id: "A-5",
          time: "2026-07-19T06:28:00",
          type: "pattern_eye_closure_yawn",
          duration: 55,
          severity: "High",
        },
        {
          id: "A-6",
          time: "2026-07-19T06:35:00",
          type: "prolonged_eye_closure",
          duration: 50,
          severity: "Moderate",
        },
        {
          id: "A-7",
          time: "2026-07-19T06:42:00",
          type: "pattern_repeated_eye_closure",
          duration: 50,
          severity: "High",
        },
      ],
      history: [
        {
          event: "Delivery Request Created",
          timestamp: "2026-07-17T09:00:00",
          actor: "System",
        },
        {
          event: "Quotation Approved",
          timestamp: "2026-07-17T15:00:00",
          actor: "Supervisor",
        },
        {
          event: "Crew Assigned — Miguel Santos + XYZ 5678",
          timestamp: "2026-07-18T10:00:00",
          actor: "Supervisor",
        },
        {
          event: "Picked Up from Cavite Depot",
          timestamp: "2026-07-19T06:00:00",
          actor: "Driver",
        },
        {
          event: "Delivered to Alabang Branch",
          timestamp: "2026-07-19T06:55:00",
          actor: "Driver",
        },
        {
          event: "Marked as Completed",
          timestamp: "2026-07-19T07:00:00",
          actor: "System",
        },
      ],
    },
  },
};

export function buildRealDriverTripReport(delivery, sessions, alerts, gpsLogs, rerouteEvents = []) {
  if (!sessions.length) return null;

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.start_time) - new Date(b.start_time),
  );
  const firstSession = sorted[0];
  const mainSessions = sorted.filter((s) => !s.is_return_trip);
  const lastMainSession = mainSessions[mainSessions.length - 1] || sorted[sorted.length - 1];
  const totalDurationSec = sorted.reduce(
    (sum, s) => sum + (s.session_duration || 0),
    0,
  );

  const bySessionId = {};
  for (const row of gpsLogs) {
    if (!bySessionId[row.session_id]) bySessionId[row.session_id] = [];
    bySessionId[row.session_id].push(row);
  }
  let totalMeters = 0;
  for (const points of Object.values(bySessionId)) {
    for (let i = 1; i < points.length; i += 1) {
      totalMeters += distanceMeters(
        points[i - 1].latitude,
        points[i - 1].longitude,
        points[i].latitude,
        points[i].longitude,
      );
    }
  }

  const dropoffEvents = [];
  if (delivery.dropoffCompletedAt) {
    dropoffEvents.push({
      label: "Dropoff Completed",
      location: delivery.deliveryAddress,
      at: delivery.dropoffCompletedAt,
    });
  }
  (delivery.stops || []).forEach((s, i) => {
    if (s.completed && s.completedAt) {
      dropoffEvents.push({
        label: `Dropoff ${i + 2} Completed`,
        location: s.location,
        at: s.completedAt,
      });
    }
  });
  dropoffEvents.sort((a, b) => new Date(a.at) - new Date(b.at));

  const timeline = [
    delivery.assignedAt && {
      label: "Assigned to Trip",
      time: delivery.assignedAt,
      completed: true,
    },
    {
      label: "Pickup Trip Started",
      time: formatAlertTimestamp(firstSession.start_time),
      completed: true,
    },
    delivery.pickupPhotoUrl && {
      label: "Pickup Confirmed",
      time: "",
      completed: true,
    },
    ...dropoffEvents.map((e) => ({
      label: e.label,
      time: formatAlertTimestamp(e.at),
      completed: true,
    })),
    {
      label: "Delivery Completed",
      time: formatAlertTimestamp(lastMainSession.end_time),
      completed: true,
    },
  ].filter(Boolean);

  const stops = [
    {
      location: delivery.pickupAddress,
      time: formatAlertTimestamp(firstSession.start_time),
      action: "Pickup / Departure",
    },
    ...dropoffEvents.map((e) => ({
      location: e.location,
      time: formatAlertTimestamp(e.at),
      action: e.label,
    })),
  ];

  const history = [
    { event: "Pickup Trip Started", at: firstSession.start_time },
    ...dropoffEvents.map((e) => ({ event: e.label, at: e.at })),
    { event: "Delivery Completed", at: lastMainSession.end_time },
  ].map((e) => ({ event: e.event, timestamp: e.at, actor: "You" }));

  const eyeClosureAlerts = alerts
    .filter((a) => a.event_type !== "face_not_detected")
    .map((a) => ({
      id: a.id,
      type: a.event_type,
      time: a.created_at,
      duration: a.duration,
      severity: (a.duration || 0) >= 20 ? "High" : "Moderate",
    }));
  const avgClosureSec = eyeClosureAlerts.length
    ? eyeClosureAlerts.reduce((sum, a) => sum + (a.duration || 0), 0) /
      eyeClosureAlerts.length
    : null;

  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  alerts.forEach((a) => {
    const hour = getManilaHour(a.created_at);
    if (hour != null) hourlyCounts[hour] += 1;
  });
  let peakHour = null;
  let peakCount = 0;
  hourlyCounts.forEach((count, hour) => {
    if (count > peakCount) {
      peakCount = count;
      peakHour = hour;
    }
  });

  const typeCounts = {};
  alerts.forEach((a) => {
    typeCounts[a.event_type] = (typeCounts[a.event_type] || 0) + 1;
  });
  const alertsByType = Object.keys(ALERT_TYPE_LABELS).map((type) => ({
    type,
    label: ALERT_TYPE_LABELS[type],
    count: typeCounts[type] || 0,
  }));

  const drowsinessAlertCount = alerts.filter(
    (a) => a.event_type !== "face_not_detected",
  ).length;
  const riskLevel = getRiskLevel(drowsinessAlertCount);

  const suggestedRoute = Array.isArray(delivery.suggestedRoute)
    ? delivery.suggestedRoute
    : null;
  const rerouteEventsForDisplay = rerouteEvents.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    reason: r.reason,
  }));
  let routeDeviation = null;
  if (suggestedRoute && suggestedRoute.length > 0) {
    const plannedLegs = suggestedRoute.map((leg, i) => ({
      path: leg.path,
      color: NAV_LEG_COLORS[i % NAV_LEG_COLORS.length],
    }));
    const plannedMeters = suggestedRoute.reduce((sum, leg) => {
      let legMeters = 0;
      for (let i = 1; i < leg.path.length; i += 1) {
        legMeters += distanceMeters(
          leg.path[i - 1][0],
          leg.path[i - 1][1],
          leg.path[i][0],
          leg.path[i][1],
        );
      }
      return sum + legMeters;
    }, 0);
    const mainTotalMeters = mainSessions.reduce((sum, s) => {
      const points = bySessionId[s.session_id] || [];
      let legMeters = 0;
      for (let i = 1; i < points.length; i += 1) {
        legMeters += distanceMeters(
          points[i - 1].latitude,
          points[i - 1].longitude,
          points[i].latitude,
          points[i].longitude,
        );
      }
      return sum + legMeters;
    }, 0);
    const deviationMeters = Math.abs(mainTotalMeters - plannedMeters);
    const pickupLeg = suggestedRoute.find((leg) => leg.to === "pickup");
    const pickupPoint = pickupLeg
      ? pickupLeg.path[pickupLeg.path.length - 1]
      : null;
    const dropoffLeg = suggestedRoute.find((leg) => leg.to === "dropoff");
    const dropoffPoint = dropoffLeg
      ? dropoffLeg.path[dropoffLeg.path.length - 1]
      : null;
    const deviationPercent =
      plannedMeters > 0
        ? Math.round((deviationMeters / plannedMeters) * 100)
        : 0;

    const actualPointsWithTime = mainSessions.flatMap(
      (s) => bySessionId[s.session_id] || [],
    );
    const classification = classifyRouteDeviation({
      plannedPoints: plannedLegs.flatMap((leg) => leg.path),
      actualPoints: actualPointsWithTime,
      plannedMeters,
      totalMeters: mainTotalMeters,
      rerouteSegments: rerouteEvents.map((r) => ({
        path: r.new_path,
        occurredAt: r.occurred_at,
      })),
    });

    let aiVerdict = null;
    let aiVerdictTone = null;
    let aiSummary = null;
    let deviationSegments = [];
    if (classification) {
      aiVerdict = classification.verdict;
      aiVerdictTone = classification.tone;
      const roundedOffset = Math.round(classification.maxOffsetMeters);
      const distanceSavedKm = ((plannedMeters - mainTotalMeters) / 1000).toFixed(1);
      if (classification.verdict === "Beneficial") {
        aiSummary = `Actual distance was ${distanceSavedKm}km shorter than the planned route — likely a more efficient path.`;
      } else if (classification.verdict === "Reasonable") {
        aiSummary = `Truck stayed within ${roundedOffset}m of the planned route throughout — normal route variation, no extended stop detected.`;
      } else if (classification.dwells.length > 0) {
        const longest = [...classification.dwells].sort(
          (a, b) => b.durationMinutes - a.durationMinutes,
        )[0];
        aiSummary = `Truck was off-route for about ${longest.durationMinutes} minutes near ${longest.lat.toFixed(5)}, ${longest.lng.toFixed(5)} starting ${formatAlertTimestamp(longest.startedAt)} — no scheduled stop accounts for this.`;
      } else {
        const p = classification.maxOffsetPoint;
        aiSummary = `Truck deviated up to ${roundedOffset}m from the planned route${p ? ` near ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} at ${formatAlertTimestamp(p.timestamp)}` : ""}, without a corresponding stop.`;
      }
      deviationSegments = classification.dwells.map((d) => ({
        location: `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`,
        extraDistance: `${roundedOffset}m off-route`,
        reason: `Off-route for ${d.durationMinutes} min, ${formatAlertTimestamp(d.startedAt)} – ${formatAlertTimestamp(d.resumedAt)}`,
        severity: d.durationMinutes >= 15 ? "Significant" : "Minor",
      }));
    }

    routeDeviation = {
      plannedLegs,
      actualRoute: mainSessions.flatMap((s) =>
        (bySessionId[s.session_id] || []).map((p) => [p.latitude, p.longitude]),
      ),
      pickupCoords: pickupPoint
        ? { lat: pickupPoint[0], lng: pickupPoint[1] }
        : null,
      dropoffCoords: dropoffPoint
        ? { lat: dropoffPoint[0], lng: dropoffPoint[1] }
        : null,
      plannedDistance:
        plannedMeters > 0 ? `${(plannedMeters / 1000).toFixed(1)} km` : "",
      actualDistance:
        mainTotalMeters > 0 ? `${(mainTotalMeters / 1000).toFixed(1)} km` : "",
      deviationDistance: `${(deviationMeters / 1000).toFixed(1)} km`,
      deviationPercent,
      aiVerdict,
      aiVerdictTone,
      aiSummary,
      deviationSegments,
    };
  }

  return {
    trip: {
      distance: totalMeters > 0 ? `${(totalMeters / 1000).toFixed(1)} km` : "",
      duration: formatAlertDuration(totalDurationSec),
      stops,
      timeline,
    },
    delivery: {
      totalAlerts: alerts.length,
      avgAlertDuration:
        avgClosureSec != null ? `${avgClosureSec.toFixed(1)}s` : "",
      peakAlertTime:
        peakHour != null ? `${String(peakHour).padStart(2, "0")}:00` : "",
      eyeClosureAlerts,
      history,
    },
    behavior: {
      totalAlerts: alerts.length,
      riskLevel,
      alertsByType,
      sessions: sorted.map((s) => ({
        start: s.start_time,
        end: s.end_time,
        alerts:
          s.total_alerts ??
          alerts.filter((a) => a.session_id === s.session_id).length,
        duration: s.session_duration,
        label: s.is_return_trip ? "Return to Base" : null,
      })),
    },
    routeDeviation,
    rerouteEvents: rerouteEventsForDisplay,
  };
}
