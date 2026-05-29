import SupLayout from "../layout/SupLayout.jsx";

function SupProfile() {
  return (
    <SupLayout title="Supervisor Profile" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Supervisor Profile
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Update contact info, shift coverage, and notification rules.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: "Region", value: "Metro West" },
            { label: "Team size", value: "18" },
            { label: "Escalations", value: "Dispatch team" },
            { label: "On-call", value: "Weekend rotation" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-blue-200/70 bg-white p-6"
            >
              <p className="text-xs uppercase tracking-[0.24em] text-blue-600">
                {item.label}
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </SupLayout>
  );
}

export default SupProfile;
