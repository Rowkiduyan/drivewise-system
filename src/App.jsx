import { Navigate, Route, Routes } from 'react-router-dom'
import ClientBookings from './pages/ClientBookings.jsx'
import ClientHome from './pages/ClientHome.jsx'
import ClientProfile from './pages/ClientProfile.jsx'
import DriverDeliveries from './pages/DriverDeliveries.jsx'
import DriverPerformance from './pages/DriverPerformance.jsx'
import DriverProfile from './pages/DriverProfile.jsx'
import LandingPage from './pages/LandingPage.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import MechanicTrucks from './pages/MechanicTrucks.jsx'
import SupBookings from './pages/SupBookings.jsx'
import SupDeliveryCrew from './pages/SupDeliveryCrew.jsx'
import SupDeliveries from './pages/SupDeliveries.jsx'
import SupDashboard from './pages/SupDashboard.jsx'
import SupAlertAnalysis from './pages/SupAlertAnalysis.jsx'
import SupAnalysisIndiv from './pages/SupAnalysisIndiv.jsx'
import SupAnalysisSpecific from './pages/SupAnalysisSpecific.jsx'
import SupProfile from './pages/SupProfile.jsx'
import SupTrucks from './pages/SupTrucks.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/client" element={<Navigate to="/client/home" replace />} />
      <Route path="/client/home" element={<ClientHome />} />
      <Route path="/client/bookings" element={<ClientBookings />} />
      <Route path="/client/profile" element={<ClientProfile />} />
      <Route
        path="/driver"
        element={<Navigate to="/driver/performance" replace />}
      />
      <Route path="/driver/performance" element={<DriverPerformance />} />
      <Route path="/driver/trips" element={<DriverDeliveries />} />
      <Route path="/driver/profile" element={<DriverProfile />} />
      <Route
        path="/supervisor"
        element={<Navigate to="/supervisor/dashboard" replace />}
      />
      <Route path="/supervisor/dashboard" element={<SupDashboard />} />
      <Route path="/supervisor/analysis" element={<SupAlertAnalysis />} />
      <Route path="/supervisor/analysis/indiv" element={<SupAnalysisIndiv />} />
      <Route path="/supervisor/analysis/specific" element={<SupAnalysisSpecific />} />
      <Route path="/supervisor/bookings" element={<SupBookings />} />
      <Route path="/supervisor/delivery-crew" element={<SupDeliveryCrew />} />
      <Route path="/supervisor/deliveries" element={<SupDeliveries />} />
      <Route path="/supervisor/profile" element={<SupProfile />} />
      <Route path="/supervisor/trucks" element={<SupTrucks />} />
      <Route
        path="/mechanic"
        element={<Navigate to="/mechanic/trucks" replace />}
      />
      <Route path="/mechanic/trucks" element={<MechanicTrucks />} />
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
