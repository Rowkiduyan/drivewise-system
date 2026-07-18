import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
import { Search, Truck, Users, CircleCheck, ChevronRight, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Dummy crew roster — frontend only, no backend/API/database.
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Juan", "Maria", "Jose", "Ana", "Pedro", "Rosa", "Carlos", "Elena",
  "Miguel", "Carmen", "Antonio", "Teresa", "Francisco", "Luz", "Manuel",
  "Corazon", "Ricardo", "Josefina", "Eduardo", "Remedios", "Fernando",
  "Concepcion", "Roberto", "Milagros", "Alfredo", "Estrella", "Rodrigo",
  "Perla", "Andres", "Divina", "Emilio", "Flordeliza", "Gregorio",
  "Herminia", "Ignacio", "Julieta", "Leonardo", "Marilou", "Nestor", "Ofelia",
];

const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Torres",
  "Flores", "Ramos", "Mendoza", "Castillo", "Villanueva", "Aquino",
  "Del Rosario", "Gonzales", "Fernandez", "Domingo", "Pascual", "Salazar",
  "Navarro", "Aguilar", "Marquez", "Rivera", "Dizon", "Tolentino", "Manalo",
  "Valdez", "Lazaro", "Serrano", "Roque", "Aranda", "Belmonte", "Cabrera",
  "Diaz", "Espino", "Franco", "Guevarra", "Herrera",
];

const MIDDLE_INITIALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const CLIENT_SPECIALTIES = [
  "Jollibee", "McDonald's", "Chowking", "KFC", "Mang Inasal", "Greenwich",
  "Shakey's", "Red Ribbon", "Goldilocks", "Max's Restaurant",
];

const SHIFTS = ["Morning Shift", "Afternoon Shift", "Night Shift"];
const STATUS_SEQUENCE = ["Available", "Available", "On Delivery", "On Delivery", "Off Duty"];
const JOIN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildMockCrew(count) {
  return Array.from({ length: count }, (_, i) => {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length];
    const middleInitial = MIDDLE_INITIALS[(i * 3) % MIDDLE_INITIALS.length];
    const position = i % 5 < 3 ? "Driver" : "Helper";
    const status = STATUS_SEQUENCE[(i * 11) % STATUS_SEQUENCE.length];

    const primaryClient = CLIENT_SPECIALTIES[(i * 3 + 1) % CLIENT_SPECIALTIES.length];
    const secondaryClient = CLIENT_SPECIALTIES[(i * 5 + 2) % CLIENT_SPECIALTIES.length];
    const clientSpecialties =
      secondaryClient !== primaryClient ? [primaryClient, secondaryClient] : [primaryClient];

    const shift = SHIFTS[i % SHIFTS.length];
    const areaCode = 917 + (i % 3);
    const contactNumber = `09${areaCode}-${String(100 + i).padStart(3, "0")}-${String(
      1000 + ((i * 137) % 9000),
    ).padStart(4, "0")}`;
    const employeeId = `DWC-${String(1001 + i)}`;
    const dateJoined = `${JOIN_MONTHS[(i * 5) % JOIN_MONTHS.length]} ${2026 - (i % 5)}`;

    return {
      id: `crew-${i + 1}`,
      fullName: `${lastName}, ${firstName} ${middleInitial}.`,
      position,
      status,
      clientSpecialties,
      shift,
      contactNumber,
      employeeId,
      dateJoined,
    };
  });
}

const MOCK_CREW = buildMockCrew(68);

function getInitials(fullName) {
  const [last = "", rest = ""] = fullName.split(",").map((part) => part.trim());
  const first = rest.split(" ")[0] || "";
  return (`${last.charAt(0)}${first.charAt(0)}`.toUpperCase()) || "?";
}

