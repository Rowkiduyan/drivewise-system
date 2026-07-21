import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import LogoutButton from './LogoutButton.jsx'
import { useUserInitials } from '../lib/useUserInitials.js'

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

    return window.localStorage.getItem('driver-sidebar-expanded') === 'true'
  })
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const navigate = useNavigate()
  const userInitials = useUserInitials()

  const closeMobileMenu = () => setIsMobileMenuOpen(false)
  const closeMobileMenuAfterDelay = (path) => {
    closeMobileMenu()
    window.setTimeout(() => {
      navigate(path)
    }, 300)
  }

  useEffect(() => {
    window.localStorage.setItem('driver-sidebar-expanded', String(isExpanded))
  }, [isExpanded])

  const navigateAfterMobileClose = (path) => {
    closeMobileMenuAfterDelay(path)
  }

  const renderDriverNav = (isExpanded, onItemClick) => (
    <nav className="flex w-full flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2">
      {driverModules.map((module) => (
        <NavLink
          key={module.path}
          to={module.path}
          aria-label={module.label}
          onClick={(event) => {
            event.stopPropagation()

            if (!onItemClick) {
              return
            }

            event.preventDefault()
            onItemClick(module.path)
          }}
          className={({ isActive }) =>
            `flex items-center justify-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm transition-all duration-200 ${
              isActive
                ? 'border-amber-400 bg-amber-900 text-white rounded-lg'
                : 'text-amber-200 hover:border-amber-700'
            }`
          }
        >
          <span className="h-5 w-5 flex-shrink-0">{driverIcons[module.label]}</span>
          {isExpanded && (
            <span className="inline-flex whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 transition-opacity duration-200">
              {module.label}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <main
      className="relative flex h-screen w-screen overflow-hidden bg-white text-slate-900"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {background}

      <div className="fixed left-0 right-0 top-0 z-40 flex items-center border-b border-amber-900/80 bg-amber-950 px-4 py-3 text-white md:hidden">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-amber-700 text-amber-100 transition-colors hover:bg-amber-900"
          aria-label="Open navigation menu"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((currentValue) => !currentValue)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
          </svg>
        </button>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-900 text-sm font-semibold text-white flex-shrink-0">
            {userInitials || '...'}
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 md:hidden ${
          isMobileMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
        onClick={closeMobileMenu}
      />

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-56 flex-col gap-4 border-r border-amber-900/80 bg-amber-950 py-4 backdrop-blur transition-transform duration-300 md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="navigation"
        aria-label="Mobile navigation"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3 px-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-900 text-lg font-semibold text-white flex-shrink-0">
            {userInitials || '...'}
          </div>
        </div>

        {renderDriverNav(true, navigateAfterMobileClose)}

        <div className="border-t border-amber-900/80 px-2 pt-2">
          <LogoutButton isExpanded />
        </div>
      </aside>

      <section className="relative flex h-full w-full">
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-4 border-r border-amber-900/80 py-4 backdrop-blur transition-all duration-300 bg-amber-950 md:flex ${
            isExpanded ? 'w-64' : 'w-16'
          }`}
          role="navigation"
          aria-label="Main navigation"
          onClick={() => setIsExpanded((currentValue) => !currentValue)}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-3 px-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-900 text-lg font-semibold text-white flex-shrink-0">
              DR
            </div>
          </div>

          {/* Navigation */}
          {renderDriverNav(isExpanded, undefined)}

          <div className="border-t border-amber-900/80 px-2 pt-2">
            <LogoutButton isExpanded={isExpanded} />
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden pt-16 md:pt-0">
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
