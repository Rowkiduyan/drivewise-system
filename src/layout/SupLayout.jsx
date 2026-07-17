import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

export const supervisorModules = [
  {
    label: "Dashboard",
    path: "/supervisor/dashboard",
    description: "Supervisor overview",
  },
  {
    label: "Bookings",
    path: "/supervisor/bookings",
    description: "Approvals and schedules",
  },
  {
    label: "Deliveries",
    path: "/supervisor/deliveries",
    description: "Live routes and alerts",
  },
  {
    label: "Delivery Crew",
    path: "/supervisor/delivery-crew",
    description: "Crew availability",
  },
  {
    label: "Trucks",
    path: "/supervisor/trucks",
    description: "Fleet availability",
  },
  {
    label: "Alert Analysis",
    path: "/supervisor/analysis",
    description: "Alert patterns and insights",
  },
  {
    label: "Profile",
    path: "/supervisor/profile",
    description: "Team settings",
  },
];

const supIconClassName = "h-5 w-5 stroke-current";

const supervisorSidebarTheme = {
  sidebar: "border-blue-900/80 bg-blue-950",
  badge: "bg-blue-900 text-white",
  divider: "bg-blue-800",
  activeLink: "border-blue-400 bg-blue-900 text-white",
  inactiveLink: "text-blue-200 hover:border-blue-700",
  labelText: "text-blue-100",
};

const supervisorSidebarStorageKey = "supervisor-sidebar-expanded";

const supIcons = {
  Dashboard: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={supIconClassName}
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13V10.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  ),
  Home: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={supIconClassName}
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13V10.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  ),
  Deliveries: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={supIconClassName}
      aria-hidden="true"
    >
      <path d="M4 6h10l2 4h4v7H4z" />
      <path d="M4 6v11" />
      <circle cx="8" cy="18" r="1.5" />
      <circle cx="18" cy="18" r="1.5" />
    </svg>
  ),
  Bookings: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={supIconClassName}
      aria-hidden="true"
    >
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  ),
  "Delivery Crew": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={supIconClassName}
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3.5 19c1.4-2.6 3.8-4 5.5-4s4.1 1.4 5.5 4" />
      <path d="M14.5 19c.8-1.6 2.1-2.6 3.5-3" />
    </svg>
  ),
  Trucks: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={supIconClassName}
      aria-hidden="true"
    >
      <path d="M3 15h12l2 3H3z" />
      <path d="M5 15v-7h8l2 7" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  ),
  "Alert Analysis": (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={supIconClassName}
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="M7 14l3-4 3 2 5-6" />
      <circle cx="7" cy="14" r="1" />
      <circle cx="13" cy="12" r="1" />
      <circle cx="18" cy="8" r="1" />
    </svg>
  ),
  Profile: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={supIconClassName}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.8-3 4.5-4.5 7-4.5s5.2 1.5 7 4.5" />
    </svg>
  ),
};

function SupLayout({ title, background, children, bg = "bg-white" }) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(supervisorSidebarStorageKey) === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(
      supervisorSidebarStorageKey,
      String(isExpanded)
    );
  }, [isExpanded]);

  return (
    <main
      className={`sup-layout relative flex h-screen w-screen overflow-hidden ${bg} text-slate-900`}
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {background}

      <section className="relative flex h-full w-full">
        <aside
          className={`sticky top-0 flex h-screen shrink-0 flex-col gap-4 border-r border-blue-900 py-4 backdrop-blur transition-all duration-300 ${supervisorSidebarTheme.sidebar} ${
            isExpanded ? "w-64" : "w-16"
          }`}
          role="navigation"
          aria-label="Main navigation"
          onClick={() => setIsExpanded((currentValue) => !currentValue)}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-3 px-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${supervisorSidebarTheme.badge} text-lg font-semibold flex-shrink-0`}
            >
              SP
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex w-full flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2">
            {supervisorModules.map((module) => (
              <NavLink
                key={module.path}
                to={module.path}
                aria-label={module.label}
                onClick={(event) => event.stopPropagation()}
                className={({ isActive }) =>
                  `flex items-center justify-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm transition-all duration-200 ${
                    isActive
                      ? `${supervisorSidebarTheme.activeLink} rounded-lg`
                      : `${supervisorSidebarTheme.inactiveLink} hover:rounded-lg hover:bg-blue-900/40`
                  }`
                }
              >
                <span className="h-5 w-5 flex-shrink-0">
                  {supIcons[module.label]}
                </span>
                <span
                  className={`inline-flex overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] transition-all duration-200 ease-out ${
                    isExpanded
                      ? "max-w-40 opacity-100 translate-x-0"
                      : "max-w-0 opacity-0 -translate-x-2"
                  }`}
                >
                  {module.label}
                </span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="h-full px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-12 lg:py-10">
              {children}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SupLayout;
