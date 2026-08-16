// Re‑implemented using the same UI pattern as AdminTrucks.jsx for consistency.
import { useState, useEffect, useMemo } from "react";
// import { useNavigate } from "react-router-dom"; // navigation not needed in this page
import AdminLayout from "../layout/AdminLayout.jsx";
import RegisterDeviceModal from "../components/RegisterDeviceModal.jsx";
import { Search, Edit, XCircle, Trash2 } from "lucide-react";
import EditDeviceModal from "../components/EditDeviceModal.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { MANILA_TIMEZONE } from "../lib/manilaTime.js";

// Helper to fetch devices from Supabase
async function fetchDevices() {
  // The devices table does not have an `updated_at` column (see Supabase error).
  // Select only the columns that exist: device_id, plate_number, and device_status.
  const { data, error } = await supabase
    .from("devices")
    .select("device_id, plate_number, device_status, last_ping")
    .order("device_id", { ascending: true });
  if (error) throw error;
  return data || [];
}

export default function AdminDevices() {
  // const navigate = useNavigate(); // navigation not needed in this page currently
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); // Active / Inactive / Maintenance / All
  const [assignmentFilter, setAssignmentFilter] = useState("All"); // Assigned / Unassigned / All
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [devices, setDevices] = useState([]);
  // Confirmation modals
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState(null);
  const [isUnassignModalOpen, setIsUnassignModalOpen] = useState(false);
  const [deviceToUnassign, setDeviceToUnassign] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deviceToEdit, setDeviceToEdit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Load devices on mount
  useEffect(() => {
    async function load() {
      try {
        const devs = await fetchDevices();
        setDevices(devs);
      } catch (e) {
        console.error("Failed to load devices", e);
        setToast({ message: "Failed to load devices", type: "error" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Filter logic similar to AdminTrucks
  const filteredDevices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return devices.filter((d) => {
      // Search filter (ID or plate number)
      const matchesSearch = !query
        ? true
        : [d.device_id, d.plate_number]
            .filter(Boolean)
            .some((val) => val.toLowerCase().includes(query));

      // Status filter – compare case‑insensitively
      const deviceStatus = d.device_status?.toLowerCase();
      const matchesStatus =
        statusFilter === "All" || deviceStatus === statusFilter.toLowerCase();

      // Assignment filter
      const matchesAssign =
        assignmentFilter === "All" ||
        (assignmentFilter === "Assigned" && d.plate_number) ||
        (assignmentFilter === "Unassigned" && !d.plate_number);

      return matchesSearch && matchesStatus && matchesAssign;
    });
  }, [devices, searchTerm, statusFilter, assignmentFilter]);

  const handleUnassign = async (deviceId) => {
    // Open confirmation modal instead of immediate action
    const device = devices.find((d) => d.device_id === deviceId);
    setDeviceToUnassign(device);
    setIsUnassignModalOpen(true);
  };

  const handleDelete = async (device) => {
    const { error } = await supabase
      .from("devices")
      .delete()
      .eq("device_id", device.device_id);
    if (error) {
      const message =
        error.code === "23503"
          ? "Cannot delete: this device has session history."
          : "Delete failed";
      setToast({ message, type: "error" });
      return;
    }
    setDevices((prev) => prev.filter((d) => d.device_id !== device.device_id));
    setToast({ message: "Device deleted successfully", type: "success" });
  };

  // Auto‑clear toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  return (
    <AdminLayout title="Device Management" background={null}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* Toolbar */}
        <section className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <label className="sr-only" htmlFor="device-search">
                Search devices
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="device-search"
                type="text"
                placeholder="Search by ID or plate…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-violet-400 focus:bg-white"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:flex-none sm:justify-end">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
              >
                <option value="All">Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Maintenance">Maintenance</option>
              </select>
              <select
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
              >
                <option value="All">Assignments</option>
                <option value="Assigned">Assigned</option>
                <option value="Unassigned">Unassigned</option>
              </select>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >
              Register Device
            </button>
          </div>
        </section>

        {/* Toast */}
        {toast && (
          <div className="fixed inset-x-0 top-4 flex justify-center z-50">
            <p
              className={`px-4 py-2 rounded-md shadow-md text-sm font-medium transition-transform duration-300 ${
                toast.type === "success"
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : "bg-red-100 text-red-800 border border-red-300"
              }`}
            >
              {toast.message}
            </p>
          </div>
        )}

        {/* Device List */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
              {loading ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  Loading devices…
                </div>
              ) : filteredDevices.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-slate-500">
                  No devices match the current filters.
                </div>
              ) : (
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Device ID</th>
                      <th className="px-5 py-3">Assigned Truck</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Last Ping</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDevices.map((d) => (
                      <tr key={d.device_id} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 font-medium text-slate-900">
                          {d.device_id}
                        </td>
                        <td className="px-5 py-2.5 text-slate-700">
                          {d.plate_number || "Unassigned"}
                        </td>
                        <td className="px-5 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                              {
                                active: "bg-green-100 text-green-700",
                                inactive: "bg-red-100 text-red-700",
                                maintenance: "bg-amber-100 text-amber-700",
                              }[d.device_status?.toLowerCase()] ||
                              "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {d.device_status
                              ? d.device_status.charAt(0).toUpperCase() +
                                d.device_status.slice(1)
                              : "unknown"}
                          </span>
                        </td>
                        <td className="px-5 py-2.5">
                          {d.last_ping
                            ? new Date(d.last_ping).toLocaleString("en-US", { timeZone: MANILA_TIMEZONE })
                            : "Never"}
                        </td>
                        <td className="px-5 py-2.5 text-right flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDeviceToEdit(d);
                              setIsEditModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            <Edit className="h-3 w-3" /> Edit
                          </button>
                          {d.plate_number && (
                            <button
                              type="button"
                              onClick={() => handleUnassign(d.device_id)}
                              className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              <XCircle className="h-3 w-3" /> Unassign
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setDeviceToDelete(d);
                              setIsDeleteModalOpen(true);
                            }}
                            className="inline-flex items-center text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Register Device Modal */}
      {isAddModalOpen && (
        <RegisterDeviceModal
          onClose={() => {
            setIsAddModalOpen(false);
            // Refresh list after registration
            fetchDevices()
              .then(setDevices)
              .catch((e) => console.error(e));
          }}
        />
      )}
      {/* Unassign Confirmation Modal */}
      {isUnassignModalOpen && deviceToUnassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Confirm Unassign</h2>
            <p className="mb-6">
              Are you sure you want to unassign device{" "}
              <span className="font-medium">{deviceToUnassign.device_id}</span>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsUnassignModalOpen(false);
                  setDeviceToUnassign(null);
                }}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // Perform unassign
                  const { error } = await supabase
                    .from("devices")
                    .update({ plate_number: null })
                    .eq("device_id", deviceToUnassign.device_id);
                  if (error) {
                    setToast({ message: "Unassign failed", type: "error" });
                  } else {
                    setDevices((prev) =>
                      prev.map((d) =>
                        d.device_id === deviceToUnassign.device_id
                          ? { ...d, plate_number: null }
                          : d,
                      ),
                    );
                    setToast({ message: "Device unassigned", type: "success" });
                  }
                  setIsUnassignModalOpen(false);
                  setDeviceToUnassign(null);
                }}
                className="px-4 py-2 rounded bg-violet-600 text-white hover:bg-violet-700"
              >
                Unassign
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && deviceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Confirm Delete</h2>
            <p className="mb-6">
              Are you sure you want to delete device{" "}
              <span className="font-medium">{deviceToDelete.device_id}</span>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeviceToDelete(null);
                }}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleDelete(deviceToDelete);
                  setIsDeleteModalOpen(false);
                  setDeviceToDelete(null);
                }}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Device Modal */}
      {isEditModalOpen && deviceToEdit && (
        <EditDeviceModal
          device={deviceToEdit}
          onClose={() => {
            setIsEditModalOpen(false);
            setDeviceToEdit(null);
          }}
          onSave={async () => {
            // Refresh device list and update state
            const refreshed = await fetchDevices();
            setDevices(refreshed);
            // Show success toast after device update
            setToast({
              message: "Device updated successfully",
              type: "success",
            });
            setIsEditModalOpen(false);
            setDeviceToEdit(null);
          }}
        />
      )}
    </AdminLayout>
  );
}
