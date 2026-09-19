import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login.jsx";
import ProtectedRoute from "./components/common/ProtectedRoute.jsx";

// Route-split (2026-09-19, 3s load KPI): every page except Login (the initial
// "/" route) loads lazily, so first paint ships only React + router + Login
// instead of all 20+ pages + tfjs + maps + charts + leaflet in one 9MB chunk.
// Heavy route chunks (Helper with tfjs, Driver/Sup with maps, dashboards with
// charts) download on demand when the user actually navigates there.
const CustomerDeliveries = lazy(() => import("./pages/CustomerDeliveries.jsx"));
const CustomerRequestDelivery = lazy(
  () => import("./pages/CustomerRequestDelivery.jsx"),
);
const CustomerProfile = lazy(() => import("./pages/CustomerProfile.jsx"));
const DriverDeliveries = lazy(() => import("./pages/DriverDeliveries.jsx"));
const DriverPerformance = lazy(() => import("./pages/DriverPerformance.jsx"));
const DriverProfile = lazy(() => import("./pages/DriverProfile.jsx"));
const HelperDeliveries = lazy(() => import("./pages/HelperDeliveries.jsx"));
const HelperProfile = lazy(() => import("./pages/HelperProfile.jsx"));
const LandingPage = lazy(() => import("./pages/LandingPage.jsx"));
const AdminHome = lazy(() => import("./pages/AdminHome.jsx"));
const AdminDevices = lazy(() => import("./pages/AdminDevices.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const AdminProfile = lazy(() => import("./pages/AdminProfile.jsx"));
const AdminTrucks = lazy(() => import("./pages/AdminTrucks.jsx"));
const AdminTruckProfile = lazy(() => import("./pages/AdminTruckProfile.jsx"));
const SupDeliveryCrew = lazy(() => import("./pages/SupDeliveryCrew.jsx"));
const SupCrewProfile = lazy(() => import("./pages/SupCrewProfile.jsx"));
const SupDeliveries = lazy(() => import("./pages/SupDeliveries.jsx"));
const SupDashboard = lazy(() => import("./pages/SupDashboard.jsx"));
const SupAnalysisIndiv = lazy(() => import("./pages/SupAnalysisIndiv.jsx"));
const SupProfile = lazy(() => import("./pages/SupProfile.jsx"));
const SupTrucks = lazy(() => import("./pages/SupTrucks.jsx"));
const SupTruckProfile = lazy(() => import("./pages/SupTruckProfile.jsx"));

function RouteFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-violet-600" />
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/landing" element={<LandingPage />} />

        {/* Customer portal — requires Customer role. Home page removed
           2026-09-18, per explicit user request -- Deliveries is now the
           customer portal's default landing page, so both /customer and the
           old /customer/home just redirect there instead of rendering a page. */}
        <Route element={<ProtectedRoute />}>
          <Route path="/customer" element={<Navigate to="/customer/deliveries" replace />} />
          <Route path="/customer/home" element={<Navigate to="/customer/deliveries" replace />} />
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
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/home" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/user-management" element={<AdminHome />} />
          <Route path="/admin/device-management" element={<AdminDevices />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/profile" element={<AdminProfile />} />
          <Route path="/admin/trucks" element={<AdminTrucks />} />
          <Route path="/admin/trucks/profile" element={<AdminTruckProfile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
