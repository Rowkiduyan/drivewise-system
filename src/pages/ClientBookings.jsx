import ClientLayout from '../layout/ClientLayout.jsx'

const background = (
  <>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(134,239,172,0.16),_transparent_45%)]" />
    <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-emerald-300/40 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-[120px]" />
  </>
)

function ClientBookings() {
  return (
    <ClientLayout title="Client Bookings" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-600">
            Client Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Client Bookings
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Manage new requests and review current shipment statuses.
          </p>
        </header>

        <div className="space-y-4">
          {[
            'Refrigerated delivery - pending confirmation.',
            'Express shipment - pickup scheduled for 2:30 PM.',
            'Bulk freight - awaiting documentation.'
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-emerald-200/70 bg-white p-6"
            >
              <p className="text-sm text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </ClientLayout>
  )
}

export default ClientBookings
