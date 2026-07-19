import { useEffect, useMemo, useState } from 'react'
import AdminLayout from '../layout/AdminLayout.jsx'
import { supabase } from '../lib/supabaseClient.js'

const background = null

const ROLE_OPTIONS = ['Supervisor', 'Admin', 'Driver', 'Helper', 'Customer']

function AdminHome() {
  const [newUserForm, setNewUserForm] = useState({
    fullName: '',
    role: '',
    email: ''
  })
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tempPassword, setTempPassword] = useState('')
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [isAddConfirmOpen, setIsAddConfirmOpen] = useState(false)
  const [statusModal, setStatusModal] = useState({
    open: false,
    tone: 'success',
    title: '',
    message: '',
    onClose: null
  })
  const [users, setUsers] = useState([])
  const [usersError, setUsersError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [manageError, setManageError] = useState('')
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [manageForm, setManageForm] = useState({
    name: '',
    role: '',
    email: '',
    loginEmail: '',
    status: 'active'
  })

  useEffect(() => {
    let isMounted = true

    async function loadUsers() {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, role, email, login_email')
        .order('full_name', { ascending: true })

      if (!isMounted) {
        return
      }

      if (error) {
        setUsersError(error.message || 'Unable to load users.')
        return
      }

      setUsersError('')
      setUsers(
        (data || []).map((user) => ({
          id: user.id,
          name: user.full_name,
          role: user.role,
          email: user.email,
          loginEmail: user.login_email,
          status: 'active'
        }))
      )
    }

    loadUsers()

    return () => {
      isMounted = false
    }
  }, [])

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  )

  const closeManageDialog = () => {
    setSelectedUserId('')
    setManageError('')
    setIsSavingAccount(false)
  }

  const showStatusModal = (tone, title, message, onClose = null) => {
    setStatusModal({ open: true, tone, title, message, onClose })
  }

  const closeStatusModal = () => {
    setStatusModal((current) => {
      current.onClose?.()
      return { ...current, open: false }
    })
  }

  const handleAddInputChange = (event) => {
    const { name, value } = event.target
    setNewUserForm((current) => ({ ...current, [name]: value }))
    if (formError) {
      setFormError('')
    }
  }

  const resetForm = () => {
    setNewUserForm({ fullName: '', role: '', email: '' })
  }

  const handleAddUser = (event) => {
    event.preventDefault()
    setFormError('')

    const fullName = newUserForm.fullName.trim()
    const role = newUserForm.role.trim()
    const email = newUserForm.email.trim().toLowerCase()

    if (!fullName || !role || !email) {
      setFormError('Name, role, and email are required.')
      return
    }

    const hasDuplicateEmail = users.some((user) => user.email === email)
    if (hasDuplicateEmail) {
      setFormError('A user with this email already exists.')
      return
    }

    setIsAddConfirmOpen(true)
  }

  const cancelAddUser = () => {
    setIsAddConfirmOpen(false)
  }

  const confirmAddUser = async () => {
    setFormError('')

    const fullName = newUserForm.fullName.trim()
    const role = newUserForm.role.trim()
    const email = newUserForm.email.trim().toLowerCase()

    setIsAddConfirmOpen(false)
    setIsSubmitting(true)

    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create-user', fullName, email, role }
    })

    if (error) {
      setIsSubmitting(false)
      showStatusModal('error', 'Unable to Add User', error.message || 'Something went wrong while adding the user.')
      return
    }

    const newUser = {
      id: data.user.id,
      name: data.user.full_name,
      role: data.user.role,
      email: data.user.email,
      loginEmail: data.user.login_email,
      status: 'active'
    }

    setUsers((current) => [newUser, ...current])
    resetForm()
    setIsSubmitting(false)

    if (data.emailSent) {
      showStatusModal(
        'success',
        'User Added',
        `${newUser.name} has been added as ${newUser.role}. Login credentials were emailed to ${newUser.email}.`
      )
    } else {
      setTempPassword(data.tempPassword || '')
      showStatusModal(
        'error',
        'User Added — Email Not Sent',
        `${newUser.name} was added, but the credentials email failed to send (${data.emailError || 'unknown error'}). Share the temporary password with them securely.`,
        () => setIsPasswordModalOpen(true)
      )
    }
  }

  const openManageDialog = (user) => {
    setSelectedUserId(user.id)
    setManageError('')
    setIsSavingAccount(false)
    setManageForm({
      name: user.name,
      role: user.role,
      email: user.email,
      loginEmail: user.loginEmail,
      status: user.status
    })
  }

  const handleManageInputChange = (event) => {
    const { name, value } = event.target
    setManageForm((current) => ({ ...current, [name]: value }))
  }

  const handleSaveManagedAccount = async (event) => {
    event.preventDefault()

    if (isSavingAccount) {
      return
    }

    setManageError('')
    setIsSavingAccount(true)

    const name = manageForm.name.trim()
    const role = manageForm.role.trim()
    const email = manageForm.email.trim().toLowerCase()

    const { error } = await supabase
      .from('users')
      .update({ full_name: name, role, email })
      .eq('id', selectedUserId)

    if (error) {
      setIsSavingAccount(false)
      showStatusModal('error', 'Unable to Save Changes', error.message || 'Unable to save changes.')
      return
    }

    if (role === 'Driver') {
      const { error: driverSyncError } = await supabase.functions.invoke('admin-users', {
        body: { action: 'ensure-driver-record', userId: selectedUserId }
      })

      if (driverSyncError) {
        setIsSavingAccount(false)
        showStatusModal(
          'error',
          'Partially Saved',
          driverSyncError.message || 'Saved, but unable to sync driver record.'
        )
        return
      }
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === selectedUserId
          ? { ...user, name, role, email, status: manageForm.status }
          : user
      )
    )
    setIsSavingAccount(false)
    closeManageDialog()
    showStatusModal('success', 'Account Updated', `${name} is now set to the ${role} role.`)
  }

  const handleDeactivateAccount = async () => {
    setManageError('')
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'deactivate', userId: selectedUserId }
    })

    if (error) {
      setManageError(error.message || 'Unable to deactivate account.')
      return
    }

    setManageForm((current) => ({ ...current, status: 'inactive' }))
  }

  const handleResetPassword = async () => {
    setManageError('')
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'reset-password', userId: selectedUserId }
    })

    if (error) {
      setManageError(error.message || 'Unable to reset password.')
      return
    }

    if (data.emailSent) {
      showStatusModal(
        'success',
        'Password Reset',
        `A new temporary password was emailed to ${manageForm.email}.`
      )
    } else {
      setTempPassword(data.tempPassword || '')
      showStatusModal(
        'error',
        'Password Reset — Email Not Sent',
        `The password was reset, but the email failed to send (${data.emailError || 'unknown error'}). Share the temporary password with them securely.`,
        () => setIsPasswordModalOpen(true)
      )
    }
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
          <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={handleAddUser}>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Full Name
              </span>
              <input
                type="text"
                name="fullName"
                placeholder="Jane Doe"
                value={newUserForm.fullName}
                onChange={handleAddInputChange}
                className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Role
              </span>
              <select
                name="role"
                value={newUserForm.role}
                onChange={handleAddInputChange}
                className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
              >
                <option value="">Select role</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
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
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-[46px] rounded-2xl bg-violet-600 px-5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60 lg:self-end"
            >
              {isSubmitting ? 'Adding...' : 'Add User'}
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
          {usersError ? (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {usersError}
            </p>
          ) : null}
          <div className="mt-4 overflow-hidden rounded-2xl border border-violet-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Login Email</th>
                  <th className="px-4 py-3 font-medium">Manage Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-100">
                {users.map((user) => (
                  <tr key={user.id} className="bg-white">
                    <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-slate-700">{user.role}</td>
                    <td className="px-4 py-3 text-slate-700">{user.email}</td>
                    <td className="px-4 py-3 text-slate-500">{user.loginEmail}</td>
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
                  <select
                    name="role"
                    value={manageForm.role}
                    onChange={handleManageInputChange}
                    className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
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
                    Login Email
                  </span>
                  <input
                    type="email"
                    value={manageForm.loginEmail}
                    disabled
                    className="w-full rounded-2xl border border-violet-100 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                  />
                </label>
              </div>

              {manageError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {manageError}
                </p>
              ) : null}

              <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-700">
                Account status:{' '}
                <span className="font-semibold capitalize">{manageForm.status}</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50"
                    onClick={handleResetPassword}
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
                  disabled={isSavingAccount}
                  className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
                >
                  {isSavingAccount ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAddConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-3xl border border-violet-200/70 bg-white p-6 shadow-xl sm:p-8">
            <p className="text-xs uppercase tracking-[0.24em] text-violet-600">
              Confirm New User
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              Add this user?
            </h2>
            <div className="mt-4 space-y-2 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Name:</span>{' '}
                {newUserForm.fullName.trim()}
              </p>
              <p>
                <span className="font-semibold">Role:</span>{' '}
                {newUserForm.role.trim()}
              </p>
              <p>
                <span className="font-semibold">Email:</span>{' '}
                {newUserForm.email.trim().toLowerCase()}
              </p>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              A login email and temporary password will be generated
              automatically, and the credentials will be emailed to the
              address above.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
                onClick={cancelAddUser}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
                onClick={confirmAddUser}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPasswordModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-3xl border border-violet-200/70 bg-white p-6 shadow-xl sm:p-8">
            <p className="text-xs uppercase tracking-[0.24em] text-violet-600">
              Email Not Sent
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              Share this temporary password
            </h2>
            <p className="mt-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 font-mono text-sm text-slate-900">
              {tempPassword}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              This password will not be shown again. Send it to the new user securely.
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
              onClick={() => {
                setIsPasswordModalOpen(false)
                setTempPassword('')
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {statusModal.open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-3xl border border-violet-200/70 bg-white p-6 shadow-xl sm:p-8">
            <p
              className={`text-xs uppercase tracking-[0.24em] ${
                statusModal.tone === 'success' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {statusModal.tone === 'success' ? 'Success' : 'Error'}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">{statusModal.title}</h2>
            <p className="mt-3 text-sm text-slate-600">{statusModal.message}</p>
            <button
              type="button"
              className={`mt-6 w-full rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${
                statusModal.tone === 'success'
                  ? 'bg-violet-600 hover:bg-violet-500'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
              onClick={closeStatusModal}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  )
}

export default AdminHome
