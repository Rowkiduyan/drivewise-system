import { useEffect, useState } from "react";
import DriverLayout from "../layout/DriverLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { cropImageToSquareBase64 } from "../lib/profilePicture.js";
import WorkingDaysEditor from "../components/WorkingDaysEditor.jsx";

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
    return "N/A";
  }

  const date = new Date(`${birthdate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
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
    return "N/A";
  }

  return [address.street, address.city, address.province].filter(Boolean).join(", ") || "N/A";
}

// Mirrors AdminHome.jsx's mapListedUser shape — both read the same
// driver_records columns via the admin-users Edge Function.
function mapProfile(row) {
  const fullName = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");

  return {
    id: row.id,
    fullName: fullName || "N/A",
    role: row.role,
    age: calculateAge(row.birthdate),
    birthdate: formatBirthdate(row.birthdate),
    address: formatAddress(row.address),
    personalEmail: row.email || "N/A",
    workEmail: row.login_email || "N/A",
    profilePicture: row.profile_picture || "",
  };
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
        {title}
      </h2>
      {description && <p className="mt-1 text-xs text-slate-500 sm:text-sm">{description}</p>}
      <div className="mt-3 sm:mt-4">{children}</div>
    </section>
  );
}

// Plain label/value pairs with generous spacing instead of boxed tiles or
// bordered rows — a flatter, more modern definition-list style.
function InfoField({ label, value, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.14em]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 sm:text-sm" htmlFor={id}>
        {label} <span className="text-red-600">*</span>
      </label>
      <input
        id={id}
        type="password"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100 sm:py-2.5 sm:text-sm"
      />
    </div>
  );
}

function DriverProfile() {
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [driver, setDriver] = useState(null);
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

      setDriver(mapProfile(data.profile));
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
    if (!file || !driver?.id || isUpdatingPicture) {
      return;
    }

    setPictureError("");
    setIsUpdatingPicture(true);

    try {
      const fileBase64 = await cropImageToSquareBase64(file);
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "upload-profile-picture",
          userId: driver.id,
          fileBase64,
          contentType: "image/jpeg",
        },
      });

      if (error) {
        setPictureError(error.message || "Unable to upload profile picture.");
        return;
      }

      setDriver((current) => (current ? { ...current, profilePicture: data.profile_picture } : current));
    } catch (uploadException) {
      setPictureError(
        uploadException instanceof Error ? uploadException.message : "Unable to process the selected image."
      );
    } finally {
      setIsUpdatingPicture(false);
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!driver?.id || isUpdatingPicture) {
      return;
    }

    setPictureError("");
    setIsUpdatingPicture(true);

    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "remove-profile-picture", userId: driver.id },
      });

      if (error) {
        setPictureError(error.message || "Unable to remove profile picture.");
        return;
      }

      setDriver((current) => (current ? { ...current, profilePicture: "" } : current));
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
    <DriverLayout title="Driver Profile" background={null}>
      <div className="flex w-full min-w-0 flex-col gap-4 pb-8 sm:gap-6 sm:pb-10">
        {profileError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 sm:px-4 sm:py-3 sm:text-sm">
            {profileError}
          </p>
        ) : null}

        {isLoadingProfile ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-xs text-slate-500 sm:text-sm">Loading profile…</p>
          </div>
        ) : driver ? (
          <>
            {/* Profile header — horizontal strip matching the width and card
                style of the sections below, instead of a separate sidebar.
                No role badge here: this is the Driver portal, so "Driver"
                next to the driver's own name is redundant. */}
            <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-4 sm:p-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-50 text-sm font-semibold text-amber-700 sm:h-28 sm:w-28 sm:text-xl">
                {driver.profilePicture ? (
                  <img src={driver.profilePicture} alt="" className="h-full w-full object-cover" />
                ) : (
                  getInitials(driver.fullName)
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 sm:text-lg">
                  {driver.fullName}
                </p>
                <p className="truncate text-xs text-slate-500 sm:text-sm">{driver.workEmail}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-2 sm:gap-2">
                  <label
                    htmlFor="driver-profile-picture"
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:px-3 sm:py-1.5 sm:text-xs ${
                      isUpdatingPicture ? "pointer-events-none opacity-60" : ""
                    }`}
                  >
                    {isUpdatingPicture ? "Working..." : "Change Photo"}
                  </label>
                  {driver.profilePicture ? (
                    <button
                      type="button"
                      onClick={handleRemoveProfilePicture}
                      disabled={isUpdatingPicture}
                      className="rounded-xl border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  id="driver-profile-picture"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleProfilePictureChange}
                  disabled={isUpdatingPicture}
                  className="sr-only"
                />
                {pictureError ? <p className="mt-1.5 text-[11px] text-red-600 sm:text-xs">{pictureError}</p> : null}
              </div>
            </section>

            <SectionCard title="Basic Information">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-5">
                <InfoField label="Full Name" value={driver.fullName} />
                <InfoField label="Role" value={driver.role} />
                <InfoField label="Personal Email" value={driver.personalEmail} />
                <InfoField label="Work Email" value={driver.workEmail} />
                <InfoField label="Age" value={driver.age ?? "N/A"} />
                <InfoField label="Birthdate" value={driver.birthdate} />
                <InfoField label="Address" value={driver.address} wide />
              </dl>
            </SectionCard>

            <WorkingDaysEditor />
          </>
        ) : null}

        <SectionCard title="Change Password">
          <div className="max-w-md">
            <p className="text-xs font-medium text-slate-700 sm:text-sm">Password</p>
            <div className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs tracking-widest text-slate-500 sm:py-2.5 sm:text-sm">
              ••••••••••••
            </div>

            {formSuccess && <p className="mt-2 text-xs text-emerald-600 sm:text-sm">{formSuccess}</p>}

            <button
              type="button"
              onClick={openPasswordModal}
              className="mt-3 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:mt-4 sm:px-4 sm:py-2.5 sm:text-sm"
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
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="change-password-title" className="text-sm font-semibold text-slate-900 sm:text-base">
              Change Password
            </h3>

            <form onSubmit={handleChangePassword} className="mt-3 flex flex-col gap-3 sm:mt-4 sm:gap-4">
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

              {formError && <p className="text-xs text-red-600 sm:text-sm">{formError}</p>}

              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:px-3.5 sm:py-2 sm:text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 sm:px-3.5 sm:py-2 sm:text-sm"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DriverLayout>
  );
}

export default DriverProfile;
