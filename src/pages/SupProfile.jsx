import { useState } from "react";
import SupLayout from "../layout/SupLayout.jsx";

// ---------------------------------------------------------------------------
// Dummy supervisor profile — frontend only, no backend/API/database.
// ---------------------------------------------------------------------------

const MOCK_SUPERVISOR = {
  fullName: "Alexis Duain",
  age: 34,
  birthdate: "March 12, 1992",
  address: "123 Sampaguita St., Quezon City, Metro Manila",
  role: "Supervisor",
};

function getInitials(fullName) {
  const parts = fullName.trim().split(" ");
  const first = parts[0]?.charAt(0) || "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase() || "?";
}

function SectionCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const handleChangePassword = (event) => {
    event.preventDefault();
    setFormSuccess("");

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

    setFormError("");
    setFormSuccess("Password updated successfully.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <SupLayout title="Supervisor Profile" background={null} bg="bg-white">
      <div className="flex flex-col gap-6 pb-10">
        {/* Identity strip */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
              {getInitials(MOCK_SUPERVISOR.fullName)}
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900 sm:text-lg">
                {MOCK_SUPERVISOR.fullName}
              </p>
              <p className="text-xs text-slate-500">{MOCK_SUPERVISOR.role}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Basic Information">
            <div>
              <InfoRow label="Full Name" value={MOCK_SUPERVISOR.fullName} />
              <InfoRow label="Age" value={MOCK_SUPERVISOR.age} />
              <InfoRow label="Birthdate" value={MOCK_SUPERVISOR.birthdate} />
              <InfoRow label="Address" value={MOCK_SUPERVISOR.address} />
              <InfoRow label="Role" value={MOCK_SUPERVISOR.role} />
            </div>
          </SectionCard>

          <SectionCard title="Change Password">
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
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
              {formSuccess && <p className="text-sm text-emerald-600">{formSuccess}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Update Password
                </button>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>
    </SupLayout>
  );
}

export default SupProfile;
