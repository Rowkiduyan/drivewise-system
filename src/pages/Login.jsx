import { useMemo, useState } from 'react'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import marvelLogo from '../assets/MarvelLogo.png'

const initialForm = {
  email: '',
  password: ''
}

function Login() {
  const [formValues, setFormValues] = useState(initialForm)
  const [status, setStatus] = useState('empty')
  const [showPassword, setShowPassword] = useState(false)

  const formHint = useMemo(() => {
    if (status === 'error') {
      return 'Please enter a valid email and password.'
    }
    return ''
  }, [status])

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setFormValues((current) => ({ ...current, [name]: value }))
    if (status !== 'loading') {
      setStatus('empty')
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const isValid =
      formValues.email.trim().length > 4 &&
      formValues.password.trim().length > 5

    if (!isValid) {
      setStatus('error')
      return
    }

    setStatus('loading')
    setTimeout(() => {
      setStatus('empty')
    }, 1200)
  }

  const isLoading = status === 'loading'
  const showError = status === 'error'
  const inputBorderClass = showError
    ? 'border-red-300 bg-red-50'
    : 'border-slate-200 bg-white hover:border-slate-300'

  return (
    <main
      className="min-h-screen w-full bg-slate-50 text-slate-900 lg:flex"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-iron-950 via-slate-900 to-iron-950 px-6 py-12 sm:py-16 lg:w-1/2 lg:px-12 lg:py-0">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-ember-500/25 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 h-72 w-72 rounded-full bg-ember-400/20 blur-[110px]" />

        <div className="relative flex flex-col items-center text-center">
          <img
            src={marvelLogo}
            alt="Marvel Trucking Solutions Inc. logo"
            className="h-28 w-auto object-contain sm:h-32 lg:h-40"
          />
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-slate-300 sm:max-w-sm sm:text-base">
            Real-time fleet visibility and driver safety monitoring, in one dashboard.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-6 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <h1 className="font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to access your dashboard.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
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

            <div className="space-y-2">
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
    </main>
  )
}

export default Login
