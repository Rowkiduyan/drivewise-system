import { useState } from 'react'
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
  const [isHovered, setIsHovered] = useState(false)

  return (
    <main className="relative flex h-screen w-screen overflow-hidden bg-white text-slate-900">
      {background}

      <section className="relative flex h-full w-full">
        <aside
          className={`sticky top-0 flex h-screen shrink-0 flex-col gap-4 border-r border-emerald-900/80 py-4 backdrop-blur transition-all duration-300 bg-emerald-950 ${
            isHovered ? 'w-56' : 'w-16'
          }`}
          role="navigation"
          aria-label="Main navigation"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-3 px-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-900 text-lg font-semibold text-white flex-shrink-0">
              CL
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex w-full flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2">
            {clientModules.map((module) => (
              <NavLink
                key={module.path}
                to={module.path}
                aria-label={module.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm transition-all duration-200 ${
                    isHovered ? 'justify-start' : 'justify-center'
                  } ${
                    isActive
                      ? 'border-emerald-400 bg-emerald-900 text-white rounded-lg'
                      : 'text-emerald-200 hover:border-emerald-700'
                  }`
                }
              >
                <span className="h-5 w-5 flex-shrink-0">{clientIcons[module.label]}</span>
                {isHovered && (
                  <span className="inline-flex whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100 transition-opacity duration-200">
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

export default ClientLayout
