import SupLayout from '../layout/SupLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(147,197,253,0.16),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-blue-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-blue-200/30 blur-[120px]" />
  </>
)

function SupTrucks() {
  return (
    <SupLayout title="Trucks" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600">
            Supervisor Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Trucks
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Monitor truck availability, status, and device connectivity.
          </p>
        </header>

        <div className="space-y-4">
          {[
            'Unit 42 - online, diagnostics clear.',
            'Unit 57 - offline, check hardware.',
            'Unit 63 - firmware update scheduled.'
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-blue-200/70 bg-white p-6"
            >
              <p className="text-sm text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </SupLayout>
  )
}

export default SupTrucks
