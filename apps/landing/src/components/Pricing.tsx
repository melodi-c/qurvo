import { qurvo } from '@qurvo/sdk-browser'

interface PricingProps {
  appUrl: string
}

const FREE_FEATURES = [
  'Тренды и воронки',
  'Анализ retention',
  'Пользовательские пути',
  'AI-ассистент',
  'Безлимит проектов и участников',
]

export function Pricing({ appUrl }: PricingProps) {
  return (
    <section id="pricing" className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Бесплатно, пока мы растём
          </h2>
          <p className="mt-3 text-muted-foreground">
            Сейчас все возможности доступны бесплатно. Платные планы появятся позже.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          {/* Free plan */}
          <div className="relative flex flex-col rounded-xl border border-ring bg-secondary/40 p-6 shadow-lg shadow-ring/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
              Открытая бета
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Free</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-4xl font-bold">0 ₽</span>
                <span className="text-sm text-muted-foreground">/ на время беты</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Все инструменты доступны бесплатно, пока идёт открытая бета.
              </p>
            </div>

            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-chart-2"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <a
              href={`${appUrl}/register`}
              className="mt-8 block rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => qurvo.track('cta_click', { cta: 'register', location: 'pricing' })}
            >
              Начать бесплатно
            </a>
          </div>

          {/* Coming soon */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-secondary/10 p-6 text-center">
            <div className="text-sm font-medium text-muted-foreground">Pro & Enterprise</div>
            <div className="mt-3 text-2xl font-bold">Скоро</div>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Платные планы с расширенными лимитами и возможностями появятся позже.
              Подпишитесь, чтобы не пропустить.
            </p>
            <a
              href="mailto:hello@qurvo.ru"
              className="mt-6 block rounded-md border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
              onClick={() => qurvo.track('cta_click', { cta: 'notify_launch', location: 'pricing' })}
            >
              Сообщить о запуске
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
