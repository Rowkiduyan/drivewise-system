import { useMemo, useState } from 'react'
import AdminLayout from '../layout/AdminLayout.jsx'

const background = null

function deriveNameFromEmail(email) {
  const localPart = email.split('@')[0]?.trim()
  if (!localPart) {
    return 'New User'
  }
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(' ')
}

function AdminHome() {
  const [newUserForm, setNewUserForm] = useState({
    role: '',
    email: '',
    contactNumber: ''
  })
  const [formError, setFormError] = useState('')
  const [users, setUsers] = useState([
    {
      id: 'U-1001',
      name: 'Lara Mendoza',
      role: 'Admin',
      email: 'lara.mendoza@drivewise.com',
      contactNumber: '+63 917 100 1001',
      status: 'active'
    },
    {
      id: 'U-1002',
      name: 'Noel Ramirez',
      role: 'Supervisor',
      email: 'noel.ramirez@drivewise.com',
      contactNumber: '+63 917 100 1002',
      status: 'active'
    },
    {
      id: 'U-1003',
      name: 'Judy Perez',
      role: 'Operations',
      email: 'judy.perez@drivewise.com',
      contactNumber: '+63 917 100 1003',
      status: 'inactive'
    }
  ])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [manageForm, setManageForm] = useState({
    name: '',
    role: '',
    email: '',
    contactNumber: '',
    status: 'active'
  })

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  )

  const closeManageDialog = () => {
    setSelectedUserId('')
  }

  const handleAddInputChange = (event) => {
    const { name, value } = event.target
    setNewUserForm((current) => ({ ...current, [name]: value }))
    if (formError) {
      setFormError('')
    }
  }

  const handleAddUser = (event) => {
    event.preventDefault()
    const role = newUserForm.role.trim()
    const email = newUserForm.email.trim().toLowerCase()
    const contactNumber = newUserForm.contactNumber.trim()

    if (!role || !email || !contactNumber) {
      setFormError('Role, email, and contact number are required.')
      return
    }

    const hasDuplicateEmail = users.some((user) => user.email === email)
    if (hasDuplicateEmail) {
      setFormError('A user with this email already exists.')
      return
    }

    const newUser = {
      id: `U-${Date.now()}`,
      name: deriveNameFromEmail(email),
      role,
      email,
      contactNumber,
      status: 'active'
    }

    setUsers((current) => [newUser, ...current])
    setNewUserForm({ role: '', email: '', contactNumber: '' })
    setFormError('')
  }

  const openManageDialog = (user) => {
    setSelectedUserId(user.id)
    setManageForm({
      name: user.name,
      role: user.role,
      email: user.email,
      contactNumber: user.contactNumber,
      status: user.status
    })
  }

  const handleManageInputChange = (event) => {
    const { name, value } = event.target
    setManageForm((current) => ({ ...current, [name]: value }))
  }

  const handleSaveManagedAccount = (event) => {
    event.preventDefault()
    setUsers((current) =>
      current.map((user) =>
        user.id === selectedUserId
          ? {
              ...user,
              name: manageForm.name.trim(),
              role: manageForm.role.trim(),
              email: manageForm.email.trim().toLowerCase(),
              contactNumber: manageForm.contactNumber.trim(),
              status: manageForm.status
            }
          : user
      )
    )
    closeManageDialog()
  }

  const handleDeactivateAccount = () => {
    setManageForm((current) => ({ ...current, status: 'inactive' }))
  }

  return (
    <AdminLayout title="User Management" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-violet-600 font-medium">
            Admin Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            User Management
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Add and manage accounts, assign roles, and maintain user access.
          </p>
        </header>

        <section className="rounded-3xl border border-violet-200/70 bg-white p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-violet-600">
            Add User (Individual)
          </p>
          <form className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={handleAddUser}>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Role
              </span>
              <input
                type="text"
                name="role"
                placeholder="e.g. Supervisor"
                value={newUserForm.role}
                onChange={handleAddInputChange}
                className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Email
              </span>
              <input
                type="email"
                name="email"
                placeholder="user@drivewise.com"
                value={newUserForm.email}
                onChange={handleAddInputChange}
                className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Contact Number
              </span>
              <input
                type="text"
                name="contactNumber"
                placeholder="+63 9XX XXX XXXX"
                value={newUserForm.contactNumber}
                onChange={handleAddInputChange}
                className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
              />
            </label>
            <button
              type="submit"
              className="h-[46px] rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white transition hover:bg-violet-500 md:self-end"
            >
              Add User
            </button>
          </form>
          {formError ? (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-violet-200/70 bg-white p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-violet-600">Users</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-violet-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Contact Number</th>
                  <th className="px-4 py-3 font-medium">Manage Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-100">
                {users.map((user) => (
                  <tr key={user.id} className="bg-white">
                    <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-slate-700">{user.role}</td>
                    <td className="px-4 py-3 text-slate-700">{user.email}</td>
                    <td className="px-4 py-3 text-slate-700">{user.contactNumber}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="rounded-full border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                        onClick={() => openManageDialog(user)}
                      >
                        Manage Account
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-violet-200/70 bg-white p-6 shadow-xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-violet-600">
                  Manage Account
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  {selectedUser.name}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:border-slate-300"
                onClick={closeManageDialog}
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSaveManagedAccount}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Name
                  </span>
                  <input
                    type="text"
                    name="name"
                    value={manageForm.name}
                    onChange={handleManageInputChange}
                    className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Role
                  </span>
                  <input
                    type="text"
                    name="role"
                    value={manageForm.role}
                    onChange={handleManageInputChange}
                    className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
                  />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Email
                  </span>
                  <input
                    type="email"
                    name="email"
                    value={manageForm.email}
                    onChange={handleManageInputChange}
                    className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
                  />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Contact Number
                  </span>
                  <input
                    type="text"
                    name="contactNumber"
                    value={manageForm.contactNumber}
                    onChange={handleManageInputChange}
                    className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-700">
                Account status:{' '}
                <span className="font-semibold capitalize">{manageForm.status}</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50"
                  >
                    Reset Password
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
                    onClick={handleDeactivateAccount}
                    disabled={manageForm.status === 'inactive'}
                  >
                    Deactivate Account
                  </button>
                </div>

                <button
                  type="submit"
                  className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  )
}

export default AdminHome
