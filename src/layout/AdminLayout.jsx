import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { NavLink } from "react-router-dom";
import LogoutButton from "./LogoutButton.jsx";
import { useUserProfile } from "../lib/useUserInitials.js";
import { useDeactivationGuard } from "../lib/useDeactivationGuard.js";
import { formatCutoff } from "../lib/deactivation.js";

// Order of modules as requested:
// 1. User Management
// 2. Dashboard
// 3. Device Management
// 4. Trucks
// 5. Profile
const adminModules = [
  {
    label: "User Management",
    path: "/admin/user-management",
    description: "Users, roles, and accounts",
  },
  {
    label: "Dashboard",
    path: "/admin/dashboard",
    description: "Fleet operations overview",
  },
  {
    label: "Device Management",
    path: "/admin/device-management",
    description: "Fleet devices and status",
  },
  // Trucks module – mirrors the supervisor's Trucks entry but for admin routes
  {
    label: "Trucks",
    path: "/admin/trucks",
    description: "Fleet availability",
  },
  { label: "Profile", path: "/admin/profile", description: "Admin account" },
];

const adminIconClassName = "h-5 w-5 stroke-current";

const adminIcons = {
  "User Management": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={adminIconClassName}
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3.5 19c1.4-2.6 3.8-4 5.5-4s4.1 1.4 5.5 4" />
      <path d="M14.5 19c.8-1.6 2.1-2.6 3.5-3" />
    </svg>
  ),
  "Device Management": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={adminIconClassName}
      aria-hidden="true"
    >
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <circle cx="9" cy="16" r="1.4" />
      <circle cx="15" cy="16" r="1.4" />
    </svg>
  ),
  Dashboard: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={adminIconClassName}
      aria-hidden="true"
    >
      <path d="M4 20h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-7" />
    </svg>
  ),
  // Trucks icon – identical to supervisor's Trucks icon
  Trucks: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={adminIconClassName}
      aria-hidden="true"
    >
      <path d="M3 15h12l2 3H3z" />
      <path d="M5 15v-7h8l2 7" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  ),
  Profile: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={adminIconClassName}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.8-3 4.5-4.5 7-4.5s5.2 1.5 7 4.5" />
    </svg>
  ),
};

const adminSidebarTheme = {
  sidebar: "border-violet-900/80 bg-violet-950",
  badge: "bg-violet-900 text-white",
  divider: "border-violet-900/80",
  activeLink: "border-violet-400 bg-violet-900 text-white",
  inactiveLink: "text-violet-200 hover:border-violet-700",
  labelText: "text-violet-100",
};

const adminSidebarStorageKey = "admin-sidebar-expanded";

function AdminLayout({ title, background, children, bg = "bg-white" }) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(adminSidebarStorageKey) === "true";
  });
  const { initials: userInitials, profilePicture, role } = useUserProfile();
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const deactivationWarning = useDeactivationGuard();
  const location = useLocation();

  useEffect(() => {
    window.localStorage.setItem(adminSidebarStorageKey, String(isExpanded));
  }, [isExpanded]);

  // Collapse sidebar when navigating to a truck profile page
  useEffect(() => {
    if (location.pathname.startsWith("/admin/trucks/profile")) {
      setIsExpanded(false);
    }
  }, [location.pathname]);

  return (
    <main
      className={`admin-layout relative flex h-screen w-screen overflow-hidden ${bg} text-slate-900`}
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {background}

      <section className="relative flex h-full w-full">
        <aside
          className={`sticky top-0 flex h-screen shrink-0 flex-col gap-4 border-r py-4 backdrop-blur transition-all duration-300 ${adminSidebarTheme.sidebar} ${
            isExpanded ? "w-64" : "w-16"
          }`}
          role="navigation"
          aria-label="Main navigation"
          onClick={() => setIsExpanded((currentValue) => !currentValue)}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-3 px-3">
            <div
              className={`flex items-center justify-center overflow-hidden rounded-full transition-all duration-300 ${adminSidebarTheme.badge} font-semibold flex-shrink-0 ${
                isExpanded ? "h-24 w-24 text-2xl" : "h-10 w-10 text-sm"
              } ${profilePicture ? "cursor-pointer" : ""}`}
              onClick={(event) => {
                if (!profilePicture) {
                  return;
                }
                event.stopPropagation();
                setIsImageViewerOpen(true);
              }}
            >
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                userInitials || "..."
              )}
            </div>
            {isExpanded && role ? (
              <span
                className={`text-xs font-semibold uppercase tracking-[0.2em] ${adminSidebarTheme.labelText}`}
              >
                {role}
              </span>
            ) : null}
          </div>

          {/* Navigation */}
          <nav className="flex w-full flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2">
            {adminModules.map((module) => (
              <NavLink
                key={module.path}
                to={module.path}
                aria-label={module.label}
                onClick={(event) => event.stopPropagation()}
                className={({ isActive }) =>
                  `flex items-center justify-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm transition-all duration-200 ${
                    isActive
                      ? `${adminSidebarTheme.activeLink} rounded-lg`
                      : `${adminSidebarTheme.inactiveLink} hover:rounded-lg hover:bg-violet-900/40`
                  }`
                }
              >
                <span className="h-5 w-5 flex-shrink-0">
                  {adminIcons[module.label]}
                </span>
                <span
                  className={`inline-flex overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] transition-all duration-200 ease-out ${
                    isExpanded
                      ? "max-w-44 opacity-100 translate-x-0"
                      : "max-w-0 opacity-0 -translate-x-2"
                  }`}
                >
                  {module.label}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className={`border-t ${adminSidebarTheme.divider} px-2 pt-2`}>
            <LogoutButton isExpanded={isExpanded} />
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="h-full px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-12 lg:py-10">
              {title ? <h1 className="sr-only">{title}</h1> : null}
              {deactivationWarning ? (
                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Your account has been deactivated. You will lose access on{" "}
                  {formatCutoff(deactivationWarning.cutoffAt)} unless this is
                  reversed.
                </div>
              ) : null}
              {children}
            </div>
          </div>
        </div>
      </section>

      {isImageViewerOpen && profilePicture ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Profile picture"
          onClick={() => setIsImageViewerOpen(false)}
        >
          <img
            src={profilePicture}
            alt="Profile"
            className="aspect-square h-auto max-h-[80vh] w-auto max-w-full rounded-full object-cover shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </main>
  );
}

export default AdminLayout;
