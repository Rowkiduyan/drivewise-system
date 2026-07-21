import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'

function deriveInitials(firstName, lastName) {
  const first = firstName?.trim()?.charAt(0) || ''
  const last = lastName?.trim()?.charAt(0) || ''
  const initials = (first + last).toUpperCase()
  return initials || '?'
}

// Shared by every sidebar layout (Admin/Supervisor/Driver/Customer) to show
// the signed-in user's initials from their own *_records row (first_name +
// last_name) rather than the Auth email — the client can't read *_records
// directly (service_role only, see DATABASE.md), so this goes through the
// admin-users Edge Function's get-own-profile action.
export function useUserInitials() {
  const [initials, setInitials] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadInitials() {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'get-own-profile' }
      })

      if (!isMounted || error) {
        return
      }

      setInitials(deriveInitials(data.profile.first_name, data.profile.last_name))
    }

    loadInitials()

    return () => {
      isMounted = false
    }
  }, [])

  return initials
}
