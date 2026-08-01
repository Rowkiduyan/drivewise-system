import { useEffect, useState } from "react";
import SupLayout from "../layout/SupLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { cropImageToSquareBase64 } from "../lib/profilePicture.js";

function getInitials(fullName) {
  const parts = fullName.trim().split(" ");
  const first = parts[0]?.charAt(0) || "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase() || "?";
}

function calculateAge(birthdate) {
  if (!birthdate) {
    return null;
  }

  const dob = new Date(`${birthdate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const hasHadBirthdayThisYear =
    today.getUTCMonth() > dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() >= dob.getUTCDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function formatBirthdate(birthdate) {
  if (!birthdate) {
    return "—";
  }

  const date = new Date(`${birthdate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatAddress(address) {
  if (!address) {
    return "—";
  }

  return [address.street, address.city, address.province].filter(Boolean).join(", ") || "—";
}

// Mirrors AdminHome.jsx's mapListedUser shape — both read the same
// supervisor_records columns via the admin-users Edge Function.
function mapProfile(row) {
  const fullName = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");

  return {
    id: row.id,
    fullName: fullName || "—",
    role: row.role,
    age: calculateAge(row.birthdate),
    birthdate: formatBirthdate(row.birthdate),
    address: formatAddress(row.address),
    personalEmail: row.email || "—",
    workEmail: row.login_email || "—",
    profilePicture: row.profile_picture || "",
  };
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Plain label/value pairs with generous spacing instead of boxed tiles or
// bordered rows — a flatter, more modern definition-list style.
function InfoField({ label, value, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label} <span className="text-red-600">*</span>
      </label>
      <input
        id={id}
        type="password"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function SupProfile() {
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [supervisor, setSupervisor] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [pictureError, setPictureError] = useState("");
  const [isUpdatingPicture, setIsUpdatingPicture] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    const loadProfile = async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "get-own-profile" },
      });

      if (!isCurrent) {
        return;
      }

      if (error) {
        setProfileError(error.message || "Unable to load your profile.");
        setIsLoadingProfile(false);
        return;
      }

      setSupervisor(mapProfile(data.profile));
      setIsLoadingProfile(false);
    };

    loadProfile();

    return () => {
      isCurrent = false;
    };
  }, []);

  const handleProfilePictureChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supervisor?.id || isUpdatingPicture) {
      return;
    }

    setPictureError("");
    setIsUpdatingPicture(true);

    try {
      const fileBase64 = await cropImageToSquareBase64(file);
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "upload-profile-picture",
          userId: supervisor.id,
          fileBase64,
          contentType: "image/jpeg",
        },
      });

      if (error) {
        setPictureError(error.message || "Unable to upload profile picture.");
        return;
      }

      setSupervisor((current) => (current ? { ...current, profilePicture: data.profile_picture } : current));
    } catch (uploadException) {
      setPictureError(
        uploadException instanceof Error ? uploadException.message : "Unable to process the selected image."
      );
    } finally {
      setIsUpdatingPicture(false);
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!supervisor?.id || isUpdatingPicture) {
      return;
    }

    setPictureError("");
    setIsUpdatingPicture(true);

    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "remove-profile-picture", userId: supervisor.id },
      });

      if (error) {
        setPictureError(error.message || "Unable to remove profile picture.");
        return;
      }

      setSupervisor((current) => (current ? { ...current, profilePicture: "" } : current));
    } finally {
      setIsUpdatingPicture(false);
    }
  };

  const openPasswordModal = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFormError("");
    setFormSuccess("");
    setIsPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setFormError("");
  };

  const handleChangePassword = (event) => {
    event.preventDefault();
    setFormError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setFormError("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("New password and confirmation do not match.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setIsPasswordModalOpen(false);
    setFormSuccess("Password updated successfully.");
  };

  return (
    <SupLayout title="Supervisor Profile" background={null} bg="bg-[#F6F7FB]">
      <div className="flex flex-col gap-6 pb-10">
        {profileError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {profileError}
          </p>
        ) : null}

        {isLoadingProfile ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm text-slate-500">Loading profile…</p>
          </div>
        ) : supervisor ? (
          <>
            {/* Profile header — horizontal strip matching the width and card
                style of the sections below, instead of a separate sidebar. */}
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-xl font-semibold text-blue-700">
                  {supervisor.profilePicture ? (
                    <img src={supervisor.profilePicture} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getInitials(supervisor.fullName)
                  )}
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {supervisor.fullName}
                  </p>
                  <p className="text-sm text-slate-500">{supervisor.workEmail}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <label
                      htmlFor="supervisor-profile-picture"
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 ${
                        isUpdatingPicture ? "pointer-events-none opacity-60" : ""
                      }`}
                    >
                      {isUpdatingPicture ? "Working..." : "Change Photo"}
                    </label>
                    {supervisor.profilePicture ? (
                      <button
                        type="button"
                        onClick={handleRemoveProfilePicture}
                        disabled={isUpdatingPicture}
                        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <input
                    id="supervisor-profile-picture"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleProfilePictureChange}
                    disabled={isUpdatingPicture}
                    className="sr-only"
                  />
                  {pictureError ? <p className="mt-1.5 text-xs text-red-600">{pictureError}</p> : null}
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {supervisor.role}
              </span>
            </section>

            <SectionCard title="Basic Information">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                <InfoField label="Full Name" value={supervisor.fullName} />
                <InfoField label="Role" value={supervisor.role} />
                <InfoField label="Personal Email" value={supervisor.personalEmail} />
                <InfoField label="Work Email" value={supervisor.workEmail} />
                <InfoField label="Age" value={supervisor.age ?? "—"} />
                <InfoField label="Birthdate" value={supervisor.birthdate} />
                <InfoField label="Address" value={supervisor.address} wide />
              </dl>
            </SectionCard>
          </>
        ) : null}

        <SectionCard title="Change Password">
          <div className="max-w-md">
            <p className="text-sm font-medium text-slate-700">Password</p>
            <div className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm tracking-widest text-slate-500">
              ••••••••••••
            </div>

            {formSuccess && <p className="mt-2 text-sm text-emerald-600">{formSuccess}</p>}

            <button
              type="button"
              onClick={openPasswordModal}
              className="mt-4 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Change Password
            </button>
          </div>
        </SectionCard>
      </div>

      {isPasswordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-password-title"
          onClick={closePasswordModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="change-password-title" className="text-base font-semibold text-slate-900">
              Change Password
            </h3>

            <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-4">
              <PasswordField
                id="current-password"
                label="Current Password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Enter current password"
              />
              <PasswordField
                id="new-password"
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new password"
              />
              <PasswordField
                id="confirm-password"
                label="Confirm New Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Re-enter new password"
              />

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SupLayout>
  );
}

export default SupProfile;
