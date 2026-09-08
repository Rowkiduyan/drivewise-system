import marvelTrucks from '../layout/images/MarvelTrucks.png'
import marvelMonoLogo from '../layout/images/MLOGO.png'

function LandingPage() {
  const wordmarkStyle = 'gradient'

  const wordmarkPrimaryClass =
    wordmarkStyle === 'gradient'
      ? 'bg-gradient-to-r from-[#7e1609] via-[#f7a760] to-[#e64439] bg-clip-text text-transparent'
      : wordmarkStyle === 'accent'
        ? 'text-[#7e1609]'
        : wordmarkStyle === 'mixed'
          ? 'font-black text-[#7e1609]'
          : 'font-semibold text-[#7e1609]'

  const wordmarkSecondaryClass =
    wordmarkStyle === 'gradient'
      ? 'bg-gradient-to-r from-[#e64439] to-[#f7a760] bg-clip-text text-transparent'
      : wordmarkStyle === 'accent'
        ? 'text-[#e64439]'
        : wordmarkStyle === 'mixed'
          ? 'font-light text-[#e64439]'
          : 'text-[#e64439]'

  return (
    <main className="bg-white text-[#1c120f]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <section className="relative min-h-screen overflow-hidden">
        <img
          src={marvelTrucks}
          alt="Marvel fleet"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-white/50 to-white/40" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(230,68,57,0.12),_transparent_55%),radial-gradient(circle_at_70%_40%,_rgba(247,167,96,0.16),_transparent_50%)]" />

        <div className="relative flex min-h-screen w-full flex-col gap-12 px-5 pb-8 pt-0 sm:px-8 lg:px-12">
          <header
            className="sticky top-0 z-20 -mx-5 flex flex-wrap items-center justify-between gap-6 px-5 py-4 text-white sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
            style={{ backgroundColor: '#060300' }}
          >
            <div className="flex items-center gap-3">
              <img
                src={marvelMonoLogo}
                alt="Marvel"
                className="h-11 w-auto sm:h-14"
              />
              <div className="leading-tight">
                <p
                  className={`text-base uppercase tracking-[0.28em] ${wordmarkPrimaryClass} ${
                    wordmarkStyle === 'italic' ? 'italic' : ''
                  }`}
                >
                  Marvel Trucking
                </p>
                <p
                  className={`text-sm uppercase tracking-[0.36em] ${wordmarkSecondaryClass} ${
                    wordmarkStyle === 'italic' ? 'italic' : ''
                  }`}
                >
                  Solutions, Inc.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <nav className="flex items-center gap-5 text-sm uppercase tracking-[0.3em] text-white/85">
                {['Overview', 'Fleet', 'Services', 'Contact'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="transition hover:text-white"
                  >
                    {item}
                  </button>
                ))}
              </nav>
            </div>
          </header>

          <div className="flex min-h-[60vh] items-end">
            <div className="space-y-5">
              <p className="text-sm uppercase tracking-[0.3em] font-medium text-[#e64439]">
                Pasig City, Philippines
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-tight tracking-tight">
                <span className="bg-gradient-to-r from-[#7e1609] via-[#e64439] to-[#f7a760] bg-clip-text text-transparent">
                  Marvel Trucking Solutions, Inc.
                </span>
              </h1>
              <p className="max-w-3xl text-base md:text-lg text-[#4b2a25] leading-relaxed">
                Marvel Trucking Solutions, Inc. is a growing logistics and
                trucking provider delivering safe, reliable transport across
                Luzon for businesses of every size.
              </p>
              <button
                type="button"
                className="rounded-full bg-[#e64439] px-8 py-3 text-base font-semibold text-white transition hover:bg-[#cc3a31]"
              >
                Book Marvel
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default LandingPage
