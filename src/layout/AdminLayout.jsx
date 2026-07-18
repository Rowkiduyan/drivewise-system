import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import LogoutButton from './LogoutButton.jsx'

const adminModules = [
  {
    label: 'User Management',
    path: '/admin/user-management',
    description: 'Users, roles, and accounts'
  },
  {
    label: 'Device Management',
    path: '/admin/device-management',
    description: 'Fleet devices and status'
  },
  {
    label: 'Admin Analysis',
    path: '/admin/analysis',
    description: 'Delivery and alert analysis'
  },
  { label: 'Profile', path: '/admin/profile', description: 'Admin account' }
]

const adminIconClassName = 'h-5 w-5 stroke-current'

const adminIcons = {
  'User Management': (
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
  'Device Management': (
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
  'Admin Analysis': (
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
  )
}

const adminSidebarStorageKey = 'admin-sidebar-expanded'

function deriveInitials(name, email) {
  const source = name?.trim() || email?.split('@')[0]?.trim() || ''
  if (!source) {
    return '?'
  }

  const parts = source.split(/[\s._-]+/).filter(Boolean)
  const initials = parts.length > 1
    ? parts[0][0] + parts[parts.length - 1][0]
    : source.slice(0, 2)

  return initials.toUpperCase()
}

function AdminLayout({ title, background, children }) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem(adminSidebarStorageKey) === 'true'
  })
  const [userInitials, setUserInitials] = useState('')

  useEffect(() => {
    window.localStorage.setItem(adminSidebarStorageKey, String(isExpanded))
  }, [isExpanded])

  useEffect(() => {
    let isMounted = true

    async function loadCurrentUser() {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      if (!user || !isMounted) {
        return
      }

      const { data: userRow } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', user.id)
        .single()

      if (!isMounted) {
        return
      }

      setUserInitials(deriveInitials(userRow?.full_name, user.email))
    }

    loadCurrentUser()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <main
      className="relative flex h-screen w-screen overflow-hidden bg-white text-slate-900"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {background}

      <section className="relative flex h-full w-full">
        <aside
          className={`sticky top-0 flex h-screen shrink-0 flex-col gap-4 border-r border-violet-900/80 py-4 backdrop-blur transition-all duration-300 bg-violet-950 ${
            isExpanded ? 'w-64' : 'w-16'
          }`}
          role="navigation"
          aria-label="Main navigation"
          onClick={() => setIsExpanded((currentValue) => !currentValue)}
        >
          <div className="flex flex-col items-center gap-3 px-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-900 text-lg font-semibold text-white flex-shrink-0">
              {userInitials || '...'}
            </div>
          </div>

          <nav className="flex w-full flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2">
            {adminModules.map((module) => (
              <NavLink
                key={module.path}
                to={module.path}
                aria-label={module.label}
                onClick={(event) => event.stopPropagation()}
                className={({ isActive }) =>
                  `flex items-center justify-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm transition-all duration-200 $
                    isActive
                      ? 'border-violet-400 bg-violet-900 text-white rounded-lg'
                      : 'text-violet-200 hover:border-violet-700'
                  }`
                }
              >
                <span className="h-5 w-5 flex-shrink-0">
                  {adminIcons[module.label]}
                </span>
                <span
                  className={`inline-flex overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-violet-100 transition-all duration-200 ease-out ${
                    isExpanded
                      ? 'max-w-40 opacity-100 translate-x-0'
                      : 'max-w-0 opacity-0 -translate-x-2'
                  }`}
                >
                  {module.label}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-violet-900/80 px-2 pt-2">
            <LogoutButton isExpanded={isExpanded} />
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="h-full px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-12 lg:py-10">
              {title ? <h1 className="sr-only">{title}</h1> : null}
              {children}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default AdminLayout
