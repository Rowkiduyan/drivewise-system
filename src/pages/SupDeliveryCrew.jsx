import { useMemo, useState } from 'react'
import SupLayout from '../layout/SupLayout.jsx'

function SupDeliveryCrew() {
  const [searchTerm, setSearchTerm] = useState('')

  const crewRecords = [
    {
      name: 'Crew Alpha',
      lead: 'J. Santos',
      members: 3,
      status: 'On Route',
      shift: 'Morning',
      lastUpdated: '10 mins ago'
    },
    {
      name: 'Crew Bravo',
      lead: 'M. Reyes',
      members: 4,
      status: 'Standby',
      shift: 'Afternoon',
      lastUpdated: '25 mins ago'
    },
    {
      name: 'Crew Charlie',
      lead: 'A. Flores',
      members: 2,
      status: 'Available',
      shift: 'Night',
      lastUpdated: '1 hr ago'
    },
    {
      name: 'Crew Delta',
      lead: 'S. Cruz',
      members: 3,
      status: 'Off Duty',
      shift: 'Night',
      lastUpdated: '2 hrs ago'
    }
  ]

  const filteredCrew = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    if (!query) {
      return crewRecords
    }

    return crewRecords.filter((crew) => {
      return [crew.name, crew.lead, crew.status, crew.shift]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [searchTerm])

  const stats = [
    { label: 'Total Crew', value: crewRecords.length },
    { label: 'Active', value: crewRecords.filter((crew) => crew.status !== 'Off Duty').length },
    { label: 'Available', value: crewRecords.filter((crew) => crew.status === 'Available').length },
    { label: 'On Route', value: crewRecords.filter((crew) => crew.status === 'On Route').length }
  ]

  return (
    <SupLayout title="Delivery Crew" background={null} bg="bg-[#FAF9F6]">
      <div className="flex flex-col gap-6">

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div className="w-full sm:max-w-sm">
              <label className="sr-only" htmlFor="crew-search">
                Search crew records
              </label>
              <input
                id="crew-search"
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search crew, lead, status..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <div className="col-span-3">Crew</div>
              <div className="col-span-3">Lead</div>
              <div className="col-span-2">Members</div>
              <div className="col-span-2">Shift</div>
              <div className="col-span-2">Status</div>
            </div>

            <div className="divide-y divide-slate-200">
              {filteredCrew.map((crew) => (
                <div key={crew.name} className="grid grid-cols-12 items-center px-4 py-4 text-sm text-slate-700">
                  <div className="col-span-3 font-medium text-slate-900">{crew.name}</div>
                  <div className="col-span-3">{crew.lead}</div>
                  <div className="col-span-2">{crew.members}</div>
                  <div className="col-span-2">{crew.shift}</div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <span className="inline-flex w-fit rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      {crew.status}
                    </span>
                    <span className="text-xs text-slate-400">Updated {crew.lastUpdated}</span>
                  </div>
                </div>
              ))}

              {filteredCrew.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No crew records match your search.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </SupLayout>
  )
}

export default SupDeliveryCrew
