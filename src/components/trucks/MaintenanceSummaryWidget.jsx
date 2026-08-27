import React, { useMemo } from "react";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { getPmsStatus } from "./utils/pms.js";

export default function MaintenanceSummaryWidget({ trucks, onSelect }) {
  const counts = useMemo(() => {
    const c = { overdue: 0, scheduled: 0, completed: 0 };
    trucks.forEach((t) => {
      const status = getPmsStatus(t);
      c[status]++;
    });
    return c;
  }, [trucks]);

  const Card = ({ accent, icon: Icon, title, subtext, status }) => (
    <button
      type="button"
      onClick={() => onSelect(status)}
      className="flex flex-1 cursor-pointer items-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-all"
    >
      <div
        className={`mr-4 flex h-12 w-12 items-center justify-center rounded-md ${accent}`}
      >
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="flex-1 text-left">
        <div className="text-sm font-medium text-slate-600">{title}</div>
        <div className="mt-1 text-2xl font-bold text-slate-900">
          {counts[status]} Trucks
        </div>
        <div className="text-xs text-slate-500">{subtext}</div>
      </div>
    </button>
  );

  return (
    <section className="mb-6">
      {/* Header */}
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Preventive Maintenance (PMS) Status
        </h2>
        <p className="text-sm text-slate-500">
          Monitored via 10,000 km mileage or 6-month interval threshold
          (whichever comes first).
        </p>
      </header>
      {/* Cards */}
      <div className="flex flex-col gap-4 md:flex-row">
        <Card
          accent="bg-red-500"
          icon={AlertTriangle}
          title="Overdue"
          subtext="Exceeded mileage or 6‑month threshold"
          status="overdue"
        />
        <Card
          accent="bg-amber-500"
          icon={Clock}
          title="Scheduled"
          subtext="Remaining 1,000 km or 30 days"
          status="scheduled"
        />
        <Card
          accent="bg-emerald-500"
          icon={CheckCircle2}
          title="Completed"
          subtext="Operating within safe limits"
          status="completed"
        />
      </div>
    </section>
  );
}
