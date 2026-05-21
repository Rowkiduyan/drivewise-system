import SupLayout from '../layout/SupLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(165,180,252,0.16),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-indigo-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-200/30 blur-[120px]" />
  </>
)

function SupDeliveryCrew() {
  return (
    <SupLayout title="Delivery Crew" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-indigo-600">
            Supervisor Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Delivery Crew
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Assign crews, monitor availability, and track shift coverage.
          </p>
        </header>

        <div className="space-y-4">
          {[
            'Crew Alpha - on route (2 drivers, 1 loader).',
            'Crew Bravo - standby (1 driver, 2 loaders).',
            'Crew Delta - off duty until 6:00 AM.'
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-indigo-200/70 bg-white p-6"
            >
              <p className="text-sm text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </SupLayout>
  )
}

export default SupDeliveryCrew
