import { Navigate, Route, Routes } from 'react-router-dom'
import CustomerBookings from './pages/CustomerBookings.jsx'
import CustomerHome from './pages/CustomerHome.jsx'
import CustomerProfile from './pages/CustomerProfile.jsx'
import DriverDeliveries from './pages/DriverDeliveries.jsx'
import DriverPerformance from './pages/DriverPerformance.jsx'
import DriverProfile from './pages/DriverProfile.jsx'
import LandingPage from './pages/LandingPage.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import AdminHome from './pages/AdminHome.jsx'
import AdminDeviceManagement from './pages/AdminDeviceManagement.jsx'
import AdminAnalysis from './pages/AdminAnalysis.jsx'
import AdminProfile from './pages/AdminProfile.jsx'
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
      <Route path="/customer" element={<Navigate to="/customer/home" replace />} />
      <Route path="/customer/home" element={<CustomerHome />} />
      <Route path="/customer/bookings" element={<CustomerBookings />} />
      <Route path="/customer/profile" element={<CustomerProfile />} />
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
        path="/admin"
        element={<Navigate to="/admin/user-management" replace />}
      />
      <Route
        path="/admin/home"
        element={<Navigate to="/admin/user-management" replace />}
      />
      <Route path="/admin/user-management" element={<AdminHome />} />
      <Route
        path="/admin/device-management"
        element={<AdminDeviceManagement />}
      />
      <Route path="/admin/analysis" element={<AdminAnalysis />} />
      <Route path="/admin/profile" element={<AdminProfile />} />
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