const STATUS_BADGE_CLASSES = {
  Available: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  "On Delivery": "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  "Off Duty": "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        STATUS_BADGE_CLASSES[status] || STATUS_BADGE_CLASSES["Off Duty"]
      }`}
    >
      {status}
    </span>
  );
}

function PositionTag({ position }) {
  const isDriver = position === "Driver";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        isDriver ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {position}
    </span>
  );
}

function StatTile({ icon: Icon, label, value, accent = "blue" }) {
  const accentClasses = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-600",
  }[accent];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentClasses}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

const STATUS_FILTERS = ["All", "Available", "On Delivery", "Off Duty"];
const POSITION_FILTERS = ["All", "Driver", "Helper"];
const PAGE_SIZE = 10;

function SupDeliveryCrew() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedPosition, setSelectedPosition] = useState("All");
  const [selectedClient, setSelectedClient] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const clientOptions = useMemo(() => ["All", ...CLIENT_SPECIALTIES], []);

  const statusCounts = useMemo(
    () => ({
      All: MOCK_CREW.length,
      Available: MOCK_CREW.filter((crew) => crew.status === "Available").length,
      "On Delivery": MOCK_CREW.filter((crew) => crew.status === "On Delivery").length,
      "Off Duty": MOCK_CREW.filter((crew) => crew.status === "Off Duty").length,
    }),
    [],
  );

  const positionCounts = useMemo(
    () => ({
      All: MOCK_CREW.length,
      Driver: MOCK_CREW.filter((crew) => crew.position === "Driver").length,
      Helper: MOCK_CREW.filter((crew) => crew.position === "Helper").length,
    }),
    [],
  );

  const filteredCrew = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return MOCK_CREW.filter((crew) => {
      const matchesSearch = !query
        ? true
        : [crew.fullName, crew.position, crew.status, ...crew.clientSpecialties, crew.employeeId]
            .join(" ")
            .toLowerCase()
            .includes(query);

      const matchesStatus = selectedStatus === "All" || crew.status === selectedStatus;
      const matchesPosition = selectedPosition === "All" || crew.position === selectedPosition;
      const matchesClient =
        selectedClient === "All" || crew.clientSpecialties.includes(selectedClient);

      return matchesSearch && matchesStatus && matchesPosition && matchesClient;
    });
  }, [searchTerm, selectedStatus, selectedPosition, selectedClient]);

  const totalPages = Math.max(1, Math.ceil(filteredCrew.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedCrew = filteredCrew.slice(pageStart, pageStart + PAGE_SIZE);

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    selectedStatus !== "All" ||
    selectedPosition !== "All" ||
    selectedClient !== "All";

  const updateSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const updateStatus = (value) => {
    setSelectedStatus(value);
    setCurrentPage(1);
  };

  const updatePosition = (value) => {
    setSelectedPosition(value);
    setCurrentPage(1);
  };

  const updateClient = (value) => {
    setSelectedClient(value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedStatus("All");
    setSelectedPosition("All");
    setSelectedClient("All");
    setCurrentPage(1);
  };

  const openProfile = (crew) => {
    navigate("/supervisor/delivery-crew/profile", { state: { crew } });
  };

  return (
    <SupLayout title="Delivery Crew" background={null} bg="bg-white">
      <div className="flex flex-col gap-6 pb-10">
        {/* Header */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Delivery Crew
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Browse your drivers and helpers. Select a crew member to view
            their full profile, performance, and trip history.
          </p>
        </header>

        {/* Summary Stat Tiles */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={Users} label="Total Crew" value={MOCK_CREW.length} accent="blue" />
          <StatTile icon={Truck} label="Drivers" value={positionCounts.Driver} accent="violet" />
          <StatTile icon={Users} label="Helpers" value={positionCounts.Helper} accent="slate" />
          <StatTile
            icon={CircleCheck}
            label="Available Now"
            value={statusCounts.Available}
            accent="emerald"
          />
        </section>

        {/* Search and Filter Toolbar */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <label className="sr-only" htmlFor="crew-search">
                  Search crew records
                </label>
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="crew-search"
                  type="text"
                  value={searchTerm}
                  onChange={(event) => updateSearch(event.target.value)}
                  placeholder="Search by name, client, employee ID, or status..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="sm:w-56">
                <label className="sr-only" htmlFor="client-filter">
                  Filter by client
                </label>
                <div className="relative">
                  <select
                    id="client-filter"
                    value={selectedClient}
                    onChange={(event) => updateClient(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-300 bg-slate-50 py-3 pl-4 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  >
                    {clientOptions.map((client) => (
                      <option key={client} value={client}>
                        {client === "All" ? "All Clients" : client}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateStatus(status)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
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

              <div className="flex flex-wrap items-center gap-2">
                {POSITION_FILTERS.map((position) => (
                  <button
                    key={position}
                    type="button"
                    onClick={() => updatePosition(position)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
                      selectedPosition === position
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <span>{position}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        selectedPosition === position
                          ? "bg-white/20 text-white"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {positionCounts[position]}
                    </span>
                  </button>
                ))}

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Results summary */}
        <p className="text-sm text-slate-500">
          {filteredCrew.length === 0
            ? "No crew members match your filters."
            : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredCrew.length)} of ${filteredCrew.length} crew members`}
        </p>

        {/* Crew List */}
        {filteredCrew.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
            No crew records match your search. Try adjusting your filters.
          </div>
        ) : (
          <>
            {/* Crew table — same layout at every screen size; scrolls horizontally on narrow viewports */}
            <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-5 py-3 font-semibold">Crew Member</th>
                    <th className="px-5 py-3 font-semibold">Position</th>
                    <th className="px-5 py-3 font-semibold">Client Specialty</th>
                    <th className="px-5 py-3 font-semibold">Contact</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="py-3 pl-2 pr-5 font-semibold">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedCrew.map((crew) => (
                    <tr
                      key={crew.id}
                      onClick={() => openProfile(crew)}
                      className="cursor-pointer transition hover:bg-slate-50"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                            {getInitials(crew.fullName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {crew.fullName}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <PositionTag position={crew.position} />
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {crew.clientSpecialties.join(", ")}
                      </td>
                      <td className="px-5 py-4 text-slate-700">{crew.contactNumber}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={crew.status} />
                      </td>
                      <td className="py-4 pl-2 pr-5 text-right">
                        <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Pagination */}
            {totalPages > 1 && (
              <nav
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                aria-label="Crew list pagination"
              >
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safePage === 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <div className="flex flex-wrap items-center gap-1.5">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`h-8 w-8 rounded-lg text-sm font-semibold transition ${
                        page === safePage
                          ? "bg-blue-600 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safePage === totalPages}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </SupLayout>
  );
}

export default SupDeliveryCrew;
