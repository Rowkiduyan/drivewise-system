import { useState, useEffect } from "react";
// Real device data will be fetched from Supabase instead of using mock data.
import { supabase } from "../lib/supabaseClient.js";
import { X } from "lucide-react";
import {
  DEFAULT_MAINTENANCE_INTERVAL_KM,
  DEFAULT_MAINTENANCE_INTERVAL_MONTHS,
} from "../constants/pms.js";
import { completeInProgressMaintenance } from "./trucks/utils/maintenance.js";

// Duplicate options to avoid circular imports
// Utility: today’s date in YYYY‑MM‑DD format (no time component)
const todayISO = () => new Date().toISOString().split("T")[0];

const TRUCK_TYPES = [
  "LUV",
  "AUV",
  "1T DRY",
  "2T DRY",
  "1T REF",
  "2T REF",
  "4T DRY",
  "4T REF",
];
// Device status is now managed by the devices table; no separate status dropdown needed.
// Brand and model suggestions based on existing mock data
// Brand and model options – will be extended with custom entries
const INITIAL_BRAND_OPTIONS = ["Mitsubishi", "Toyota", "Isuzu", "Fuso", "Hino"];
const INITIAL_MODEL_OPTIONS = [
  "L300 FB",
  "Innova",
  "NHR 55",
  "NKR 71",
  "Canter FE71",
  "300 Series 714",
  "Forward FRR90",
  "500 Series FG8J",
];

// Month and year options for Date Acquired dropdowns

