import { useEffect, useState } from "react";
import CustomerLayout from "../layout/CustomerLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";

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
// customer_records columns via the admin-users Edge Function.
function mapProfile(row) {
  const fullName = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");

  return {
    fullName: fullName || "—",
    role: row.role,
    age: calculateAge(row.birthdate),
    birthdate: formatBirthdate(row.birthdate),
    address: formatAddress(row.address),
    personalEmail: row.email || "—",
    workEmail: row.login_email || "—",
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
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
      />
    </div>
  );
}

function CustomerProfile() {
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [customer, setCustomer] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

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

      setCustomer(mapProfile(data.profile));
      setIsLoadingProfile(false);
    };

    loadProfile();

    return () => {
      isCurrent = false;
    };
  }, []);

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
    <CustomerLayout title="Customer Profile" background={null}>
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
        ) : customer ? (
          <>
            {/* Profile header — horizontal strip matching the width and card
                style of the sections below, instead of a separate sidebar. */}
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-base font-semibold text-emerald-700">
                  {getInitials(customer.fullName)}
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {customer.fullName}
                  </p>
                  <p className="text-sm text-slate-500">{customer.workEmail}</p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {customer.role}
              </span>
            </section>

            <SectionCard title="Basic Information">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                <InfoField label="Full Name" value={customer.fullName} />
                <InfoField label="Role" value={customer.role} />
                <InfoField label="Personal Email" value={customer.personalEmail} />
                <InfoField label="Work Email" value={customer.workEmail} />
                <InfoField label="Age" value={customer.age ?? "—"} />
                <InfoField label="Birthdate" value={customer.birthdate} />
                <InfoField label="Address" value={customer.address} wide />
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
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}

export default CustomerProfile;
