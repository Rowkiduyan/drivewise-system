import { useState, useEffect } from "react";
// Real device data will be fetched from Supabase instead of using mock data.
import { supabase } from "../lib/supabaseClient.js";
import { X } from "lucide-react";

// Duplicate options to avoid circular imports
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
const MONTH_OPTIONS = [
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
const YEAR_OPTIONS = Array.from({ length: 2027 - 2000 }, (_, i) =>
  (2000 + i).toString(),
);

export default function AddTruckModal({ isOpen, onClose, onSubmit }) {
  // Dynamic option lists that can be extended with custom entries
  const [brandOptions, setBrandOptions] = useState(INITIAL_BRAND_OPTIONS);
  const [modelOptions, setModelOptions] = useState(INITIAL_MODEL_OPTIONS);

  const [truck_typeOptions, settruck_typeOptions] = useState(TRUCK_TYPES);
  const [formData, setFormData] = useState({
    plate_number: "",
    brand: "",
    customBrand: "",
    model: "",
    customModel: "",
    truck_type: TRUCK_TYPES[0],
    customtruck_type: "",
    // device_status removed – managed via devices table
    device_id: "",
    year_model: 2026,
    // New fields
    max_capacity: "",
    container_width: "",
    container_height: "",
    container_length: "",
    current_mileage: "",
    maintenance_interval: "",
    maintenance_mileage_interval: "",
    date_acquired: "",
  });

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
    if (isOpen) {
      // Reset form fields
      // Reset all form fields to their initial empty values to keep inputs controlled
      setFormData({
        plate_number: "",
        brand: "",
        customBrand: "",
        model: "",
        customModel: "",
        truck_type: TRUCK_TYPES[0],
        customtruck_type: "",
        device_id: "",
        year_model: 2026,
        date_acquired: "",
        // New numeric fields default to empty strings (controlled inputs)
        max_capacity: "",
        container_height: "",
        container_width: "",
        container_length: "",
        current_mileage: "",
        maintenance_interval: "",
        maintenance_mileage_interval: "",
      });

      // Fetch unassigned devices from Supabase (devices with null plate_number)
      const fetchDevices = async () => {
        const { data, error } = await supabase
          .from("devices")
          .select("device_id, device_status, plate_number");
        if (error) {
          console.error("Failed to fetch devices:", error);
          setAvailableDevices([]);
        } else {
          // The returned objects may have keys device_id, device_status, plate_number
          setAvailableDevices(data || []);
        }
      };
      fetchDevices();
    }
  }, [isOpen]);
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
    setFormData((prev) => ({ ...prev, [name]: newValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Convert numeric fields and resolve custom entries before persisting
    const finalBrand =
      formData.brand === "Custom" ? formData.customBrand : formData.brand;
    const finalModel =
      formData.model === "Custom" ? formData.customModel : formData.model;
    const finaltruck_type =
      formData.truck_type === "Custom"
        ? formData.customtruck_type
        : formData.truck_type;
    // Prepare truck data according to new schema (only plate_number, brand, model)
    // Build the payload with all fields that exist in the `trucks` table.
    // Empty strings are acceptable for optional columns; numeric fields are kept as strings
    // because Supabase will coerce them appropriately.
    const truckData = {
      plate_number: formData.plate_number,
      brand: finalBrand,
      model: finalModel,
      truck_type: finaltruck_type,
      // Optional fields – include them even if empty to avoid NULL defaults
      date_acquired: formData.date_acquired || null,
      year_model: formData.year_model || null,
      container_height: formData.container_height || null,
      container_width: formData.container_width || null,
      container_length: formData.container_length || null,
      max_capacity: formData.max_capacity || null,
      current_mileage: formData.current_mileage || null,
      maintenance_mileage_interval:
        formData.maintenance_mileage_interval || null,
      maintenance_interval: formData.maintenance_interval || null,
    };
    try {
      // ---- Duplicate plate‑number check ----
      const { data: existing, error: dupError } = await supabase
        .from("trucks")
        .select("plate_number")
        .eq("plate_number", formData.plate_number)
        .limit(1);
      if (dupError) {
        // Supabase error while checking – treat as fatal
        throw dupError;
      }
      if (existing && existing.length > 0) {
        // Plate number already exists – show toast and abort submission
        setValidationToast({
          message: `Plate number ${formData.plate_number} already exists`,
          type: "error",
        });
        return; // Do not close modal, do not call onSubmit
      }

      // If a device was selected, associate it with the new truck by updating its plate_number
      if (formData.device_id) {
        const { error: deviceError } = await supabase
          .from("devices")
          .update({ plate_number: formData.plate_number })
          .eq("device_id", formData.device_id);
        if (deviceError) {
          throw deviceError;
        }
      }
      // Notify parent component (AdminTrucks) that a new truck was added.
      // The parent will handle the actual insertion and toast display.
      if (onSubmit) {
        onSubmit(truckData);
      }
      // Close the modal on success
      onClose();
      // Persist new custom entries for future selections
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
      // Errors are handled by the parent via toast; no inline message needed
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
          Add New Truck
        </h2>
        {/* Removed datalists – using select dropdowns for Brand and Model */}
        <form
          onSubmit={handleSubmit}
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
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
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
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
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
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
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
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
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
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
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
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
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
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
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
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
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
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          {/* Row 4: Device ID */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Device ID
            </label>
            <select
              name="device_id"
              value={formData.device_id}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="" disabled>
                Select device
              </option>
              {availableDevices
                .filter((d) => d.device_id) // Ensure device_id is defined
                .map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.device_id} ({d.device_status})
                  </option>
                ))}
            </select>
          </div>
          {/* New fields: Vehicle Height (m) */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Container Height (m)
            </label>
            <input
              name="container_height"
              type="number"
              step="0.01"
              min="0"
              placeholder="1.8"
              value={formData.container_height}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          {/* New fields: Vehicle Width (m) */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Container Width (m)
            </label>
            <input
              name="container_width"
              type="number"
              step="0.01"
              min="0"
              placeholder="2.5"
              value={formData.container_width}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          {/* New field: Vehicle Length (m) */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Container Length (m)
            </label>
            <input
              name="container_length"
              type="number"
              step="0.01"
              min="0"
              placeholder="5.0"
              value={formData.container_length}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
              required
            />
          </div>
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
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
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
          {/* Maintenance Mileage Interval */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Maintenance Mileage Interval (km)
            </label>
            <input
              name="maintenance_mileage_interval"
              type="number"
              step="1"
              min="0"
              placeholder="5000"
              value={formData.maintenance_mileage_interval}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          {/* Maintenance Interval */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Maintenance Interval (month/s)
            </label>
            <input
              name="maintenance_interval"
              type="number"
              step="1"
              min="0"
              placeholder="6"
              value={formData.maintenance_interval}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
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
            >
              Add Truck
            </button>
          </div>
          {/* Success or error messages are now handled via toast in the parent component */}
        </form>
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
