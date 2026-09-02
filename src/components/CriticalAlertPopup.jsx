import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

// Reuses the Driver portal's own "5+ Multiple Alert" clip (DriverDeliveries.jsx)
// rather than a new asset -- it's already this app's vocabulary for "an
// escalated, attention-grabbing safety moment," which is exactly what both
// critical-alert types here are.
const ALERT_AUDIO_SRC = encodeURI("/5+ Multiple Alert.mp3");

// Browsers block <audio>.play() with no prior user interaction on the page.
// Identical technique to DriverDeliveries.jsx's unlockAlertAudio -- play
// muted-and-immediately-paused on the Supervisor's first click anywhere on
// the page (there's no trip-lifecycle gesture like Driver's Start Trip to
// hook into instead), so a later real alert can just play.
function unlockAlertAudio(audioEl) {
  if (!audioEl) return;
  const wasMuted = audioEl.muted;
  audioEl.muted = true;
  audioEl
    .play()
    .then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.muted = wasMuted;
    })
    .catch(() => {
      audioEl.muted = wasMuted;
    });
}

// Plays the clip twice in a row, same reasoning as DriverDeliveries.jsx's
// playAlertClip -- one pass isn't attention-grabbing enough for a critical
// real-time incident.
function playAlertClip(audioEl) {
  if (!audioEl) return;
  const attemptPlay = () =>
    audioEl.play().catch((err) => {
      console.warn("Critical alert audio failed to play:", err);
    });
  const playSecondTime = () => {
    audioEl.removeEventListener("ended", playSecondTime);
    audioEl.currentTime = 0;
    attemptPlay();
  };
  audioEl.addEventListener("ended", playSecondTime, { once: true });
  audioEl.currentTime = 0;
  attemptPlay();
}

// Pop-up + sound for critical real-time incidents (Very High Risk of
// Drowsiness / Very High Possibility of Route Deviation) -- see the two
// SupDashboard.jsx useFleetOps INSERT handlers that populate `alerts`.
// Deliberately narrow: everything else (ordinary drowsiness alerts, paused-
// movement anomalies) stays in the existing passive DriverSafetyList/
// PausedMovementBanner feeds, exactly so this doesn't become notification
// spam -- only these two named, threshold-crossing events reach this popup.
export default function CriticalAlertPopup({ alerts, onDismiss }) {
  const audioRef = useRef(null);
  const playedKeysRef = useRef(new Set());

  useEffect(() => {
    const unlock = () => {
      unlockAlertAudio(audioRef.current);
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
    playAlertClip(audioRef.current);
  }, [current]);

  return (
    <>
      <audio ref={audioRef} src={ALERT_AUDIO_SRC} preload="auto" hidden />
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
              <Link
                to="/supervisor/deliveries"
                state={{ openRequestId: current.deliveryId }}
                onClick={() => onDismiss(current.key)}
                className="text-sm font-semibold text-blue-700 hover:underline"
              >
                View Delivery →
              </Link>
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
