import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

export const supervisorModules = [
  { label: 'Home', path: '/supervisor/home', description: 'Supervisor overview' },
  {
    label: 'Bookings',
    path: '/supervisor/bookings',
    description: 'Approvals and schedules'
  },
  {
    label: 'Deliveries',
    path: '/supervisor/deliveries',
    description: 'Live routes and alerts'
  },
  {
    label: 'Delivery Crew',
    path: '/supervisor/delivery-crew',
    description: 'Crew availability'
  },
  {
    label: 'Trucks',
    path: '/supervisor/trucks',
    description: 'Fleet availability'
  },
  { label: 'Profile', path: '/supervisor/profile', description: 'Team settings' }
]

const supIconClassName = 'h-5 w-5 stroke-current'

const supIcons = {
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
  'Delivery Crew': (
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
  )
}

function SupLayout({ title, background, children }) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.localStorage.getItem('supSidebarExpanded') === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem('supSidebarExpanded', String(isExpanded))
  }, [isExpanded])

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      {background}

      <section className="relative mx-auto flex min-h-screen w-full max-w-none gap-0">
        <aside
          className={`flex flex-col items-center gap-5 border-r border-blue-200/70 bg-blue-50/80 px-2 py-4 backdrop-blur transition-all duration-200 ${
            isExpanded ? 'w-48 sm:w-56' : 'w-16 sm:w-20'
          }`}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-lg font-semibold text-blue-700">
              SP
            </div>
            <div className="h-px w-full bg-blue-200/70" />
          </div>

          <nav className="flex w-full flex-1 flex-col items-center gap-3">
            {supervisorModules.map((module) => (
              <NavLink
                key={module.path}
                to={module.path}
                aria-label={module.label}
                onClick={(event) => event.stopPropagation()}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 border border-transparent p-3 text-sm transition ${
                    isExpanded ? 'w-full justify-start' : 'w-12 justify-center sm:w-14'
                  } ${
                    isActive
                      ? 'border-blue-300 bg-blue-100 text-blue-800'
                      : 'text-blue-700 hover:border-blue-300'
                  }`
                }
              >
                {supIcons[module.label]}
                <span
                  className={`pointer-events-none inline-flex whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-blue-800 transition-[max-width,opacity,transform] duration-200 ease-out ${
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

export default SupLayout
