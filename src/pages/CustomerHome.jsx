import CustomerLayout from '../layout/CustomerLayout.jsx'

const background = null

function CustomerHome() {
  return (
    <CustomerLayout title="Customer Home" background={background}>
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-600 font-medium">
            Customer Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Home
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Overview of your active bookings, recent deliveries, and account
            updates.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-emerald-200/70 bg-white p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">
              Active bookings
            </p>
            <p className="mt-3 text-2xl font-semibold">3</p>
          </div>
          <div className="rounded-3xl border border-emerald-200/70 bg-white p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">
              Pending actions
            </p>
            <p className="mt-3 text-2xl font-semibold">2</p>
          </div>
        </div>
      </div>
    </CustomerLayout>
  )
}

export default CustomerHome
