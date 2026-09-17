import { Navigate, Route, Routes } from "react-router-dom";
import CustomerDeliveries from "./pages/CustomerDeliveries.jsx";
import CustomerRequestDelivery from "./pages/CustomerRequestDelivery.jsx";
import CustomerHome from "./pages/CustomerHome.jsx";
import CustomerProfile from "./pages/CustomerProfile.jsx";
import DriverDeliveries from "./pages/DriverDeliveries.jsx";
import DriverPerformance from "./pages/DriverPerformance.jsx";
import DriverProfile from "./pages/DriverProfile.jsx";
import HelperDeliveries from "./pages/HelperDeliveries.jsx";
import HelperProfile from "./pages/HelperProfile.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import Login from "./pages/Login.jsx";
import AdminHome from "./pages/AdminHome.jsx";
import AdminDevices from "./pages/AdminDevices.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminProfile from "./pages/AdminProfile.jsx";
import AdminTrucks from "./pages/AdminTrucks.jsx";
import AdminTruckProfile from "./pages/AdminTruckProfile.jsx";
import SupDeliveryCrew from "./pages/SupDeliveryCrew.jsx";
import SupCrewProfile from "./pages/SupCrewProfile.jsx";
import SupDeliveries from "./pages/SupDeliveries.jsx";
import SupDashboard from "./pages/SupDashboard.jsx";
import SupAnalysisIndiv from "./pages/SupAnalysisIndiv.jsx";
import SupProfile from "./pages/SupProfile.jsx";
import SupTrucks from "./pages/SupTrucks.jsx";
import SupTruckProfile from "./pages/SupTruckProfile.jsx";
import ProtectedRoute from "./components/common/ProtectedRoute.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/landing" element={<LandingPage />} />

      {/* Customer portal — requires Customer role */}
      <Route element={<ProtectedRoute />}>
        <Route path="/customer" element={<Navigate to="/customer/home" replace />} />
        <Route path="/customer/home" element={<CustomerHome />} />
        <Route path="/customer/deliveries" element={<CustomerDeliveries />} />
        <Route path="/customer/deliveries/request" element={<CustomerRequestDelivery />} />
        <Route path="/customer/profile" element={<CustomerProfile />} />
      </Route>

      {/* Driver portal — requires Driver role */}
      <Route element={<ProtectedRoute />}>
        <Route path="/driver" element={<Navigate to="/driver/trips" replace />} />
        <Route path="/driver/performance" element={<DriverPerformance />} />
        <Route path="/driver/trips" element={<DriverDeliveries />} />
        <Route path="/driver/profile" element={<DriverProfile />} />
      </Route>

      {/* Helper portal — requires Helper role */}
      <Route element={<ProtectedRoute />}>
        <Route path="/helper" element={<Navigate to="/helper/trips" replace />} />
        <Route path="/helper/trips" element={<HelperDeliveries />} />
        <Route path="/helper/profile" element={<HelperProfile />} />
      </Route>

      {/* Supervisor portal — requires Supervisor role */}
      <Route element={<ProtectedRoute />}>
        <Route path="/supervisor" element={<Navigate to="/supervisor/dashboard" replace />} />
        <Route path="/supervisor/dashboard" element={<SupDashboard />} />
        <Route path="/supervisor/analysis/indiv" element={<SupAnalysisIndiv />} />
        <Route path="/supervisor/delivery-crew" element={<SupDeliveryCrew />} />
        <Route path="/supervisor/delivery-crew/profile" element={<SupCrewProfile />} />
        <Route path="/supervisor/deliveries" element={<SupDeliveries />} />
        <Route path="/supervisor/profile" element={<SupProfile />} />
        <Route path="/supervisor/trucks" element={<SupTrucks />} />
        <Route path="/supervisor/trucks/profile" element={<SupTruckProfile />} />
      </Route>

      {/* Admin portal — requires Admin role */}
      <Route element={<ProtectedRoute />}>
        <Route path="/admin" element={<Navigate to="/admin/user-management" replace />} />
        <Route path="/admin/home" element={<Navigate to="/admin/user-management" replace />} />
        <Route path="/admin/user-management" element={<AdminHome />} />
        <Route path="/admin/device-management" element={<AdminDevices />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/profile" element={<AdminProfile />} />
        <Route path="/admin/trucks" element={<AdminTrucks />} />
        <Route path="/admin/trucks/profile" element={<AdminTruckProfile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
