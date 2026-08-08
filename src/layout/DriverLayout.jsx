import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import LogoutButton from './LogoutButton.jsx'
import { useUserProfile } from '../lib/useUserInitials.js'
import { useDeactivationGuard } from '../lib/useDeactivationGuard.js'
import { formatCutoff } from '../lib/deactivation.js'

// Profile isn't listed here — it's reached via the sidebar header (avatar)
// instead of a nav item, see the header buttons below.
export const driverModules = [
  {
    label: 'Performance',
    path: '/driver/performance',
    description: 'Scores and safety trends'
  },
  {
    label: 'Deliveries',
    path: '/driver/trips',
    description: 'Routes and deliveries'
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
  Deliveries: (
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
  const { initials: userInitials, profilePicture } = useUserProfile()
  const deactivationWarning = useDeactivationGuard()

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

  const renderDriverNav = (isExpanded, onItemClick, compact = false) => (
    <nav className={`flex w-full flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 ${compact ? 'gap-1.5' : 'gap-2'}`}>
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
            `flex items-center justify-start rounded-lg border border-transparent text-sm transition-all duration-200 ${
              compact ? 'gap-2.5 px-2.5 py-2' : 'gap-3 px-3 py-2.5'
            } ${
              isActive
                ? 'border-amber-400 bg-amber-900 text-white rounded-lg'
                : 'text-amber-200 hover:border-amber-700'
            }`
          }
        >
          <span className="h-5 w-5 flex-shrink-0">{driverIcons[module.label]}</span>
          {isExpanded && (
            <span
              className={`inline-flex whitespace-nowrap font-semibold uppercase text-amber-100 transition-opacity duration-200 ${
                compact ? 'text-[11px] tracking-wide' : 'text-xs tracking-[0.2em]'
              }`}
            >
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

      <div className="fixed left-0 right-0 top-0 z-40 flex items-center border-b border-amber-900/80 bg-amber-950 px-3 py-2 text-white md:hidden">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-700 text-amber-100 transition-colors hover:bg-amber-900"
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
          <button
            type="button"
            aria-label="Go to profile"
            onClick={() => navigate('/driver/profile')}
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-amber-900 text-xs font-semibold text-white flex-shrink-0"
          >
            {profilePicture ? (
              <img src={profilePicture} alt="" className="h-full w-full object-cover" />
            ) : (
              userInitials || '...'
            )}
          </button>
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
        className={`fixed left-0 top-0 z-40 flex h-screen w-56 flex-col gap-3 border-r border-amber-900/80 bg-amber-950 py-3 backdrop-blur transition-transform duration-300 md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="navigation"
        aria-label="Mobile navigation"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header — the profile shortcut, since Profile isn't a nav item below. */}
        <button
          type="button"
          aria-label="Go to profile"
          onClick={() => navigateAfterMobileClose('/driver/profile')}
          className="flex flex-col items-center gap-2 px-3"
        >
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-amber-900 text-base font-semibold text-white flex-shrink-0">
            {profilePicture ? (
              <img src={profilePicture} alt="" className="h-full w-full object-cover" />
            ) : (
              userInitials || '...'
            )}
          </div>
        </button>

        {renderDriverNav(true, navigateAfterMobileClose, true)}

        <div className="border-t border-amber-900/80 px-2 pt-2">
          <LogoutButton isExpanded compact iconClassName="h-4 w-4 stroke-current" />
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
          {/* Header — the profile shortcut, since Profile isn't a nav item below. */}
          <button
            type="button"
            aria-label="Go to profile"
            onClick={(event) => {
              event.stopPropagation()
              navigate('/driver/profile')
            }}
            className="flex flex-col items-center gap-3 px-3"
          >
            <div
              className={`flex items-center justify-center overflow-hidden rounded-full transition-all duration-300 bg-amber-900 font-semibold text-white flex-shrink-0 ${
                isExpanded ? 'h-24 w-24 text-2xl' : 'h-10 w-10 text-sm'
              }`}
            >
              {profilePicture ? (
                <img src={profilePicture} alt="" className="h-full w-full object-cover" />
              ) : (
                userInitials || '...'
              )}
            </div>
          </button>

          {/* Navigation */}
          {renderDriverNav(isExpanded, undefined)}

          <div className="border-t border-amber-900/80 px-2 pt-2">
            <LogoutButton isExpanded={isExpanded} />
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden pt-14 md:pt-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="h-full px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-12 lg:py-10">
              {deactivationWarning ? (
                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Your account has been deactivated. You will lose access on{' '}
                  {formatCutoff(deactivationWarning.cutoffAt)} unless this is reversed.
                </div>
              ) : null}
              {children}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default DriverLayout
