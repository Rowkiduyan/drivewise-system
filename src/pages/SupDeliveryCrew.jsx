import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { Search, Truck, Users, CircleCheck, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Crew roster — loaded from the admin-users Edge Function's `list-crew`
// action (Driver/Helper users merged with their driver_records/
// helper_records row). See DATABASE.md "Per-role profile tables" and
// AUTHENTICATION.md for why this can't be a direct client-side query.
// ---------------------------------------------------------------------------

// Shift/status have no backing table yet (see DATABASE.md "Current Notes")
// and stay fixed placeholders. Client Specialty is real — sourced from
// crew_client_specialties/customer_records via the admin-users Edge
// Function's list-crew (per-crew assignments) and list-clients (the full
// client roster, for the filter dropdown).

function getAgeFromBirthday(birthday, referenceDate = new Date()) {
  const age = referenceDate.getFullYear() - birthday.getFullYear();
  const monthDifference = referenceDate.getMonth() - birthday.getMonth();
  const dayDifference = referenceDate.getDate() - birthday.getDate();

  return monthDifference > 0 || (monthDifference === 0 && dayDifference >= 0)
    ? age
    : age - 1;
}

function buildDisplayName(firstName, middleName, lastName) {
  const nameParts = [firstName];
  if (middleName) {
    nameParts.push(`${middleName.trim().charAt(0).toUpperCase()}.`);
  }
  return `${lastName || ""}, ${nameParts.filter(Boolean).join(" ")}`.trim();
}

// Maps one row from the `list-crew` Edge Function response (users merged
// with their driver_records/helper_records row) into the shape this page
// and SupCrewProfile.jsx expect. Status/Shift/Client Specialty/Weekly
// Performance have no real data source yet (see module comment above) and
// are left as neutral placeholders rather than fabricated values.
function mapCrewRow(row) {
  const birthDate = row.birthdate ? new Date(row.birthdate) : null;

  return {
    id: row.id,
    fullName: buildDisplayName(row.first_name, row.middle_name, row.last_name),
    position: row.role,
    status: "Off Duty",
    clientSpecialties: row.client_specialties || [],
    shift: "—",
    contactNumber: row.contact_number || "—",
    employeeId: row.record_id || "—",
    birthday: birthDate
      ? birthDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
      : null,
    age: birthDate ? getAgeFromBirthday(birthDate) : null,
    dateJoined: row.created_at
      ? new Date(row.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : "—",
    personalEmail: row.email || "",
    workEmail: row.login_email || "",
    weeklyPerformance: null,
  };
}

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

// Weekly Performance — color-coded so supervisors can spot frequent
// eye-closure/drowsiness patterns at a glance without reading every number.
// Helpers don't drive, so they show a plain dash instead of a badge; so
// does every crew member right now, since there's no per-driver session/
// alert linkage yet (see module comment above).
function getPerformanceTier(score) {
  if (score >= 85) {
    return { label: "Good", classes: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" };
  }
  if (score >= 70) {
    return { label: "Watch", classes: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" };
  }
  return { label: "At Risk", classes: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200" };
}

function PerformanceBadge({ score }) {
  if (score == null) {
    return <span className="text-xs text-slate-300">—</span>;
  }

  const tier = getPerformanceTier(score);
  return (
    <span
      title={`${tier.label} — 7-day average alertness score`}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tier.classes}`}
    >
      {score}/100
    </span>
  );
}

// Filter dropdown — used for Status, Position, and Client. A native <select>
// scales to any number of options without wrapping or crowding the toolbar
// (unlike the pill/tab groups it replaces), and gets keyboard navigation and
// a native mobile picker for free, so no custom popover/menu is needed.
function FilterSelect({ id, label, value, onChange, options, counts, allLabel }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-auto min-w-[7.5rem] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
      >
        <option value="All">
          {allLabel}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option} ({counts[option] ?? 0})
          </option>
        ))}
      </select>
    </>
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

function PaginationBar({ page, setPage, totalPages }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
      <p className="text-sm text-slate-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="First page"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
        </button>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-1 px-1">
          {(() => {
            const pages = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              pages.push(1);
              if (page > 3) pages.push('...');
              for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
              if (page < totalPages - 2) pages.push('...');
              pages.push(totalPages);
            }
            return pages.map((num, idx) =>
              num === '...' ? (
                <span key={`ellipsis-${idx}`} className="flex h-8 w-8 items-center justify-center text-sm text-slate-400">...</span>
              ) : (
                <button
                  key={num}
                  onClick={() => setPage(num)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                    num === page
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {num}
                </button>
              )
            );
          })()}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Last page"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ["Available", "On Delivery", "Off Duty"];
const POSITION_OPTIONS = ["Driver", "Helper"];
const PAGE_SIZE = 10;

function SupDeliveryCrew() {
  const navigate = useNavigate();
  const [roster, setRoster] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedPosition, setSelectedPosition] = useState("All");
  const [selectedClient, setSelectedClient] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [clientOptions, setClientOptions] = useState([]);

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list-clients" },
      });

      if (isMounted && !error) {
        setClientOptions((data.clients || []).map((client) => client.name));
      }
    }

    loadClients();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCrew() {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list-crew" },
      });

      if (!isMounted) {
        return;
      }

      if (error) {
        setLoadError(error.message || "Unable to load delivery crew.");
        setIsLoading(false);
        return;
      }

      setLoadError("");
      setRoster((data.crew || []).map(mapCrewRow));
      setIsLoading(false);
    }

    loadCrew();

    return () => {
      isMounted = false;
    };
  }, []);

  const statusCounts = useMemo(
    () => ({
      All: roster.length,
      Available: roster.filter((crew) => crew.status === "Available").length,
      "On Delivery": roster.filter((crew) => crew.status === "On Delivery").length,
      "Off Duty": roster.filter((crew) => crew.status === "Off Duty").length,
    }),
    [roster],
  );

  const positionCounts = useMemo(
    () => ({
      All: roster.length,
      Driver: roster.filter((crew) => crew.position === "Driver").length,
      Helper: roster.filter((crew) => crew.position === "Helper").length,
    }),
    [roster],
  );

  const clientCounts = useMemo(() => {
    const counts = { All: roster.length };
    clientOptions.forEach((client) => {
      counts[client] = roster.filter((crew) => crew.clientSpecialties.includes(client)).length;
    });
    return counts;
  }, [roster, clientOptions]);

  const filteredCrew = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return roster.filter((crew) => {
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
    }).sort((leftCrew, rightCrew) => leftCrew.fullName.localeCompare(rightCrew.fullName));
  }, [roster, searchTerm, selectedStatus, selectedPosition, selectedClient]);

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
    <SupLayout title="Delivery Crew" background={null} bg="bg-[#F6F7FB]">
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* Search and Filter Toolbar — search and filters share one row, with
            filters right-aligned. This is the common modern dashboard layout
            (e.g. Linear, Notion tables): the search stays the primary, most
            prominent control while filters sit as a secondary cluster the
            eye reaches after. Wraps to a stacked layout on small screens. */}
        <section className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative w-full lg:flex-1">
              <label className="sr-only" htmlFor="crew-search">
                Search crew records
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="crew-search"
                type="text"
                value={searchTerm}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="Search by name, client, or status..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
              />
            </div>

            {/* Filters — one dropdown per dimension, all styled identically so
                the set reads as one system and scales cleanly if more filters
                (e.g. Shift) are added later. Reset only renders once a filter
                is applied, so the toolbar stays uncluttered at rest. */}
            <div className="flex flex-wrap items-center gap-2 lg:flex-none lg:justify-end">
              <FilterSelect
                id="status-filter"
                label="Status"
                value={selectedStatus}
                onChange={updateStatus}
                options={STATUS_OPTIONS}
                counts={statusCounts}
                allLabel="Status"
              />
              <FilterSelect
                id="position-filter"
                label="Position"
                value={selectedPosition}
                onChange={updatePosition}
                options={POSITION_OPTIONS}
                counts={positionCounts}
                allLabel="Position"
              />
              <FilterSelect
                id="client-filter"
                label="Client"
                value={selectedClient}
                onChange={updateClient}
                options={clientOptions}
                counts={clientCounts}
                allLabel="Client"
              />
            </div>
          </div>
        </section>

        {/* Crew List */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
              {isLoading ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  Loading delivery crew…
                </div>
              ) : loadError ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-red-600">
                  {loadError}
                </div>
              ) : filteredCrew.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  No crew records match your search. Try adjusting your filters.
                </div>
              ) : (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Crew Member
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Position
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Weekly Performance
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
                        <td className="px-5 py-2.5">
                          <PerformanceBadge score={crew.weeklyPerformance} />
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
            <PaginationBar page={safePage} setPage={setCurrentPage} totalPages={totalPages} />
          </div>
        </div>
      </div>
    </SupLayout>
  );
}

export default SupDeliveryCrew;
