import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../layout/AdminLayout.jsx";
import AddTruckModal from "../components/AddTruckModal.jsx";
import { Search, ChevronRight, Trash2 } from "lucide-react";
// Truck type options are defined directly here as mockTrucks.js has been removed.
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
import { supabase } from "../lib/supabaseClient.js";

// STATUS_BADGE_CLASSES removed as status field is no longer used.

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

// StatusBadge component removed as status field is no longer used.

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

const TYPE_OPTIONS = TRUCK_TYPES;
const TRUCK_TYPE_ORDER = TRUCK_TYPES.reduce((order, type, index) => {
  order[type] = index;
  return order;
}, {});
const PAGE_SIZE = 10;

function AdminTrucks() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // Load trucks from Supabase on component mount. Fallback to empty array if fetch fails.
  const [trucks, setTrucks] = useState([]);
  // Toast state: message and type ('success' | 'error')
  const [toast, setToast] = useState(null);

  // Delete modal state
  const [truckToDelete, setTruckToDelete] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Loading state for initial data fetch
  const [loading, setLoading] = useState(true);

  // Persist trucks to localStorage for offline fallback (optional)
  useEffect(() => {
    localStorage.setItem("adminTrucks", JSON.stringify(trucks));
  }, [trucks]);

  // Load trucks from localStorage on mount as an immediate fallback before the async fetch.
  useEffect(() => {
    const stored = localStorage.getItem("adminTrucks");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setTrucks(parsed);
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to parse stored trucks", e);
      }
    }
  }, []);

  // Fetch initial truck data from Supabase
  useEffect(() => {
    async function loadTrucks() {
      const { data, error } = await supabase.from("trucks").select("*");
      if (error) {
        console.error("Failed to fetch trucks from Supabase:", error);
        // No fallback – keep current state (empty) if fetch fails.
        setLoading(false);
        return;
      }
      setTrucks(data);
      setLoading(false);
    }
    loadTrucks();
  }, []);

  const typeCounts = useMemo(() => {
    const counts = { All: trucks.length };
    TYPE_OPTIONS.forEach((type) => {
      counts[type] = trucks.filter((t) => t.truck_type === type).length;
    });
    return counts;
  }, [trucks]);

  // Filter trucks based on search term and selected type, then sort by type order and plate number.
  const filteredTrucks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return trucks
      .filter((truck) => {
        const matchesSearch = !query
          ? true
          : [
              truck.plate_number,
              truck.brand,
              truck.model,
              truck.truck_type,
              truck.assignedDeviceNo,
              truck.assignedDriver || "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(query);

        const matchesType =
          selectedType === "All" || truck.truck_type === selectedType;

        return matchesSearch && matchesType;
      })
      .sort((leftTruck, rightTruck) => {
        const leftOrder =
          TRUCK_TYPE_ORDER[leftTruck.truck_type] ?? Number.MAX_SAFE_INTEGER;
        const rightOrder =
          TRUCK_TYPE_ORDER[rightTruck.truck_type] ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return leftTruck.plate_number.localeCompare(rightTruck.plate_number);
      });
  }, [searchTerm, selectedType, trucks]);
  // Handler for adding a new truck from the modal
  // Add a new truck entry – now persists to Supabase and updates local state.
  // Insert a new truck via Supabase and update UI state.
  const handleAddTruck = async (formData) => {
    try {
      // Insert the form data; let Supabase generate the UUID and return the new row.
      const { data, error } = await supabase
        .from("trucks")
        .insert([formData])
        .select();
      if (error) throw error;

      // If a row is returned, prepend it to the trucks list.
      if (data && data.length > 0) {
        setTrucks((prev) => [data[0], ...prev]);
      }

      // Close modal and show success toast.
      setIsAddModalOpen(false);
      setToast({ message: "Truck added successfully", type: "success" });
    } catch (err) {
      console.error("Failed to add truck:", err.message);
      setToast({
        message: "Failed to add truck: " + err.message,
        type: "error",
      });
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

  // Status update removed as status field is no longer used.

  const updateType = (value) => {
    setSelectedType(value);
    setCurrentPage(1);
  };

  const openProfile = (truck) => {
    navigate("/admin/trucks/profile", { state: { truck } });
  };

  // Delete handler
  const handleDeleteTruck = async (truck) => {
    try {
      // Delete truck record
      const { error: deleteError } = await supabase
        .from("trucks")
        .delete()
        .eq("id", truck.id);
      if (deleteError) throw deleteError;

      // If the truck had an assigned device, clear its plate_number reference
      if (truck.assignedDeviceNo) {
        const { error: deviceError } = await supabase
          .from("devices")
          .update({ plate_number: null })
          .eq("device_id", truck.assignedDeviceNo);
        if (deviceError) throw deviceError;
      }

      // Update UI state
      setTrucks((prev) => prev.filter((t) => t.id !== truck.id));
      setToast({ message: "Truck deleted successfully", type: "success" });
    } catch (err) {
      console.error("Failed to delete truck:", err.message);
      setToast({
        message: "Failed to delete truck: " + err.message,
        type: "error",
      });
    } finally {
      setIsDeleteModalOpen(false);
      setTruckToDelete(null);
    }
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
              {/* Status filter removed as status field is no longer used */}
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
              {loading ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  Loading trucks…
                </div>
              ) : filteredTrucks.length === 0 ? (
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
                              {truck.plate_number}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {truck.year_model}
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
                          <TypeTag type={truck.truck_type} />
                        </td>
                        {/* Device Status column removed */}
                        <td className="py-2.5 pl-2 pr-5 text-right flex items-center justify-end space-x-2">
                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTruckToDelete(truck);
                              setIsDeleteModalOpen(true);
                            }}
                            className="text-red-600 hover:text-red-800"
                            title="Delete truck"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {/* Navigation chevron */}
                          <ChevronRight className="ml-1 h-4 w-4 text-slate-400" />
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
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && truckToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Confirm Delete</h2>
            <p className="mb-6">
              Are you sure you want to delete truck{" "}
              <span className="font-medium">{truckToDelete.plate_number}</span>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setTruckToDelete(null);
                }}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTruck(truckToDelete)}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminTrucks;
