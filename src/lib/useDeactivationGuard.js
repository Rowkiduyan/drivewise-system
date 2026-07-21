import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient.js'
import { getDeactivationStatus } from './deactivation.js'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

// Deactivation only cuts off *new* sign-ins once the grace period elapses
// (see Login.jsx) — a browser tab that's already signed in would otherwise
// keep working indefinitely via silent token refresh. This hook, used by
// every portal layout, re-checks the caller's own `deactivated_at` on
// mount and periodically after, forcing a sign-out once the grace period
// is over and returning a warning (with the cutoff time) while still
// inside it.
export function useDeactivationGuard() {
  const [warning, setWarning] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    async function check() {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      if (!user || !isMounted) {
        return
      }

      const { data } = await supabase
        .from('users')
        .select('deactivated_at')
        .eq('id', user.id)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      const status = getDeactivationStatus(data?.deactivated_at)

      if (!status.isDeactivated) {
        setWarning(null)
        return
      }

      if (status.isPastGrace) {
        await supabase.auth.signOut()
        if (isMounted) {
          navigate('/', { replace: true })
        }
        return
      }

      setWarning({ cutoffAt: status.cutoffAt })
    }

    check()
    const interval = window.setInterval(check, CHECK_INTERVAL_MS)

    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [navigate])

  return warning
}
