import { useEffect, useState } from 'react'
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
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.localStorage.getItem('driverSidebarExpanded') === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem('driverSidebarExpanded', String(isExpanded))
  }, [isExpanded])

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      {background}

      <section className="relative mx-auto flex min-h-screen w-full max-w-none gap-0">
        <aside
          className={`flex flex-col items-center gap-5 border-r border-amber-200/70 bg-amber-50/80 px-2 py-4 backdrop-blur transition-all duration-200 ${
            isExpanded ? 'w-48 sm:w-56' : 'w-16 sm:w-20'
          }`}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-lg font-semibold text-amber-700">
              DR
            </div>
            <div className="h-px w-full bg-amber-200/70" />
          </div>

          <nav className="flex w-full flex-1 flex-col items-center gap-3">
            {driverModules.map((module) => (
              <NavLink
                key={module.path}
                to={module.path}
                aria-label={module.label}
                onClick={(event) => event.stopPropagation()}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-2xl border p-3 text-sm transition ${
                    isExpanded ? 'w-full justify-start' : 'w-12 justify-center sm:w-14'
                  } ${
                    isActive
                      ? 'border-amber-300 bg-amber-100 text-amber-800'
                      : 'border-amber-200/70 text-amber-700 hover:border-amber-300'
                  }`
                }
              >
                {driverIcons[module.label]}
                <span
                  className={`pointer-events-none inline-flex whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-amber-800 transition-[max-width,opacity,transform] duration-200 ease-out ${
                    isExpanded
                      ? 'max-w-[160px] translate-x-0 opacity-100'
                      : 'max-w-0 translate-x-1 opacity-0'
                  }`}
                >
                  {module.label}
                </span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 px-4 py-4 sm:px-8 sm:py-8 lg:px-12">
          {children}
        </div>
      </section>
    </main>
  )
}

export default DriverLayout
