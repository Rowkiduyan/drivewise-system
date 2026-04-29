import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import marvelLogo from '../assets/MarvelLogo.png'

const initialForm = {
  email: '',
  password: ''
}

function Login() {
  const [formValues, setFormValues] = useState(initialForm)
  const [status, setStatus] = useState('empty')

  const formHint = useMemo(() => {
    if (status === 'loading') {
      return ''
    }
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.2),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(251,146,60,0.18),_transparent_45%)]" />
      <div className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-ember-300/40 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-ember-200/30 blur-[120px]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center gap-6 px-5 py-4 sm:gap-8 sm:px-6 sm:py-10 lg:grid lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-6 lg:px-12 lg:py-12">
        <div className="flex flex-col items-center gap-8 text-center lg:items-start lg:text-left">
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <div className="w-fit px-8 py-6 sm:px-16 sm:py-12 lg:px-20 lg:py-16">
              <img
                src={marvelLogo}
                alt="Marvel Trucking Solutions Inc. logo"
                className="h-40 w-auto object-contain sm:h-56 lg:h-64"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <div className="w-full rounded-3xl border border-ember-200/70 bg-white p-6 shadow-ember sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">Login</h2>
              </div>
              <div className="hidden sm:block" />
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  placeholder="operator@marveltrucking.com"
                  value={formValues.email}
                  onChange={handleInputChange}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ember-400/60 ${
                    showError
                      ? 'border-red-400/70 bg-red-50'
                      : 'border-ember-200/70 bg-white'
                  }`}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  placeholder="Enter your secure password"
                  value={formValues.password}
                  onChange={handleInputChange}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ember-400/60 ${
                    showError
                      ? 'border-red-400/70 bg-red-50'
                      : 'border-ember-200/70 bg-white'
                  }`}
                />
              </div>

              <div className="flex items-center justify-center text-sm text-slate-500">
                <span className="flex items-center gap-2">
                  {formHint ? (
                    <span
                      className={`h-2 w-2 rounded-full ${
                        status === 'loading'
                          ? 'animate-pulse bg-ember-400'
                          : status === 'error'
                          ? 'bg-red-300'
                          : 'bg-ember-500'
                      }`}
                    />
                  ) : null}
                  {formHint}
                </span>
              </div>

              {showError ? (
                <p className="rounded-2xl border border-red-400/40 bg-red-50 px-4 py-3 text-sm text-red-700">
                  We could not verify your credentials. Double-check your
                  entries.
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-ember-500 px-4 py-3 text-sm font-semibold text-white shadow-ember transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:bg-ember-500/60"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Authenticating
                  </span>
                ) : (
                  'Log In'
                )}
              </button>

              <p className="text-center text-sm text-slate-500">
                New here?{' '}
                <Link
                  to="/register"
                  className="font-semibold text-ember-600 transition hover:text-ember-700"
                >
                  Register
                </Link>
              </p>

              <div className="flex flex-col gap-3 rounded-2xl border border-ember-200/70 bg-ember-50 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span className="uppercase tracking-[0.28em] text-ember-600">
                  UI States
                </span>
                <div className="flex flex-wrap gap-2">
                  {['empty', 'error', 'loading'].map((nextState) => (
                    <button
                      key={nextState}
                      type="button"
                      onClick={() => setStatus(nextState)}
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.24em] transition ${
                        status === nextState
                          ? 'border-ember-400/70 bg-ember-200/60 text-ember-700'
                          : 'border-ember-200/70 text-slate-500 hover:border-ember-300/80'
                      }`}
                    >
                      {nextState}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Login
