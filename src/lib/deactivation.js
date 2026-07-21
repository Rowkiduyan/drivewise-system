export const DEACTIVATION_GRACE_HOURS = 24

// Deactivating an account doesn't ban it in Supabase Auth immediately —
// Supabase has no way to schedule a ban to start in the future, so instead
// `users.deactivated_at` just records when an admin deactivated the
// account, and every login/session check compares that timestamp against
// now. Access is only actually cut off once DEACTIVATION_GRACE_HOURS have
// elapsed; before that, the account still works but is warned.
export function getDeactivationStatus(deactivatedAt) {
  if (!deactivatedAt) {
    return { isDeactivated: false, isPastGrace: false, cutoffAt: null }
  }

  const deactivatedDate = new Date(deactivatedAt)
  const cutoffAt = new Date(deactivatedDate.getTime() + DEACTIVATION_GRACE_HOURS * 60 * 60 * 1000)

  return {
    isDeactivated: true,
    isPastGrace: Date.now() >= cutoffAt.getTime(),
    cutoffAt
  }
}

export function formatCutoff(cutoffAt) {
  if (!cutoffAt) {
    return ''
  }

  return cutoffAt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}
