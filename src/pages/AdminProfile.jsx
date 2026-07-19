import { useState } from "react";
import AdminLayout from "../layout/AdminLayout.jsx";

// ---------------------------------------------------------------------------
// Dummy admin profile — frontend only, no backend/API/database.
// ---------------------------------------------------------------------------

const MOCK_ADMIN = {
  fullName: "System Administrator",
  role: "Platform Admin",
  age: 38,
  birthdate: "November 21, 1987",
  address: "78 Ipil-Ipil St., Taguig City, Metro Manila",
  personalEmail: "admin.personal@gmail.com",
  workEmail: "admin@marveltrucking.com",
};

function getInitials(fullName) {
  const parts = fullName.trim().split(" ");
  const first = parts[0]?.charAt(0) || "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase() || "?";
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
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );
}

function AdminProfile() {
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

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
    <AdminLayout title="Admin Profile" background={null}>
      <div className="flex flex-col gap-6 pb-10">
        {/* Profile header — horizontal strip matching the width and card
            style of the sections below, instead of a separate sidebar. */}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-violet-50 text-base font-semibold text-violet-700">
              {getInitials(MOCK_ADMIN.fullName)}
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {MOCK_ADMIN.fullName}
              </p>
              <p className="text-sm text-slate-500">{MOCK_ADMIN.workEmail}</p>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            {MOCK_ADMIN.role}
          </span>
        </section>

        <SectionCard title="Basic Information">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            <InfoField label="Full Name" value={MOCK_ADMIN.fullName} />
            <InfoField label="Role" value={MOCK_ADMIN.role} />
            <InfoField label="Personal Email" value={MOCK_ADMIN.personalEmail} />
            <InfoField label="Work Email" value={MOCK_ADMIN.workEmail} />
            <InfoField label="Age" value={MOCK_ADMIN.age} />
            <InfoField label="Birthdate" value={MOCK_ADMIN.birthdate} />
            <InfoField label="Address" value={MOCK_ADMIN.address} wide />
          </dl>
        </SectionCard>

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
                  className="rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminProfile;
