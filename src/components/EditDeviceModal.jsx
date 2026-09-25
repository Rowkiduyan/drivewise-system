import { useState, useEffect, useRef } from "react";
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
  // Lazy initializer, not an effect -- the modal fully remounts per device
  // (see AdminDevices.jsx's conditional render), so this only ever needs to
  // seed once: the currently assigned plate appears in the dropdown
  // immediately, before fetchAvailablePlates' async fetch below completes.
  const [plateOptions, setPlateOptions] = useState(() =>
    device.plate_number ? [device.plate_number] : [],
  );
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // Native <select> lets the browser decide whether its options open above
  // or below the field, based on available viewport space -- inside this
  // modal (vertically centered, so short viewports leave little room below
  // a field near the middle) that meant the plate list sometimes opened
  // upward. Replaced with a small custom dropdown, absolutely positioned
  // below the trigger, so it always opens downward.
  const [isPlateDropdownOpen, setIsPlateDropdownOpen] = useState(false);
  const plateDropdownRef = useRef(null);

  useEffect(() => {
    if (!isPlateDropdownOpen) {
      return;
    }
    const handleOutsideClick = (event) => {
      if (!plateDropdownRef.current?.contains(event.target)) {
        setIsPlateDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isPlateDropdownOpen]);

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
    // device.plate_number: the modal remounts per device (never changes
    // without a full remount, see AdminDevices.jsx), so this never
    // re-triggers the fetch in practice -- included for correctness only.
  }, [device.plate_number]);

  const performUpdate = async () => {
    setLoading(true);
    setError(null);
    try {
      const isReassigningAway =
        device.plate_number && plateNumber !== device.plate_number;
      if (isReassigningAway) {
        const { data: activeSessions, error: sessionError } = await supabase
          .from("sessions")
          .select("session_id")
          .eq("device_id", device.device_id)
          .eq("status", "Active")
          .limit(1);
        if (sessionError) throw sessionError;
        if (activeSessions && activeSessions.length > 0) {
          throw new Error(
            "This device is powering an active trip — end or pause the trip before reassigning it."
          );
        }
      }

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
          <div className="relative" ref={plateDropdownRef}>
            <label className="block text-sm font-medium mb-1" htmlFor="plateNumber">
              Plate Number
            </label>
            <button
              id="plateNumber"
              type="button"
              onClick={() => setIsPlateDropdownOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={isPlateDropdownOpen}
              className="flex w-full items-center justify-between rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm"
            >
              <span className={plateNumber ? "" : "text-gray-400"}>
                {plateNumber || "-- Unassigned --"}
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.8"
                className="h-4 w-4 shrink-0 stroke-current text-gray-400"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isPlateDropdownOpen && (
              <ul
                role="listbox"
                className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-300 bg-white text-sm shadow-lg"
              >
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={plateNumber === ""}
                    onClick={() => {
                      setPlateNumber("");
                      setIsPlateDropdownOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left hover:bg-violet-50 ${
                      plateNumber === "" ? "bg-violet-50 font-medium" : ""
                    }`}
                  >
                    -- Unassigned --
                  </button>
                </li>
                {plateOptions.map((p) => (
                  <li key={p}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={plateNumber === p}
                      onClick={() => {
                        setPlateNumber(p);
                        setIsPlateDropdownOpen(false);
                      }}
                      className={`block w-full px-3 py-2 text-left hover:bg-violet-50 ${
                        plateNumber === p ? "bg-violet-50 font-medium" : ""
                      }`}
                    >
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
