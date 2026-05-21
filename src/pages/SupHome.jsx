import SupLayout from '../layout/SupLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(165,180,252,0.16),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-indigo-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-200/30 blur-[120px]" />
  </>
)

function SupHome() {
  return (
    <SupLayout title="Supervisor Home" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-indigo-600">
            Supervisor Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Supervisor Home
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Snapshot of delivery operations, crew status, and vehicle health.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Open alerts', value: '4' },
            { label: 'Crews on duty', value: '7' },
            { label: 'Vehicles monitored', value: '42' },
            { label: 'Escalations', value: '1' }
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-indigo-200/70 bg-white p-6"
            >
              <p className="text-xs uppercase tracking-[0.24em] text-indigo-600">
                {item.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </SupLayout>
  )
}

export default SupHome
