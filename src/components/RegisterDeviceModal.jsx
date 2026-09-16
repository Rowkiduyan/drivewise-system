import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { X, Copy, Check, RefreshCw } from "lucide-react";

// DV-#### matching the one device already in the table (DV-1114) -- 4 random
// digits is plenty of headroom for a small fleet's worth of Pi devices, and
// collisions are checked against the live device list before submit.
function generateDeviceId(existingIds) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `DV-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  // Astronomically unlikely with 9000 possible suffixes and a small fleet,
  // but fall back to a wider id space rather than looping forever.
  return `DV-${Date.now().toString().slice(-6)}`;
}

function CopyButton({ value, label }) {
  const [isCopied, setIsCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } catch {
          // Clipboard API can fail (permissions, insecure context) -- the
          // value stays selectable/visible either way, nothing else to do.
        }
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
      title={`Copy ${label}`}
    >
      {isCopied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

export default function RegisterDeviceModal({ onClose }) {
  const [existingDeviceIds, setExistingDeviceIds] = useState(new Set());
  const [deviceId, setDeviceId] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [plateOptions, setPlateOptions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registeredSecret, setRegisteredSecret] = useState(null);

  // Existing device ids (for auto-generating a Device ID that can't collide)
  // and available truck plates load in parallel on open.
  useEffect(() => {
    const fetchDeviceIds = async () => {
      const { data, error: fetchError } = await supabase
        .from("devices")
        .select("device_id");
      if (!fetchError) {
        const ids = new Set((data || []).map((d) => d.device_id));
        setExistingDeviceIds(ids);
        setDeviceId(generateDeviceId(ids));
      }
    };
    fetchDeviceIds();
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

  const regenerateDeviceId = useCallback(() => {
    setDeviceId(generateDeviceId(existingDeviceIds));
  }, [existingDeviceIds]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    let candidateId = deviceId;
    let data, fnError;
    // A collision is only realistically possible if another Admin registers
    // a device between this modal's initial id fetch and submit -- retry a
    // couple of times with a fresh id rather than failing outright.
    for (let attempt = 0; attempt < 3; attempt++) {
      ({ data, error: fnError } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "register-device",
          deviceId: candidateId,
          plateNumber: plateNumber.trim() || null,
          status: "Active",
        },
      }));

      if (!fnError && !data?.error) {
        break;
      }

      const message = data?.error || fnError?.message || "";
      if (!/already exists|duplicate/i.test(message)) {
        break;
      }
      candidateId = generateDeviceId(new Set([...existingDeviceIds, candidateId]));
      setDeviceId(candidateId);
    }

    setLoading(false);
    if (fnError || data?.error) {
      setError(data?.error || fnError.message);
    } else {
      // Show the one-time device_secret instead of closing immediately — it
      // is never retrievable again after this response (see admin-users'
      // register-device action).
      setRegisteredSecret({ deviceId: data.device_id, secret: data.device_secret });
    }
  };

  if (registeredSecret) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
        <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
          <h2 className="mb-2 text-xl font-semibold text-slate-800">
            Device Registered
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Copy the Device ID and secret below and manually configure them on
            the physical Raspberry Pi.
          </p>

          <p className="text-xs font-medium text-slate-500">Device ID</p>
          <div className="mb-3 flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2">
            <p className="min-w-0 flex-1 truncate font-mono text-sm text-slate-900">
              {registeredSecret.deviceId}
            </p>
            <CopyButton value={registeredSecret.deviceId} label="Device ID" />
          </div>

          <p className="text-xs font-medium text-slate-500">Device Secret</p>
          <div className="mb-3 flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2">
            <p className="min-w-0 flex-1 break-all font-mono text-sm text-slate-900">
              {registeredSecret.secret}
            </p>
            <CopyButton value={registeredSecret.secret} label="secret" />
          </div>

          <p className="mb-4 text-sm text-red-700">
            This secret will not be shown again.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              Device ID (auto-generated)
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={deviceId}
                readOnly
                className="block w-full rounded border border-slate-300 bg-slate-100 p-2 font-mono text-sm text-slate-700"
              />
              <button
                type="button"
                onClick={regenerateDeviceId}
                title="Generate a different Device ID"
                className="flex shrink-0 items-center justify-center rounded border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
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
              disabled={loading || !deviceId}
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
