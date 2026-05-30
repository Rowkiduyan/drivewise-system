import DriverLayout from '../layout/DriverLayout.jsx'

const background = null

function DriverProfile() {
  return (
    <DriverLayout title="Profile" background={background}>
      <div className="flex flex-col gap-8">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-600 font-medium">
            Driver Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Profile
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
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
