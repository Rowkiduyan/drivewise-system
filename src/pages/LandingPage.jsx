function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.16),_transparent_55%),radial-gradient(circle_at_20%_60%,_rgba(253,186,116,0.16),_transparent_45%)]" />
      <div className="pointer-events-none absolute -top-28 right-0 h-72 w-72 rounded-full bg-amber-300/40 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-amber-200/30 blur-[120px]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-start justify-center gap-8 px-5 py-12 sm:px-8 lg:px-12">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-600">
            Guest Access
          </p>
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">
            Drivewise System
          </h1>
          <p className="max-w-xl text-base text-slate-600">
            Real-time fleet visibility and delivery coordination for clients,
            drivers, and supervisors.
          </p>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            'Track live deliveries with confidence.',
            'Coordinate with teams across locations.',
            'Make fast, informed decisions.'
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-amber-200/70 bg-white p-6 shadow-ember"
            >
              <p className="text-sm text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default LandingPage
