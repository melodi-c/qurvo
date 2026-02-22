const STEPS = [
  {
    number: '01',
    title: 'Установите SDK',
    description:
      'Добавьте один пакет в ваше приложение. Работает с любым JavaScript-фреймворком — React, Vue, Node.js или обычный HTML.',
    code: 'npm install @qurvo/sdk-browser',
  },
  {
    number: '02',
    title: 'Отслеживайте события',
    description:
      'Вызывайте qurvo.track() там, где происходит что-то важное. Просмотры страниц отслеживаются автоматически.',
    code: "qurvo.track('signup_completed', { plan: 'pro' })",
  },
  {
    number: '03',
    title: 'Получайте инсайты',
    description:
      'Откройте дашборд и начните исследовать. Стройте воронки, графики retention и пути пользователей за секунды.',
    code: null,
  },
] as const

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Запуск за несколько минут
          </h2>
          <p className="mt-3 text-muted-foreground">
            Никаких сложных настроек, никаких data-пайплайнов.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.number} className="relative min-w-0">
              <div className="mb-4 text-5xl font-bold text-muted/60">{step.number}</div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              {step.code && (
                <pre className="mt-4 overflow-x-auto rounded-lg bg-secondary p-3 text-xs text-chart-2">
                  <code>{step.code}</code>
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
