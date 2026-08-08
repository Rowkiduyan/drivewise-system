# DriveWise UI Design

## Design Philosophy

DriveWise is a modern, friendly, and professional fleet management system.

The interface should prioritize:

- Readability
- Consistency
- Simplicity
- Maintainability

Avoid unnecessary visual clutter.

---

## Theme

Background

- White

Overall Style

- Modern
- Friendly
- Professional

Do not use:

- Heavy gradients
- Glassmorphism
- Neumorphism
- Excessive shadows

---

## Cards

Cards should be:

- Flat
- White background
- Minimal border
- Small rounded corners

---

## Buttons

Buttons should:

- Be rounded
- Match the active role's primary color when appropriate

Danger buttons should always be red.

---

## Loading States

Any button that triggers an async backend call — most commonly a modal's confirm button — must show a loading state while the request is in flight, and must be disabled (along with its modal's Cancel button) for the duration. This prevents a double-tap from firing the request twice, which is easy to hit on mobile (slower taps, no cursor feedback) and on slower connections generally.

Decided 2026-08-08 (first applied to `DriverDeliveries.jsx`'s Confirm Pickup/Complete Delivery/Pause Trip/Resume Trip confirm-modal buttons — see `STATUS.md`). The pattern:

- Track a single `isSubmitting`-style boolean in the component. If more than one confirm modal exists but only one can ever be open at a time, share one flag across all of them rather than one per action — simpler, and there's never a real case where two could be in flight together.
- Guard the handler itself against re-entry (`if (isSubmitting) return`) as well as disabling the button — belt and suspenders, since a disabled button can still receive a queued click event on some mobile browsers a frame before the disabled state paints.
- While submitting: swap the button's label for a small spinner + "Please wait…" (a `Loader2`-style icon with `animate-spin` is the standard here), and disable both the confirm and cancel buttons (`disabled:cursor-not-allowed disabled:opacity-50`/`70`).
- Close the modal (and reset the flag) only after the async call settles — not immediately on click — so the loading state is actually visible for however long the request takes, and so a failure's `alert()` (or future non-alert error UI) appears while context is still on screen rather than after the modal has already vanished.

Apply this to every new confirm-modal button going forward, not just the ones it already covers.

---

## Tables

Tables should:

- Have sticky headers
- Have hover effects
- Remain readable on all screen sizes
- A controls card for search, filters, and primary actions.
- A separate table card for the user list and pagination.
- Sit inside a rounded white container with a minimal border and subtle shadow.
- Allow horizontal scrolling on smaller screens so column content stays readable.
- Use a fixed table layout with a minimum width to preserve column spacing.
- Keep the header row visually distinct with small uppercase text and a light neutral
- Use subtle row hover states for readability and interaction feedback.
- Show compact status pills and role pills instead of heavy badges.
- Keep pagination in a footer below the table, separated by a thin top border.
background.

Use this structure when the page needs dense tabular data but still needs to remain readable on mobile and tablet screens.

---

## Forms

Forms should:

- Have labels above inputs
- Have placeholders
- Mark required fields with a red asterisk (*)

---

## Modal

- A full-screen dark translucent backdrop with a slight blur.
- A centered white dialog with rounded corners, a minimal border, and a soft shadow.
- A title area at the top, supporting helper text beneath it, and actions aligned at the bottom.
- A small close button in the top-right corner for dismissing the dialog.

The modal variants follow the content size:

- Wide modal for the Add User form.
- Medium modal for Manage Account and Bulk Upload.
- Compact modal for confirmation, password, and status messages.

Modal content should stay simple and readable:

- Use labels above inputs in forms.
- Keep confirmation details grouped in a compact summary block.
- Present temporary passwords in a monospace block so they are easy to copy and verify.
- Use a single clear action for status dialogs and a small set of actions for forms.

These overlays should feel consistent even when the content changes, so the backdrop, shape, spacing, and button style stay aligned across all modal types.

---

## Icons

Do not use icons unless explicitly requested.