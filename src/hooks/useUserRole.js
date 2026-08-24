import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";

/**
 * Hook to retrieve the current user's role from the database "users" table.
 * Falls back to "admin" if no role is defined.
 */
export default function useUserRole() {
  const [role, setRole] = useState("admin");
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setRole("admin");
        return;
      }
      // Fetch role from the public.users table instead of user_metadata
      supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          const r = data?.role ?? "admin";
          setRole(r);
        })
        .catch(() => setRole("admin"));
    });
  }, []);
  return role;
}
