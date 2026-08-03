import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../layout/AdminLayout.jsx";
import AddTruckModal from "../components/AddTruckModal.jsx";
import { Search, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Dummy fleet roster — frontend only, no backend/API/database.
// ---------------------------------------------------------------------------

const DRIVER_FIRST_NAMES = [
  "Juan",
  "Maria",
  "Jose",
  "Ana",
  "Pedro",
  "Rosa",
  "Carlos",
  "Elena",
  "Miguel",
  "Carmen",
  "Antonio",
  "Teresa",
  "Francisco",
  "Luz",
  "Manuel",
  "Corazon",
  "Ricardo",
  "Josefina",
  "Eduardo",
  "Remedios",
  "Fernando",
];

const DRIVER_LAST_NAMES = [
  "Santos",
  "Reyes",
  "Cruz",
  "Bautista",
  "Ocampo",
  "Garcia",
  "Torres",
  "Flores",
  "Ramos",
  "Mendoza",
  "Castillo",
  "Villanueva",
  "Aquino",
  "Del Rosario",
  "Gonzales",
  "Fernandez",
  "Domingo",
  "Pascual",
  "Salazar",
];

const DRIVER_MIDDLE_INITIALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const TRUCK_TYPES = [
  "L300",
  "AUV",
  "1T DRY",
  "2T DRY",
  "1T REF",
  "2T REF",
  "4T DRY",
  "4T REF",
];

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

const PLATE_PREFIXES = [
  "NGP",
  "NDW",
  "NBW",
  "NGK",
  "NAP",
  "NDT",
  "NEQ",
  "NFY",
  "NHC",
  "NJB",
];
const STATUS_SEQUENCE = [
  "Available",
  "Available",
  "On Delivery",
  "On Delivery",
  "Maintenance",
  "Offline",
];
const ACQUIRE_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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
    const driverLast =
      DRIVER_LAST_NAMES[(i * 7 + 3) % DRIVER_LAST_NAMES.length];
    const driverMiddle =
      DRIVER_MIDDLE_INITIALS[(i * 3) % DRIVER_MIDDLE_INITIALS.length];
    const assignedDriver = hasDriver
      ? `${driverLast}, ${driverFirst} ${driverMiddle}.`
      : null;

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

// Initialize trucks state with persistence in localStorage
const getInitialTrucks = () => {
  try {
    const stored = localStorage.getItem("adminTrucks");
    return stored ? JSON.parse(stored) : buildMockTrucks(48);
  } catch {
    return buildMockTrucks(48);
  }
};

const STATUS_BADGE_CLASSES = {
  Available:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
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
        TRUCK_TYPE_TAG_CLASSES[type] ||
        "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"
      }`}
    >
      {type}
    </span>
  );
}

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

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  counts,
  allLabel,
}) {
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
        <option value="All">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option} ({counts[option] ?? 0})
          </option>
        ))}
      </select>
    </>
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
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="flex items-center gap-1 px-1">
          {(() => {
            const pages = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              pages.push(1);
              if (page > 3) pages.push("...");
              for (
                let i = Math.max(2, page - 1);
                i <= Math.min(totalPages - 1, page + 1);
                i++
              )
                pages.push(i);
              if (page < totalPages - 2) pages.push("...");
              pages.push(totalPages);
            }
            return pages.map((num, idx) =>
              num === "..." ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-8 w-8 items-center justify-center text-sm text-slate-400"
                >
                  ...
                </span>
              ) : (
                <button
                  key={num}
                  onClick={() => setPage(num)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition ${
                    num === page
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {num}
                </button>
              ),
            );
          })()}
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
        <button
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Last page"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ["Available", "On Delivery", "Maintenance", "Offline"];
const TYPE_OPTIONS = TRUCK_TYPES;
const STATUS_SORT_SEQUENCE = [
  "On Delivery",
  "Available",
  "Maintenance",
  "Offline",
];
const STATUS_SORT_ORDER = STATUS_SORT_SEQUENCE.reduce(
  (order, status, index) => {
    order[status] = index;
    return order;
  },
  {},
);
const TRUCK_TYPE_ORDER = TRUCK_TYPES.reduce((order, type, index) => {
  order[type] = index;
  return order;
}, {});
const PAGE_SIZE = 10;

function AdminTrucks() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [trucks, setTrucks] = useState(getInitialTrucks);
  // Toast state: message and type ('success' | 'error')
  const [toast, setToast] = useState(null);

  // Persist trucks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("adminTrucks", JSON.stringify(trucks));
  }, [trucks]);

  const statusCounts = useMemo(
    () => ({
      All: trucks.length,
      Available: trucks.filter((t) => t.status === "Available").length,
      "On Delivery": trucks.filter((t) => t.status === "On Delivery").length,
      Maintenance: trucks.filter((t) => t.status === "Maintenance").length,
      Offline: trucks.filter((t) => t.status === "Offline").length,
    }),
    [trucks],
  );

  const typeCounts = useMemo(() => {
    const counts = { All: trucks.length };
    TYPE_OPTIONS.forEach((type) => {
      counts[type] = trucks.filter((t) => t.truckType === type).length;
    });
    return counts;
  }, [trucks]);

  const filteredTrucks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return trucks
      .filter((truck) => {
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

        const matchesStatus =
          selectedStatus === "All" || truck.status === selectedStatus;
        const matchesType =
          selectedType === "All" || truck.truckType === selectedType;

        return matchesSearch && matchesStatus && matchesType;
      })
      .sort((leftTruck, rightTruck) => {
        const leftStatusOrder =
          STATUS_SORT_ORDER[leftTruck.status] ?? Number.MAX_SAFE_INTEGER;
        const rightStatusOrder =
          STATUS_SORT_ORDER[rightTruck.status] ?? Number.MAX_SAFE_INTEGER;
        if (leftStatusOrder !== rightStatusOrder)
          return leftStatusOrder - rightStatusOrder;
        const leftTypeOrder =
          TRUCK_TYPE_ORDER[leftTruck.truckType] ?? Number.MAX_SAFE_INTEGER;
        const rightTypeOrder =
          TRUCK_TYPE_ORDER[rightTruck.truckType] ?? Number.MAX_SAFE_INTEGER;
        if (leftTypeOrder !== rightTypeOrder)
          return leftTypeOrder - rightTypeOrder;
        return leftTruck.plateNumber.localeCompare(rightTruck.plateNumber);
      });
  }, [searchTerm, selectedStatus, selectedType]);
  // Handler for adding a new truck from the modal
  const handleAddTruck = (formData) => {
    try {
      const newTruck = {
        id: `truck-${Date.now()}`,
        ...formData,
      };
      setTrucks((prev) => [newTruck, ...prev]);
      setIsAddModalOpen(false);
      setToast({ message: "Truck added successfully", type: "success" });
    } catch (error) {
      console.error(error);
      setToast({ message: "Failed to add truck", type: "error" });
    }
  };

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
    navigate("/admin/trucks/profile", { state: { truck } });
  };

  // Auto‑clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <AdminLayout title="Truck Management" background={null} bg="bg-[#F6F7FB]">
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* Toolbar */}
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
                onChange={(e) => updateSearch(e.target.value)}
                placeholder="Search by plate, brand, model, type, or device no..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
              />
            </div>
            {/* Filters */}
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
                label="Truck Type"
                value={selectedType}
                onChange={updateType}
                options={TYPE_OPTIONS}
                counts={typeCounts}
                allLabel="Truck Type"
              />
            </div>
            {/* Add Truck button (rightmost) */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Add Truck
            </button>
          </div>
        </section>
        {/* Toast message with slide‑down animation */}
        {toast && (
          <div className="fixed inset-x-0 top-4 flex justify-center z-50">
            <p
              className={`
                  px-4 py-2 rounded-md shadow-md text-sm font-medium
                  transition-transform duration-300 ease-out
                  ${
                    toast.type === "success"
                      ? "bg-green-100 text-green-800 border border-green-300"
                      : "bg-red-100 text-red-800 border border-red-300"
                  }
                  transform translate-y-0 opacity-100
                `}
            >
              {toast.message}
            </p>
          </div>
        )}

        {/* Truck List */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
              {filteredTrucks.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  No truck records match your search. Try adjusting your
                  filters.
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
                            <p className="truncate text-xs text-slate-500">
                              {truck.yearModel}
                            </p>
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
            <PaginationBar
              page={safePage}
              setPage={setCurrentPage}
              totalPages={totalPages}
            />
          </div>
        </div>
      </div>
      {/* Add Truck Modal */}
      <AddTruckModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddTruck}
      />
    </AdminLayout>
  );
}

export default AdminTrucks;
