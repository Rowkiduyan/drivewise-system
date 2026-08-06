import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";

function deriveInitials(firstName, lastName) {
  const first = firstName?.trim()?.charAt(0) || "";
  const last = lastName?.trim()?.charAt(0) || "";
  const initials = (first + last).toUpperCase();
  return initials || "?";
}

// Shared by every sidebar layout (Admin/Supervisor/Driver/Customer) to show
// the signed-in user's initials from their own *_records row (first_name +
// last_name) rather than the Auth email — the client can't read *_records
// directly (service_role only, see DATABASE.md), so this goes through the
// admin-users Edge Function's get-own-profile action.
export function useUserInitials() {
  const [initials, setInitials] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadInitials() {
      // Ensure we have an authenticated session before invoking the Edge Function.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        // No session – skip the request; the component will render placeholder initials.
        return;
      }

      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "get-own-profile" },
      });

      if (!isMounted || error) {
        return;
      }

      setInitials(
        deriveInitials(data.profile.first_name, data.profile.last_name),
      );
    }

    loadInitials();

    return () => {
      isMounted = false;
    };
  }, []);

  return initials;
}

// Same get-own-profile fetch as useUserInitials, but also returns
// profile_picture so a sidebar can show the picture instead of initials
// once one is uploaded. Kept as a separate hook (rather than changing
// useUserInitials's return shape) so the three layouts that only need
// initials aren't touched.
export function useUserProfile() {
  const [profile, setProfile] = useState({
    initials: "",
    profilePicture: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      // Ensure an authenticated session exists before calling the Edge Function.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        return;
      }

      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "get-own-profile" },
      });

      if (!isMounted || error) {
        return;
      }

      setProfile({
        initials: deriveInitials(
          data.profile.first_name,
          data.profile.last_name,
        ),
        profilePicture: data.profile.profile_picture || null,
      });
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  return profile;
}
