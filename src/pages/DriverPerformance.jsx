import DriverLayout from '../layout/DriverLayout.jsx'

const background = null

function DriverPerformance() {
  return (
    <DriverLayout title="Performance" background={background}>
      <div className="flex flex-col gap-8">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-600 font-medium">
            Driver Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Performance
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
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
