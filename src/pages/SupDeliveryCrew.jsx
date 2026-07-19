import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
import { Search, Truck, Users, CircleCheck, ChevronRight, ChevronDown } from "lucide-react";

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

// Filter dropdown — used for Status, Position, and Client. A native <select>
// scales to any number of options without wrapping or crowding the toolbar
// (unlike the pill/tab groups it replaces), and gets keyboard navigation and
// a native mobile picker for free, so no custom popover/menu is needed.
//
// When a non-default value is picked, the control itself switches to a
// tinted "active" style. That's the signal that a filter is applied — no
// separate active-filters summary needed, since the selects already show
// their own current value at rest.
function FilterSelect({ id, label, value, onChange, options, counts, allLabel, className = "" }) {
  const isActive = value !== "All";

  return (
    <div className={className}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`h-10 w-full appearance-none rounded-xl border px-4 pr-9 text-center text-sm outline-none transition focus:ring-2 focus:ring-blue-100 ${
            isActive
              ? "border-blue-300 bg-blue-50 font-semibold text-blue-700 focus:border-blue-400"
              : "border-slate-300 bg-slate-50 text-slate-700 focus:border-blue-400 focus:bg-white"
          }`}
        >
          <option value="All">
            {allLabel} ({counts.All})
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option} ({counts[option] ?? 0})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
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
    <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accentClasses}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p className="text-lg font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ["Available", "On Delivery", "Off Duty"];
const POSITION_OPTIONS = ["Driver", "Helper"];
const PAGE_SIZE = 10;

function SupDeliveryCrew() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedPosition, setSelectedPosition] = useState("All");
  const [selectedClient, setSelectedClient] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

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

  const clientCounts = useMemo(() => {
    const counts = { All: MOCK_CREW.length };
    CLIENT_SPECIALTIES.forEach((client) => {
      counts[client] = MOCK_CREW.filter((crew) => crew.clientSpecialties.includes(client)).length;
    });
    return counts;
  }, []);

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
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* Search and Filter Toolbar — search and filters share one row, with
            filters right-aligned. This is the common modern dashboard layout
            (e.g. Linear, Notion tables): the search stays the primary, most
            prominent control while filters sit as a secondary cluster the
            eye reaches after. Wraps to a stacked layout on small screens. */}
        <section className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:p-3.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative w-full lg:flex-1">
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
                className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Filters — one dropdown per dimension, all styled identically so
                the set reads as one system and scales cleanly if more filters
                (e.g. Shift) are added later. Reset only renders once a filter
                is applied, so the toolbar stays uncluttered at rest. */}
            <div className="flex flex-wrap items-center gap-1.5 lg:flex-none lg:justify-end">
              <FilterSelect
                id="status-filter"
                label="Filter by status"
                value={selectedStatus}
                onChange={updateStatus}
                options={STATUS_OPTIONS}
                counts={statusCounts}
                allLabel="All Statuses"
                className="min-w-[8.5rem]"
              />
              <FilterSelect
                id="position-filter"
                label="Filter by position"
                value={selectedPosition}
                onChange={updatePosition}
                options={POSITION_OPTIONS}
                counts={positionCounts}
                allLabel="All Positions"
                className="min-w-[7.75rem]"
              />
              <FilterSelect
                id="client-filter"
                label="Filter by client"
                value={selectedClient}
                onChange={updateClient}
                options={CLIENT_SPECIALTIES}
                counts={clientCounts}
                allLabel="All Clients"
                className="min-w-[9rem]"
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-500 sm:text-xs">
            <span>
              {filteredCrew.length === 0
                ? "No crew members match your filters."
                : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredCrew.length)} of ${filteredCrew.length}`}
            </span>
            <span className="hidden sm:inline">Scroll the list below for more crew members</span>
          </div>
        </section>

        {/* Crew List */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
              {filteredCrew.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  No crew records match your search. Try adjusting your filters.
                </div>
              ) : (
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Crew Member
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Position
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Client Specialty
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Contact
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Status
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 py-3 pl-2 pr-5 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        &nbsp;
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedCrew.map((crew) => (
                      <tr
                        key={crew.id}
                        onClick={() => openProfile(crew)}
                        className="cursor-pointer transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">
                              {getInitials(crew.fullName)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {crew.fullName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          <PositionTag position={crew.position} />
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">
                          {crew.clientSpecialties.join(", ")}
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">{crew.contactNumber}</td>
                        <td className="px-5 py-2.5">
                          <StatusBadge status={crew.status} />
                        </td>
                        <td className="py-2.5 pl-2 pr-5 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            <nav
              className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2"
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

              <div className="flex flex-wrap items-center gap-1">
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
          </div>
        </div>
      </div>
    </SupLayout>
  );
}

export default SupDeliveryCrew;
