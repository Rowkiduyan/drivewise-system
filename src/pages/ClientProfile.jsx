import ClientLayout from '../layout/ClientLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(134,239,172,0.16),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-emerald-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-[120px]" />
  </>
)

function ClientProfile() {
  return (
    <ClientLayout title="Client Profile" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-600">
            Client Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Client Profile
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Update billing details, contacts, and notification preferences.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Primary contact', value: 'Jordan Smith' },
            { label: 'Billing email', value: 'billing@clientco.com' },
            { label: 'Preferred lane', value: 'West Coast' },
            { label: 'Payment terms', value: 'Net 30' }
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-emerald-200/70 bg-white p-6"
            >
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">
                {item.label}
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </ClientLayout>
  )
}

export default ClientProfile
