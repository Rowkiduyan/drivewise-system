import { useMemo, useState } from "react";
import SupLayout from "../layout/SupLayout.jsx";

function SupDeliveryCrew() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const crewRecords = [
    {
      lastName: "Santos",
      firstName: "Juan",
      middleName: "D.",
      position: "Driver",
      status: "On Route",
      lastUpdated: "10 mins ago",
    },
    {
      lastName: "Reyes",
      firstName: "Maria",
      middleName: "A.",
      position: "Helper",
      status: "Standby",
      lastUpdated: "25 mins ago",
    },
    {
      lastName: "Flores",
      firstName: "Andre",
      middleName: "L.",
      position: "Driver",
      status: "Available",
      lastUpdated: "1 hr ago",
    },
    {
      lastName: "Cruz",
      firstName: "Sofia",
      middleName: "M.",
      position: "Helper",
      status: "Off Duty",
      lastUpdated: "2 hrs ago",
    },
  ];

  const filteredCrew = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return crewRecords.filter((crew) => {
      const matchesSearch = !query
        ? true
        : [
            crew.lastName,
            crew.firstName,
            crew.middleName,
            crew.position,
            crew.status,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);

      const matchesStatus =
        selectedStatus === "All" || crew.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, selectedStatus]);

  const statusCounts = {
    All: crewRecords.length,
    "On Route": crewRecords.filter((crew) => crew.status === "On Route").length,
    Available: crewRecords.filter((crew) => crew.status === "Available").length,
  };

  return (
    <SupLayout title="Delivery Crew" background={null} bg="bg-white">
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Delivery Crew
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Manage crew availability, assignments, and real-time location
            tracking.
          </p>
        </header>

        {/* Search and Filter Section */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-3 sm:max-w-2xl sm:flex-row sm:items-center">
              <div className="w-full sm:max-w-sm">
                <label className="sr-only" htmlFor="crew-search">
                  Search crew records
                </label>
                <input
                  id="crew-search"
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search crew, lead, status..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                Add Employee
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap gap-3">
              {["All", "On Route", "Available"].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    selectedStatus === status
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-white"
                  }`}
                >
                  <span>{status}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      selectedStatus === status
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {statusCounts[status]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <div className="col-span-5">Name</div>
              <div className="col-span-3">Position</div>
              <div className="col-span-4 text-right">Status</div>
            </div>

            <div className="divide-y divide-slate-200 bg-white">
              {filteredCrew.map((crew) => (
                <div
                  key={crew.name}
                  className="grid grid-cols-12 items-center px-4 py-4 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <div className="col-span-5">
                    <p className="font-medium text-slate-900">
                      {crew.lastName}, {crew.firstName} {crew.middleName}
                    </p>
                    <p className="text-xs text-slate-400">
                      Updated {crew.lastUpdated}
                    </p>
                  </div>
                  <div className="col-span-3 text-slate-700">
                    {crew.position}
                  </div>
                  <div className="col-span-4 flex flex-col items-end gap-1">
                    <span className="inline-flex w-fit rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {crew.status}
                    </span>
                  </div>
                </div>
              ))}

              {filteredCrew.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No crew records match your search.
                </div>
              )}
            </div>
          </div>
        </section>

        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 backdrop-blur-sm">
            <div className="mt-8 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Add Employee
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Enter the crew member details for the roster.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Santos, Juan D."
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Position
                  </label>
                  <input
                    type="text"
                    placeholder="Driver / Loader"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Shift
                  </label>
                  <input
                    type="text"
                    placeholder="Morning / Afternoon / Night"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Notes
                  </label>
                  <textarea
                    rows="4"
                    placeholder="Add any record notes here..."
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Save Employee
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SupLayout>
  );
}

export default SupDeliveryCrew;
