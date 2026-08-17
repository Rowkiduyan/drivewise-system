import { useState, useMemo } from "react";
import AdminLayout from "../layout/AdminLayout.jsx";
import mockLogs from "../lib/mockSystemLogs.js";
import {
  ArrowUp,
  ArrowDown,
  Search,
  RotateCcw,
  Download,
  PlusCircle,
  RefreshCw,
  Trash2,
  Eye,
  Wrench,
  Truck,
  HardDrive,
  User as UserIcon,
  FileText,
  Settings,
} from "lucide-react";
import { MANILA_TIMEZONE } from "../lib/manilaTime.js";

// Helper to format timestamps to "MMM dd, yyyy • HH:mm", pinned to Manila timezone.
const formatTimestamp = (iso) => {
  const date = new Date(iso);
  const options = {
    timeZone: MANILA_TIMEZONE,
    month: "short",
    day: "2-digit",
    year: "numeric",
  };
  const datePart = new Intl.DateTimeFormat("en-US", options).format(date);
  const timePart = date.toLocaleTimeString("en-US", {
    timeZone: MANILA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} • ${timePart}`;
};

// Simple relative time (e.g., "2h ago")
const relativeTime = (iso) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
};

// Mapping of actions to badge styles and icons
const actionMeta = {
  Created: {
    class: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: PlusCircle,
  },
  Updated: {
    class: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: RefreshCw,
  },
  Deleted: {
    class: "bg-rose-50 text-rose-700 border border-rose-200",
    icon: Trash2,
  },
  Viewed: {
    class: "bg-slate-100 text-slate-700 border border-slate-200",
    icon: Eye,
  },
  Maintenance: {
    class: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: Wrench,
  },
};

// Mapping of target keywords to icons
const targetMeta = {
  Delivery: { icon: Truck },
  Device: { icon: HardDrive },
  User: { icon: UserIcon },
  Report: { icon: FileText },
  Settings: { icon: Settings },
};

// Avatar helper (initials)
const Avatar = ({ name }) => {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
      {initials}
    </div>
  );
};

function SystemLogs() {
  // Filters & search
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all"); // all | today | 7d | 30d
  const [actionFilter, setActionFilter] = useState("all"); // all | Created | Updated | Deleted | Viewed | Maintenance
  const [targetFilter, setTargetFilter] = useState("all"); // all | Delivery | Device | User | Report | Settings
  const [sortDirection, setSortDirection] = useState("desc"); // asc or desc

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Drawer state
  const [selectedLog, setSelectedLog] = useState(null);

  // Compute filtered logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();
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
      // Target filter
      if (targetFilter !== "all" && !log.target.includes(targetFilter))
        return false;
      // Search filter
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
    // Sort
    const sorted = filtered.sort((a, b) => {
      const diff = new Date(a.timestamp) - new Date(b.timestamp);
      return sortDirection === "asc" ? diff : -diff;
    });
    return sorted;
  }, [search, dateFilter, actionFilter, targetFilter, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page]);

  const resetFilters = () => {
    setSearch("");
    setDateFilter("all");
    setActionFilter("all");
    setTargetFilter("all");
    setSortDirection("desc");
    setPage(1);
  };

  const exportCSV = () => {
    const header = ["Timestamp", "Actor", "Action", "Target", "Details"].join(
      ",",
    );
    const rows = filteredLogs.map((log) =>
      [
        log.timestamp,
        log.actor,
        log.action,
        log.target,
        JSON.stringify(log.details),
      ].join(","),
    );
    const csvContent = [header, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "system_logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout title="System Logs" background={null}>
      <div className="max-w-7xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-6">
        {/* Toolbar */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-wrap gap-3 items-center mb-5">
          {/* Search */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by actor, target, or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {/* Filters & actions */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="all">All Actions</option>
              <option value="Created">Created</option>
              <option value="Updated">Updated</option>
              <option value="Deleted">Deleted</option>
              <option value="Viewed">Viewed</option>
              <option value="Maintenance">Maintenance</option>
            </select>
            <select
              value={targetFilter}
              onChange={(e) => {
                setTargetFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="all">All Targets</option>
              <option value="Delivery">Delivery</option>
              <option value="Device">Device</option>
              <option value="User">User</option>
              <option value="Report">Report</option>
              <option value="Settings">Settings</option>
            </select>
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-700 flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <RotateCcw className="h-4 w-4 mr-1" /> Refresh
            </button>
            <button
              type="button"
              onClick={exportCSV}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </button>
          </div>
        </div>

        {/* Table Card */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left">
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
                      <ArrowUp className="h-4 w-4" />
                    ) : (
                      <ArrowDown className="h-4 w-4" />
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
            <tbody className="divide-y divide-slate-100">
              {paginatedLogs.map((log) => {
                const ActionIcon = actionMeta[log.action]?.icon || null;
                const actionClass =
                  actionMeta[log.action]?.class || "bg-gray-100 text-gray-800";
                const TargetIcon = Object.entries(targetMeta).find(([key]) =>
                  log.target.includes(key),
                )?.[1].icon;
                return (
                  <tr
                    key={log.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-sm text-slate-700 cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="font-medium text-slate-900">
                        {formatTimestamp(log.timestamp)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {relativeTime(log.timestamp)}
                      </div>
                    </td>
                    <td className="px-4 py-2 flex items-center space-x-2 whitespace-nowrap">
                      <Avatar name={log.actor} />
                      <span className="font-medium text-slate-800">
                        {log.actor}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${actionClass}`}
                      >
                        {ActionIcon && <ActionIcon className="h-3 w-3 mr-1" />}
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-slate-800 font-medium">
                        {TargetIcon && <TargetIcon className="h-3 w-3" />}
                        <span>{log.target}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap max-w-md truncate text-slate-600">
                      {log.details}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
          <div>
            Showing {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, filteredLogs.length)} of{" "}
            {filteredLogs.length} entries
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`rounded border px-2 py-1 ${p === page ? "bg-violet-100" : ""}`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {/* Drawer for log details */}
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black bg-opacity-30"
              onClick={() => setSelectedLog(null)}
            ></div>
            <div className="ml-auto w-96 max-w-full h-full bg-white dark:bg-slate-800 shadow-xl p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Log Details</h2>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2">
                <div>
                  <strong>Timestamp:</strong>{" "}
                  {formatTimestamp(selectedLog.timestamp)} (
                  {relativeTime(selectedLog.timestamp)})
                </div>
                <div className="flex items-center space-x-2">
                  <strong>Actor:</strong> <Avatar name={selectedLog.actor} />{" "}
                  {selectedLog.actor}
                </div>
                <div>
                  <strong>Action:</strong> {selectedLog.action}
                </div>
                <div>
                  <strong>Target:</strong> {selectedLog.target}
                </div>
                <div>
                  <strong>Details:</strong>
                  <pre className="bg-gray-100 dark:bg-slate-700 p-2 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default SystemLogs;
