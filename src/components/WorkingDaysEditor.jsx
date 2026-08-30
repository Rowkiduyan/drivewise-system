import { useEffect, useState } from "react";
import { CalendarDays, Check, Lock, Pencil } from "lucide-react";
import ConfirmationModal from "./common/ConfirmationModal.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { WORKING_DAY_LABELS } from "../lib/workingDays.js";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function WorkingDaysEditor() {
  const [savedDays, setSavedDays] = useState([]);
  const [selectedDays, setSelectedDays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    let isCurrent = true;

    async function loadAvailability() {
      const { data, error: loadError } = await supabase
        .from("crew_availability")
        .select("day_of_week");

      if (!isCurrent) return;

      if (loadError) {
        setError("Unable to load your working days.");
        setIsLoading(false);
        return;
      }

      const days = (data || []).map((row) => row.day_of_week).sort((a, b) => a - b);
      setSavedDays(days);
      setSelectedDays(days);
      setIsLoading(false);
    }

    loadAvailability();
    return () => {
      isCurrent = false;
    };
  }, []);

  const toggleDay = (day) => {
    if (isSaving) return;
    setError("");
    setToast(null);
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  };

  const enterEditMode = () => {
    setSelectedDays([...savedDays]);
    setError("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setSelectedDays([...savedDays]);
    setError("");
    setIsEditing(false);
  };

  const saveAvailability = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    setToast(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You must be signed in to save your working days.");
      setIsSaving(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("crew_availability")
      .delete()
      .eq("crew_auth_id", user.id);

    if (deleteError) {
      setError("Unable to save your working days. Please try again.");
      setIsSaving(false);
      return;
    }

    if (selectedDays.length > 0) {
      const { error: insertError } = await supabase
        .from("crew_availability")
        .insert(
          selectedDays.map((day) => ({
            crew_auth_id: user.id,
            day_of_week: day,
          })),
        );

      if (insertError) {
        setError("Unable to save your working days. Please try again.");
        setIsSaving(false);
        return;
      }
    }

    setSavedDays([...selectedDays]);
    setIsEditing(false);
    setToast({
      message:
        selectedDays.length > 0
          ? "Working days saved successfully."
          : "No working days saved. Customers cannot book you until you set at least one.",
      type: "success",
    });
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
          Working Days
        </h2>
        <p className="mt-2 text-sm text-slate-400">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {toast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div
            className={`rounded-md border px-4 py-2 text-sm font-medium shadow-md ${
              toast.type === "success"
                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                : "border-red-300 bg-red-100 text-red-800"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <CalendarDays className="h-4 w-4 text-amber-600" />
          ) : (
            <Lock className="h-4 w-4 text-slate-400" />
          )}
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
            Working Days
          </h2>
          {!isEditing && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              Locked
            </span>
          )}
          {isEditing && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              Editing
            </span>
          )}
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={enterEditMode}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
          >
            <Pencil className="h-3 w-3" />
            Edit Schedule
          </button>
        )}
      </div>

      {isEditing ? (
        <p className="mt-1 text-xs text-amber-600">
          Select the days you are available for deliveries, then save your
          changes.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Your current schedule is locked. Click &quot;Edit Schedule&quot; to make
          changes.
        </p>
      )}

      {isEditing ? (
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label="Working days"
        >
          {DAY_ORDER.map((day) => {
            const isSelected = selectedDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={isSelected}
                className={`inline-flex min-w-[3.5rem] items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                {isSelected && <Check className="h-3.5 w-3.5" />}
                {WORKING_DAY_LABELS[day]}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {DAY_ORDER.map((day) => {
            const isSelected = savedDays.includes(day);
            return (
              <span
                key={day}
                className={`inline-flex min-w-[3.5rem] items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                  isSelected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-100 bg-slate-50 text-slate-400"
                }`}
              >
                {isSelected && <Check className="h-3.5 w-3.5" />}
                {WORKING_DAY_LABELS[day]}
              </span>
            );
          })}
        </div>
      )}

      {isEditing && error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {isEditing && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsConfirmingSave(true)}
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Working Days"}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {!isEditing && savedDays.length === 0 && (
        <p className="mt-3 text-xs text-amber-600">
          No working days set. Customers cannot book you until you set at least
          one day.
        </p>
      )}

      <ConfirmationModal
        isOpen={isConfirmingSave}
        onClose={() => setIsConfirmingSave(false)}
        onConfirm={async () => {
          setIsConfirmingSave(false);
          await saveAvailability();
        }}
        title="Save Working Days"
        message={
          selectedDays.length > 0
            ? "Are you sure you want to save these working days? Customers will be able to book you on the selected days."
            : "Are you sure you want to save no working days? Customers will not be able to book you until you set at least one day."
        }
        confirmText="Save"
        confirmVariant="primary"
        isLoading={isSaving}
      />
    </section>
  );
}
