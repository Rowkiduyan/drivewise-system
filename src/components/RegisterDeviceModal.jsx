import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { X, Plus } from "lucide-react";

export default function RegisterDeviceModal({ onClose }) {
  const [deviceId, setDeviceId] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [availableDevices, setAvailableDevices] = useState([]);
  const [plateOptions, setPlateOptions] = useState([]);
  const [status, setStatus] = useState("active");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch unassigned devices when modal opens
  // Fetch unassigned devices for potential future use (e.g., validation)
  useEffect(() => {
    const fetchDevices = async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("device_id, plate_number")
        .eq("plate_number", null);
      if (!error) {
        setAvailableDevices(data || []);
      }
    };
    fetchDevices();
  }, []);

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
        const unique = Array.from(new Set(available));
        setPlateOptions(unique);
      } catch (e) {
        console.error("Failed to fetch plate numbers", e);
      }
    };
    fetchAvailablePlates();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!deviceId) {
      setError("Device ID is required");
      return;
    }
    setLoading(true);
    const { error: dbError } = await supabase.from("devices").insert([
      {
        device_id: deviceId.trim().toUpperCase(),
        plate_number: plateNumber.trim().toUpperCase() || null,
        device_status: status,
      },
    ]);
    setLoading(false);
    if (dbError) {
      setError(dbError.message);
    } else {
      // success, close modal
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-4 text-xl font-semibold text-slate-800">
          Register New Device
        </h2>
        {error && (
          <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Device ID
            </span>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="DV-0001"
              className="mt-1 block w-full rounded border border-slate-300 p-2 focus:border-violet-400 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Plate Number (optional)
            </span>
            <select
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 p-2 focus:border-violet-400 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {plateOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 p-2 focus:border-violet-400 focus:outline-none"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </label>
          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
