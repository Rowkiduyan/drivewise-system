// React import removed as it's not directly used; JSX transpilation handles it.

/**
 * Simple segmented control for selecting a date range.
 * Props:
 *   - selected: currently selected option (string)
 *   - onChange: callback(newValue) invoked when user picks a different range
 */
export default function DateRangeFilter({ selected, onChange }) {
  const options = ["Today", "7 Days", "30 Days"];

  return (
    <div className="flex space-x-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            selected === opt
              ? "bg-emerald-600 text-white"
              : "bg-slate-100 text-slate-800 hover:bg-slate-200"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
