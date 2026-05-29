import SupLayout from "../layout/SupLayout.jsx";

function SupBookings() {
  return (
    <SupLayout title="Bookings" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6 md:gap-8">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Bookings
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Approve, schedule, and track the latest booking requests.
          </p>
        </header>

        {/* KPI Cards Grid */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Pending approvals", value: "6" },
            { label: "Scheduled today", value: "14" },
            { label: "Awaiting documents", value: "3" },
            { label: "Escalations", value: "1" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col gap-2 rounded-2xl border border-blue-200/70 bg-white p-4 sm:p-5 md:p-6 transition-shadow hover:shadow-md"
            >
              <p className="text-xs uppercase tracking-[0.24em] text-blue-600 font-semibold">
                {item.label}
              </p>
              <p className="text-2xl sm:text-3xl font-semibold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Placeholder Content Areas */}
        {/* <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2">
          <div className="min-h-80 rounded-2xl border border-blue-100/50 bg-white p-4 sm:p-5 md:p-6 shadow-sm">
            <div className="h-full flex items-center justify-center text-slate-400">
              Content area 1
            </div>
          </div>
          <div className="min-h-80 rounded-2xl border border-blue-100/50 bg-white p-4 sm:p-5 md:p-6 shadow-sm">
            <div className="h-full flex items-center justify-center text-slate-400">
              Content area 2
            </div>
          </div>
        </div> */}
      </div>
    </SupLayout>
  );
}

export default SupBookings;
