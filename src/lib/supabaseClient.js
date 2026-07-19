import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// "Remember Me" storage: when the login form's checkbox is unchecked, the
// session is written to sessionStorage instead of localStorage so it is
// cleared when the browser/tab closes, rather than persisting indefinitely.
// The `rememberMe` flag itself lives in localStorage so it survives reloads
// and is readable before Supabase restores the session on client init.
export const REMEMBER_ME_KEY = 'rememberMe'

const rememberMeStorage = {
  getItem: (key) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key, value) => {
    const rememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true'
    if (rememberMe) {
      sessionStorage.removeItem(key)
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
      sessionStorage.setItem(key, value)
    }
  },
  removeItem: (key) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: rememberMeStorage
  }
})

