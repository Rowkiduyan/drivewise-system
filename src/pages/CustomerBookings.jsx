import CustomerLayout from '../layout/CustomerLayout.jsx'

const background = null

function CustomerBookings() {
  return (
    <CustomerLayout title="Customer Bookings" background={background}>
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-600 font-medium">
            Customer Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Bookings
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
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
    </CustomerLayout>
  )
}

export default CustomerBookings
