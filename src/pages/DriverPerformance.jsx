import DriverLayout from '../layout/DriverLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.2),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(251,191,36,0.18),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-amber-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-amber-200/30 blur-[120px]" />
  </>
)

function DriverPerformance() {
  return (
    <DriverLayout title="Performance" background={background}>
      <div className="flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-600">
            Driver Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Performance
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Track scores, punctuality, and safety trends with an at-a-glance
            view of driver performance.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-amber-200/70 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">Today at a glance</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Safety score', value: '94%' },
                { label: 'On-time rate', value: '98%' },
                { label: 'Idle time', value: '12 min' },
                { label: 'Fuel efficiency', value: '7.2 mpg' }
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-amber-100/70 bg-amber-50 px-4 py-4"
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-amber-600">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-3xl border border-amber-200/70 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">Focus areas</h2>
            <ul className="mt-5 space-y-4 text-sm text-slate-600">
              <li className="rounded-2xl border border-amber-100/70 bg-amber-50 px-4 py-3">
                Reduce idle time between stops by 8% this week.
              </li>
              <li className="rounded-2xl border border-amber-100/70 bg-amber-50 px-4 py-3">
                Keep safety checklist completion above 95%.
              </li>
              <li className="rounded-2xl border border-amber-100/70 bg-amber-50 px-4 py-3">
                Review late delivery causes after each route.
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </DriverLayout>
  )
}

export default DriverPerformance
