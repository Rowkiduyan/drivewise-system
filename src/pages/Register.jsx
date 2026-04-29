import { useState } from 'react'
import { Link } from 'react-router-dom'
import marvelLogo from '../assets/MarvelLogo.png'

const initialForm = {
  firstName: '',
  lastName: '',
  middleName: '',
  email: '',
  password: '',
  confirmPassword: ''
}

function Register() {
  const [formValues, setFormValues] = useState(initialForm)
  const [status, setStatus] = useState('empty')

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
      formValues.firstName.trim().length > 1 &&
      formValues.lastName.trim().length > 1 &&
      formValues.email.trim().length > 4 &&
      formValues.password.trim().length > 5 &&
      formValues.password === formValues.confirmPassword

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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.2),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(45,212,191,0.18),_transparent_45%)]" />
      <div className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-sky-300/40 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-teal-200/30 blur-[120px]" />

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

        <div className="w-full rounded-3xl border border-sky-200/70 bg-white p-6 shadow-ember sm:p-8">
          <div>
            <h2 className="font-display text-2xl font-semibold">Register</h2>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  First Name
                </label>
                <input
                  type="text"
                  name="firstName"
                  placeholder="Jordan"
                  value={formValues.firstName}
                  onChange={handleInputChange}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                    showError
                      ? 'border-red-400/70 bg-red-50'
                      : 'border-sky-200/70 bg-white'
                  }`}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Last Name
                </label>
                <input
                  type="text"
                  name="lastName"
                  placeholder="Smith"
                  value={formValues.lastName}
                  onChange={handleInputChange}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                    showError
                      ? 'border-red-400/70 bg-red-50'
                      : 'border-sky-200/70 bg-white'
                  }`}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Middle Name
                  <span className="ml-2 text-[10px] uppercase tracking-[0.24em] text-slate-400">
                    Optional
                  </span>
                </label>
                <input
                  type="text"
                  name="middleName"
                  placeholder="A."
                  value={formValues.middleName}
                  onChange={handleInputChange}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                    showError
                      ? 'border-red-400/70 bg-red-50'
                      : 'border-sky-200/70 bg-white'
                  }`}
                />
              </div>
            </div>

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
                className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                  showError
                    ? 'border-red-400/70 bg-red-50'
                    : 'border-sky-200/70 bg-white'
                }`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  placeholder="Create a password"
                  value={formValues.password}
                  onChange={handleInputChange}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                    showError
                      ? 'border-red-400/70 bg-red-50'
                      : 'border-sky-200/70 bg-white'
                  }`}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Confirm Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Re-enter password"
                  value={formValues.confirmPassword}
                  onChange={handleInputChange}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                    showError
                      ? 'border-red-400/70 bg-red-50'
                      : 'border-sky-200/70 bg-white'
                  }`}
                />
              </div>
            </div>

            {showError ? (
              <p className="rounded-2xl border border-red-400/40 bg-red-50 px-4 py-3 text-sm text-red-700">
                Please verify your details and confirm the password.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-ember transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-500/60"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Creating account
                </span>
              ) : (
                'Create Account'
              )}
            </button>

            <div className="flex items-center justify-center text-sm text-slate-500">
              <Link
                to="/"
                className="font-semibold text-sky-600 transition hover:text-sky-700"
              >
                Back to login
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}

export default Register
