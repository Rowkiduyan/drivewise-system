import SupLayout from '../layout/SupLayout.jsx'

function SupDeliveries() {
  return (
    <SupLayout title="Deliveries" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600">
            Supervisor Interface
          </p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Deliveries
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Review live routes, delayed shipments, and completed drops.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Live routes', value: '12' },
            { label: 'Delayed shipments', value: '2' },
            { label: 'Completed today', value: '38' },
            { label: 'Needs attention', value: '3' }
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-blue-200/70 bg-white p-6"
            >
              <p className="text-xs uppercase tracking-[0.24em] text-blue-600">
                {item.label}
              </p>
              <p className="mt-3 text-2xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </SupLayout>
  )
}

export default SupDeliveries
