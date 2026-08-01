import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";
import { Search, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Dummy fleet roster — frontend only, no backend/API/database.
// ---------------------------------------------------------------------------

const DRIVER_FIRST_NAMES = [
  "Juan", "Maria", "Jose", "Ana", "Pedro", "Rosa", "Carlos", "Elena",
  "Miguel", "Carmen", "Antonio", "Teresa", "Francisco", "Luz", "Manuel",
  "Corazon", "Ricardo", "Josefina", "Eduardo", "Remedios", "Fernando",
];

const DRIVER_LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Torres",
  "Flores", "Ramos", "Mendoza", "Castillo", "Villanueva", "Aquino",
  "Del Rosario", "Gonzales", "Fernandez", "Domingo", "Pascual", "Salazar",
];

const DRIVER_MIDDLE_INITIALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const TRUCK_TYPES = ["L300", "AUV", "1T DRY", "2T DRY", "1T REF", "2T REF", "4T DRY", "4T REF"];

const TRUCK_SPECS = [
  { brand: "Mitsubishi", model: "L300 FB", truckType: "L300" },
  { brand: "Toyota", model: "Innova", truckType: "AUV" },
  { brand: "Isuzu", model: "NHR 55", truckType: "1T DRY" },
  { brand: "Isuzu", model: "NKR 71", truckType: "2T DRY" },
  { brand: "Fuso", model: "Canter FE71", truckType: "1T REF" },
  { brand: "Hino", model: "300 Series 714", truckType: "2T REF" },
  { brand: "Isuzu", model: "Forward FRR90", truckType: "4T DRY" },
  { brand: "Hino", model: "500 Series FG8J", truckType: "4T REF" },
];

const PLATE_PREFIXES = ["NGP", "NDW", "NBW", "NGK", "NAP", "NDT", "NEQ", "NFY", "NHC", "NJB"];
const STATUS_SEQUENCE = ["Available", "Available", "On Delivery", "On Delivery", "Maintenance", "Offline"];
const ACQUIRE_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildPlateNumber(i) {
  const prefix = PLATE_PREFIXES[i % PLATE_PREFIXES.length];
  const number = String(1000 + ((i * 137) % 9000));
  return `${prefix} ${number}`;
}

function buildMockTrucks(count) {
  return Array.from({ length: count }, (_, i) => {
    const { brand, model, truckType } = TRUCK_SPECS[i % TRUCK_SPECS.length];
    const status = STATUS_SEQUENCE[(i * 11) % STATUS_SEQUENCE.length];
    const deviceStatus = i % 7 === 0 ? "Offline" : "Online";
    const hasDriver = status === "Available" || status === "On Delivery";
    const driverFirst = DRIVER_FIRST_NAMES[i % DRIVER_FIRST_NAMES.length];
    const driverLast = DRIVER_LAST_NAMES[(i * 7 + 3) % DRIVER_LAST_NAMES.length];
    const driverMiddle = DRIVER_MIDDLE_INITIALS[(i * 3) % DRIVER_MIDDLE_INITIALS.length];
    const assignedDriver = hasDriver ? `${driverLast}, ${driverFirst} ${driverMiddle}.` : null;

    const plateNumber = buildPlateNumber(i);
    const assignedDeviceNo = `DWD-${String(1001 + i).padStart(4, "0")}`;
    const yearModel = 2016 + (i % 9);
    const odometer = 12000 + ((i * 3187) % 148000);
    const fuelLevel = 20 + ((i * 13) % 80);
    const dateAcquired = `${ACQUIRE_MONTHS[(i * 5) % ACQUIRE_MONTHS.length]} ${2026 - (i % 6)}`;

    return {
      id: `truck-${i + 1}`,
      plateNumber,
      brand,
      model,
      truckType,
      status,
      deviceStatus,
      assignedDriver,
      assignedDeviceNo,
      yearModel,
      odometer,
      fuelLevel,
      dateAcquired,
    };
  });
}

const MOCK_TRUCKS = buildMockTrucks(48);

const STATUS_BADGE_CLASSES = {
  Available: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  "On Delivery": "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Maintenance: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  Offline: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
};

const TRUCK_TYPE_TAG_CLASSES = {
  L300: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  AUV: "bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-200",
  "1T DRY": "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  "2T DRY": "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200",
  "4T DRY": "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200",
  "1T REF": "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  "2T REF": "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  "4T REF": "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        STATUS_BADGE_CLASSES[status] || STATUS_BADGE_CLASSES.Offline
      }`}
    >
      {status}
    </span>
  );
}

function TypeTag({ type }) {
  return (
    <span
      className={`inline-flex min-w-[78px] items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-[0.01em] ${
        TRUCK_TYPE_TAG_CLASSES[type] || "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"
      }`}
    >
      {type}
    </span>
  );
}

// Device Status — GPS/dashcam connectivity for the truck's onboard unit.
// Color-coded the same way the crew list flags at-risk drivers, so
// supervisors can spot disconnected hardware at a glance.
function DeviceStatusBadge({ status }) {
  const isOnline = status === "Online";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        isOnline
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
          : "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200"
      }`}
    >
      {status}
    </span>
  );
}

// Filter dropdown — used for Status, Type, and Client. A native <select>
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
        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
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

const STATUS_OPTIONS = ["Available", "On Delivery", "Maintenance", "Offline"];
const TYPE_OPTIONS = TRUCK_TYPES;
const STATUS_SORT_SEQUENCE = ["On Delivery", "Available", "Maintenance", "Offline"];
const STATUS_SORT_ORDER = STATUS_SORT_SEQUENCE.reduce((order, status, index) => {
  order[status] = index;
  return order;
}, {});
const TRUCK_TYPE_ORDER = TRUCK_TYPES.reduce((order, type, index) => {
  order[type] = index;
  return order;
}, {});
const PAGE_SIZE = 10;

