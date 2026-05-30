import { useState } from 'react'
import { NavLink } from 'react-router-dom'

export const driverModules = [
  {
    label: 'Performance',
    path: '/driver/performance',
    description: 'Scores and safety trends'
  },
  {
    label: 'Trips',
    path: '/driver/trips',
    description: 'Routes and deliveries'
  },
  {
    label: 'Profile',
    path: '/driver/profile',
    description: 'Details and settings'
  }
]

const iconClassName = 'h-5 w-5 stroke-current'

const driverIcons = {
  Performance: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={iconClassName}
      aria-hidden="true"
    >
      <path d="M4 20h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-7" />
    </svg>
  ),
  Trips: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={iconClassName}
      aria-hidden="true"
    >
      <path d="M5 15h11l2 3H5z" />
      <path d="M7 15v-6h7l2 6" />
      <circle cx="8" cy="18" r="1.5" />
      <circle cx="16" cy="18" r="1.5" />
    </svg>
  ),
  Profile: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={iconClassName}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.8-3 4.5-4.5 7-4.5s5.2 1.5 7 4.5" />
    </svg>
  )
}

function DriverLayout({ title, background, children }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <main className="relative flex h-screen w-screen overflow-hidden bg-white text-slate-900">
      {background}

      <section className="relative flex h-full w-full">
        <aside
          className={`sticky top-0 flex h-screen shrink-0 flex-col gap-4 border-r border-amber-900/80 py-4 backdrop-blur transition-all duration-300 bg-amber-950 ${
            isHovered ? 'w-56' : 'w-16'
          }`}
          role="navigation"
          aria-label="Main navigation"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-3 px-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-900 text-lg font-semibold text-white flex-shrink-0">
              DR
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex w-full flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2">
            {driverModules.map((module) => (
              <NavLink
                key={module.path}
                to={module.path}
                aria-label={module.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm transition-all duration-200 ${
                    isHovered ? 'justify-start' : 'justify-center'
                  } ${
                    isActive
                      ? 'border-amber-400 bg-amber-900 text-white rounded-lg'
                      : 'text-amber-200 hover:border-amber-700'
                  }`
                }
              >
                <span className="h-5 w-5 flex-shrink-0">{driverIcons[module.label]}</span>
                {isHovered && (
                  <span className="inline-flex whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 transition-opacity duration-200">
                    {module.label}
                  </span>
                )}
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
  )
}

export default DriverLayout
