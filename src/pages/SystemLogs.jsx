import { useState, useMemo } from "react";
import AdminLayout from "../layout/AdminLayout.jsx";
import mockLogs from "../lib/mockSystemLogs.js";
import { ShieldCheck, ArrowUp, ArrowDown } from "lucide-react";

// Helper to format timestamps to "MMM dd, yyyy • HH:mm"
const formatTimestamp = (iso) => {
  const date = new Date(iso);
  const options = { month: "short", day: "2-digit", year: "numeric" };
  const datePart = new Intl.DateTimeFormat("en-US", options).format(date);
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} • ${timePart}`;
};

// Color mapping for actions
const actionColors = {
  Created: "bg-emerald-100 text-emerald-800",
  Updated: "bg-blue-100 text-blue-800",
  Deleted: "bg-amber-100 text-amber-800",
  Viewed: "bg-slate-100 text-slate-800",
  Maintenance: "bg-rose-100 text-rose-800",
};

function SystemLogs() {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all"); // all | today | 7d | 30d
  const [actionFilter, setActionFilter] = useState("all"); // all | Created | Updated | Deleted | Viewed | Maintenance
  const [sortDirection, setSortDirection] = useState("desc"); // asc or desc

  // Compute filtered logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();
    // Initial filter based on date, action, and search
    const filtered = mockLogs.filter((log) => {
      // Date filter
      if (dateFilter === "today") {
        const today = new Date();
        const logDate = new Date(log.timestamp);
        if (logDate.toDateString() !== today.toDateString()) return false;
      }
      if (
        dateFilter === "7d" &&
        now - new Date(log.timestamp) > 7 * 24 * 60 * 60 * 1000
      )
        return false;
      if (
        dateFilter === "30d" &&
        now - new Date(log.timestamp) > 30 * 24 * 60 * 60 * 1000
      )
        return false;
      // Action filter
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      // Search filter (case‑insensitive) on actor, action, target, details
      if (search) {
        const term = search.toLowerCase();
        return (
          log.actor.toLowerCase().includes(term) ||
          log.action.toLowerCase().includes(term) ||
          log.target.toLowerCase().includes(term) ||
          (log.details && log.details.toLowerCase().includes(term))
        );
      }
      return true;
    });
    // Sort by timestamp according to sortDirection
    const sorted = filtered.sort((a, b) => {
      const diff = new Date(a.timestamp) - new Date(b.timestamp);
      return sortDirection === "asc" ? diff : -diff;
    });
    return sorted;
  }, [search, dateFilter, actionFilter, sortDirection]);

  return (
    <AdminLayout title="System Logs" background={null}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <ShieldCheck className="h-6 w-6 text-violet-600" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-gray-900">System Logs</h1>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <input
            type="text"
            placeholder="Search logs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="7d">Last 7 days</option>
            <option value="today">Today</option>
          </select>
          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">All actions</option>
            <option value="Created">Created</option>
            <option value="Updated">Updated</option>
            <option value="Deleted">Deleted</option>
            <option value="Viewed">Viewed</option>
            <option value="Maintenance">Maintenance</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  <button
                    type="button"
                    className="flex items-center space-x-1"
                    onClick={() =>
                      setSortDirection((prev) =>
                        prev === "asc" ? "desc" : "asc",
                      )
                    }
                  >
                    <span>Timestamp</span>
                    {sortDirection === "asc" ? (
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Actor
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Action
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Target
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                    {log.actor}
                  </td>
                  <td className="px-4 py-2 text-sm whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${actionColors[log.action] || "bg-gray-100 text-gray-800"}`}
                    >
                      {" "}
                      {log.action}{" "}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                    {log.target}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default SystemLogs;
