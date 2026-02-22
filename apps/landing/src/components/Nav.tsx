import { useState } from 'react'
import { qurvo } from '@qurvo/sdk-browser'
import { QurvoLogo } from './QurvoLogo'

interface NavProps {
  appUrl: string
}

export function Nav({ appUrl }: NavProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <a href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <QurvoLogo className="h-6 w-6 text-primary" />
          Qurvo
        </a>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">Возможности</a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">Как это работает</a>
          <a href="#pricing" className="transition-colors hover:text-foreground">Цены</a>
          <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={`${appUrl}/login`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => qurvo.track('cta_click', { cta: 'login', location: 'nav' })}
          >
            Войти
          </a>
          <a
            href={`${appUrl}/register`}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => qurvo.track('cta_click', { cta: 'register', location: 'nav' })}
          >
            Начать бесплатно
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          className="flex flex-col gap-1.5 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Меню"
        >
          <span className={`block h-0.5 w-5 bg-foreground transition-transform ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
          <span className={`block h-0.5 w-5 bg-foreground transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 w-5 bg-foreground transition-transform ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t px-4 pb-4 md:hidden">
          <nav className="flex flex-col gap-3 pt-3 text-sm">
            <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => setMenuOpen(false)}>Возможности</a>
            <a href="#how-it-works" className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => setMenuOpen(false)}>Как это работает</a>
            <a href="#pricing" className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => setMenuOpen(false)}>Цены</a>
            <a href="#faq" className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => setMenuOpen(false)}>FAQ</a>
            <div className="mt-2 flex flex-col gap-2">
              <a
                href={`${appUrl}/login`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => qurvo.track('cta_click', { cta: 'login', location: 'mobile_nav' })}
              >
                Войти
              </a>
              <a
                href={`${appUrl}/register`}
                className="rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => qurvo.track('cta_click', { cta: 'register', location: 'mobile_nav' })}
              >
                Начать бесплатно
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
