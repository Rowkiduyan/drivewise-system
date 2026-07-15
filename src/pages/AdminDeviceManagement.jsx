import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../layout/AdminLayout.jsx'

const background = null

function AdminDeviceManagement() {
  const navigate = useNavigate()
  const [formValues, setFormValues] = useState({
    deviceId: '',
    plateNumber: ''
  })
  const [formError, setFormError] = useState('')
  const [devices, setDevices] = useState([
    {
      id: 'DV-2104',
      plateNumber: 'ABC-1234',
      status: 'active',
      deliveries: [
        {
          date: '2026-07-15',
          time: '08:20 AM',
          referenceNumber: 'DEL-771245',
          driver: 'Juan D. Santos',
          helper: 'Mark Rivera'
        },
        {
          date: '2026-07-14',
          time: '03:12 PM',
          referenceNumber: 'DEL-771198',
          driver: 'Lea Mendoza',
          helper: 'Kriz Alonte'
        }
      ]
    },
    {
      id: 'DV-2241',
      plateNumber: 'XYZ-8821',
      status: 'inactive',
      deliveries: [
        {
          date: '2026-07-13',
          time: '09:01 AM',
          referenceNumber: 'DEL-771052',
          driver: 'Alex R. Cruz',
          helper: 'Nate Flores'
        }
      ]
    }
  ])
  const [expandedDeviceId, setExpandedDeviceId] = useState('DV-2104')

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setFormValues((current) => ({ ...current, [name]: value }))
    if (formError) {
      setFormError('')
    }
  }

  const handleRegisterDevice = (event) => {
    event.preventDefault()
    const nextDeviceId = formValues.deviceId.trim().toUpperCase()
    const nextPlateNumber = formValues.plateNumber.trim().toUpperCase()

    if (!nextDeviceId || !nextPlateNumber) {
      setFormError('Device ID Number and Vehicle Plate Number are required.')
      return
    }

    const alreadyExists = devices.some((device) => device.id === nextDeviceId)
    if (alreadyExists) {
      setFormError('Device ID Number is already registered.')
      return
    }

    const newDevice = {
      id: nextDeviceId,
      plateNumber: nextPlateNumber,
      status: 'active',
      deliveries: []
    }

    setDevices((current) => [newDevice, ...current])
    setExpandedDeviceId(newDevice.id)
    setFormValues({ deviceId: '', plateNumber: '' })
    setFormError('')
  }

  const handleToggleDevice = (deviceId) => {
    setExpandedDeviceId((current) => (current === deviceId ? '' : deviceId))
  }

  return (
    <AdminLayout title="Device Management" background={background}>
      <div className="flex flex-col gap-6">
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-violet-600 font-medium">
            Admin Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Device Management
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Register devices and review delivery assignments with quick analysis
            access.
          </p>
        </header>

        <section className="rounded-3xl border border-violet-200/70 bg-white p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-violet-600">
            Register Device
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Add a new DriveWise Device by Device ID Number and its assigned  Vehicle Plate Number.
          </p>
          <form className="mt-5" onSubmit={handleRegisterDevice}>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Device ID Number
                </span>
                <input
                  type="text"
                  name="deviceId"
                  placeholder="DV-0000"
                  value={formValues.deviceId}
                  onChange={handleInputChange}
                  className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Vehicle Plate Number
                </span>
                <input
                  type="text"
                  name="plateNumber"
                  placeholder="AAA-1234"
                  value={formValues.plateNumber}
                  onChange={handleInputChange}
                  className="w-full rounded-2xl border border-violet-200/70 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50"
                />
              </label>

              <button
                type="submit"
                className="h-[46px] rounded-2xl bg-violet-600 px-6 text-sm font-semibold text-white transition hover:bg-violet-500 md:self-end"
              >
                Register
              </button>
            </div>
          </form>
          {formError ? (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-violet-200/70 bg-white p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-violet-600">
            Registered Devices
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Click a Device ID row to expand details.
          </p>

          <div className="mt-5 space-y-3">
            {devices.map((device) => {
              const isExpanded = expandedDeviceId === device.id
              return (
                <div
                  key={device.id}
                  className="overflow-hidden rounded-2xl border border-violet-100 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleDevice(device.id)}
                    className={`grid w-full grid-cols-[1.2fr_1fr_auto_auto] items-center gap-3 px-4 py-4 text-left transition ${
                      isExpanded ? 'bg-violet-50/60 border-b border-violet-100' : 'hover:bg-violet-50/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-violet-600">
                        Device ID Number
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                        {device.id}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-violet-600">
                        Assigned Vehicle Plate Number
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-slate-900">
                        {device.plateNumber}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-violet-600">
                        Status
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          device.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {device.status}
                      </span>
                    </div>
                    <span
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-600 shadow-sm transition-all duration-300 ${
                        isExpanded ? 'rotate-180 border-violet-300 shadow-violet-100/70' : 'hover:border-violet-300 hover:bg-violet-50'
                      }`}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                        <path d="M5.2 7.8a.75.75 0 0 1 1.06 0L10 11.54l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.86a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-violet-100 bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-600">
                          <tr>
                            <th className="px-4 py-3 font-medium">Date</th>
                            <th className="px-4 py-3 font-medium">Time</th>
                            <th className="px-4 py-3 font-medium">
                              Delivery Reference Number
                            </th>
                            <th className="px-4 py-3 font-medium">
                              Assigned Driver
                            </th>
                            <th className="px-4 py-3 font-medium">
                              Assigned Helper
                            </th>
                            <th className="px-4 py-3 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-violet-100">
                          {device.deliveries.map((row) => (
                            <tr key={row.referenceNumber} className="bg-white">
                              <td className="px-4 py-3 text-slate-700">{row.date}</td>
                              <td className="px-4 py-3 text-slate-700">{row.time}</td>
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {row.referenceNumber}
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {row.driver}
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {row.helper}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-600"
                                  onClick={() => navigate('/admin/analysis')}
                                >
                                  View Analysis
                                </button>
                              </td>
                            </tr>
                          ))}
                          {device.deliveries.length === 0 ? (
                            <tr className="bg-white">
                              <td
                                className="px-4 py-6 text-center text-sm text-slate-500"
                                colSpan={6}
                              >
                                No delivery history yet for this device.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </AdminLayout>
  )
}

export default AdminDeviceManagement
