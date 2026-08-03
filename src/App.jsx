import { Navigate, Route, Routes } from "react-router-dom";
import CustomerDeliveries from "./pages/CustomerDeliveries.jsx";
import CustomerRequestDelivery from "./pages/CustomerRequestDelivery.jsx";
import CustomerHome from "./pages/CustomerHome.jsx";
import CustomerProfile from "./pages/CustomerProfile.jsx";
import DriverDeliveries from "./pages/DriverDeliveries.jsx";
import DriverPerformance from "./pages/DriverPerformance.jsx";
import DriverProfile from "./pages/DriverProfile.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import Login from "./pages/Login.jsx";
import AdminHome from "./pages/AdminHome.jsx";
import AdminDeviceManagement from "./pages/AdminDeviceManagement.jsx";
import AdminAnalysis from "./pages/AdminAnalysis.jsx";
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
import SystemLogs from "./pages/SystemLogs.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route
        path="/customer"
        element={<Navigate to="/customer/home" replace />}
      />
      <Route path="/customer/home" element={<CustomerHome />} />
      <Route path="/customer/deliveries" element={<CustomerDeliveries />} />
      <Route
        path="/customer/deliveries/request"
        element={<CustomerRequestDelivery />}
      />
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
      <Route path="/supervisor/analysis/indiv" element={<SupAnalysisIndiv />} />
      <Route path="/supervisor/delivery-crew" element={<SupDeliveryCrew />} />
      <Route
        path="/supervisor/delivery-crew/profile"
        element={<SupCrewProfile />}
      />
      <Route path="/supervisor/deliveries" element={<SupDeliveries />} />
      <Route path="/supervisor/profile" element={<SupProfile />} />
      <Route path="/supervisor/trucks" element={<SupTrucks />} />
      <Route path="/supervisor/trucks/profile" element={<SupTruckProfile />} />
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
      <Route path="/admin/system-logs" element={<SystemLogs />} />
      <Route path="/admin/trucks" element={<AdminTrucks />} />
      <Route path="/admin/trucks/profile" element={<AdminTruckProfile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
