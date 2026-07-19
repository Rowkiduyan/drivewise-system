import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
import { ArrowLeft, Route, ExternalLink, MoreVertical, Trash2, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Dummy trip history — frontend only, no backend/API/database.
// The crew member being viewed is passed in via navigation state from the
// Delivery Crew list (see SupDeliveryCrew.jsx), so this page doesn't need
// its own copy of the crew roster.
// ---------------------------------------------------------------------------

const CLIENT_SPECIALTIES = [
  "Jollibee", "McDonald's", "Chowking", "KFC", "Mang Inasal", "Greenwich",
  "Shakey's", "Red Ribbon", "Goldilocks", "Max's Restaurant",
];

const TRIP_ROUTES = [
  "Manila Warehouse → Quezon Ave Branch",
  "Cavite Depot → Alabang Branch",
  "Manila Warehouse → Ortigas Branch",
  "Pasig Hub → BGC Branch",
  "Cavite Depot → Las Piñas Branch",
  "Manila Warehouse → Cubao Branch",
  "Pasig Hub → Marikina Branch",
  "Cavite Depot → Parañaque Branch",
];

const TRIP_STATUS_POOL = ["Completed", "Completed", "Completed", "Cancelled"];

// Small seeded generator so a given crew member's trips stay the same while
// you're viewing the page, instead of reshuffling on every re-render.
function buildMockTrips(crew) {
  let state = 0;
  for (let i = 0; i < crew.id.length; i += 1) state = (state * 31 + crew.id.charCodeAt(i)) >>> 0;
  if (state <= 0) state = 1;
  const rng = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const now = new Date("2026-07-19T08:00:00");
  const tripCount = 8 + Math.floor(rng() * 5); // 8-12

  return Array.from({ length: tripCount }, (_, i) => {
    const isOngoing = i === 0 && crew.status === "On Delivery";
    const status = isOngoing ? "Ongoing" : pick(TRIP_STATUS_POOL);
    const date = new Date(now.getTime() - i * (18 + rng() * 20) * 60 * 60 * 1000);
    const client = crew.clientSpecialties?.length
      ? pick(crew.clientSpecialties)
      : pick(CLIENT_SPECIALTIES);

    return {
      id: `TRIP-${2100 - i}`,
      dateLabel: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      client,
      route: pick(TRIP_ROUTES),
      status,
    };
  });
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

const TRIP_STATUS_BADGE_CLASSES = {
  Completed: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  Ongoing: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Cancelled: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
};

function TripStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        TRIP_STATUS_BADGE_CLASSES[status] || TRIP_STATUS_BADGE_CLASSES.Cancelled
      }`}
    >
      {status}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <span className="inline-flex items-center gap-2 text-sm text-slate-500">
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-blue-600" />}
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {title}
        </h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Three-dot menu with just two actions: Add opens the add-clients modal,
// Delete switches the list below into delete mode (each row grows a trash
// icon). Kept as plain menu items rather than the list itself, since Add
// and Delete lead to two different interactions (a modal vs. inline
// per-row confirmation).
function SpecialtyMenu({ isOpen, onToggle, onClose, onSelectAdd, onSelectDelete, canDelete }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Manage client specialties"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute right-0 z-20 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button
              type="button"
              onClick={onSelectAdd}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={onSelectDelete}
              disabled={!canDelete}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// One row in the Client Specialties stacked list. In delete mode it shows a
// trash icon; clicking it opens a confirmation modal (rendered by the page)
// rather than deleting immediately.
function SpecialtyListItem({ client, isDeleteMode, onRequestDelete }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-slate-900">{client}</span>
      {isDeleteMode && (
        <button
          type="button"
          onClick={onRequestDelete}
          aria-label={`Delete ${client}`}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const TABS_BASE = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance", driversOnly: true, external: true },
  { id: "trips", label: "Trip History" },
];

const TRIP_STATUS_FILTERS = ["All", "Completed", "Ongoing", "Cancelled"];

function SupCrewProfile() {
  const location = useLocation();
  const crew = location.state?.crew;

  const [activeTab, setActiveTab] = useState("overview");
  const [clientSpecialties, setClientSpecialties] = useState(crew?.clientSpecialties || []);
  const [isSpecialtyMenuOpen, setIsSpecialtyMenuOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [clientsToAdd, setClientsToAdd] = useState([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [clientPendingDelete, setClientPendingDelete] = useState(null);
  const [tripStatusFilter, setTripStatusFilter] = useState("All");

  const trips = useMemo(() => (crew ? buildMockTrips(crew) : []), [crew]);

  const availableClientsToAdd = CLIENT_SPECIALTIES.filter(
    (client) => !clientSpecialties.includes(client),
  );

  const openAddModal = () => {
    setClientsToAdd([]);
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setClientsToAdd([]);
  };

  const selectClientToAdd = (client) => {
    if (!client) return;
    setClientsToAdd((prev) => (prev.includes(client) ? prev : [...prev, client]));
  };

  const unselectClientToAdd = (client) => {
    setClientsToAdd((prev) => prev.filter((entry) => entry !== client));
  };

  const saveAddModal = () => {
    setClientSpecialties((prev) => [...prev, ...clientsToAdd]);
    closeAddModal();
  };

  const startDeleteMode = () => {
    setClientPendingDelete(null);
    setIsDeleteMode(true);
  };

  const exitDeleteMode = () => {
    setIsDeleteMode(false);
    setClientPendingDelete(null);
  };

  const confirmDeleteClient = (client) => {
    setClientSpecialties((prev) => prev.filter((entry) => entry !== client));
    setClientPendingDelete(null);
  };

  const filteredTrips =
    tripStatusFilter === "All" ? trips : trips.filter((trip) => trip.status === tripStatusFilter);

  const tripStatusCounts = {
    All: trips.length,
    Completed: trips.filter((trip) => trip.status === "Completed").length,
    Ongoing: trips.filter((trip) => trip.status === "Ongoing").length,
    Cancelled: trips.filter((trip) => trip.status === "Cancelled").length,
  };

  if (!crew) {
    return (
      <SupLayout title="Crew Profile" background={null} bg="bg-white">
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-lg font-semibold text-slate-900">No crew member selected</p>
          <p className="max-w-sm text-sm text-slate-500">
            Open a profile by selecting a crew member from the Delivery Crew list.
          </p>
          <Link
            to="/supervisor/delivery-crew"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Delivery Crew
          </Link>
        </div>
      </SupLayout>
    );
  }

  const isDriver = crew.position === "Driver";
  const tabs = TABS_BASE.filter((tab) => !tab.driversOnly || isDriver);

  return (
    <SupLayout title="Crew Profile" background={null} bg="bg-white">
      <div className="flex flex-col gap-6 pb-10">
        <Link
          to="/supervisor/delivery-crew"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Delivery Crew
        </Link>

        {/* Profile header */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-semibold text-blue-700">
                {getInitials(crew.fullName)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                    {crew.fullName}
                  </h1>
                  <StatusBadge status={crew.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {crew.employeeId} · {crew.shift}
                </p>
              </div>
            </div>
            <PositionTag position={crew.position} />
          </div>
        </section>

        {/* Tabs — Performance links out to the existing Supervisor Analysis page instead of duplicating it */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {tabs.map((tab) =>
            tab.external ? (
              <Link
                key={tab.id}
                to="/supervisor/analysis/specific"
                className="inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:text-blue-600"
              >
                {tab.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ),
          )}
        </div>

        {/* Overview tab */}
        {activeTab === "overview" && (
          <SectionCard title="Personal Information">
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <InfoRow label="Full Name" value={crew.fullName} />
                <InfoRow label="Position" value={crew.position} />
                <InfoRow label="Contact Number" value={crew.contactNumber} />
                <InfoRow label="Personal Email" value={crew.personalEmail || "N/A"} />
                <InfoRow label="Work Email" value={crew.workEmail || "N/A"} />
                <InfoRow label="Birthday" value={crew.birthday || "N/A"} />
                <InfoRow label="Age" value={crew.age ?? "N/A"} />
                <InfoRow label="Employment Start Date" value={crew.dateJoined} />
              </div>

              <div className="lg:border-l lg:border-slate-100 lg:pl-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Client Specialties
                  </h3>
                  {isDeleteMode ? (
                    <button
                      type="button"
                      onClick={exitDeleteMode}
                      className="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                    >
                      Done
                    </button>
                  ) : (
                    <SpecialtyMenu
                      isOpen={isSpecialtyMenuOpen}
                      onToggle={() => setIsSpecialtyMenuOpen((prev) => !prev)}
                      onClose={() => setIsSpecialtyMenuOpen(false)}
                      onSelectAdd={() => {
                        setIsSpecialtyMenuOpen(false);
                        openAddModal();
                      }}
                      onSelectDelete={() => {
                        setIsSpecialtyMenuOpen(false);
                        startDeleteMode();
                      }}
                      canDelete={clientSpecialties.length > 0}
                    />
                  )}
                </div>

                <div className="mt-1 divide-y divide-slate-100">
                  {clientSpecialties.length === 0 ? (
                    <p className="py-2.5 text-sm text-slate-500">No clients assigned yet.</p>
                  ) : (
                    clientSpecialties.map((client) => (
                      <SpecialtyListItem
                        key={client}
                        client={client}
                        isDeleteMode={isDeleteMode}
                        onRequestDelete={() => setClientPendingDelete(client)}
                      />
                    ))
                  )}
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  Demo only — changes here are not saved.
                </p>
              </div>
            </div>
          </SectionCard>
        )}

        {isAddModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-specialty-title"
            onClick={closeAddModal}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="add-specialty-title" className="text-base font-semibold text-slate-900">
                Add Client Specialties
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Pick clients one at a time to assign to this crew member.
              </p>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700" htmlFor="client-to-add">
                  Client
                </label>
                <select
                  id="client-to-add"
                  value=""
                  onChange={(event) => selectClientToAdd(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a client…</option>
                  {availableClientsToAdd
                    .filter((client) => !clientsToAdd.includes(client))
                    .map((client) => (
                      <option key={client} value={client}>
                        {client}
                      </option>
                    ))}
                </select>

                <p className="mt-4 text-sm font-medium text-slate-700">
                  Selected{clientsToAdd.length > 0 ? ` (${clientsToAdd.length})` : ""}:
                </p>
                {/* Fixed height (~5 rows) so the modal doesn't grow with every
                    pick — beyond 5 selections the list scrolls in place. */}
                <div className="mt-1.5 h-[190px] overflow-y-auto rounded-xl border border-slate-200">
                  {clientsToAdd.length === 0 ? (
                    <div className="flex h-full items-center justify-center px-3">
                      <p className="text-sm text-slate-400">No clients picked yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {clientsToAdd.map((client) => (
                        <div key={client} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm text-slate-900">{client}</span>
                          <button
                            type="button"
                            onClick={() => unselectClientToAdd(client)}
                            aria-label={`Remove ${client} from selection`}
                            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAddModal}
                  disabled={clientsToAdd.length === 0}
                  className="rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {clientPendingDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-specialty-title"
            onClick={() => setClientPendingDelete(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="delete-specialty-title" className="text-base font-semibold text-slate-900">
                Delete client specialty
              </h3>
              <p className="mt-1.5 text-sm text-slate-500">
                Are you sure you want to delete <span className="font-medium text-slate-700">{clientPendingDelete}</span> from
                this crew member?
              </p>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClientPendingDelete(null)}
                  className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeleteClient(clientPendingDelete)}
                  className="rounded-xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trip History tab */}
        {activeTab === "trips" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {TRIP_STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setTripStatusFilter(status)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
                    tripStatusFilter === status
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-white"
                  }`}
                >
                  <span>{status}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      tripStatusFilter === status
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {tripStatusCounts[status]}
                  </span>
                </button>
              ))}
            </div>

            <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-5 py-3 font-semibold">Trip ID</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Client</th>
                    <th className="px-5 py-3 font-semibold">Route</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTrips.map((trip) => (
                    <tr key={trip.id} className="transition hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-900">{trip.id}</td>
                      <td className="px-5 py-4 text-slate-700">{trip.dateLabel}</td>
                      <td className="px-5 py-4 text-slate-700">{trip.client}</td>
                      <td className="px-5 py-4 text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          <Route className="h-3.5 w-3.5 text-slate-400" />
                          {trip.route}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <TripStatusBadge status={trip.status} />
                      </td>
                    </tr>
                  ))}

                  {filteredTrips.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                        No trips match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </div>
    </SupLayout>
  );
}

export default SupCrewProfile;
