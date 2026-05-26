import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

export const clientModules = [
  { label: 'Home', path: '/client/home', description: 'Client overview' },
  {
    label: 'Bookings',
    path: '/client/bookings',
    description: 'Requests and shipments'
  },
  { label: 'Profile', path: '/client/profile', description: 'Account details' }
]

const clientIconClassName = 'h-5 w-5 stroke-current'

const clientIcons = {
  Home: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={clientIconClassName}
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13V10.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  ),
  Bookings: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={clientIconClassName}
      aria-hidden="true"
    >
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  ),
  Profile: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={clientIconClassName}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.8-3 4.5-4.5 7-4.5s5.2 1.5 7 4.5" />
    </svg>
  )
}

function ClientLayout({ title, background, children }) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.localStorage.getItem('clientSidebarExpanded') === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem('clientSidebarExpanded', String(isExpanded))
  }, [isExpanded])

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      {background}

      <section className="relative mx-auto flex min-h-screen w-full max-w-none gap-0">
        <aside
          className={`flex flex-col items-center gap-5 border-r border-emerald-200/70 bg-emerald-50/80 px-2 py-4 backdrop-blur transition-all duration-200 ${
            isExpanded ? 'w-48 sm:w-56' : 'w-16 sm:w-20'
          }`}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-lg font-semibold text-emerald-700">
              CL
            </div>
            <div className="h-px w-full bg-emerald-200/70" />
          </div>

          <nav className="flex w-full flex-1 flex-col items-center gap-3">
            {clientModules.map((module) => (
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
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                      : 'border-emerald-200/70 text-emerald-700 hover:border-emerald-300'
                  }`
                }
              >
                {clientIcons[module.label]}
                <span
                  className={`pointer-events-none inline-flex whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800 transition-[max-width,opacity,transform] duration-200 ease-out ${
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

export default ClientLayout
