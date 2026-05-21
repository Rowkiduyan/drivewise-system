import DriverLayout from '../layout/DriverLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.2),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(251,191,36,0.18),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-amber-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-amber-200/30 blur-[120px]" />
  </>
)

function DriverProfile() {
  return (
    <DriverLayout title="Profile" background={background}>
      <div className="flex flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-600">
            Driver Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Profile
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Keep contact details, certifications, and shift preferences
            up-to-date.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-amber-200/70 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">Driver details</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                { label: 'License', value: 'Class A - Active' },
                { label: 'Medical card', value: 'Valid through Oct 2026' },
                { label: 'Home terminal', value: 'Canyon Hub' },
                { label: 'Preferred shift', value: 'Morning' }
              ].map((detail) => (
                <div
                  key={detail.label}
                  className="rounded-2xl border border-amber-100/70 bg-amber-50 px-4 py-4"
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-amber-600">
                    {detail.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {detail.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-3xl border border-amber-200/70 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">Quick actions</h2>
            <ul className="mt-5 space-y-4 text-sm text-slate-600">
              {[
                'Update emergency contacts for the dispatch team.',
                'Review training modules due this quarter.',
                'Confirm uniform and equipment requests.'
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

export default DriverProfile
