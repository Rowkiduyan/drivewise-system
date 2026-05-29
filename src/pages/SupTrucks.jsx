import SupLayout from "../layout/SupLayout.jsx";

function SupTrucks() {
  return (
    <SupLayout title="Trucks" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Trucks
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Monitor truck availability, status, and device connectivity.
          </p>
        </header>

        <div className="space-y-4">
          {[
            "Unit 42 - online, diagnostics clear.",
            "Unit 57 - offline, check hardware.",
            "Unit 63 - firmware update scheduled.",
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-blue-200/70 bg-white p-6"
            >
              <p className="text-sm text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </SupLayout>
  );
}

export default SupTrucks;
