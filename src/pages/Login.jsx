import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { REMEMBER_ME_KEY, supabase } from '../lib/supabaseClient.js'
import { getDeactivationStatus } from '../lib/deactivation.js'
import logoMark from '../layout/images/Logoo.png'
import marvelEmployees from '../layout/images/MarvelEmployees.png'
import marvelTrucks1 from '../layout/images/MarvelTrucks1.png'
import marvelTrucks2 from '../layout/images/MarvelTrucks2.jpg'

const initialForm = {
  email: '',
  password: ''
}

const ROLE_HOME_ROUTES = {
  Admin: '/admin/user-management',
  Supervisor: '/supervisor/dashboard',
  Driver: '/driver/performance',
  Customer: '/customer/home'
}

// Looks up the signed-in user's role and resolves the portal route it maps
// to. Shared by the fresh sign-in flow and the on-mount persisted-session
// check so both redirect the same way.
async function resolveHomeRoute(userId) {
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('role, deactivated_at')
    .eq('id', userId)
    .single()

  if (userError || !userRow) {
    return { error: 'Unable to load your account. Please try again.' }
  }

  if (getDeactivationStatus(userRow.deactivated_at).isPastGrace) {
    return { error: 'Your account has been deactivated. Contact your administrator for help.' }
  }

  const homeRoute = ROLE_HOME_ROUTES[userRow.role]

  if (!homeRoute) {
    return { error: `The ${userRow.role} portal isn't available yet.` }
  }

  return { homeRoute }
}

function Login() {
  const navigate = useNavigate()
  const [formValues, setFormValues] = useState(initialForm)
  const [status, setStatus] = useState('empty')
  const [errorMessage, setErrorMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let isCurrent = true

    const restoreSession = async () => {
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user?.id

      if (!userId) {
        if (isCurrent) setCheckingSession(false)
        return
      }

      const { homeRoute } = await resolveHomeRoute(userId)

      if (!isCurrent) return

      if (homeRoute) {
        navigate(homeRoute, { replace: true })
        return
      }

      await supabase.auth.signOut()
      setCheckingSession(false)
    }

    restoreSession()

    return () => {
      isCurrent = false
    }
  }, [navigate])

  const formHint = useMemo(() => {
    if (status === 'error') {
      return errorMessage || 'Please enter a valid email and password.'
    }
    return ''
  }, [status, errorMessage])

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setFormValues((current) => ({ ...current, [name]: value }))
    if (status !== 'loading') {
      setStatus('empty')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const email = formValues.email.trim()
    const password = formValues.password.trim()
    const isValid = email.length > 4 && password.length > 5

    if (!isValid) {
      setErrorMessage('Please enter a valid email and password.')
      setStatus('error')
      return
    }

    setStatus('loading')

    localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false')

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setErrorMessage(authError.message || 'Invalid email or password.')
      setStatus('error')
      return
    }

    const { homeRoute, error: roleError } = await resolveHomeRoute(authData.user?.id)

    if (roleError) {
      await supabase.auth.signOut()
      setErrorMessage(roleError)
      setStatus('error')
      return
    }

    setStatus('empty')
    navigate(homeRoute, { replace: true })
  }

  const isLoading = status === 'loading'
  const showError = status === 'error'
  const inputBorderClass = showError
    ? 'border-red-300 bg-red-50'
    : 'border-slate-200 bg-white hover:border-slate-300'

  const slideshowImages = [
    { src: marvelTrucks1, alt: 'Marvel Trucking fleet truck 1' },
    { src: marvelEmployees, alt: 'Marvel Trucking employees' },
    { src: marvelTrucks2, alt: 'Marvel Trucking fleet truck 2' }
  ]

  if (checkingSession) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-ember-600" aria-hidden="true" />
      </main>
    )
  }

  return (
    <main
      className="relative flex min-h-screen w-full overflow-hidden bg-slate-50 text-slate-900 lg:flex-row"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center border-b border-white/10 bg-slate-950 px-4 lg:hidden">
        <img
          src={logoMark}
          alt="Marvel Trucking Solutions Inc. logo"
          className="h-8 w-auto object-contain"
        />
      </header>

      <div className="relative hidden min-h-0 flex-1 overflow-hidden bg-slate-950 px-5 py-5 lg:flex lg:w-1/2 lg:flex-none lg:px-8 lg:py-8">
        <div className="absolute inset-0">
          {slideshowImages.map((image, index) => (
            <img
              key={image.src}
              src={image.src}
              alt={image.alt}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                animation: 'loginSlideshowFade 18s ease-in-out infinite',
                animationDelay: `${index * 6}s`
              }}
            />
          ))}
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-0 bg-gradient-to-br from-black/35 via-black/20 to-black/60" />
        </div>

        <img
          src={logoMark}
          alt="Marvel Trucking Solutions Inc. logo"
          className="pointer-events-none absolute left-4 top-4 z-10 h-12 w-auto object-contain sm:left-5 sm:top-5 sm:h-14 lg:h-16"
        />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5 pb-6 pt-20 sm:px-6 sm:pb-8 sm:pt-24 lg:w-1/2 lg:flex-none lg:px-12 lg:py-8">
        <div className="w-full max-w-sm lg:max-w-md">
          <div className="mb-6 text-center lg:mb-8 lg:text-left">
            <h1 className="font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
              Welcome
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to continue to your account.
            </p>
          </div>

          <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5 sm:space-y-2">
              <label
                htmlFor="email"
                className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="operator@marveltrucking.com"
                  value={formValues.email}
                  onChange={handleInputChange}
                  aria-invalid={showError}
                  className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 focus:ring-offset-slate-50 ${inputBorderClass}`}
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Enter your secure password"
                  value={formValues.password}
                  onChange={handleInputChange}
                  aria-invalid={showError}
                  className={`w-full rounded-xl border py-3 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 focus:ring-offset-slate-50 ${inputBorderClass}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-ember-500"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-ember-600 focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 focus:ring-offset-slate-50"
              />
              Remember me
            </label>

            {showError ? (
              <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {formHint}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ember-600 to-ember-700 px-4 py-3 text-sm font-semibold text-white shadow-ember transition hover:from-ember-500 hover:to-ember-600 focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 focus:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Authenticating
                </>
              ) : (
                'Log In'
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes loginSlideshowFade {
          0% {
            opacity: 0;
            transform: scale(1.08);
          }

          10% {
            opacity: 1;
            transform: scale(1);
          }

          33.333% {
            opacity: 1;
            transform: scale(1);
          }

          43.333% {
            opacity: 0;
            transform: scale(1.08);
          }

          100% {
            opacity: 0;
            transform: scale(1.08);
          }
        }
      `}</style>
    </main>
  )
}

export default Login
