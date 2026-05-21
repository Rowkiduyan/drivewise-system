import MechanicLayout from '../layout/MechanicLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.18),_transparent_55%),radial-gradient(circle_at_25%_65%,_rgba(103,232,249,0.16),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-cyan-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-cyan-200/30 blur-[120px]" />
  </>
)

function MechanicTrucks() {
  return (
    <MechanicLayout title="Trucks" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-600">
            Mechanic Bay
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Truck Diagnostics
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Review inspections, prioritize repairs, and keep the fleet ready.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {[
            {
              title: 'Unit 18 - brake check',
              detail: 'Pads at 30%, schedule replacement this week.'
            },
            {
              title: 'Unit 33 - engine diagnostics',
              detail: 'Minor coolant leak detected near intake.'
            },
            {
              title: 'Unit 49 - electronics',
              detail: 'Sensor calibration pending, waiting on parts.'
            },
            {
              title: 'Unit 71 - tire rotation',
              detail: 'Front alignment recommended after next route.'
            }
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-cyan-200/70 bg-white p-6"
            >
              <p className="text-sm font-semibold text-slate-800">
                {item.title}
              </p>
              <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </MechanicLayout>
  )
}

export default MechanicTrucks
