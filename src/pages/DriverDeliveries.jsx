import DriverLayout from '../layout/DriverLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.2),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(251,191,36,0.18),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-amber-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-amber-200/30 blur-[120px]" />
  </>
)

function DriverDeliveries() {
  return (
    <DriverLayout title="Trips" background={background}>
      <div className="flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-600">
            Driver Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Trips
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Monitor upcoming runs, completed deliveries, and route priorities
            for today.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-amber-200/70 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">Active route</h2>
            <div className="mt-6 space-y-4">
              {[
                {
                  title: 'Warehouse to Riverside Depot',
                  detail: 'Stops: 4 | ETA: 2:45 PM'
                },
                {
                  title: 'Riverside Depot to Canyon Hub',
                  detail: 'Stops: 3 | ETA: 4:10 PM'
                }
              ].map((trip) => (
                <div
                  key={trip.title}
                  className="rounded-2xl border border-amber-100/70 bg-amber-50 px-4 py-4"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {trip.title}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.22em] text-amber-600">
                    {trip.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-3xl border border-amber-200/70 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">Upcoming stops</h2>
            <ul className="mt-5 space-y-4 text-sm text-slate-600">
              {[
                'Check-in at Riverside Depot - dock 7.',
                'Refuel at Canyon Hub after drop-off.',
                'Upload delivery photos for priority freight.'
              ].map((note) => (
                <li
                  key={note}
                  className="rounded-2xl border border-amber-100/70 bg-amber-50 px-4 py-3"
                >
                  {note}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </DriverLayout>
  )
}

export default DriverDeliveries
