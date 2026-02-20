# PostHog vs Qurvo Analytics — UI/UX Сравнение

> Дата исследования: 2026-02-20
> Источники: GitHub posthog/posthog (ветка master), документация posthog.com, исходный код Qurvo Analytics

---

## Содержание

1. [Общая архитектура и философия](#1-общая-архитектура-и-философия)
2. [Навигация и Layout](#2-навигация-и-layout)
3. [Дизайн-система и UI компоненты](#3-дизайн-система-и-ui-компоненты)
4. [Дашборды](#4-дашборды)
5. [Insights / Аналитика](#5-insights--аналитика)
6. [Query Builder / Конструктор запросов](#6-query-builder--конструктор-запросов)
7. [Графики и визуализации](#7-графики-и-визуализации)
8. [Events (События)](#8-events-события)
9. [Persons (Пользователи)](#9-persons-пользователи)
10. [Cohorts (Когорты)](#10-cohorts-когорты)
11. [Data Management](#11-data-management)
12. [Дополнительные продукты PostHog (отсутствуют в Qurvo)](#12-дополнительные-продукты-posthog-отсутствуют-в-shot)
13. [Auth и Onboarding](#13-auth-и-onboarding)
14. [Стилистика и тема](#14-стилистика-и-тема)
15. [Формы и валидация](#15-формы-и-валидация)
16. [Таблицы](#16-таблицы)
17. [Loading States](#17-loading-states)
18. [Responsive Design](#18-responsive-design)
19. [Collaboration и Sharing](#19-collaboration-и-sharing)
20. [AI-интеграция](#20-ai-интеграция)
21. [Итоговая таблица отличий](#21-итоговая-таблица-отличий)
22. [Рекомендации по приоритетным улучшениям](#22-рекомендации-по-приоритетным-улучшениям)

---

## 1. Общая архитектура и философия

### PostHog
- **All-in-one платформа**: аналитика, session replay, feature flags, A/B тесты, опросы, heatmaps, data warehouse, CDP, error tracking, notebooks — всё в одном продукте
- **Целевая аудитория**: Product Engineers — технические специалисты, принимающие продуктовые решения
- **Событийная модель**: всё построено на событиях, включая identify, группы, feature flags
- **Open source**: MIT лицензия, self-hosted вариант
- **State management**: Kea (собственный Redux-подобный фреймворк) + kea-forms + kea-loaders + kea-router
- **Query-based архитектура**: единый компонент `<Query>` с декларативными запросами, сериализуемыми в URL
- **HogQL**: собственный SQL-диалект поверх ClickHouse, доступный везде

### Qurvo Analytics
- **Фокусированный инструмент**: продуктовая аналитика (trends, funnels, cohorts, events, persons)
- **Целевая аудитория**: разработчики и продуктовые команды
- **Событийная модель**: аналогичная PostHog (events → ClickHouse)
- **State management**: Zustand (для auth и dashboard state) + TanStack Query (для API запросов)
- **Императивный подход**: каждая страница строит свой UI вручную, нет единого Query-компонента
- **Нет SQL-интерфейса**: нет возможности писать произвольные запросы

### Ключевые отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Количество продуктов | 15+ | 5 (trends, funnels, cohorts, events, persons) |
| State manager | Kea | Zustand + TanStack Query |
| Query архитектура | Декларативная (Query nodes) | Императивная (хуки + API вызовы) |
| SQL доступ | HogQL (полноценный SQL) | Нет |
| Self-hosted | Да | Да |
| Зрелость UI | 280+ сцен, 50+ UI компонентов | ~20 страниц, ~30 компонентов |

---

## 2. Навигация и Layout

### PostHog
- **Двойная навигация**: вертикальная иконочная панель (45px collapsed / 215px expanded) + раскрываемые side-panels
- **Browser-like табы** вверху: drag-and-drop, pin/unpin, double-click rename, middle-click close, persist across sessions
- **Side Panel справа**: 14 типов контента (AI, Notebooks, Docs, Activity, Discussion, Support, Settings и др.)
- **Древовидная структура**: панели раскрываются в деревья (Products, Data Management, People, Project, Shortcuts)
- **Command Palette**: Cmd+K для поиска по всем сущностям проекта
- **Environment Switcher**: трёхуровневая иерархия Organization → Project → Environment с Fuse.js поиском
- **URL-структура**: `/project/:id/...` — проект в URL-пути
- **4 режима навигации**: full, minimal, zen, none
- **Scene абстракция**: 280+ именованных сцен с метаданными (layout, docs path, activity scope)
- **Breadcrumbs**: двухуровневые (app-level prefix + scene-specific suffix), inline rename поддержка

### Qurvo Analytics
- **Фиксированный sidebar** (220px): не сворачивается, нет мобильного меню
- **Нет табов**: одна страница = один вид
- **Нет Side Panel**: нет правой панели
- **Плоская навигация**: 2 группы (Product: 6 пунктов, Configure: 2 пункта)
- **Нет Command Palette**: нет быстрого поиска
- **Project Switcher внизу sidebar**: dropdown с проектами, переключение через `?project=<uuid>` в query-строке
- **URL-структура**: `/trends`, `/events` — проект передаётся через query param
- **Нет режимов навигации**: всегда одинаковый layout
- **Breadcrumbs**: только в PersonDetailPage и EditorHeader

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Sidebar | Сворачиваемый, древовидный | Фиксированный 220px |
| Табы | Browser-like, drag & drop | Нет |
| Side Panel | 14 типов | Нет |
| Command Palette | Cmd+K | Нет |
| Breadcrumbs | Полноценные, inline rename | Только в 2 местах |
| Мобильное меню | Да (коллапс) | Нет |
| Keyboard shortcuts | Cmd+B, Cmd+K, Cmd+Shift+F | Нет |
| Project в URL | Path-based `/project/:id/` | Query param `?project=` |

---

## 3. Дизайн-система и UI компоненты

### PostHog — Lemon UI
- **50+ кастомных компонентов** с префиксом `Lemon`
- **Паттерн `disabledReason`**: все disabled-состояния ТРЕБУЮТ объяснения (показывается в tooltip). Используется `aria-disabled` вместо нативного `disabled`
- **3D Chrome эффект на кнопках**: `::before` рамка + `::after` фон + box-shadow, hover "поднимает" кнопку, press "вдавливает"
- **Анимированные слайдеры**: для Tabs и SegmentedButton — подсветка плавно скользит к выбранному элементу
- **LemonTable**: сортировка, пагинация (auto/manual), expandable rows, sticky columns, row ribbon, cell actions, column groups, row status highlight
- **LemonModal**: `hasUnsavedInput` блокирует overlay-close с tilt-shake анимацией, z-index стекирование (1161-1169)
- **LemonToast**: react-toastify, автотрекинг warning/error, "Get help" кнопка для ошибок, пасхалка с IconGift на Рождество
- **LemonBanner**: CSS Container Queries для адаптивности, AI-тип с градиентной рамкой
- **LemonField**: интеграция с kea-forms, showOptional, info tooltip, help text, error с иконкой
- **LemonSkeleton**: shimmer анимация, варианты Text/Row/Circle/Button, fade для повторяющихся элементов
- **CSS архитектура**: SCSS модули + Tailwind v4 + CSS Custom Properties

### Qurvo Analytics — shadcn/ui
- **~15 shadcn-компонентов** (Radix UI + cva): Button, Badge, Card, Input, Label, Select, Dialog, DropdownMenu, Popover, Command, Table, Skeleton, Tooltip, Separator, Sonner
- **~15 кастомных компонентов**: DataTable, ConfirmDialog, PageHeader, EmptyState, InlineCreateForm, ListSkeleton, GridSkeleton, EditorHeader, Metric, PillToggleGroup, DateRangeSection, Breadcrumbs и др.
- **Стандартный `disabled`**: нет паттерна disabledReason
- **Нет 3D эффектов**: плоские кнопки
- **Нет анимированных слайдеров**: статичные переключатели
- **Простой DataTable**: нет сортировки по колонкам, нет expandable rows, нет sticky columns
- **Простой Dialog**: нет защиты от случайного закрытия
- **Sonner toast**: без автотрекинга, без "Get help"
- **CSS**: Tailwind v4 + CSS Custom Properties, нет SCSS

### Отличия
| Аспект | PostHog (Lemon UI) | Qurvo Analytics (shadcn) |
|--------|-------------------|----------------------|
| Компонентов | 50+ | ~30 |
| Дизайн-система | Собственная, зрелая | shadcn/ui + кастомные |
| disabledReason | Обязателен | Стандартный disabled |
| Кнопки | 3D chrome эффект | Плоские |
| Анимации | Богатые (slider, shimmer, tilt-shake) | Минимальные |
| Таблицы | Сортировка, expand, sticky, cell actions | Только базовый рендер |
| Формы | kea-forms, LemonField | Нативный HTML |
| Иконки | @posthog/icons (отдельный пакет) | lucide-react |

---

## 4. Дашборды

### PostHog
- **react-grid-layout**: 12 колонок, `rowHeight: 80px`, два breakpoint (sm: 1024px / xs: 1 колонка)
- **Drag & drop с автоскроллом**: при перетаскивании к краям контейнера
- **Resize handles**: юг, восток, юго-восток (только юг на мобильных)
- **Два типа тайлов**: InsightCard (визуализации) + TextCard (markdown аннотации)
- **4 режима дашборда**: View, Edit, Fullscreen, Sharing
- **6 контекстов размещения**: Dashboard, ProjectHomepage, Public, Export, FeatureFlag, Group
- **Создание из шаблонов**: каталог шаблонов с переменными, поиск, превью
- **Добавление инсайтов**: быстрое создание (Trend/Funnel/Retention) + поиск существующих
- **Edit Bar**: глобальные фильтры дашборда (DateFilter, PropertyFilters, BreakdownFilter, HogQL Variables), auto-preview для ≤5 тайлов
- **Header**: inline editable name + description + tags, 15+ действий (Share, Export PNG/JSON, Terraform, Create notebook, Subscribe, Fullscreen и др.)
- **Export**: PNG, JSON, Terraform HCL
- **Шаринг**: публичные ссылки, iframe embed, подписки (Email, Slack), авто-обновление каждый час

### Qurvo Analytics
- **react-grid-layout**: 12 колонок, `rowHeight: 80px`, margin [12, 12]
- **Drag & drop**: через drag-handle (иконка GripVertical), только в edit-режиме
- **Один тип тайла**: WidgetCard (Trend или Funnel insight)
- **2 режима**: View, Edit
- **Нет шаблонов**: создание только пустых дашбордов
- **Добавление инсайтов**: Dialog с поиском по существующим Trend/Funnel инсайтам
- **Нет Edit Bar**: нет глобальных фильтров дашборда
- **Header**: Input для названия, кнопки Add Widget + Cancel
- **SaveBar**: фиксированная плашка внизу "Unsaved changes" + Discard + Save
- **Нет экспорта**: нет PNG/JSON/CSV
- **Нет шаринга**: нет публичных ссылок, нет подписок

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Типы тайлов | Insight + Text | Только Insight (Trend/Funnel) |
| Шаблоны | Каталог с переменными | Нет |
| Глобальные фильтры | Date, Properties, Breakdown, Variables | Нет |
| Export | PNG, JSON, Terraform | Нет |
| Sharing | Public links, iframe, email, Slack | Нет |
| Fullscreen mode | Да | Нет |
| Text cards (markdown) | Да | Нет |
| Автоскролл при drag | Да | Нет |

---

## 5. Insights / Аналитика

### PostHog
- **10 типов insights**: Trends, Funnels, Retention, User Paths, Stickiness, Lifecycle, Hog, SQL, Web Analytics, Custom JSON
- **Unified Insight Editor**: единый редактор с переключением типов через табы, при переключении сохраняет и восстанавливает параметры (series, filters, date range)
- **Insight как первоклассная сущность**: может быть на нескольких дашбордах одновременно, имеет свой URL, историю версий, комментарии
- **AI Analysis**: автоматическое описание трендов и аномалий (за feature flag)
- **Drill down**: клик по точке данных → список пользователей → создание когорты → session replay → профиль

### Qurvo Analytics
- **2 типа insights**: Trends, Funnels
- **Отдельные редакторы**: `trend-editor.tsx` и `funnel-editor.tsx` — два отдельных файла с общим хуком `useInsightEditor`
- **Insight привязан к одному дашборду**: нет переиспользования между дашбордами (виджет — это ссылка на insight)
- **Нет AI Analysis**
- **Нет drill down**: нельзя кликнуть по точке и увидеть пользователей

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Типов insights | 10 | 2 (Trends, Funnels) |
| Retention | Да (таблица + график) | Нет |
| User Paths | Да (Sankey-визуализация) | Нет |
| Stickiness | Да | Нет |
| Lifecycle | Да (New/Returning/Resurrecting/Dormant) | Нет |
| SQL/HogQL | Да | Нет |
| Web Analytics | Да (отдельный продукт) | Нет |
| Формулы | Да (A/B, A+B, etc.) | Нет |
| Drill down to persons | Да | Нет |
| AI Analysis | Да | Нет |

---

## 6. Query Builder / Конструктор запросов

### PostHog
- **Серийный подход**: пользователь добавляет серии (A, B, C...) с событиями, каждая серия имеет свою агрегацию и inline-фильтры
- **Агрегации**: Total count, Unique users, WAU, MAU, Count per user (avg/min/max/median/percentiles), Unique sessions, Property value (sum/avg/min/max/median/p90/p95/p99)
- **Формулы**: математические выражения для комбинирования серий (A/B, A+B и т.д.)
- **PropertyGroupFilters (AND/OR)**: многоуровневая фильтрация с группами
- **Breakdown**: разбивка до 3 свойств одновременно, типы: event, person, group, session, hogql, data_warehouse, cohort
- **Attribution types (для funnels)**: First touchpoint, Last touchpoint, All steps, Specific step
- **TaxonomicFilter**: древовидный поиск по всем свойствам (event, person, session, cohort, HogQL expression, data warehouse)
- **Compare**: сравнение с предыдущим периодом
- **Smoothing**: 7-дневное / 28-дневное скользящее среднее
- **Inline combination**: объединение нескольких событий в одну серию (OR)
- **AI-ассистент (MaxTool)**: создание запросов на естественном языке

### Qurvo Analytics
- **Серийный подход**: до 5 серий, каждая серия — одно событие
- **Агрегации**: через select "Metric" (конкретные опции зависят от API)
- **Нет формул**
- **Нет AND/OR групп**: фильтры только линейные
- **Breakdown**: одно текстовое поле для ввода свойства
- **Нет attribution types**
- **Нет TaxonomicFilter**: простой combobox для выбора событий
- **Compare**: checkbox "Compare to previous period" (пунктирные линии)
- **Нет smoothing**
- **Нет AI-ассистента**
- **StepFilterRow (funnels)**: свойство + оператор + значение, операторы is_set/is_not_set скрывают поле value

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Серий | Без ограничений | До 5 |
| Агрегации | 15+ вариантов | Ограниченный набор |
| Формулы | Да (A/B, A+B...) | Нет |
| Фильтры | AND/OR группы, многоуровневые | Линейные |
| Breakdown | До 3, 8 типов | 1, текстовое поле |
| Smoothing | 7d / 28d | Нет |
| AI query builder | Да | Нет |
| Attribution | 4 типа | Нет |
| Property search | TaxonomicFilter (древовидный) | Простой combobox |

---

## 7. Графики и визуализации

### PostHog
- **Основная библиотека**: Chart.js + плагины (annotation, datalabels, stacked100, trendline)
- **Дополнительно**: D3.js (World Map, Histogram, Paths)
- **18 типов визуализаций**:
  1. Line Graph (linear)
  2. Line Graph (cumulative)
  3. Area Graph
  4. Bar Chart (stacked)
  5. Bar Chart (unstacked)
  6. Horizontal Bar
  7. Pie Chart
  8. Bold Number (с трендом)
  9. Table
  10. World Map (SVG)
  11. Region Map
  12. Calendar Heatmap
  13. 2D Heatmap
  14. Histogram
  15. Funnel Bar Vertical
  16. Funnel Bar Horizontal
  17. Retention Graph
  18. Retention Table (треугольная)
- **Доверительные интервалы**: confidence intervals с настраиваемым уровнем
- **Trend lines**: линии тренда
- **Goal lines**: пороговые линии
- **Incomplete data segments**: пунктирная линия для незавершённых периодов
- **Y-axis**: unit picker (numeric, duration, percentage, currency), log scale
- **Multiple Y-axes**: поддержка нескольких осей Y
- **Percent stack view**: процентное распределение
- **Data labels**: подписи точек данных

### Qurvo Analytics
- **Основная библиотека**: Recharts (LineChart, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip)
- **5 типов визуализаций**:
  1. Line Chart (Recharts)
  2. Bar Chart (Recharts)
  3. Funnel Bar Chart (кастомный CSS/div, не Recharts)
  4. Funnel Breakdown Chart (CSS/div)
  5. Metric числа (KPI-карточки)
- **Compare**: пунктирные линии для предыдущего периода
- **Незавершённый период**: пунктирная линия через двойной ResponsiveContainer overlay
- **Интерактивная легенда**: клик скрывает/показывает серии (opacity + strikethrough)
- **Compact mode**: уменьшенная версия для виджетов дашборда
- **Tooltip**: стилизованный под тему
- **Нет**: confidence intervals, trend lines, goal lines, world map, pie, retention, heatmap, histogram

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Библиотека | Chart.js + D3.js | Recharts |
| Типов визуализаций | 18 | 5 |
| Pie Chart | Да | Нет |
| World Map | Да (SVG, D3) | Нет |
| Calendar Heatmap | Да | Нет |
| Retention Table | Да (треугольная) | Нет |
| Confidence intervals | Да | Нет |
| Trend lines | Да | Нет |
| Goal lines | Да | Нет |
| Log scale | Да | Нет |
| Multiple Y-axes | Да | Нет |
| Incomplete data | Пунктир (Chart.js) | Пунктир (overlay hack) |

---

## 8. Events (События)

### PostHog
- **Query-based таблица**: единый компонент `<Query>` с `DataTableNode` + `EventsQuery`
- **Сериализация в URL**: запрос сохраняется в query-параметре `q` — можно делиться ссылкой
- **Конфигурируемые колонки**: пользователь выбирает какие колонки показывать
- **Сохранённые запросы**: можно сохранить конфигурацию
- **10 табов при раскрытии**: properties, metadata, flags, $set_properties, $set_once_properties, raw (JSON), elements, image, error_display, conversation (AI)
- **Create Action from Event**: создание Action прямо из события
- **Фильтрация**: PropertyFilters с TaxonomicFilter
- **Дефолт**: последний час
- **Live Events**: SSE-стрим в реальном времени, polling 1500ms, буфер 100 событий, pause/resume, filter by event name, live counters

### Qurvo Analytics
- **Ручная таблица**: CSS Grid (`grid-cols-[20px_1fr_160px_80px]`)
- **Нет сериализации в URL**: фильтры не сохраняются в URL
- **Фиксированные колонки**: Event, Person (опционально), When
- **Нет сохранённых запросов**
- **2 таба при раскрытии**: Event (сгруппированные секции: Location, Page, Device, Identity, SDK, Custom) + Person (user_properties)
- **Нет Create Action**
- **Фильтрация**: 2 текстовых Input (event_name, distinct_id) без дебаунса
- **Нет Live Events**: нет реального времени
- **Цветовые иконки событий**: $pageview (синяя Globe), $pageleave (оранжевая LogOut), $identify (фиолетовая UserCheck), $set (зелёная UserPen), $screen (голубая Smartphone), остальные (янтарная Zap)

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Подход | Query-based | Ручная таблица |
| URL serialization | Да | Нет |
| Колонки | Конфигурируемые | Фиксированные |
| Saved queries | Да | Нет |
| Event detail tabs | 10 | 2 |
| Live Events | SSE, реальное время | Нет |
| Create Action | Да | Нет |
| Фильтрация | TaxonomicFilter | 2 текстовых input |
| Пагинация | Серверная с limit | offset + hasMore |

---

## 9. Persons (Пользователи)

### PostHog
- **Query-based таблица**: `ActorsQuery` через `<Query>`
- **Table Views**: сохранённые конфигурации таблицы
- **10+ табов в профиле**: Profile (Canvas/Notebook), Properties, Events, Recordings, Exceptions, Surveys, Cohorts, Related groups, Feature flags, History
- **Notebook-based профиль**: Canvas на основе Notebook-движка с кастомными карточками
- **Revenue данные**: MRR, revenue из persons_revenue_analytics
- **30-дневная статистика**: session_count, event_count, last_seen (HogQL запрос)
- **Inline editing свойств**: редактирование/удаление properties прямо в профиле
- **Split IDs**: разделение distinct_ids через модал
- **Merge restrictions**: отображение ограничений identify
- **Launch Toolbar**: запуск toolbar с feature flag overrides пользователя

### Qurvo Analytics
- **DataTable**: typed generic-таблица с колонками: Identifier (mono), Name, Email, First Seen, Last Seen
- **Нет Table Views**
- **Профиль**: 2 карточки (Profile + Properties) + Event History
- **Profile карточка**: Person ID (mono), Identifiers (badges), First/Last Seen
- **Properties карточка**: grid key/value пар user_properties
- **Event History**: EventTable с пагинацией
- **Нет inline editing свойств**
- **Нет Split IDs**
- **Нет session recordings**
- **Нет feature flags**

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Табов в профиле | 10+ | Нет табов (2 карточки + events) |
| Table Views | Да | Нет |
| Inline editing | Да | Нет |
| Session recordings | Да | Нет |
| Revenue данные | Да | Нет |
| Feature flags per person | Да | Нет |
| Related groups | Да | Нет |
| Activity history | Да | Нет |
| Split/Merge IDs | Да | Нет |
| Notebook-based profile | Да | Нет |

---

## 10. Cohorts (Когорты)

### PostHog
- **Два типа**: Dynamic (автообновление по критериям) + Static (CSV-загрузка)
- **Criteria Groups (AND/OR)**: визуальный конструктор с группами критериев
- **5 категорий критериев**: Behavioral (5 подтипов), Person Properties (2), Lifecycle (4), Cohort Membership (2), Aggregation (7)
- **Temporal операторы**: In the last N days/weeks/months, Between dates, Before/After date
- **Calculation History**: история пересчётов когорты
- **Фильтры в списке**: Search, Type (All/Static/Dynamic), Created by
- **Действия**: Edit, View session recordings, Export CSV (important columns / all columns), Delete, Duplicate
- **Использование везде**: insights, фильтры дашбордов, feature flags, эксперименты, опросы

### Qurvo Analytics
- **Один тип**: Dynamic (по условиям)
- **Два типа условий**: Person property (property + operator + value) + Performed event (event_name + count_operator + count + time_window_days)
- **Match toggle**: ALL / ANY (PillToggleGroup)
- **Preview count**: debounced (800ms), POST-запрос при изменении условий
- **Нет Calculation History**
- **Нет фильтров в списке**
- **Минимальные действия**: Edit, Delete

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Типы когорт | Dynamic + Static | Только Dynamic |
| Criteria groups | AND/OR многоуровневые | ALL/ANY линейные |
| Типов критериев | 20+ | 2 (property, event) |
| Temporal операторы | 4 типа | Только time_window_days |
| CSV загрузка | Да (Static cohorts) | Нет |
| Export | CSV | Нет |
| Calculation History | Да | Нет |
| Lifecycle критерии | Да (New/Returning/Resurrecting/Dormant) | Нет |

---

## 11. Data Management

### PostHog
- **Центральный раздел** с 12+ вкладками: Event definitions, Actions, Properties, Property Groups, Annotations, Comments, History, Revenue, Core events, Ingestion warnings, Marketing, SQL variables
- **Event Definitions**: описание, теги, verification status (Verified/Hidden/Visible), property groups, associated insights, connected destinations, matching events
- **Property Definitions**: типизация (String, Numeric, Boolean, DateTime), теги, верификация
- **Actions**: агрегация событий (autocapture, pageview, screen, custom), ретроактивное применение
- **Schema Management**: определение структуры событий до захвата, Property Groups
- **Annotations**: markdown заметки к датам, отображаются на графиках
- **Ingestion Warnings**: предупреждения о проблемах приёма данных
- **Activity Log**: полная история изменений с Monaco Diff Editor (JSON diff)

### Qurvo Analytics
- **Нет Data Management раздела**
- **Нет Event Definitions**: события не документируются
- **Нет Property Definitions**: свойства не типизируются
- **Нет Actions**: нет агрегации событий
- **Нет Annotations**: нет заметок на графиках
- **Нет Activity Log**: нет истории изменений
- **Нет Schema Management**

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Data Management раздел | 12+ вкладок | Отсутствует |
| Event Definitions | Полноценные (описание, теги, verification) | Нет |
| Property typing | Да | Нет |
| Actions | Да | Нет |
| Annotations | Да | Нет |
| Activity Log | Да (с JSON diff) | Нет |
| Schema Management | Да | Нет |

---

## 12. Дополнительные продукты PostHog (отсутствуют в Qurvo)

PostHog включает множество продуктов, которых нет в Qurvo Analytics:

### Feature Flags
- Создание/управление/таргетинг feature flags
- Release conditions с rollout percentage (LemonSlider 0-100%)
- Multivariate flags с вариантами (A/B/C...)
- Scheduling: планирование включения/выключения
- Stale detection: "Not called in 30+ days"
- JSON payload per variant
- Шаблоны: simple, targeted, multivariate
- View session recordings per variant

### Experiments (A/B Testing)
- Standard (code-based) + Web (no-code) эксперименты
- Wizard для создания с гипотезой, вариантами, метриками
- Statistical significance
- Winning variant probability
- Duration calculator
- AI-суммаризация результатов
- Shared Metrics, Holdouts

### Session Recording
- rrweb-based воспроизведение сессий
- Inspector: events, console, network, performance
- Keyboard shortcuts (Space, Arrow, F, C, S, X, T, M, 0-9)
- Comments привязанные к моменту записи
- Clips creation
- Playlists и Collections
- Mobile replay поддержка
- APM (Performance monitoring)

### Surveys
- 5 типов вопросов: Open, Rating, SingleChoice, MultipleChoice, Link
- Rating шкалы: 2-point thumbs, 3-point emoji, 5/7-point Likert, 10-point NPS
- Branching logic (условные переходы)
- Targeting: URL, device, properties, feature flags
- Appearance customization: colors, fonts, position
- Schedule: start/end dates, repeat
- Drag-and-drop вопросов (@dnd-kit)

### Heatmaps
- Iframe-based browser с overlay heatmap
- Viewport chooser: 320-1920px
- Save/Load heatmaps
- Export as PNG
- Integration with Toolbar

### Web Analytics
- Отдельный дашборд с тайлами
- 20+ tile IDs (Overview, Graphs, Paths, Sources, Devices, Geography, etc.)
- Live metrics
- Web Vitals
- Session Attribution Explorer
- Marketing analytics

### Data Pipelines (CDP)
- 30+ Sources (PostgreSQL, Stripe, Shopify, Google Ads и др.)
- 40+ Destinations (Salesforce, Slack, Webhooks и др.)
- Transformations
- Batch Exports/Imports

### Notebooks
- TipTap/ProseMirror rich text editor
- 25+ типов embed-нод (Query, Recording, Flag, Experiment, Person и др.)
- Slash commands
- Table of Contents
- History, Sharing, Templates
- Scratchpad mode
- Canvas mode

### Error Tracking
- Отдельная сцена для ошибок

### Toolbar
- Визуальный инструмент встраиваемый в сайт пользователя
- Heatmaps, Actions, Feature Flags, Inspect, Web Vitals, Experiments

---

## 13. Auth и Onboarding

### PostHog
- **Множество методов**: Email/password, SSO, SAML, 2FA (TOTP)
- **Трёхуровневая иерархия**: Organization → Project → Environment
- **Роли**: Owner, Admin, Member (org) + Manager, Editor, Viewer (resource)
- **Granular access control**: права на уровне конкретных ресурсов
- **Onboarding wizard**: Install SDK → Send Events → Identify Users → Data Import
- **Приглашения**: 3-дневный срок действия, уведомления
- **2FA enforcement**: на уровне организации
- **Project Notices**: баннеры (demo project, no events, invite teammates, unverified email)

### Qurvo Analytics
- **Email/password**: единственный метод (argon2 для хеширования)
- **Одноуровневая**: User → Projects (через project_members)
- **Нет ролей**: только `user !== null`
- **Нет granular access control**
- **Нет onboarding wizard**: после регистрации — пустой дашборд
- **Нет приглашений**: нет team management
- **Нет 2FA**
- **Auth UI**: fullscreen centered Card, max-w-md, inline error (не toast)

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Auth методы | Email, SSO, SAML, 2FA | Только email/password |
| Иерархия | Org → Project → Environment | User → Projects |
| Роли | Owner/Admin/Member + 4 resource-level | Нет ролей |
| Onboarding | Multi-step wizard | Нет |
| Team management | Приглашения, роли | Нет |
| 2FA | Да (TOTP) | Нет |

---

## 14. Стилистика и тема

### PostHog
- **Light + Dark mode**: переключение через атрибут `theme="dark"` на body
- **Цвета**: oklch() палитра, 22 цветовые гаммы по 11 оттенков
- **Brand**: Orange primary (#f54e00 light / Yellow #f7a503 dark)
- **Нейтральные**: теплые серые с желтоватым оттенком (PostHog 3000 palette)
- **15 data colors**: для серий графиков
- **Шрифты**: Inter (основной) + MatterSQ (заголовки)
- **Shadows**: 3D-эффект на кнопках
- **Z-index система**: строго упорядоченная (16 уровней от 5 до 9999)
- **Tailwind v4** + SCSS модули + CSS Custom Properties

### Qurvo Analytics
- **Dark-only**: нет светлой темы, нет переключателя
- **Цвета**: HSL/hex, ограниченная палитра
- **Background**: `#09090b`, Sidebar: `#0f0f11` (чуть светлее)
- **5 chart colors**: terracotta, teal, dark-blue, yellow, peach
- **5 series colors**: blue-600, emerald-600, amber-500, violet-500, rose-500
- **Шрифт**: системный стек (system-ui, -apple-system, sans-serif)
- **Нет 3D-эффектов**: плоский дизайн
- **Нет формализованной z-index системы**
- **Tailwind v4** + CSS Custom Properties (нет SCSS)

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Темы | Light + Dark | Dark only |
| Палитра | oklch(), 22 гаммы | Ограниченная HSL/hex |
| Data colors | 15 | 5 |
| Шрифт | Inter + MatterSQ | Системный стек |
| 3D эффекты | Да (кнопки) | Нет |
| Z-index система | 16 уровней | Нет системы |
| SCSS | Да (модули) | Нет |

---

## 15. Формы и валидация

### PostHog
- **kea-forms**: полноценная интеграция с state manager
- **LemonField**: label + info tooltip + help text + error с иконкой + showOptional
- **Валидация через Kea**: `errors` selectors, `isFormValid`, `formValidationErrors`
- **disabledReason**: обязательное объяснение disabled-состояний
- **LemonDialog.openForm()**: императивные формы в диалогах
- **Cmd+Enter submit**: быстрое сохранение в модалках/формах

### Qurvo Analytics
- **Нативный HTML**: `<form onSubmit>`, `required`, `type="email"`, `minLength`
- **useState для ошибок**: `const [error, setError] = useState<string>()`
- **isValid inline**: `name.trim() !== '' && series.length > 0`
- **Стандартный disabled**: `disabled={!isValid || isSaving}`
- **Нет form library**: нет react-hook-form, нет zod
- **Нет field-level errors**: только общая ошибка

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Form library | kea-forms | Нативный HTML |
| Field-level errors | Да (LemonField) | Нет |
| Validation schema | Kea selectors | Inline isValid |
| disabledReason | Обязателен | Стандартный disabled |
| Form dialogs | LemonDialog.openForm() | Нет |
| Keyboard submit | Cmd+Enter | Enter (через form) |

---

## 16. Таблицы

### PostHog — LemonTable
- **Сортировка**: по колонкам, три состояния (asc → desc → unsorted), URL-синхронизация
- **Пагинация**: auto (клиентская) + manual (серверная с onBackward/onForward)
- **Expandable rows**: раскрываемые строки с кастомным контентом
- **Sticky columns**: с тенью при скролле
- **Row ribbon**: цветная полоса слева
- **Row status**: highlighted (полужирный + фон), highlight-new (анимация появления)
- **Column groups**: группировка колонок с общим заголовком
- **Cell actions**: контекстное меню ячейки
- **Column filters**: dropdown фильтры в заголовке колонки + badge с количеством
- **Loading**: swooping анимированная полоска + overlay с 50% opacity
- **Embedded/stealth**: варианты без рамок
- **Size**: xs, small, medium

### Qurvo Analytics — DataTable
- **Нет сортировки по колонкам**
- **Пагинация**: Prev/Page N/Next, offset-based
- **Нет expandable rows** (есть в EventTable, но это отдельный компонент)
- **Нет sticky columns**
- **Нет row ribbon/status**
- **Нет column groups**
- **Нет cell actions**
- **Нет column filters**
- **Loading**: ListSkeleton (повторяющиеся прямоугольники)
- **Один вариант**: стандартный

### Отличия
| Аспект | PostHog (LemonTable) | Qurvo Analytics (DataTable) |
|--------|---------------------|---------------------------|
| Сортировка | По колонкам, 3 состояния | Нет |
| Пагинация | Auto + Manual | Только Manual |
| Expandable rows | Да | Нет (только в EventTable) |
| Sticky columns | Да | Нет |
| Row ribbon | Да | Нет |
| Cell actions | Да | Нет |
| Column filters | Да | Нет |
| Loading animation | Swooping bar + overlay | Skeleton placeholder |
| Variants | xs/small/medium, embedded/stealth | Одна |

---

## 17. Loading States

### PostHog
- **SpinnerOverlay**: полноэкранный overlay с Spinner (или IconPencil в editing режиме)
- **LemonTableLoader**: тонкая swooping анимированная полоска для таблиц
- **LoadingBar**: детерминированная полоса с atan-кривой замедления
- **LemonSkeleton**: shimmer анимация, варианты Text/Row/Circle/Button, fade для повторяющихся, `@media (prefers-reduced-motion)`
- **Button loading**: Spinner внутри кнопки
- **Switch loading**: Spinner внутри ручки переключателя
- **Spinner captureTime**: автоматический трекинг длительности показа

### Qurvo Analytics
- **ListSkeleton**: вертикальный список прямоугольников (events, persons, API keys)
- **GridSkeleton**: 3-колонная сетка скелетонов (dashboards, projects)
- **Skeleton**: базовый компонент (в редакторах: метрики + чарт)
- **"Loading..." text**: в ProtectedRoute и Dashboard builder
- **Loader2 animate-spin**: в cohort preview
- **Button text**: `{isSaving ? 'Saving…' : 'Save'}`
- **Loader2 на кнопке**: в ConfirmDialog

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Spinner overlay | Да | Нет |
| Animated bar loader | Да (swooping) | Нет |
| Deterministic progress | Да (atan-кривая) | Нет |
| Skeleton варианты | Text/Row/Circle/Button | List/Grid/Basic |
| prefers-reduced-motion | Да | Нет |
| Button spinner | SVG inside button | Text change |
| Spinner tracking | Да (captureTime) | Нет |

---

## 18. Responsive Design

### PostHog
- **Breakpoints**: 576/768/992/1200/1600px (SCSS + CSS custom properties)
- **SCSS mixin**: `@mixin screen($breakpoint)`
- **CSS Container Queries**: для LemonBanner и других компонентов
- **Sidebar**: сворачиваемый (215px → 45px), мобильный offset
- **Табы**: адаптивные gap (gap-x-4 md:gap-x-8)
- **Touch**: `touch-action: manipulation` на body
- **Responsive панели**: desktop vs mobile layouts хранятся отдельно

### Qurvo Analytics
- **Ограниченная адаптивность**: только `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- **Нет мобильного меню**: sidebar фиксирован 220px
- **Фиксированные панели**: 360px / 420px в редакторах
- **Нет Container Queries**
- **Нет touch-action**
- **Рассчитано на десктоп**: широкий экран

### Отличия
| Аспект | PostHog | Qurvo Analytics |
|--------|---------|---------------|
| Breakpoints | 5 уровней | 3 (md, lg) |
| Container Queries | Да | Нет |
| Mobile sidebar | Сворачиваемый | Фиксированный |
| Touch support | Да | Нет |
| Mobile-first | Да | Desktop-only |
| Editor panels | Адаптивные | Фиксированная ширина |

---

## 19. Collaboration и Sharing

### PostHog
- **Публичные ссылки**: любой insight/дашборд можно расшарить
- **Iframe embed**: встраивание с настройкой размеров, auto-resize через PostMessage
- **Email подписки**: insight'ы/дашборды по расписанию
- **Slack интеграция**: отправка в каналы через PostHog Slack App
- **Notebooks**: collaborative analytics документы (аналог Jupyter/Notion)
- **Comments**: на session replays, привязка к моменту времени
- **Annotations**: заметки к датам, видны на графиках
- **Terraform**: управление дашбордами как IaC
- **Activity Log**: история всех изменений с JSON diff

### Qurvo Analytics
- **Нет публичных ссылок**
- **Нет embed**
- **Нет подписок**
- **Нет Slack интеграции**
- **Нет Notebooks**
- **Нет Comments**
- **Нет Annotations**
- **Нет Terraform**
- **Нет Activity Log**

---

## 20. AI-интеграция

### PostHog
- **MaxTool (AI assistant)**: встроен в EditorFilters, Surveys, Experiments
- **Natural language queries**: "Show me users who..." → генерация AssistantTrendsQuery/FunnelsQuery/RetentionQuery/HogQLQuery
- **AI Insight Analysis**: автоматическое описание трендов и аномалий
- **AI Summarization**: суммаризация результатов экспериментов
- **Session Replay AI summarization**: суммаризация session recordings
- **LLM Analytics**: отдельный продукт для AI/LLM мониторинга
- **MCP Support**: Model Context Protocol для интеграции с AI-ассистентами

### Qurvo Analytics
- **Нет AI-интеграции**

---

## 21. Итоговая таблица отличий

| Категория | PostHog | Qurvo Analytics | Разрыв |
|-----------|---------|---------------|--------|
| **Продукты** | 15+ | 5 | Критический |
| **UI компоненты** | 50+ (Lemon UI) | ~30 (shadcn + custom) | Большой |
| **Типы insights** | 10 | 2 | Критический |
| **Визуализации** | 18 типов | 5 типов | Критический |
| **Навигация** | Tabs + Side Panel + Command Palette | Фиксированный sidebar | Большой |
| **Таблицы** | Sort, expand, sticky, cell actions | Базовый рендер | Большой |
| **Фильтры** | AND/OR группы, Taxonomic, HogQL | Линейные, текстовые input | Большой |
| **Дашборды** | Шаблоны, text cards, export, sharing | Базовые, без экспорта | Большой |
| **Events** | Query-based, 10 табов, Live | Ручная таблица, 2 таба | Средний |
| **Persons** | 10+ табов, inline edit, canvas | 2 карточки + events | Большой |
| **Cohorts** | Dynamic+Static, 20+ критериев | Dynamic, 2 критерия | Средний |
| **Data Management** | 12+ вкладок | Нет | Критический |
| **Auth** | SSO, SAML, 2FA, roles | Email/password | Средний |
| **Тема** | Light + Dark | Dark only | Малый |
| **Responsive** | 5 breakpoints, mobile | Desktop-only | Средний |
| **Collaboration** | Share, embed, subscriptions, notebooks | Нет | Критический |
| **AI** | MaxTool, Analysis, Summarization | Нет | Средний |
| **Forms** | kea-forms, LemonField | Нативный HTML | Средний |
| **Loading** | 7 типов, анимации | 3 типа, базовые | Малый |

---

## 22. Рекомендации по приоритетным улучшениям

На основе анализа, вот приоритезированный список улучшений для Qurvo Analytics:

### Приоритет 1 — Основная аналитика (критический разрыв)
1. **Retention insight** — треугольная таблица удержания + линейный график когорт
2. **Lifecycle insight** — New/Returning/Resurrecting/Dormant сегментация
3. **Drill down to persons** — клик по точке данных → список пользователей
4. **Формулы в trends** — A/B, A+B для комбинирования серий
5. **Больше визуализаций** — Pie Chart, Bold Number, Table view

### Приоритет 2 — UX улучшения (большой разрыв)
6. **AND/OR фильтры** — PropertyGroupFilters вместо линейных
7. **Breakdown улучшения** — множественные breakdowns, выбор через combobox вместо текстового ввода
8. **Сортировка в таблицах** — по колонкам с URL-синхронизацией
9. **Expandable rows в DataTable** — раскрываемые строки
10. **Event detail** — больше табов (raw JSON, metadata, flags)

### Приоритет 3 — Дашборды (большой разрыв)
11. **Глобальные фильтры дашборда** — Date + Property filters
12. **Text cards** — markdown аннотации на дашборде
13. **Export дашборда** — PNG, JSON
14. **Шаблоны дашбордов** — каталог готовых шаблонов
15. **Больше типов виджетов** — Retention, Lifecycle, Bold Number

### Приоритет 4 — Навигация (большой разрыв)
16. **Command Palette** — Cmd+K для быстрого поиска
17. **Breadcrumbs** — на всех страницах, не только в 2 местах
18. **Keyboard shortcuts** — хотя бы базовые (Cmd+K, Cmd+B)
19. **Sidebar collapse** — возможность свернуть sidebar

### Приоритет 5 — Data Management (критический, но менее срочный)
20. **Event Definitions** — описания, теги, verification status
21. **Property Definitions** — типизация свойств
22. **Annotations** — заметки к датам на графиках
23. **Activity Log** — история изменений

### Приоритет 6 — Collaboration (критический, но менее срочный)
24. **Public sharing** — публичные ссылки на дашборды/insights
25. **Export** — CSV/PNG для данных и графиков
26. **Light theme** — светлая тема (или переключатель)

### Приоритет 7 — Дополнительные продукты (долгосрочный)
27. **Live Events** — SSE-стрим событий в реальном времени
28. **Feature Flags** — базовый функционал
29. **Session Recording** — запись и воспроизведение сессий
30. **Surveys** — опросы пользователей

---

> **Примечание**: PostHog — зрелый продукт с ~6 годами разработки и командой 100+ человек. Сравнение показывает целевое состояние, а не обязательные немедленные улучшения. Фокус на приоритетах 1-3 даст наибольший эффект для пользователей Qurvo Analytics.
