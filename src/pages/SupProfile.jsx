import SupLayout from '../layout/SupLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(147,197,253,0.16),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-blue-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-blue-200/30 blur-[120px]" />
  </>
)

function SupProfile() {
  return (
    <SupLayout title="Supervisor Profile" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600">
            Supervisor Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Supervisor Profile
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Update contact info, shift coverage, and notification rules.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Region', value: 'Metro West' },
            { label: 'Team size', value: '18' },
            { label: 'Escalations', value: 'Dispatch team' },
            { label: 'On-call', value: 'Weekend rotation' }
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-blue-200/70 bg-white p-6"
            >
              <p className="text-xs uppercase tracking-[0.24em] text-blue-600">
                {item.label}
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </SupLayout>
  )
}

export default SupProfile
