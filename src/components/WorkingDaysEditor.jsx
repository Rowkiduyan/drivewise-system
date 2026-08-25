import { useEffect, useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import { WORKING_DAY_LABELS } from "../lib/workingDays.js";

// Weekly working-days editor for Driver/Helper profile pages. Crew members
// are field workers with no fixed hours, so availability is day-of-week only
// (no times). Rows live in crew_availability scoped by RLS to the signed-in
// user (crew_auth_id = auth.uid()), so this component needs no Edge Function
// and no explicit user id -- see 20260826000000_crew_availability.sql.
//
// Customers booking a delivery can only pick pickup dates whose weekday is
// covered by at least one of their specialized crew members (see
// specialized_crew_available_days() in the same migration).

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-first display order

export default function WorkingDaysEditor() {
  const [selectedDays, setSelectedDays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

      setSelectedDays((data || []).map((row) => row.day_of_week).sort((a, b) => a - b));
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
    setSuccess("");
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b),
    );
  };

  const saveAvailability = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    setSuccess("");

    // Replace-all is the simplest correct sync for a small fixed set:
    // delete the caller's rows (RLS scopes this to their own), then insert
    // the newly selected days in one batch.
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
        .insert(selectedDays.map((day) => ({ crew_auth_id: user.id, day_of_week: day })));

      if (insertError) {
        setError("Unable to save your working days. Please try again.");
        setIsSaving(false);
        return;
      }
    }

    setSuccess(
      selectedDays.length > 0
        ? "Working days saved."
        : "Saved — no working days set. Customers cannot book you until you set at least one.",
    );
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
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-emerald-600" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
          Working Days
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Select the days you are available for deliveries. Customers can only book pickups on days
        covered by their specialized crew.
      </p>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Working days">
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

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {success && <p className="mt-3 text-xs text-emerald-600">{success}</p>}

      <button
        type="button"
        onClick={saveAvailability}
        disabled={isSaving}
        className="mt-4 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {isSaving ? "Saving…" : "Save Working Days"}
      </button>
    </section>
  );
}
