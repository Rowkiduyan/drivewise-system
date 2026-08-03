import { useState, useEffect } from "react";
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
const STATUS_OPTIONS = ["Available", "On Delivery", "Maintenance", "Offline"];
const DEVICE_STATUS_OPTIONS = ["Online", "Offline"];
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
  if (!isOpen) return null;
  // Dynamic option lists that can be extended with custom entries
  const [brandOptions, setBrandOptions] = useState(INITIAL_BRAND_OPTIONS);
  const [modelOptions, setModelOptions] = useState(INITIAL_MODEL_OPTIONS);

  const [formData, setFormData] = useState({
    plateNumber: "",
    brand: "",
    customBrand: "",
    model: "",
    customModel: "",
    truckType: TRUCK_TYPES[0],
    status: STATUS_OPTIONS[0],
    deviceStatus: DEVICE_STATUS_OPTIONS[0],
    assignedDriver: "",
    assignedDeviceNo: "",
    yearModel: 2026,
    odometer: "",
    fuelLevel: "",
    dateAcquired: "",
  });

  // Reset form when modal opens
  const [resultMessage, setResultMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFormData({
        plateNumber: "",
        brand: "",
        customBrand: "",
        model: "",
        customModel: "",
        truckType: TRUCK_TYPES[0],
        status: STATUS_OPTIONS[0],
        deviceStatus: DEVICE_STATUS_OPTIONS[0],
        assignedDriver: "",
        assignedDeviceNo: "",
        yearModel: 2026,
        odometer: "",
        fuelLevel: "",
        dateAcquired: "",
      });
      setResultMessage("");
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;
    // Auto‑capitalize
    if (name === "plateNumber" || name === "assignedDeviceNo") {
      newValue = newValue.toUpperCase();
    }
    // Auto‑format Plate Number (space after first three characters)
    if (name === "plateNumber") {
      const stripped = newValue.replace(/\s+/g, "");
      if (stripped.length > 3) {
        newValue = stripped.slice(0, 3) + " " + stripped.slice(3);
      } else {
        newValue = stripped;
      }
    }
    // Auto‑format Device No. (hyphen after first three characters)
    if (name === "assignedDeviceNo") {
      const stripped = newValue.replace(/-/g, "");
      if (stripped.length > 3) {
        newValue = stripped.slice(0, 3) + "-" + stripped.slice(3);
      } else {
        newValue = stripped;
      }
    }
    setFormData((prev) => ({ ...prev, [name]: newValue }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Convert numeric fields
    // Resolve custom entries before persisting
    const finalBrand =
      formData.brand === "Custom" ? formData.customBrand : formData.brand;
    const finalModel =
      formData.model === "Custom" ? formData.customModel : formData.model;

    const processed = {
      plateNumber: formData.plateNumber,
      brand: finalBrand,
      model: finalModel,
      truckType: formData.truckType,
      status: formData.status,
      deviceStatus: formData.deviceStatus,
      assignedDriver: formData.assignedDriver,
      assignedDeviceNo: formData.assignedDeviceNo,
      yearModel: Number(formData.yearModel),
      odometer: Number(formData.odometer),
      fuelLevel: Number(formData.fuelLevel),
      dateAcquired: formData.dateAcquired,
    };
    try {
      onSubmit(processed);
      setResultMessage("Truck added successfully!");
      // Persist new custom entries
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
    } catch (err) {
      console.error(err);
      setResultMessage("Failed to add truck.");
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
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {/* Row 1: Plate Number | Date Acquired */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Plate Number
            </label>
            <input
              name="plateNumber"
              placeholder="NGP 1234"
              value={formData.plateNumber}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
              required
            />
          </div>
          {/* Row: Date Acquired – calendar picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date Acquired
            </label>
            <input
              type="month"
              name="dateAcquired"
              value={formData.dateAcquired}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              required
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
              required
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
              required
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
              name="truckType"
              value={formData.truckType}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              required
            >
              {TRUCK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Year Model
            </label>
            <input
              name="yearModel"
              type="number"
              value={formData.yearModel}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
              required
            />
          </div>
          {/* Row 4: Device No. | Device Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Device No.
            </label>
            <input
              name="assignedDeviceNo"
              placeholder="DWD-1001"
              value={formData.assignedDeviceNo}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Device Status
            </label>
            <select
              name="deviceStatus"
              value={formData.deviceStatus}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              required
            >
              {DEVICE_STATUS_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          {/* Assigned Driver – full width */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">
              Assigned Driver (Optional)
            </label>
            <input
              name="assignedDriver"
              placeholder="Ramos, Juan A."
              value={formData.assignedDriver}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          {/* Row 5: Fuel Level | Odometer */}
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Fuel Level (%)
            </label>
            <input
              name="fuelLevel"
              type="number"
              placeholder="50"
              value={formData.fuelLevel}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Odometer
            </label>
            <input
              name="odometer"
              type="number"
              placeholder="12000"
              value={formData.odometer}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
              required
            />
          </div>
          {/* Status – full width */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              required
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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
          {resultMessage && (
            <p className="sm:col-span-2 mt-2 text-sm text-green-600">
              {resultMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
