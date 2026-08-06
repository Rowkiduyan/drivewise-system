import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";

/**
 * Modal for editing an existing device.
 * Props:
 *  - device: the device object to edit (contains device_id, plate_number, device_status)
 *  - onClose: callback to close the modal
 *  - onSave: callback after successful save (e.g., refresh list)
 */
export default function EditDeviceModal({ device, onClose, onSave }) {
  const [plateNumber, setPlateNumber] = useState(device.plate_number ?? "");
  const [status, setStatus] = useState(device.device_status ?? "Active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [plateOptions, setPlateOptions] = useState([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Ensure the currently assigned plate (if any) appears in the dropdown immediately.
  useEffect(() => {
    if (device.plate_number) {
      setPlateOptions([device.plate_number]);
    }
  }, [device.plate_number]);

  // Fetch plate numbers from trucks that are not already assigned in devices
  useEffect(() => {
    const fetchAvailablePlates = async () => {
      try {
        const { data: truckData, error: truckError } = await supabase
          .from("trucks")
          .select("plate_number")
          .neq("plate_number", null);
        const { data: deviceData, error: deviceError } = await supabase
          .from("devices")
          .select("plate_number")
          .neq("plate_number", null);
        if (truckError) throw truckError;
        if (deviceError) throw deviceError;
        const assigned = new Set((deviceData || []).map((d) => d.plate_number));
        const available = (truckData || [])
          .map((t) => t.plate_number)
          .filter((pn) => pn && !assigned.has(pn));
        // Ensure the currently assigned plate (if any) is included in the options
        const optionsSet = new Set(available);
        if (device.plate_number) {
          optionsSet.add(device.plate_number);
        }
        const unique = Array.from(optionsSet);
        // Merge with any existing options (e.g., the initially set current plate)
        setPlateOptions((prev) => Array.from(new Set([...prev, ...unique])));
      } catch (e) {
        console.error("Failed to fetch plate numbers", e);
      }
    };
    fetchAvailablePlates();
  }, []);

  const performUpdate = async () => {
    setLoading(true);
    setError(null);
    try {
      const updates = {
        plate_number: plateNumber || null,
        device_status: status,
      };
      const { error: supabaseError } = await supabase
        .from("devices")
        .update(updates)
        .eq("device_id", device.device_id);
      if (supabaseError) throw supabaseError;
      await onSave();
    } catch (err) {
      setError(err.message || "Failed to update device");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsConfirmOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
        <h2 className="text-lg font-semibold mb-4">Edit Device</h2>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="deviceId"
            >
              Device ID (read‑only)
            </label>
            <input
              id="deviceId"
              type="text"
              value={device.device_id}
              readOnly
              className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="plateNumber"
            >
              Plate Number
            </label>
            <select
              id="plateNumber"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">-- Unassigned --</option>
              {plateOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
        {/* Confirmation Modal */}
        {isConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
            <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-4">
              <h3 className="text-lg font-semibold mb-2">Confirm Update</h3>
              <p className="mb-4">
                Are you sure you want to update this device?
              </p>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setIsConfirmOpen(false);
                    await performUpdate();
                  }}
                  className="px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
