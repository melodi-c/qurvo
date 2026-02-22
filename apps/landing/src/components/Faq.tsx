import { qurvo } from '@qurvo/sdk-browser'

const FAQS = [
  {
    q: 'Чем Qurvo отличается от Google Analytics?',
    a: 'Qurvo — это инструмент продуктовой аналитики на основе событий, а не веб-аналитики. Вы определяете важные события (регистрации, покупки, использование фич) и анализируете поведение пользователей через воронки, retention и пути — а не просто просмотры страниц.',
  },
  {
    q: 'Нужно ли хранить персональные данные?',
    a: 'Нет. По умолчанию Qurvo идентифицирует пользователей по анонимному ID. При желании можно привязать user ID или email после регистрации, но это не обязательно. События содержат только те свойства, которые вы явно передаёте.',
  },
  {
    q: 'Какие фреймворки поддерживает SDK?',
    a: 'Браузерный SDK работает с любым JavaScript-фреймворком — React, Vue, Svelte, Angular или обычный HTML. Также есть Node.js SDK для серверного трекинга.',
  },
  {
    q: 'Можно ли развернуть Qurvo на своём сервере?',
    a: 'Да. Весь стек (API, ingest, processor, дашборд) доступен в виде Docker-образов и может быть развёрнут на любом Kubernetes-кластере с помощью Helm-чарта.',
  },
  {
    q: 'Что будет, если я превышу лимит событий?',
    a: 'На плане Free события сверх месячного лимита отбрасываются, а не тарифицируются. Вы получите уведомление при достижении 80% лимита. Перейдите на Pro для увеличения лимитов.',
  },
  {
    q: 'Мои данные защищены?',
    a: 'Да. Данные хранятся в вашем собственном экземпляре ClickHouse и никогда не передаются третьим лицам и не используются для обучения AI-моделей.',
  },
]

export function Faq() {
  return (
    <section id="faq" className="border-t">
      <div className="mx-auto max-w-3xl px-4 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Часто задаваемые вопросы
          </h2>
        </div>

        <div className="mt-10 divide-y divide-border">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-4" onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                qurvo.track('faq_open', { question: item.q })
              }
            }}>
              <summary className="flex items-center justify-between gap-4 font-medium">
                {item.q}
                <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