function SupTrucks() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const statusCounts = useMemo(
    () => ({
      All: MOCK_TRUCKS.length,
      Available: MOCK_TRUCKS.filter((truck) => truck.status === "Available").length,
      "On Delivery": MOCK_TRUCKS.filter((truck) => truck.status === "On Delivery").length,
      Maintenance: MOCK_TRUCKS.filter((truck) => truck.status === "Maintenance").length,
      Offline: MOCK_TRUCKS.filter((truck) => truck.status === "Offline").length,
    }),
    [],
  );

  const typeCounts = useMemo(() => {
    const counts = { All: MOCK_TRUCKS.length };
    TYPE_OPTIONS.forEach((type) => {
      counts[type] = MOCK_TRUCKS.filter((truck) => truck.truckType === type).length;
    });
    return counts;
  }, []);

  const filteredTrucks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return MOCK_TRUCKS.filter((truck) => {
      const matchesSearch = !query
        ? true
        : [
            truck.plateNumber,
            truck.brand,
            truck.model,
            truck.truckType,
            truck.status,
            truck.assignedDeviceNo,
            truck.assignedDriver || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);

      const matchesStatus = selectedStatus === "All" || truck.status === selectedStatus;
      const matchesType = selectedType === "All" || truck.truckType === selectedType;

      return matchesSearch && matchesStatus && matchesType;
    }).sort((leftTruck, rightTruck) => {
      const leftStatusOrder = STATUS_SORT_ORDER[leftTruck.status] ?? Number.MAX_SAFE_INTEGER;
      const rightStatusOrder = STATUS_SORT_ORDER[rightTruck.status] ?? Number.MAX_SAFE_INTEGER;

      if (leftStatusOrder !== rightStatusOrder) {
        return leftStatusOrder - rightStatusOrder;
      }

      const leftTypeOrder = TRUCK_TYPE_ORDER[leftTruck.truckType] ?? Number.MAX_SAFE_INTEGER;
      const rightTypeOrder = TRUCK_TYPE_ORDER[rightTruck.truckType] ?? Number.MAX_SAFE_INTEGER;

      if (leftTypeOrder !== rightTypeOrder) {
        return leftTypeOrder - rightTypeOrder;
      }

      return leftTruck.plateNumber.localeCompare(rightTruck.plateNumber);
    });
  }, [searchTerm, selectedStatus, selectedType]);

  const totalPages = Math.max(1, Math.ceil(filteredTrucks.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedTrucks = filteredTrucks.slice(pageStart, pageStart + PAGE_SIZE);

  const updateSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const updateStatus = (value) => {
    setSelectedStatus(value);
    setCurrentPage(1);
  };

  const updateType = (value) => {
    setSelectedType(value);
    setCurrentPage(1);
  };

  const openProfile = (truck) => {
    navigate("/supervisor/trucks/profile", { state: { truck } });
  };

  return (
    <SupLayout title="Trucks" background={null} bg="bg-[#F6F7FB]">
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* Search and Filter Toolbar — search and filters share one row, with
            filters right-aligned. This is the common modern dashboard layout
            (e.g. Linear, Notion tables): the search stays the primary, most
            prominent control while filters sit as a secondary cluster the
            eye reaches after. Wraps to a stacked layout on small screens. */}
        <section className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <label className="sr-only" htmlFor="truck-search">
                Search truck records
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="truck-search"
                type="text"
                value={searchTerm}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="Search by plate, brand, model, type, or device no..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
              />
            </div>

            {/* Filters — one dropdown per dimension, all styled identically so
                the set reads as one system and scales cleanly if more filters
                are added later. */}
            <div className="flex flex-wrap items-center gap-2 sm:flex-none sm:justify-end">
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
                id="type-filter"
                label="Type"
                value={selectedType}
                onChange={updateType}
                options={TYPE_OPTIONS}
                counts={typeCounts}
                allLabel="Type"
              />
            </div>
          </div>
        </section>

        {/* Truck List */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
              {filteredTrucks.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  No truck records match your search. Try adjusting your filters.
                </div>
              ) : (
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Truck
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Brand
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Model
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Truck Type
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Device No.
                      </th>
                      <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-semibold shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        Device Status
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
                    {pagedTrucks.map((truck) => (
                      <tr
                        key={truck.id}
                        onClick={() => openProfile(truck)}
                        className="cursor-pointer transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {truck.plateNumber}
                            </p>
                            <p className="truncate text-xs text-slate-500">{truck.yearModel}</p>
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          <span className="text-slate-700">{truck.brand}</span>
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">
                          {truck.model}
                        </td>
                        <td className="px-5 py-2.5">
                          <TypeTag type={truck.truckType} />
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">
                          {truck.assignedDeviceNo}
                        </td>
                        <td className="px-5 py-2.5">
                          <DeviceStatusBadge status={truck.deviceStatus} />
                        </td>
                        <td className="px-5 py-2.5">
                          <StatusBadge status={truck.status} />
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
              className="sticky bottom-0 flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:flex-row sm:px-5"
              aria-label="Truck list pagination"
            >
              <p className="text-[11px] font-medium text-slate-500 sm:text-xs">
                Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredTrucks.length)} of{' '}
                {filteredTrucks.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-[11px] font-medium text-slate-500 sm:text-xs">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </SupLayout>
  );
}

export default SupTrucks;
