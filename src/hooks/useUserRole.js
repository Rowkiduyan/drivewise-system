import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";

/**
 * Hook to retrieve the current user's role from Supabase auth metadata.
 * Falls back to "admin" if no role is defined.
 */
export default function useUserRole() {
  const [role, setRole] = useState("admin");
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const r = user?.user_metadata?.role ?? "admin";
      setRole(r);
    });
  }, []);
  return role;
}
