import { NavLink } from 'react-router-dom'

export const mechanicModules = [
  {
    label: 'Trucks',
    path: '/mechanic/trucks',
    description: 'Fleet inspections and maintenance'
  }
]

const mechanicIconClassName = 'h-5 w-5 stroke-current'

const mechanicIcons = {
  Trucks: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.6"
      className={mechanicIconClassName}
      aria-hidden="true"
    >
      <path d="M3 15h12l2 3H3z" />
      <path d="M5 15v-7h8l2 7" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  )
}

function MechanicLayout({ title, background, children }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      {background}

      <section className="relative mx-auto flex min-h-screen w-full max-w-none gap-0">
        <aside className="group flex w-16 flex-col items-center gap-5 border-r border-cyan-200/70 bg-cyan-50/80 px-2 py-4 backdrop-blur transition-all duration-200 hover:w-48 sm:w-20 sm:hover:w-56">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-lg font-semibold text-cyan-700">
              MX
            </div>
            <div className="h-px w-full bg-cyan-200/70" />
          </div>

          <nav className="flex w-full flex-1 flex-col items-center gap-3">
            {mechanicModules.map((module) => (
              <NavLink
                key={module.path}
                to={module.path}
                aria-label={module.label}
                className={({ isActive }) =>
                  `relative flex w-12 items-center justify-center gap-3 rounded-2xl border p-3 text-sm transition sm:w-14 group-hover:w-full group-hover:justify-start ${
                    isActive
                      ? 'border-cyan-300 bg-cyan-100 text-cyan-800'
                      : 'border-cyan-200/70 text-cyan-700 hover:border-cyan-300'
                  }`
                }
              >
                {mechanicIcons[module.label]}
                <span className="pointer-events-none hidden whitespace-nowrap text-xs font-semibold uppercase tracking-[0.2em] text-cyan-800 sm:group-hover:inline">
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

export default MechanicLayout
