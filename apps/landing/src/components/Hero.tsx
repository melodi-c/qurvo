import { qurvo } from '@qurvo/sdk-browser'

interface HeroProps {
  appUrl: string
}

export function Hero({ appUrl }: HeroProps) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 text-center md:py-36">
      <div className="mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground">
        Открытая бета — бесплатно, пока мы строим
      </div>

      <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
        Продуктовая аналитика,{' '}
        <span className="bg-gradient-to-r from-chart-1 to-chart-5 bg-clip-text text-transparent">
          которая реально работает
        </span>
      </h1>

      <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
        Отслеживайте события, анализируйте воронки, понимайте пользовательские
        пути и получайте AI-инсайты — без корпоративных цен и сложности.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <a
          href={`${appUrl}/register`}
          className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => qurvo.track('cta_click', { cta: 'register', location: 'hero' })}
        >
          Начать бесплатно
        </a>
        <a
          href="#how-it-works"
          className="rounded-md border px-6 py-3 font-medium text-foreground transition-colors hover:bg-secondary"
          onClick={() => qurvo.track('cta_click', { cta: 'how_it_works', location: 'hero' })}
        >
          Как это работает
        </a>
      </div>

      {/* Dashboard mock */}
      <div className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-xl border shadow-2xl shadow-chart-1/5">
        <div className="flex h-8 items-center gap-2 border-b bg-secondary/60 px-4">
          <span className="h-3 w-3 rounded-full bg-destructive/60" />
          <span className="h-3 w-3 rounded-full bg-chart-4/60" />
          <span className="h-3 w-3 rounded-full bg-chart-2/60" />
          <span className="ml-4 text-xs text-muted-foreground">app.qurvo.ru</span>
        </div>
        <div className="bg-gradient-to-br from-secondary/60 to-background p-6 md:p-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Пользователи', value: '12 847' },
              { label: 'События сегодня', value: '284K' },
              { label: 'Retention', value: '68.3%' },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border bg-secondary/40 p-4">
                <div className="text-xs text-muted-foreground">{m.label}</div>
                <div className="mt-1 text-xl font-semibold md:text-2xl">{m.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-secondary/40 p-4">
              <div className="mb-3 text-xs text-muted-foreground">Тренды — Просмотры страниц</div>
              <div className="flex items-end gap-1.5">
                {[40, 55, 45, 65, 50, 75, 60, 80, 70, 90, 85, 95].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-chart-1/70"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg border bg-secondary/40 p-4">
              <div className="mb-3 text-xs text-muted-foreground">Воронка — Регистрация</div>
              <div className="space-y-2">
                {[
                  { step: 'Зашёл на сайт', pct: 100 },
                  { step: 'Нажал «Регистрация»', pct: 64 },
                  { step: 'Заполнил форму', pct: 41 },
                  { step: 'Подтвердил email', pct: 28 },
                ].map((s) => (
                  <div key={s.step}>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{s.step}</span>
                      <span className="text-foreground">{s.pct}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-chart-2"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
