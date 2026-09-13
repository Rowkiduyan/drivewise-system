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
  const [initials, setInitials] = useState(() => profileCache.initials);

  useEffect(() => {
    let isMounted = true;

    async function loadInitials() {
      if (profileCache.initials) {
        if (isMounted) setInitials(profileCache.initials);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "get-own-profile" },
      });

      if (!isMounted || error) return;

      const value = deriveInitials(
        data.profile.first_name,
        data.profile.last_name,
      );
      profileCache.initials = value;
      setInitials(value);
    }

    loadInitials();
    return () => {
      isMounted = false;
    };
  }, []);

  return initials;
}

const profileCache = {
  initials: "",
  profilePicture: null,
  role: "",
};

export function clearProfileCache() {
  profileCache.initials = "";
  profileCache.profilePicture = null;
  profileCache.role = "";
}

// Same get-own-profile fetch as useUserInitials, but also returns
// profile_picture so a sidebar can show the picture instead of initials
// once one is uploaded. Kept as a separate hook (rather than changing
// useUserInitials's return shape) so the three layouts that only need
// initials aren't touched.
export function useUserProfile() {
  const [profile, setProfile] = useState(() => ({
    initials: profileCache.initials,
    profilePicture: profileCache.profilePicture,
    role: profileCache.role,
  }));

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      if (profileCache.role) {
        if (isMounted) {
          setProfile({
            initials: profileCache.initials,
            profilePicture: profileCache.profilePicture,
            role: profileCache.role,
          });
        }
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "get-own-profile" },
      });

      if (!isMounted || error) return;

      profileCache.initials = deriveInitials(
        data.profile.first_name,
        data.profile.last_name,
      );
      profileCache.profilePicture = data.profile.profile_picture || null;
      profileCache.role = data.profile.role || "";

      setProfile({
        initials: profileCache.initials,
        profilePicture: profileCache.profilePicture,
        role: profileCache.role,
      });
    }

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  return profile;
}