export default function AddTruckModal({
  isOpen,
  onClose,
  mode = "add", // 'add' | 'edit'
  initialData = null,
  onSubmit,
  onSuccess,
  userRole = "Admin",
}) {
  const isSupervisor = userRole?.toLowerCase() === "supervisor";

  // Dynamic option lists that can be extended with custom entries
  const [brandOptions, setBrandOptions] = useState(INITIAL_BRAND_OPTIONS);
  const [modelOptions, setModelOptions] = useState(INITIAL_MODEL_OPTIONS);

  const [truck_typeOptions, settruck_typeOptions] = useState(TRUCK_TYPES);
  // Form state without container dimension fields (removed from DB schema)
  const [formData, setFormData] = useState({
    plate_number: "",
    brand: "",
    customBrand: "",
    model: "",
    customModel: "",
    truck_type: TRUCK_TYPES[0],
    customtruck_type: "",
    commodity_type: initialData?.commodity_type || "Ordinary",
    device_id: "",
    year_model: 2026,
    date_acquired: "",
    max_capacity: "",
    // max_capacity remains (kg)
    current_mileage: "",
    // New PMS baseline fields (previous maintenance fields hidden for now)
    /*previous_maintenance_date: "",
    previous_mileage: "",*/
    maintenance_interval_km: DEFAULT_MAINTENANCE_INTERVAL_KM,
    maintenance_interval_months: DEFAULT_MAINTENANCE_INTERVAL_MONTHS,
    // New status field for edit mode – safely handle null initialData
    status: initialData?.status || "",
  });

  // New state for edit mode handling
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Separate confirmation for the Add (create) flow
  const [showAddConfirmModal, setShowAddConfirmModal] = useState(false);
  const [originalDeviceId, setOriginalDeviceId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Store list of unassigned devices fetched from the database.
  const [availableDevices, setAvailableDevices] = useState([]);
  // Local toast for validation errors (e.g., duplicate plate number)
  const [validationToast, setValidationToast] = useState(null);
  // Auto‑clear validation toast after a short period
  useEffect(() => {
    if (validationToast) {
      const timer = setTimeout(() => setValidationToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [validationToast]);

  // Reset form when modal opens

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (mode === "edit" && initialData) {
      // Populate form with existing truck data, handling custom brand/model values
      // Normalize values for comparison (trim whitespace and case‑insensitive)
      const normalizedBrand = (initialData.brand || "").trim();
      const normalizedModel = (initialData.model || "").trim();
      const brandInOptions = INITIAL_BRAND_OPTIONS.some(
        (b) => b.toLowerCase() === normalizedBrand.toLowerCase(),
      );
      const modelInOptions = INITIAL_MODEL_OPTIONS.some(
        (m) => m.toLowerCase() === normalizedModel.toLowerCase(),
      );
      setFormData({
        plate_number: initialData.plate_number || "",
        // If the brand exists in the predefined options, use it; otherwise set to "Custom"
        brand: brandInOptions ? normalizedBrand : "Custom",
        customBrand: brandInOptions ? "" : normalizedBrand,
        // Same logic for model
        model: modelInOptions ? normalizedModel : "Custom",
        customModel: modelInOptions ? "" : normalizedModel,
        truck_type: initialData.truck_type || TRUCK_TYPES[0],
        customtruck_type: "",
        commodity_type: initialData.commodity_type || "Ordinary",
        device_id: initialData.device_id || "",
        year_model: initialData.year_model || 2026,
        date_acquired: initialData.date_acquired || "",
        max_capacity: initialData.max_capacity || "",
        // container dimensions removed (no longer in DB schema)
        current_mileage: initialData.current_mileage || "",
        /*previous_maintenance_date: initialData.previous_maintenance_date || "",
        previous_mileage: initialData.previous_mileage || "",*/
        maintenance_interval_km:
          initialData.maintenance_interval_km ||
          DEFAULT_MAINTENANCE_INTERVAL_KM,
        maintenance_interval_months:
          initialData.maintenance_interval_months ||
          DEFAULT_MAINTENANCE_INTERVAL_MONTHS,
        status: initialData.status || "",
      });
      setOriginalDeviceId(initialData.device_id || null);

      // Fetch every device (including ones taken by other trucks) so taken
      // devices still show up, just disabled — see the Device ID <select> below.
      const fetchDevices = async () => {
        const { data, error } = await supabase
          .from("devices")
          .select("device_id, device_status, plate_number");
        if (error) {
          console.error("Failed to fetch devices:", error);
          setAvailableDevices([]);
        } else {
          setAvailableDevices(data || []);
        }
      };
      fetchDevices();
    } else {
      // Add mode – reset to defaults and fetch only unassigned devices
      setFormData({
        plate_number: "",
        brand: "",
        customBrand: "",
        model: "",
        customModel: "",
        truck_type: TRUCK_TYPES[0],
        customtruck_type: "",
        commodity_type: "Ordinary",
        device_id: "",
        year_model: 2026,
        date_acquired: "",
        max_capacity: "",
        // container dimensions removed (no longer in DB schema)
        current_mileage: "",
        // New PMS baseline fields
        /*previous_maintenance_date: "",
        previous_mileage: "",*/
        maintenance_interval_km: DEFAULT_MAINTENANCE_INTERVAL_KM,
        maintenance_interval_months: DEFAULT_MAINTENANCE_INTERVAL_MONTHS,
        // Default status to avoid null values
        status: "Available",
      });
      setOriginalDeviceId(null);
      const fetchDevices = async () => {
        const { data, error } = await supabase
          .from("devices")
          .select("device_id, device_status, plate_number");
        if (error) {
          console.error("Failed to fetch devices:", error);
          setAvailableDevices([]);
        } else {
          // Keep every device (including ones already assigned to a truck) so
          // taken devices still show up, just disabled — see the Device ID
          // <select> below.
          setAvailableDevices(data || []);
        }
      };
      fetchDevices();
    }
  }, [isOpen, mode, initialData]);
  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;
    // Auto‑capitalize
    if (name === "plate_number" || name === "device_id") {
      newValue = newValue.toUpperCase();
    }
    // Auto‑format Plate Number (space after first three characters)
    if (name === "plate_number") {
      const stripped = newValue.replace(/\s+/g, "");
      if (stripped.length > 3) {
        newValue = stripped.slice(0, 3) + " " + stripped.slice(3);
      } else {
        newValue = stripped;
      }
    }
    // No special formatting for device_id (handled via dropdown)
    // Truck type change: REF types (1T REF / 2T REF / 4T REF, or a custom
    // type containing "REF") automatically set Commodity Type to Chilled.
    if (name === "truck_type" || name === "customtruck_type") {
      setFormData((prev) => ({
        ...prev,
        [name]: newValue,
        commodity_type: /REF/i.test(newValue) ? "Chilled" : "Ordinary",
      }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: newValue }));
  };

  // Separate handlers for add and edit flows
  const executeCreateTruck = async () => {
    // Same logic as previous handleSubmit (add mode)
    const finalBrand =
      formData.brand === "Custom" ? formData.customBrand : formData.brand;
    const finalModel =
      formData.model === "Custom" ? formData.customModel : formData.model;
    const finaltruck_type =
      formData.truck_type === "Custom"
        ? formData.customtruck_type
        : formData.truck_type;
    const truckData = {
      plate_number: formData.plate_number,
      brand: finalBrand,
      model: finalModel,
      truck_type: finaltruck_type,
      commodity_type: formData.commodity_type || "Ordinary",
      date_acquired: formData.date_acquired || null,
      year_model: formData.year_model || null,
      max_capacity: formData.max_capacity || null,
      current_mileage: formData.current_mileage || null,
      previous_mileage: formData.previous_mileage || null,
      previous_maintenance_date: formData.previous_maintenance_date || null,
      maintenance_interval_km: formData.maintenance_interval_km || null,
      maintenance_interval_months: formData.maintenance_interval_months || null,
      status: formData.status || null,
    };
    try {
      const { data: existing, error: dupError } = await supabase
        .from("trucks")
        .select("plate_number")
        .eq("plate_number", formData.plate_number)
        .limit(1);
      if (dupError) throw dupError;
      if (existing && existing.length > 0) {
        setValidationToast({
          message: `Plate number ${formData.plate_number} already exists`,
          type: "error",
        });
        return;
      }
      // First insert the truck via the parent handler
      if (onSubmit) await onSubmit(truckData);
      // After the truck exists, associate the selected device (if any)
      if (formData.device_id) {
        const { error: deviceError } = await supabase
          .from("devices")
          .update({ plate_number: formData.plate_number })
          .eq("device_id", formData.device_id);
        if (deviceError) throw deviceError;
      }
      // Close modal and optionally notify parent of success
      onClose();
      if (onSuccess) onSuccess();
      // Add custom options if needed
      if (
        formData.brand === "Custom" &&
        finalBrand &&
        !brandOptions.includes(finalBrand)
      ) {
        setBrandOptions((prev) => [...prev, finalBrand]);
      }
      if (
        formData.model === "Custom" &&
        finalModel &&
        !modelOptions.includes(finalModel)
      ) {
        setModelOptions((prev) => [...prev, finalModel]);
      }
      if (
        formData.truck_type === "Custom" &&
        finaltruck_type &&
        !truck_typeOptions.includes(finaltruck_type)
      ) {
        settruck_typeOptions((prev) => [...prev, finaltruck_type]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const executeUpdateTruck = async () => {
    try {
      setIsSubmitting(true);
      const finalBrand =
        formData.brand === "Custom" ? formData.customBrand : formData.brand;
      const finalModel =
        formData.model === "Custom" ? formData.customModel : formData.model;
      const editPayload = isSupervisor
        ? {
            status: formData.status || null,
            current_mileage: formData.current_mileage || null,
            previous_maintenance_date:
              formData.previous_maintenance_date || null,
            previous_mileage: formData.previous_mileage || null,
            maintenance_interval_km: formData.maintenance_interval_km || null,
            maintenance_interval_months:
              formData.maintenance_interval_months || null,
          }
        : {
            brand: finalBrand,
            model: finalModel,
            truck_type: formData.truck_type,
            commodity_type: formData.commodity_type || "Ordinary",
            year_model: formData.year_model,
            date_acquired: formData.date_acquired || null,
            max_capacity: formData.max_capacity || null,
            // container dimensions removed (no longer in DB schema)
            current_mileage: formData.current_mileage || null,
            previous_maintenance_date:
              formData.previous_maintenance_date || null,
            previous_mileage: formData.previous_mileage || null,
            maintenance_interval_km: formData.maintenance_interval_km || null,
            maintenance_interval_months:
              formData.maintenance_interval_months || null,
            status: formData.status || null,
          };

      if (onSubmit) {
        await onSubmit(editPayload);
      } else {
        const { error: truckError } = await supabase
          .from("trucks")
          .update(editPayload)
          .eq("plate_number", formData.plate_number);
        if (truckError) throw truckError;
      }

      const newDeviceId = formData.device_id || null;
      // Validate that the selected device is not already linked to a different truck
      if (originalDeviceId !== newDeviceId) {
        if (newDeviceId) {
          const { data: devData, error: devErr } = await supabase
            .from("devices")
            .select("plate_number")
            .eq("device_id", newDeviceId)
            .single();
          if (devErr) throw devErr;
          // If the device already has a plate_number that belongs to another truck, block it
          if (
            devData &&
            devData.plate_number &&
            devData.plate_number !== formData.plate_number
          ) {
            setValidationToast({
              message: `Device ${newDeviceId} is already assigned to another truck`,
              type: "error",
            });
            return;
          }
        }
        if (originalDeviceId) {
          await supabase
            .from("devices")
            .update({ plate_number: null })
            .eq("device_id", originalDeviceId);
        }
        if (newDeviceId) {
          await supabase
            .from("devices")
            .update({ plate_number: formData.plate_number })
            .eq("device_id", newDeviceId);
        }
      }

      // ---------------------------------------------------------------
      // Auto‑create a maintenance record when status changes to “Maintenance”
      // ---------------------------------------------------------------
      const statusJustChangedToMaintenance =
        formData.status?.toLowerCase() === "maintenance" &&
        (initialData?.status?.toLowerCase() ?? "") !== "maintenance";

      if (statusJustChangedToMaintenance) {
        // Prevent duplicate entries: check if a record for today already exists
        const { data: existing, error: fetchErr } = await supabase
          .from("maintenance_records")
          .select("id")
          .eq("truck_id", initialData?.id)
          .eq("start_date", todayISO())
          .eq("type", "Preventive Maintenance")
          .maybeSingle();
        if (fetchErr) {
          // Unexpected fetch error (e.g., network issue)
          setValidationToast({
            message:
              "Failed to verify existing maintenance record: " +
              fetchErr.message,
            type: "error",
          });
        }
        if (!existing) {
          const { error: maintError } = await supabase
            .from("maintenance_records")
            .insert({
              truck_id: initialData?.id,
              start_date: todayISO(),
              end_date: todayISO(),
              mileage: Number(formData.current_mileage) || 0,
              // Store the mileage at the time of service for later calculations
              mileage_at_service: Number(formData.current_mileage) || 0,
              type: "Preventive Maintenance",
              shop: "In-House",
              notes: "",
              // When the start date is today, the maintenance is ongoing
              status: "In Progress",
            });
          if (maintError) {
            setValidationToast({
              message:
                "Failed to create maintenance record: " + maintError.message,
              type: "error",
            });
          }
        }
      }

      // ---------------------------------------------------------------
      // Auto‑complete any "In Progress" maintenance record when status
      // changes to "Available" -- mirrors the block above. Previously this
      // only happened via a useEffect on SupTruckProfile.jsx/
      // AdminTruckProfile.jsx, which meant it silently never fired if the
      // status was flipped from the Trucks list page instead of that
      // truck's own Profile page. Living here (the shared modal both list
      // pages already funnel status changes through) means it fires
      // regardless of which page the edit came from.
      // ---------------------------------------------------------------
      const statusJustChangedToAvailable =
        formData.status?.toLowerCase() === "available" &&
        (initialData?.status?.toLowerCase() ?? "") !== "available";
      if (statusJustChangedToAvailable) {
        const { error: completeError } = await completeInProgressMaintenance(
          initialData?.id,
        );
        if (completeError) {
          setValidationToast({
            message:
              "Error completing maintenance: " + completeError.message,
            type: "error",
          });
        }
      }

      setShowConfirmModal(false);
      // Close modal and notify parent of successful update
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Error updating truck:", err);
      setValidationToast({ message: err.message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (mode === "edit") {
      setShowConfirmModal(true);
    } else {
      // Open confirmation overlay for adding a new truck
      setShowAddConfirmModal(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg">
        <button
          type="button"
          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2 className="mb-4 text-xl font-semibold text-slate-800">
          {mode === "edit" ? "Edit Truck" : "Add New Truck"}
        </h2>
        {/* Removed datalists – using select dropdowns for Brand and Model */}
        <form
          onSubmit={handleFormSubmit}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs"
        >
          {/* Row 1: Plate Number | Date Acquired */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Plate Number
            </label>
            <input
              name="plate_number"
              placeholder="NGP 1234"
              value={formData.plate_number}
              onChange={handleChange}
              disabled={mode === "edit" || isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                mode === "edit" || isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
          </div>
          {/* Row: Date Acquired – calendar picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date Acquired
            </label>
            <input
              type="month"
              name="date_acquired"
              value={formData.date_acquired}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
          </div>
          {/* Row 2: Brand | Model */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Brand
            </label>
            <select
              name="brand"
              value={formData.brand}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            >
              <option value="" disabled>
                Select brand
              </option>
              {brandOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
            {formData.brand === "Custom" && (
              <input
                name="customBrand"
                placeholder="Enter custom brand"
                value={formData.customBrand}
                onChange={handleChange}
                disabled={isSupervisor}
                className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                  isSupervisor
                    ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                    : "bg-white"
                }`}
                required
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Model
            </label>
            <select
              name="model"
              value={formData.model}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            >
              <option value="" disabled>
                Select model
              </option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
            {formData.model === "Custom" && (
              <input
                name="customModel"
                placeholder="Enter custom model"
                value={formData.customModel}
                onChange={handleChange}
                disabled={isSupervisor}
                className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                  isSupervisor
                    ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                    : "bg-white"
                }`}
                required
              />
            )}
          </div>
          {/* Row 3: Truck Type | Year Model */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Truck Type
            </label>
            <select
              name="truck_type"
              value={formData.truck_type}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            >
              {truck_typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
            {formData.truck_type === "Custom" && (
              <input
                name="customtruck_type"
                placeholder="Enter custom truck type"
                value={formData.customtruck_type}
                onChange={handleChange}
                disabled={isSupervisor}
                className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                  isSupervisor
                    ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                    : "bg-white"
                }`}
                required
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Year Model
            </label>
            <input
              name="year_model"
              type="number"
              value={formData.year_model}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
          </div>
          {/* Commodity Type – Chilled or Ordinary */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Commodity Type
            </label>
            <select
              name="commodity_type"
              value={formData.commodity_type}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            >
              <option value="Ordinary">Ordinary</option>
              <option value="Chilled">Chilled</option>
            </select>
          </div>
          {/* Status dropdown — edit only; new trucks start as "Available" */}
          {mode === "edit" && (
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              >
                <option value="" disabled>
                  Select status
                </option>
                <option value="Available">Available</option>
                <option value="Active">On Delivery</option>
                <option value="Inactive">Inactive</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
          )}
          {/* Row 4: Device ID */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Device ID
            </label>
            <select
              name="device_id"
              value={formData.device_id}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            >
              <option value="" disabled>
                Select device
              </option>
              {availableDevices
                .filter((d) => d.device_id) // Ensure device_id is defined
                .map((d) => {
                  const isTaken =
                    d.plate_number !== null &&
                    d.plate_number !== formData.plate_number;
                  return (
                    <option
                      key={d.device_id}
                      value={d.device_id}
                      disabled={isTaken}
                    >
                      {d.device_id} ({d.device_status})
                      {isTaken ? ` — Taken (${d.plate_number})` : ""}
                    </option>
                  );
                })}
            </select>
          </div>
          {/* Container dimension fields removed as they are no longer part of the schema */}
          {/* New fields: Maximum Capacity (kg) */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Maximum Capacity (kg)
            </label>
            <input
              name="max_capacity"
              type="number"
              step="1"
              min="0"
              placeholder="2000"
              value={formData.max_capacity}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
          </div>
          {/* Current Mileage */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Current Mileage (km)
            </label>
            <input
              name="current_mileage"
              type="number"
              step="1"
              min="0"
              placeholder="12000"
              value={formData.current_mileage}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          {/* Previous Maintenance Date (hidden) */
          /*
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Previous Maintenance Date
            </label>
            <input
              name="previous_maintenance_date"
              type="date"
              value={formData.previous_maintenance_date}
              onChange={handleChange}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white`}
            />
          </div>
          */}
          {/* Previous Mileage (hidden) */
          /*
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Previous Mileage (km)
            </label>
            <input
              name="previous_mileage"
              type="number"
              step="1"
              min="0"
              placeholder="12000"
              value={formData.previous_mileage}
              onChange={handleChange}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm bg-white`}
            />
          </div>
          */}
          {/* Maintenance Mileage Interval */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Maintenance Mileage Interval (km)
            </label>
            <input
              name="maintenance_interval_km"
              type="number"
              step="1"
              min="0"
              placeholder="10000"
              value={formData.maintenance_interval_km}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
          </div>
          {/* Maintenance Time Interval */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Maintenance Interval (months)
            </label>
            <input
              name="maintenance_interval_months"
              type="number"
              step="1"
              min="0"
              placeholder="6"
              value={formData.maintenance_interval_months}
              onChange={handleChange}
              disabled={isSupervisor}
              className={`mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm ${
                isSupervisor
                  ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
          </div>
          {/* Action buttons */}
          <div className="sm:col-span-2 flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              disabled={isSubmitting}
            >
              {mode === "edit"
                ? isSubmitting
                  ? "Saving..."
                  : "Save Changes"
                : "Add Truck"}
            </button>
          </div>
          {/* Success or error messages are now handled via toast in the parent component */}
        </form>
        {/* Confirmation overlay for edit mode */}
        {showConfirmModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg">
              <h3 className="mb-4 text-lg font-medium text-gray-800">
                Confirm Changes
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                Are you sure you want to save the changes to this truck?
              </p>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="rounded bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeUpdateTruck}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Confirmation overlay for add mode */}
        {showAddConfirmModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg">
              <h3 className="mb-4 text-lg font-medium text-gray-800">
                Confirm New Truck
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                Are you sure you want to add this truck?
              </p>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddConfirmModal(false)}
                  className="rounded bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowAddConfirmModal(false);
                    await executeCreateTruck();
                  }}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Validation toast (e.g., duplicate plate number) */}
        {validationToast && (
          <div className="fixed inset-x-0 top-4 flex justify-center z-50">
            <p
              className={`
                px-4 py-2 rounded-md shadow-md text-sm font-medium
                transition-transform duration-300 ease-out
                ${
                  validationToast.type === "success"
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : "bg-red-100 text-red-800 border border-red-300"
                }
                transform translate-y-0 opacity-100
              `}
            >
              {validationToast.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
