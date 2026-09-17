// React import removed as it is not directly used (JSX transpilation handles it)
import { useResolvedAddress } from "../lib/reverseGeocode.js";

/**
 * Reusable modal that displays the details of a delivery request.
 * It is used by both the Admin and Supervisor truck profile pages.
 * The table layout mirrors the one shown on the Customer Deliveries page.
 */
export default function ViewModal({ isOpen, onClose, trip }) {
  // Resolves a "lat, lng"-shaped location (the rare reverse-geocode-failure
  // fallback a picker/map click can still leave behind, or older fixture
  // data) into a real address for display -- same useResolvedAddress hook
  // every other portal's delivery-detail view already uses for this exact
  // reason (CustomerDeliveries.jsx, DriverDeliveries.jsx, HelperDeliveries.jsx,
  // SupDeliveries.jsx). Called unconditionally, before the early return
  // below, per the Rules of Hooks.
  const resolvedPickup = useResolvedAddress(trip?.pickup_location || "");
  const resolvedDropoff = useResolvedAddress(trip?.dropoff_location || "");

  if (!isOpen || !trip) return null;

  // Helper to safely render a field value or a placeholder.
  const renderField = (value) => (value ? value : "-");

  // Convert a 24‑hour time string (e.g., "07:33:00") to 12‑hour format with AM/PM.
  const formatTime = (timeStr) => {
    if (!timeStr) return "-";
    const parts = timeStr.split(":");
    if (parts.length < 2) return timeStr;
    let hour = parseInt(parts[0], 10);
    const minute = parts[1];
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    const hourStr = hour.toString().padStart(2, "0");
    return `${hourStr}:${minute} ${ampm}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header with icon */}
        <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {/* Using a generic truck icon – you can replace with any Lucide icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7h18M3 12h18M3 17h18"
              />
            </svg>
            <h2 className="text-lg font-semibold">Delivery Request Details</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        {/* Content area with scroll */}
        <div className="p-4 overflow-y-auto flex-1">
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="bg-gray-50">
                <td className="font-medium py-2 px-2">Status</td>
                <td className="py-2 px-2">{renderField(trip.status)}</td>
              </tr>
              <tr className="bg-white">
                <td className="font-medium py-2 px-2">Request ID</td>
                <td className="py-2 px-2">{renderField(trip.id)}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="font-medium py-2 px-2">Item Type</td>
                <td className="py-2 px-2">{renderField(trip.item_type)}</td>
              </tr>
              <tr className="bg-white">
                <td className="font-medium py-2 px-2">Pick‑up Location</td>
                <td className="py-2 px-2">
                  {renderField(resolvedPickup)}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td className="font-medium py-2 px-2">Pick‑up Time</td>
                <td className="py-2 px-2">
                  {renderField(formatTime(trip.pickup_time))}
                </td>
              </tr>
              <tr className="bg-white">
                <td className="font-medium py-2 px-2">Drop‑off Location</td>
                <td className="py-2 px-2">
                  {renderField(resolvedDropoff)}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td className="font-medium py-2 px-2">Drop‑off Time</td>
                <td className="py-2 px-2">
                  {renderField(formatTime(trip.dropoff_time))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Footer actions */}
        <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
