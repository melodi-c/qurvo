import { qurvo } from '@qurvo/sdk-browser'
import { QurvoLogo } from './QurvoLogo'

interface FooterProps {
  appUrl: string
}

const LINKS = {
  Продукт: [
    { label: 'Возможности', href: '#features' },
    { label: 'Цены', href: '#pricing' },
  ],
  Разработчикам: [
    { label: 'SDK — Browser', href: 'https://www.npmjs.com/package/@qurvo/sdk-browser' },
    { label: 'SDK — Node.js', href: 'https://www.npmjs.com/package/@qurvo/sdk-node' },
  ],
  Компания: [
    { label: 'Контакты', href: 'mailto:hello@qurvo.ru' },
  ],
}

export function Footer({ appUrl }: FooterProps) {
  return (
    <footer className="border-t bg-secondary/10">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <a href="/" className="flex items-center gap-2 text-lg font-semibold">
              <QurvoLogo className="h-6 w-6 text-primary" />
              Qurvo
            </a>
            <p className="mt-2 text-sm text-muted-foreground">
              Продуктовая аналитика для современных команд.
            </p>
            <a
              href={`${appUrl}/register`}
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => qurvo.track('cta_click', { cta: 'register', location: 'footer' })}
            >
              Начать бесплатно
            </a>
          </div>

          {Object.entries(LINKS).map(([section, links]) => (
            <div key={section}>
              <div className="text-sm font-medium">{section}</div>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t pt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Qurvo. Все права защищены.
        </div>
      </div>
    </footer>
  )
}
