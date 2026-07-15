import AdminLayout from '../layout/AdminLayout.jsx'

const background = null

function AdminProfile() {
  return (
    <AdminLayout title="Admin Profile" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-violet-600 font-medium">
            Admin Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Profile
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Manage account details, role permissions, and security settings.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Name', value: 'System Administrator' },
            { label: 'Email', value: 'admin@drivewise.com' },
            { label: 'Role', value: 'Platform Admin' },
            { label: 'Last login', value: 'Today, 8:40 AM' }
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-violet-200/70 bg-white p-6"
            >
              <p className="text-xs uppercase tracking-[0.24em] text-violet-600">
                {item.label}
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  )
}

export default AdminProfile
