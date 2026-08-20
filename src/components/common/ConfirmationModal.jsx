import { X } from "lucide-react";

/**
 * Reusable confirmation modal.
 * Props:
 *  - isOpen: boolean – whether the modal is visible
 *  - onClose: () => void – called when the user cancels or clicks outside
 *  - onConfirm: () => void – called when the user confirms the action
 *  - title: string – modal title
 *  - message: string – explanatory text (optional)
 *  - confirmText: string – text for the confirm button (default "Confirm")
 *  - confirmVariant: "primary" | "danger" | "warning" – button colour variant
 *  - isLoading: boolean – disables confirm button and shows a spinner text
 *  - children: ReactNode – optional custom content rendered between message and buttons
 */
export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure?",
  confirmText = "Confirm",
  confirmVariant = "primary",
  isLoading = false,
  children,
}) {
  if (!isOpen) return null;

  const variantClasses = {
    primary: "bg-teal-600 hover:bg-teal-700 text-white",
    danger: "bg-red-600 hover:bg-red-700 text-white",
    warning: "bg-yellow-600 hover:bg-yellow-700 text-white",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
        {children}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${variantClasses[confirmVariant]}`}
          >
            {isLoading ? "Processing…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
