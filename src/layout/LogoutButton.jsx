import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import { clearProfileCache } from "../lib/useUserInitials.js";

function LogoutButton({
  isExpanded,
  iconClassName = "h-5 w-5 stroke-current",
  compact = false,
}) {
  const navigate = useNavigate();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const openConfirm = (event) => {
    event.stopPropagation();
    setIsConfirmOpen(true);
  };

  const cancelLogout = (event) => {
    event.stopPropagation();
    if (isLoggingOut) {
      return;
    }
    setIsConfirmOpen(false);
  };

  const confirmLogout = async (event) => {
    event.stopPropagation();
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    clearProfileCache();
    try {
      sessionStorage.clear();
    } catch (e) {
      console.warn("Failed to clear sessionStorage on logout", e);
    }
    navigate("/", { replace: true });
  };

  return (
    <>
      <button
        type="button"
        aria-label="Log out"
        onClick={openConfirm}
        className={`flex items-center justify-start rounded-lg border border-transparent text-sm text-red-300 transition-all duration-200 hover:border-red-700 hover:bg-red-900/30 ${
          compact ? "px-2.5 py-2" : "px-3 py-2.5"
        } ${isExpanded ? "gap-3" : "gap-0"}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="1.6"
          className={iconClassName}
          aria-hidden="true"
        >
          <path d="M15 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
          <path d="M10 12h10" />
          <path d="M17 8l4 4-4 4" />
        </svg>
        <span
          className={`inline-flex overflow-hidden whitespace-nowrap font-semibold uppercase transition-all duration-200 ease-out ${
            compact ? "text-[11px] tracking-wide" : "text-xs tracking-[0.2em]"
          } ${
            isExpanded
              ? "max-w-40 opacity-100 translate-x-0"
              : "max-w-0 opacity-0 -translate-x-2"
          }`}
        >
          Log Out
        </span>
      </button>

      {isConfirmOpen
        ? createPortal(
            <div
              // z-[1000], not z-[60] -- Leaflet's own panes/controls (react-
              // leaflet maps like RouteDeviationMap/SuggestedRouteMap in
              // SupDeliveries.jsx) go up to z-index 1000 by default, so a
              // lower value here let a live map paint over this backdrop
              // instead of being dimmed beneath it (same reasoning
              // CustomerRequestDelivery.jsx's own modals already use z-[1000]
              // for, on its own map-bearing page).
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 px-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                <p className="text-xs uppercase tracking-[0.24em] text-red-600">
                  Log Out
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  Log out of your account?
                </h2>
                <p className="mt-3 text-sm text-slate-600">
                  You'll need to sign in again to continue.
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-60"
                    onClick={cancelLogout}
                    disabled={isLoggingOut}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
                    onClick={confirmLogout}
                    disabled={isLoggingOut}
                  >
                    {isLoggingOut ? "Logging out..." : "Log Out"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export default LogoutButton;
