import { useState } from "react";
import { Fuel, Save, X } from "lucide-react";

// Supervisor-facing editor for the quotation pricing rules stored in
// quotation_settings.rules (single JSONB row). Every field is a number; the
// values drive buildQuotationDefaults so new quotations pre-fill from
// whatever the Supervisor last saved — e.g. update dieselPesoPerLiter before
// the workday and every quote created afterwards uses it.

const NUMERIC_FIELDS = [
  {
    group: "Diesel & Fuel",
    icon: Fuel,
    hint: "Diesel rate = peso per liter ÷ that truck's km per liter.",
    fields: [
      { key: "dieselPesoPerLiter", label: "Diesel Price (₱/liter)", step: "0.01" },
      { key: "tiresPer10KmPeso", label: "Tires (₱ per 10 km)" },
      { key: "tollPer10KmPeso", label: "Toll/Parking (₱ per 10 km)" },
      { key: "tollMinPeso", label: "Toll/Parking minimum (₱)" },
      { key: "tollMaxPeso", label: "Toll/Parking maximum (₱)" },
    ],
  },
  {
    group: "Daily Vehicle Costs",
    fields: [
      { key: "depreciationPerDay", label: "Depreciation (₱/day × truck size)" },
      { key: "batteriesPerDay", label: "Batteries (₱/day × truck size)" },
      { key: "insurancePerDay", label: "Insurance (₱/day × truck size)" },
      { key: "garageRentalPerDay", label: "Garage Rental (₱/day)" },
      { key: "motorVehicleRegFlat", label: "Motor Vehicle Registration (₱ flat/trip)" },
    ],
  },
  {
    group: "Wages & Allowances",
    fields: [
      { key: "driverWagePerDay", label: "Driver wage (₱/day)" },
      { key: "driverLargeTruckPremium", label: "Driver premium for 2T/4T (₱/day)" },
      { key: "helperWagePerDay", label: "Helper wage (₱/day)" },
      { key: "tripAllowancePerHeadPerDay", label: "Trip allowance (₱/head/day)" },
      { key: "lodgingAllowancePerNightPerHead", label: "Lodging allowance (₱/night/head)" },
      { key: "secondHelperMinWeightKg", label: "Auto 2nd helper when cargo exceeds (kg)" },
      { key: "secondHelperMinStops", label: "Auto 2nd helper at this many stops" },
    ],
  },
  {
    group: "Rates & Margins",
    fields: [
      { key: "adminFeeRatePercent", label: "Admin fees (% of direct expenses)", step: "0.5" },
    ],
  },
];

const TRUCK_PROFILE_FIELDS = [
  { key: "sizeFactor", label: "Size factor", step: "0.1" },
  { key: "kmPerLiter", label: "Fuel efficiency (km/L)", step: "0.1" },
];

export default function QuotationSettingsModal({ rules, onClose, onSave }) {
  // The modal only mounts while open (conditional render in SupDeliveries),
  // so a plain initializer picks up the latest loaded rules every time.
  const [draft, setDraft] = useState(rules);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const setNumber = (key, raw) => {
    const num = parseFloat(raw);
    setDraft((prev) => ({ ...prev, [key]: Number.isNaN(num) ? "" : num }));
  };

  const setTruckProfile = (truckKey, field, raw) => {
    const num = parseFloat(raw);
    setDraft((prev) => ({
      ...prev,
      truckProfiles: {
        ...prev.truckProfiles,
        [truckKey]: { ...prev.truckProfiles[truckKey], [field]: Number.isNaN(num) ? "" : num },
      },
    }));
  };

  const collectInvalid = () => {
    const invalid = [];
    for (const group of NUMERIC_FIELDS) {
      for (const f of group.fields) {
        const v = draft[f.key];
        if (v === "" || v == null || Number.isNaN(Number(v)) || Number(v) < 0) invalid.push(f.label);
      }
    }
    return invalid;
  };

  const handleSave = async () => {
    const invalid = collectInvalid();
    if (invalid.length > 0) {
      setError(`Please fill in all fields with valid non-negative numbers. Missing: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? ` and ${invalid.length - 3} more` : ""}`);
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await onSave(draft);
    } catch {
      setError("Failed to save the pricing rules. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Quotation Pricing Rules</h3>
            <p className="mt-1 text-xs text-slate-500">
              These values auto-generate the pre-filled amounts on every new quotation. Existing saved quotations are not changed.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {NUMERIC_FIELDS.map((group) => (
            <section key={group.group} className="rounded-xl border border-slate-200 p-3">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                {group.icon && <group.icon className="h-3.5 w-3.5 text-blue-600" />}
                {group.group}
              </h4>
              {group.hint && <p className="mt-1 text-[11px] text-slate-400">{group.hint}</p>}
              <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <label key={f.key} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                    <span>{f.label}</span>
                    <input
                      type="number"
                      min="0"
                      step={f.step || "1"}
                      value={draft[f.key] ?? ""}
                      onChange={(e) => setNumber(f.key, e.target.value)}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right font-semibold text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-xl border border-slate-200 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Truck Profiles</h4>
            <p className="mt-1 text-[11px] text-slate-400">
              Size factor scales daily vehicle costs; fuel efficiency converts the diesel price into ₱/km.
            </p>
            <table className="mt-2 w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1">Truck</th>
                  <th className="py-1 text-right">Size factor</th>
                  <th className="py-1 text-right">km/L</th>
                  <th className="py-1 text-right">Diesel rate (₱/km)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(draft.truckProfiles || {}).map(([key, profile]) => {
                  const literPrice = Number(draft.dieselPesoPerLiter)
                  const kmPerL = Number(profile.kmPerLiter)
                  const dieselPerKm = literPrice > 0 && kmPerL > 0 ? literPrice / kmPerL : null
                  return (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="py-1.5 font-medium text-slate-700">{profile.label}</td>
                      {TRUCK_PROFILE_FIELDS.map((f) => (
                        <td key={f.key} className="py-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step={f.step}
                            value={profile[f.key] ?? ""}
                            onChange={(e) => setTruckProfile(key, f.key, e.target.value)}
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right font-semibold outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
                          />
                        </td>
                      ))}
                      <td className="py-1.5 text-right font-semibold text-slate-500">
                        {dieselPerKm != null
                          ? `₱${(literPrice / kmPerL).toFixed(2)}`
                          : ""}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-500">
              Diesel rate = Diesel Price (₱{Number(draft.dieselPesoPerLiter || 0).toFixed(2)}) ÷ Fuel efficiency (km/L), computed live per truck above.
            </p>
          </section>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving…" : "Save Rules"}
          </button>
        </div>
      </div>
    </div>
  );
}
