import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient.js";

const ROLE_HOME_ROUTES = {
  Admin: "/admin/user-management",
  Supervisor: "/supervisor/dashboard",
  Driver: "/driver/trips",
  Helper: "/helper/trips",
  Customer: "/customer/home",
};

const ROUTE_ROLE_MAP = {
  "/admin": "Admin",
  "/supervisor": "Supervisor",
  "/driver": "Driver",
  "/helper": "Helper",
  "/customer": "Customer",
};

function resolveRoleFromPath(pathname) {
  for (const [prefix, role] of Object.entries(ROUTE_ROLE_MAP)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return role;
  }
  return null;
}

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, allowed: false });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        setState({ loading: false, allowed: false });
        return;
      }

      const requiredRole = resolveRoleFromPath(location.pathname);

      if (!requiredRole) {
        setState({ loading: false, allowed: true });
        return;
      }

      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (cancelled) return;

      const userRole = userRow?.role;

      if (userRole === requiredRole) {
        setState({ loading: false, allowed: true });
      } else {
        setState({
          loading: false,
          allowed: false,
          redirectTo: ROLE_HOME_ROUTES[userRole] || "/",
        });
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-violet-600" />
      </div>
    );
  }

  if (!state.allowed) {
    return <Navigate to={state.redirectTo || "/"} replace />;
  }

  return children;
}
