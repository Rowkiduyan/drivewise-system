import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'

export function AlertsTrend({ data }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="alerts" stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TruckUtilizationBar({ data }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#06b6d4" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const COLORS = ['#7c3aed', '#f97316', '#ef4444', '#10b981', '#60a5fa']

export function AlertTypePie({ data }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Legend verticalAlign="bottom" height={24} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DeliveryStatusPie({ data }) {
  return <AlertTypePie data={data} />
}

export function RiskDistribution({ data }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export const dummyAlertsTrend = [
  { label: 'Mon', alerts: 12 },
  { label: 'Tue', alerts: 8 },
  { label: 'Wed', alerts: 16 },
  { label: 'Thu', alerts: 9 },
  { label: 'Fri', alerts: 22 },
  { label: 'Sat', alerts: 7 },
  { label: 'Sun', alerts: 6 }
]

export const dummyTruckUtil = [
  { name: 'Active', value: 31 },
  { name: 'Available', value: 22 },
  { name: 'Maintenance', value: 11 },
  { name: 'Inactive', value: 0 }
]

export const dummyAlertTypes = [
  { name: 'Eye Closure', value: 342 },
  { name: 'Prolonged', value: 24 },
  { name: 'Repeated', value: 58 },
  { name: 'Yawning', value: 86 },
  { name: 'Head Tilt', value: 32 }
]

export const dummyDeliveryStatus = [
  { name: 'Pending', value: 12 },
  { name: 'Ongoing', value: 8 },
  { name: 'Completed', value: 1234 },
  { name: 'Delayed', value: 87 },
  { name: 'Cancelled', value: 5 }
]

export const dummyRisk = [
  { name: 'Low', count: 180 },
  { name: 'Medium', count: 40 },
  { name: 'High', count: 6 }
]
