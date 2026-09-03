import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

// Synthesized via Web Audio API rather than reusing the Driver portal's
// "Usual Alert"/"5+ Multiple Alert" clips (DriverDeliveries.jsx) -- those are
// the Driver's own vocabulary for their two severity tiers, and reusing one
// here made the Supervisor popup indistinguishable-by-ear from a Driver-side
// alert. This is a two-tone descending siren (unique to the Supervisor
// surface), played twice in a row for the same "one pass isn't
// attention-grabbing enough" reasoning the Driver clips use.
function playCriticalTone(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const beep = (startAt, freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, startAt);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
    gain.gain.linearRampToValueAtTime(0, startAt + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + 0.22);
  };
  // Two descending two-tone bursts (siren-like), a beat apart.
  [0, 0.5].forEach((offset) => {
    beep(now + offset, 1046.5); // C6
    beep(now + offset + 0.24, 830.6); // G#5
  });
}

// Pop-up + sound for critical real-time incidents (Very High Risk of
// Drowsiness / Very High Possibility of Route Deviation) -- see the two
// SupDashboard.jsx useFleetOps INSERT handlers that populate `alerts`.
// Deliberately narrow: everything else (ordinary drowsiness alerts, paused-
// movement anomalies) stays in the existing passive DriverSafetyList/
// PausedMovementBanner feeds, exactly so this doesn't become notification
// spam -- only these two named, threshold-crossing events reach this popup.
// deliveryLinkTo: base path for "View Delivery →" (defaults to the
// Supervisor's own deliveries page). Pass null to omit that link entirely --
// used by AdminDashboard.jsx, which has no deliveries page to deep-link into.
export default function CriticalAlertPopup({ alerts, onDismiss, deliveryLinkTo = "/supervisor/deliveries" }) {
  const audioCtxRef = useRef(null);
  const playedKeysRef = useRef(new Set());

  useEffect(() => {
    // AudioContext must be created (or resumed) from a real user gesture --
    // same browser restriction the Driver portal's <audio> unlock works
    // around, just the Web Audio API's version of it.
    const unlock = () => {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
      document.removeEventListener("pointerdown", unlock);
    };
    document.addEventListener("pointerdown", unlock);
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  // Plays once per newly-arrived alert, not on every re-render (e.g.
  // dismissing one alert while a second is still queued shouldn't replay).
  const current = alerts[0] || null;
  useEffect(() => {
    if (!current || playedKeysRef.current.has(current.key)) return;
    playedKeysRef.current.add(current.key);
    playCriticalTone(audioCtxRef.current);
  }, [current]);

  return (
    <>
      {current && (
        <div
          role="alertdialog"
          aria-labelledby="critical-alert-title"
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 px-4 pt-20"
        >
          <div className="w-full max-w-md rounded-2xl border-2 border-red-500 bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3
                id="critical-alert-title"
                className="text-sm font-bold uppercase tracking-wide"
              >
                {current.title}
              </h3>
            </div>
            <p className="mt-2 text-sm text-slate-700">{current.message}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              {deliveryLinkTo ? (
                <Link
                  to={deliveryLinkTo}
                  state={{ openRequestId: current.deliveryId }}
                  onClick={() => onDismiss(current.key)}
                  className="text-sm font-semibold text-blue-700 hover:underline"
                >
                  View Delivery →
                </Link>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => onDismiss(current.key)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Dismiss
              </button>
            </div>
            {alerts.length > 1 && (
              <p className="mt-2 text-[10px] text-slate-400">
                {alerts.length - 1} more critical alert
                {alerts.length - 1 === 1 ? "" : "s"} waiting
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
