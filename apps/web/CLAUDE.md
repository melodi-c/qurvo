# Web App — UI Design System

## Commands

```bash
pnpm --filter @qurvo/web dev                # dev-режим (port 5173)
pnpm --filter @qurvo/web build              # production сборка
pnpm --filter @qurvo/web storybook          # dev-режим Storybook (port 6006)
pnpm --filter @qurvo/web build-storybook    # production билд Storybook
```

## Theme & Tokens

Dark-only theme defined in `src/index.css` via Tailwind v4 `@theme`. Key tokens:

| Token | Value | Usage |
|---|---|---|
| `--color-background` | `#09090b` | Page background |
| `--color-foreground` | `#fafafa` | Default text |
| `--color-primary` | `#fafafa` | Primary actions, accented text |
| `--color-secondary` | `#27272a` | Secondary surfaces |
| `--color-muted` | `#27272a` | Muted surfaces, skeleton bg |
| `--color-muted-foreground` | `#a1a1aa` | Subdued text, labels |
| `--color-destructive` | `#7f1d1d` | Danger actions |
| `--color-sidebar` | `#0f0f11` | Sidebar and topbar background |
| `--color-border` | `#27272a` | Borders |
| `--radius` | `0.5rem` | Border radius base |
| `--topbar-height` | `44px` | Mobile topbar height. Use `var(--topbar-height)` instead of hardcoded `44px` |

## Utility

- `cn()` from `src/lib/utils.ts` — combines `clsx` + `tailwind-merge`. Use in every component that accepts `className`.
- `extractApiErrorMessage(err, fallback)` from `src/lib/utils.ts` — extracts message from API errors (axios-style or plain Error). Use in catch blocks instead of ad-hoc casts.

## Atomic UI Components (`src/components/ui/`)

### Shadcn-based (Radix + cva)

| Component | File | Key Props | When to use |
|---|---|---|---|
| `Button` | `button.tsx` | `variant`: default/destructive/outline/secondary/ghost/link, `size`: default/xs/sm/lg/icon/icon-xs/icon-sm/icon-lg, `asChild` | All interactive actions. Use `asChild` with `<Link>` for navigation buttons |
| `Badge` | `badge.tsx` | `variant`: default/secondary/destructive/outline/ghost/link | Inline labels, status indicators, event type tags |
| `Card` | `card.tsx` | Compound: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | Content containers, list items, form wrappers |
| `Input` | `input.tsx` | Standard `<input>` props | Form fields, search bars, inline editors |
| `Label` | `label.tsx` | Standard label props | Form field labels (use with `htmlFor`) |
| `Select` | `select.tsx` | Compound: `Select`, `SelectTrigger` (`size`: sm/default), `SelectContent`, `SelectItem`, `SelectValue` | Dropdown selectors in query panels |
| `Dialog` | `dialog.tsx` | Compound: `Dialog`, `DialogTrigger`, `DialogContent` (`showCloseButton`), `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` (`showCloseButton`), `DialogClose` | Modal dialogs, confirmations |
| `DropdownMenu` | `dropdown-menu.tsx` | Full Radix set. `DropdownMenuItem` has `variant`: default/destructive | Context menus, action menus, selectors |
| `Popover` | `popover.tsx` | Compound: `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription` | Floating panels, combobox containers |
| `Command` | `command.tsx` | Built on `cmdk`. Compound: `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem` | Searchable selection lists (inside Popover for combobox pattern) |
| `Table` | `table.tsx` | Semantic: `Table`, `TableHeader`, `TableBody`, `TableHead`, `TableRow`, `TableCell` | When you need the raw shadcn table primitives |
| `Skeleton` | `skeleton.tsx` | `className` | Loading placeholders. Prefer `ListSkeleton` or `GridSkeleton` for repeated items |
| `Tooltip` | `tooltip.tsx` | Compound: `Tooltip`, `TooltipTrigger`, `TooltipContent`. `TooltipProvider` is mounted at app root | Button hints, metric explanations |
| `Separator` | `separator.tsx` | `orientation`: horizontal/vertical | Visual dividers between sections |
| `Toaster` (sonner) | `sonner.tsx` | Mounted once in `App.tsx` | Use `toast.success()`, `toast.error()` from `sonner` for notifications |

### Custom Components

| Component | File | Key Props | When to use |
|---|---|---|---|
| `DataTable<T>` | `data-table.tsx` | `columns: Column<T>[]`, `data: T[]`, `rowKey`, `onRowClick?`, `className?`, `page?`, `onPageChange?`, `hasMore?` | Generic typed table for list pages. Optional built-in pagination via `page`/`onPageChange`/`hasMore` props — renders inside the table border |
| `ConfirmDialog` | `confirm-dialog.tsx` | `open`, `onOpenChange`, `title`, `description?`, `confirmLabel?`, `cancelLabel?`, `variant?`, `onConfirm` | Destructive action confirmation. Handles async confirm with loading spinner. Never use native `confirm()` or `alert()` |
| `PageHeader` | `page-header.tsx` | `title: string`, `children?` (action slot) | Page title with optional action button. Use on every top-level page |
| `EmptyState` | `empty-state.tsx` | `icon`, `title?`, `description`, `action?`, `className?` | Empty/placeholder states. Without `title` — compact style (icon + text). With `title` — icon in circle + heading + description + optional action |
| `InlineCreateForm` | `inline-create-form.tsx` | `placeholder`, `value`, `onChange`, `isPending`, `onSubmit`, `onCancel`, `submitLabel?`, `pendingLabel?`, `autoFocus?` | Quick create forms that appear inline (projects, dashboards, api-keys) |
| `ListSkeleton` | `list-skeleton.tsx` | `count?` (default 3), `height?` (default "h-16"), `className?` | Loading skeleton for list pages |
| `GridSkeleton` | `grid-skeleton.tsx` | `count?` (default 3), `height?` (default "h-24"), `className?` | Loading skeleton for card grid pages (projects, dashboards) |
| `TablePagination` | `table-pagination.tsx` | `page`, `onPageChange`, `hasMore`, `className?` | Previous/Next pagination. Prefer using DataTable's built-in `page`/`onPageChange`/`hasMore` props instead of standalone usage |
| `EditorHeader` | `editor-header.tsx` | `backPath`, `backLabel`, `name`, `onNameChange`, `placeholder`, `onSave`, `isSaving`, `isValid`, `saveError?` | Editor page header with breadcrumbs (`backLabel > name input`) + save/discard buttons. Use for all editor pages (trends, funnels, cohorts) |
| `Metric` | `metric.tsx` | `label`, `value`, `accent?` | Large numeric display for KPIs in editor results panels |
| `MetricsDivider` | `metrics-divider.tsx` | — | Vertical divider between `Metric` components in editor metrics bar |
| `EditorSkeleton` | `editor-skeleton.tsx` | `metricCount?` (default 2), `children?` | Loading skeleton for editor pages. Shows metric placeholders + optional custom body (defaults to single 300px skeleton). Funnel editor uses custom `children` for its unique skeleton shape |
| `SectionHeader` | `section-header.tsx` | `icon: ElementType`, `label` | Uppercase section labels with icon in query panels |
| `PillToggleGroup` | `pill-toggle-group.tsx` | `options: { label, value }[]`, `value`, `onChange`, `className?` | Toggle between small set of options (chart type, match mode). Renders pill-shaped buttons |
| `TabNav` | `tab-nav.tsx` | `tabs: { id, label }[]`, `value`, `onChange`, `className?` | Underline-style tab navigation. Active tab has white bottom border. Use for page-level tab switching (settings, event detail). Generic `<T extends string>` for type-safe tab IDs |
| `DateRangeSection` | `date-range-section.tsx` | `dateFrom`, `dateTo`, `onChange(from, to)` | Date range picker with preset buttons (7d/30d/90d/6m/1y) + date inputs. Use in query panels |
| `CohortFilterSection` | `cohort-filter-section.tsx` | `value: string[]`, `onChange(cohortIds)` | Cohort multi-select filter with section header. Use in query panels |
| `BreakdownSection` | `breakdown-section.tsx` | `value: string`, `onChange(value)` | Breakdown property input with section header. Use in query panels |
| `Breadcrumbs` | `breadcrumbs.tsx` | `items: BreadcrumbItem[]`, `className?` | Navigation breadcrumbs. Each item has `label` + optional `path`. Last item renders as plain text, rest as links. Use in editor headers |
| `ClickableListRow` | `clickable-list-row.tsx` | `icon`, `title`, `subtitle`, `onClick`, `onDelete?` | Clickable list row with icon, title, subtitle, and optional hover-delete button. Use for any list of clickable items with delete (dashboards, AI conversations) |
| `RequireProject` | `require-project.tsx` | `children`, `icon?`, `description?` | Wrapper that shows `EmptyState` when no project is selected. Use instead of inline `{!projectId && <EmptyState>}` checks |
| `ProjectMemberRow` | `project-member-row.tsx` | `avatar?`, `name`, `subtitle?`, `actions?`, `className?` | Row with avatar/icon + name + subtitle + action buttons. Use in member lists and invite lists |
| `QueryPanelShell` | `query-panel-shell.tsx` | `children` | Shared `<aside>` wrapper for all query panels (trend, funnel, retention, lifecycle, stickiness, paths, cohorts). Provides responsive layout + scrollable container. Use instead of inline `<aside className="...">` |

## Shared Components (`src/components/`)

| Component | File | Key Props | When to use |
|---|---|---|---|
| `InsightEditorLayout` | `InsightEditorLayout.tsx` | `queryPanel`, `isConfigValid`, `showSkeleton`, `isEmpty`, `isFetching`, `skeleton`, `metricsBar`, `children`, `configureIcon/Title/Description`, `noResultsIcon/Title/Description`, `chartClassName?` + EditorHeader props | Shared layout for all insight editor pages. Wraps EditorHeader + QueryPanel + main area with 4 conditional states (configure, loading, empty, results). All 6 editor pages use this |
| `ErrorBoundary` | `ErrorBoundary.tsx` | `children`, `fallback?` | React error boundary. Wraps WidgetShell children and AppRoutes. Catches render errors with retry button |
| `EventNameCombobox` | `EventNameCombobox.tsx` | `value`, `onChange`, `placeholder?`, `className?` | Searchable event name selector (Popover + Command). Used across all widgets, cohort rows, filter panels |
| `PropertyNameCombobox` | `PropertyNameCombobox.tsx` | `value`, `onChange`, `propertyNames`, `descriptions?`, `className?` | Searchable property name selector. **Must be used for ALL property selection UI** — filters, breakdowns, metric properties, cohort aggregation properties. Never use plain `Input` or `Select` for property selection |
| `StepFilterRow` | `StepFilterRow.tsx` | `filter`, `onChange`, `onRemove`, `propertyNames?`, `propertyDescriptions?` | Property filter row (property + operator + value). Also exports `NO_VALUE_OPS` set. Used in QueryItemCard, FilterListSection |
| `FilterListSection` | `FilterListSection.tsx` | `label`, `addLabel`, `filters`, `onFiltersChange`, `propertyNames?`, `propertyDescriptions?`, `icon?` | Self-contained filter list with add/update/remove logic, SectionHeader, and "Add filter" button. Encapsulates the repeated pattern from EventsFilterPanel, PersonsFilterPanel, DashboardFilterBar |
| `EventTypeIcon` | `EventTypeIcon.tsx` | `eventName: string` | Event type icon by event name ($pageview, $identify, etc.). Used in EventTable, EventDetail |
| `CrudListPage<T>` | `crud-list-page.tsx` | `title`, `icon`, `basePath`, `newLabel`, `entityLabel`, `columns`, `data`, `isLoading`, `onDelete`, `emptyTitle`, `emptyDescription`, `showEmptyAction?` | Generic CRUD list page with PageHeader, EmptyState, ListSkeleton, DataTable, and ConfirmDialog delete. Automatically adds name + actions columns. Use for trends, funnels, cohorts |
| `EventTable` | `event-table.tsx` | `events: EventLike[]`, `showPerson?`, `projectId`, `page`, `onPageChange`, `hasMore`, `className?` | Expandable event list with header, rows, and pagination. Used on events page and person-detail |
| `EventDetail` | `event-detail.tsx` | `event`, `projectId` | Expanded event detail panel with tabs (Event/Person properties). Rendered inside `EventTable` expanded row |
| `PropsTable` / `PropsTableGrouped` | `event-props-table.tsx` | `rows: PropEntry[]` / `groups: { label, rows }[]` | Key-value property tables. Used internally by `EventDetail` |

## Shared Hooks (`src/hooks/`)

| Hook | File | Signature | When to use |
|---|---|---|---|
| `useProjectId` | `use-project-id.ts` | `() => string` | Read current project ID from `:projectId` URL path param via `useParams()`. Canonical source — use instead of local `useParams().projectId` |
| `useEventPropertyNames` | `use-event-property-names.ts` | `(eventName?) => { data: string[], descriptions: Record }` | Fetch property names (optionally filtered by event). Returns flat names + description map. Use with `PropertyNameCombobox` |
| `useDebounce<T>` | `use-debounce.ts` | `(value: T, delay: number) => T` | Debounce any value (search input, form state hash). Returns debounced copy after `delay` ms of inactivity |
| `useConfirmDelete` | `use-confirm-delete.ts` | `() => { isOpen, itemId, itemName, requestDelete, close }` | Manages confirm dialog state for delete actions. Pair with `ConfirmDialog` component |
| `useDragReorder<T>` | `use-drag-reorder.ts` | `(items: T[], onChange: (items: T[]) => void) => { dragIdx, overIdx, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave }` | Reorderable lists via native HTML5 drag events. Used in FunnelStepBuilder and TrendSeriesBuilder |
| `useFilterManager<T>` | `use-filter-manager.ts` | `(items: T[], updateItem) => { addFilter, updateFilter, removeFilter }` | Shared filter CRUD for items with `filters?: StepFilter[]`. Used by TrendSeriesBuilder and FunnelStepBuilder |
| `usePersonPropertyNames` | `use-person-property-names.ts` | `() => { data: string[], descriptions: Record }` | Fetch person property names. Returns flat names + description map. Use with `PropertyNameCombobox` for person property selection |
| `useDebouncedHash<T>` | `use-debounced-hash.ts` | `(value: T, delay: number) => { debounced: T, hash: string }` | Returns debounced value and its JSON hash. Replaces repeated `useDebounce` + `useMemo(JSON.stringify)` pattern |
| `useInlineEdit<TRow, TValues>` | `use-inline-edit.ts` | `(options: { rowKey, getInitialValues, onSave }) => { editingKey, editValues, setEditValues, isEditing, startEdit, cancelEdit, saveEdit }` | Generic inline row editing state. Used in `EventPropertiesSection` |
| `usePersonDetail` | `use-person-detail.ts` | `() => { person, personLoading, personError, events, eventsLoading, eventsError, page, setPage, limit }` | Data hook for person detail page |
| `useEvents` | `use-events.ts` | `(filterState, page) => { projectId, events, isLoading, isError, limit }` | Data hook for events page with debounced filters |
| `useUrlTab<T>` | `use-url-tab.ts` | `(defaultTab: T, validTabs?: readonly T[]) => [T, (tab: T) => void]` | URL-synced tab state with validation. Replaces boilerplate `useSearchParams` + manual tab logic. Used in settings, profile, cohort-editor |
| `useTimeToConvertState` | `use-time-to-convert-state.ts` | `(stepCount: number) => { fromStep, setFromStep, toStep, setToStep }` | Manages from/to step selection for time-to-convert view with auto-clamping. Used in funnel editor |

## Feature Hooks (`src/features/`)

**Canonical hooks live in `src/hooks/`**. Always import from `@/hooks/` for new code.

| Hook | File | Signature | When to use |
|---|---|---|---|
| `useInsightEditor<T>` | `features/insights/hooks/use-insight-editor.ts` | `(options) => { name, setName, config, setConfig, isNew, isSaving, saveError, listPath, handleSave, insightId, projectId }` | Shared editor state for trend/funnel insight pages. Handles name, config, load from existing, create/update mutations, save with error handling. `cleanConfig` is optional (defaults to identity) — only pass it when config needs transformation before save |
| `createWidgetDataHook` | `features/dashboard/hooks/create-widget-data-hook.ts` | `<Config, Response>(options) => useHook(config, widgetId)` | Factory for creating widget data fetching hooks. Handles projectId, auto-refresh, stale data detection, refresh limiter. All widget hooks (useTrendData, useFunnelData, etc.) use this factory |
| `createTargetEventHook` | `features/dashboard/hooks/create-target-event-hook.ts` | `<Config extends BaseTargetEventConfig, Response, Params>(options) => useHook(config, widgetId)` | Specialized factory on top of `createWidgetDataHook` for target-event widgets (lifecycle, stickiness, retention). Provides shared `configHash`, `buildParams`, `isEnabled`. Accepts optional `extraHash`/`extraParams` for widget-specific fields (e.g. retention's `retention_type`, `periods`) |
| `useFunnelTimeToConvertData` | `features/dashboard/hooks/use-funnel-time-to-convert.ts` | `(config: TimeToConvertConfig, widgetId) => { data, isLoading, isFetching }` | Time-to-convert histogram data for funnel editor. Uses `createWidgetDataHook`. Config extends `FunnelWidgetConfig` with `from_step`/`to_step` |
| `useAiChat` | `features/ai/hooks/use-ai-chat.ts` | `() => { messages, conversationId, isStreaming, error, sendMessage, loadConversation, ... }` | SSE streaming chat hook for AI assistant. Manages message state, streaming, pagination |
| `useConversations` | `features/ai/hooks/use-ai-conversations.ts` | `(projectId: string) => UseQueryResult<Conversation[]>` | Fetches AI conversation list for a project |
| `useDeleteConversation` | `features/ai/hooks/use-ai-conversations.ts` | `(projectId: string) => UseMutationResult` | Deletes an AI conversation and invalidates the list |

## Shared Utilities (`src/lib/`)

| Module | File | Exports | When to use |
|---|---|---|---|
| Chart colors | `chart-colors.ts` | `CHART_COLORS_HEX`, `CHART_COLORS_HSL`, `CHART_COMPARE_COLORS_HSL`, `CHART_FORMULA_COLORS_HSL`, `CHART_COLORS_TW`, `WEB_METRIC_COLORS`, `CHART_TOOLTIP_STYLE`, `CHART_AXIS_TICK_COLOR`, `CHART_GRID_COLOR`, `chartAxisTick(compact?)`, `STATUS_COLORS`, `EVENT_TYPE_COLORS`, `FUNNEL_LEGEND_COLORS` | Single source of truth for all chart/visualization colors and Recharts styles. Use `STATUS_COLORS` for semantic indicators (positive/negative/warning/success). Use `EVENT_TYPE_COLORS` for event type icons. Use `FUNNEL_LEGEND_COLORS` for funnel step conversion/drop-off. Never hardcode color values in components |
| Date utils | `date-utils.ts` | `todayIso()`, `daysAgoIso(days)`, `defaultDateRange()` | Date helpers for ISO strings. Use `defaultDateRange()` for default 30-day range in widget configs. Never define local date helpers in components |
| Formatting | `formatting.ts` | `formatDate(iso)`, `formatBucket(bucket, granularity, compact?)`, `formatSeconds(s)`, `formatRelativeTime(iso)`, `eventBadgeVariant(eventName)`, `formatGranularity(count, granularity)`, `formatCompactNumber(n)` | Shared formatting for chart axes, durations, dates, relative timestamps, event badge variants, and locale-aware granularity pluralization (day/week/month). Use `formatDate(iso)` instead of `new Date(x).toLocaleDateString()` — it respects the user's selected language via `getLocale()`. Use `formatCompactNumber` as `tickFormatter` on YAxis in compact/dashboard chart mode — renders `<1000` as-is, `>=1000` as `"1.2K"`, `>=1M` as `"4.5M"`. Import instead of defining local formatters. `compact` mode produces shorter labels for dashboard widgets |
| Filter utils | `filter-utils.ts` | `isValidFilter(f: StepFilter)`, `parseFilters(raw: string \| null)` | Validates a StepFilter (non-empty property, non-empty value unless operator is `is_set`/`is_not_set`). `parseFilters` safely parses JSON filter arrays from URL params. Use in query functions to strip incomplete filters before API calls |
| Auth fetch | `auth-fetch.ts` | `getAuthHeaders()`, `authFetch(path, init?)` | Auth-aware fetch helpers for calls that bypass the generated API client (e.g. SSE streaming). Use instead of manually reading `localStorage` token |
| SSE stream | `features/ai/lib/sse-stream.ts` | `consumeSseStream(response, callbacks)`, `SseChunk`, `SseStreamCallbacks` | Pure (non-React) SSE stream parser. Reads Response body, parses SSE lines, dispatches typed chunks via callbacks. Used by `useAiChat` hook |

## Dashboard Widget Components

| Component | File | When to use |
|---|---|---|
| `WidgetShell` | `features/dashboard/components/widgets/WidgetShell.tsx` | Wrapper for all dashboard widgets. Handles loading/error/empty states, metric header with refresh button, cache info. Pass type-specific chart as children |
| `WidgetSkeleton` | `features/dashboard/components/widgets/WidgetSkeleton.tsx` | Loading skeleton, variant: chart/table/flow |
| `WidgetTransition` | `features/dashboard/components/widgets/WidgetTransition.tsx` | Fade-in transition wrapper with opacity during refetch |
| `TargetEventQueryPanel` | `features/dashboard/components/widgets/shared/TargetEventQueryPanel.tsx` | Shared query panel for Retention, Lifecycle, Stickiness widgets. Provides DateRangeSection, event selection, granularity select, CohortFilterSection. Accepts `eventIcon`, `extraDisplayContent?`, `granularityAdjacentContent?` for widget-specific additions. Config must extend `BaseTargetEventConfig` (date_from, date_to, target_event, granularity, cohort_ids) |

## Cohort Condition Row Components

| Component | File | When to use |
|---|---|---|
| `ConditionRowWrapper` | `features/cohorts/components/ConditionRowWrapper.tsx` | Shared wrapper for all condition rows. Provides container, colored label, remove button. Use for all cohort condition types |
| `TimeWindowInput` | `features/cohorts/components/TimeWindowInput.tsx` | Shared "in last N days" input. Use in all condition rows that have a time window field |
| `EventSequenceRow` | `features/cohorts/components/EventSequenceRow.tsx` | Event sequence with steps. `variant: 'performed' \| 'not_performed'` controls label and color. Handles both `EventSequenceCondition` and `NotPerformedEventSequenceCondition` |
| `SimpleEventConditionRow` | `features/cohorts/components/SimpleEventConditionRow.tsx` | Single event + time window. `variant: 'first_time' \| 'not_performed'` controls label and color. Handles both `FirstTimeEventCondition` and `NotPerformedEventCondition` |
| `PersonSearchTable` | `features/cohorts/components/PersonSearchTable.tsx` | Reusable person table with search, pagination, and multi-selection. Accepts `renderRowAction` and `renderFooter` props. Extracted from MembersTab; used in cohort member lists |

## Code Rules

### File Organization
- **Hooks and utility functions MUST NOT live in the same file as components.** Keep hooks in `hooks/` directories, utilities in `lib/` or dedicated files. Component files should only contain the component itself and its types/props interface.
- One component per file. Co-locating small internal sub-components is acceptable only if they are not exported.

### Reusability
- **Prefer creating reusable components over inline implementations.** If a UI pattern appears (or could appear) in more than one place, extract it into a shared component in `components/ui/`. Use existing components whenever possible instead of writing custom markup.
- Before writing a new component, check if an existing one in `components/ui/` already solves the problem or can be composed to solve it.

### Property Selection
- **Always use `PropertyNameCombobox` for property selection** — never plain `Input` or `Select`. This provides searchable dropdown with descriptions.
- Pair with `useEventPropertyNames(eventName?)` hook to get property names and descriptions.
- For custom (user-defined) properties only, filter with `.filter(n => n.startsWith('properties.'))`.

### Dialogs Over Native APIs
- **Never use `confirm()`, `alert()`, or `prompt()`**. Use `ConfirmDialog` for destructive confirmations and `Dialog` for other modal interactions.

### Generated API Client — Never Edit Directly

**`src/api/generated/Api.ts` is auto-generated. NEVER edit it manually.**

If a method has a wrong return type or missing signature — the fix goes in the **backend** (NestJS controller + Swagger decorators), not in the generated file. After fixing the backend:
```bash
pnpm swagger:generate   # regenerates apps/api/docs/swagger.json
pnpm generate-api       # regenerates apps/web/src/api/generated/Api.ts
```

Any manual change to `Api.ts` will be overwritten on the next `pnpm generate-api`. Committing such changes is a mistake — it creates a false fix that hides the real backend issue.

### Type Safety — No `as any` / `as unknown`
- **NEVER cast the `api` object or its return types to `as any` or `as unknown`.** If a method is missing or has wrong signature, fix the backend and regenerate the client (`pnpm swagger:generate && pnpm generate-api`).
- **NEVER cast API response types** (e.g. `res.user as any`). Use the generated types (`User`, `SessionUser`, etc.) directly, mapping fields explicitly when shapes differ.
- Narrowing casts (`as SpecificType`) from a known union are acceptable; widening casts (`as any`, `as unknown as X`) are not.

### Memoization
- Use `useCallback` for functions passed as props to child components or used in dependency arrays.
- Use `useMemo` for expensive computations and derived data that would otherwise recalculate on every render.
- Event handlers defined inline in JSX (e.g. `onClick={() => setOpen(true)}`) do NOT need `useCallback` — only wrap when the function is passed down or is a dep.

## Patterns

### Combobox Pattern
Compose `Popover` + `Command` for searchable dropdowns. See `EventNameCombobox` (`components/EventNameCombobox.tsx`) and `CohortSelector` for reference implementations.

### Route Lazy Loading
All authenticated pages use `React.lazy()` in `App.tsx` for code splitting. Auth pages (login/register/verify) are eagerly loaded. A `<Suspense>` boundary wraps `<Layout />` with a loading fallback.

### Error Boundaries
`ErrorBoundary` from `components/ErrorBoundary.tsx` wraps:
- `AppRoutes` in `App.tsx` — global catch for uncaught render errors
- `{children}` in `WidgetShell` — isolates widget chart failures from crashing the dashboard

### Page Layout
All pages inside `<Layout>` receive `p-4 lg:p-6` padding (responsive). Editor pages that need full-height override with `className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden"`.

### Editor Page Structure
Use `InsightEditorLayout` component from `components/InsightEditorLayout.tsx` — it handles the full editor shell:
```
InsightEditorLayout
├── EditorHeader (breadcrumbs: "Section > name input", save/discard)
├── QueryPanel (left sidebar, ~360-420px, passed as prop)
└── main (flex-1, overflow-auto)
    ├── EmptyState (not configured)
    ├── Skeleton (loading, passed as prop)
    ├── EmptyState (no results)
    └── Results (Metric bar + Chart/Preview, passed as props)
```
Use `useInsightEditor` hook for shared state management (name, config, mutations, save handler). Pass type-specific parts (QueryPanel, skeleton shape, metrics bar, chart) as props to `InsightEditorLayout`.

### List Page Structure
Use `CrudListPage` for CRUD entity lists. It handles the full layout:
```
PageHeader (title + "New" button)
├── EmptyState (no project)
├── ListSkeleton (loading)
├── EmptyState (no data, with action)
└── DataTable (name column + extra columns + actions column)
    └── ConfirmDialog (delete confirmation)
```

### Query Panel Sections
All 6 query panels wrap their content in `<QueryPanelShell>` from `components/ui/query-panel-shell.tsx`, then compose reusable section components separated by `<Separator />`:
```
QueryPanelShell
  DateRangeSection (date presets + from/to inputs)
  Separator
  [Widget-specific sections] (Series builder, Steps, Display, etc.)
  Separator
  CohortFilterSection (multi-select cohort filter)
  Separator
  BreakdownSection (breakdown property input)
```
All query panel sections are self-contained components in `components/ui/`. Widget-specific sections stay in the widget's own directory.

**Retention, Lifecycle, Stickiness** share the same query panel structure via `TargetEventQueryPanel` from `features/dashboard/components/widgets/shared/`. Each widget only passes its icon and optional extra sections (e.g. retention type toggle, periods input).

### Project Context
Current project ID is passed via **URL path param** `:projectId`. Routes follow the pattern `/projects/:projectId/...`. Read the current project ID with `useProjectId()` hook from `@/hooks/use-project-id` — it calls `useParams<{ projectId: string }>()` internally. The `navLink()` helper in layout replaces `:projectId` in path templates with the active project ID via `path.replace(':projectId', currentProject)`.

### Toast Notifications
Use `toast.success()` / `toast.error()` from `sonner` for user feedback after mutations. Never use `alert()`.

### Drag & Drop
Use `useDragReorder<T>` hook from `hooks/use-drag-reorder.ts` for reorderable lists via native HTML5 drag events.

### Charts
- **Line/Bar charts**: Use `TrendChart` with Recharts. Supports `compact` mode for dashboard widgets.
- **Funnel charts**: Use `FunnelChart` — pure CSS/div visualization, no Recharts. Supports `breakdown` mode.
- Both chart components accept `compact?: boolean` for dashboard widget rendering.

### Tailwind v4 Border Color
Tailwind v4 sets `border-color: var(--color-border)` on all elements in the base layer. Utilities like `border-b-white` on a child may not override this due to cascade. For colored borders on specific sides, use absolutely positioned `<span>` elements with `bg-*` instead (see `TabNav` component for reference).

## Visual Verification

Use this workflow whenever you change a UI component — especially for complex layouts, responsiveness, states (empty/loading/error), and when verifying how multiple components look together.

### Workflow

1. Start Storybook:
   ```bash
   pnpm --filter @qurvo/web storybook
   # → http://localhost:6006
   ```

2. Take a screenshot via Chrome CLI (no extra dependencies, uses system Chrome):
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --headless=new \
     --screenshot=/tmp/story.png \
     --window-size=1280,800 \
     "http://localhost:6006/iframe.html?id=ui-emptystate--default"
   ```
   Then read `/tmp/story.png` (Claude has vision).

3. Fix any visual bugs, re-take the screenshot, repeat until correct before committing.

4. After adding or modifying `.stories.tsx` files — run a production Storybook build to ensure there are no compile errors:
   ```bash
   pnpm --filter @qurvo/web build-storybook
   ```
   A successful build is required before committing story changes.

### Temporary Stories for Component Composition

If you need to verify how several components look together (e.g. EditorHeader + QueryPanel + Chart), create a `ComponentName.tmp.stories.tsx` file next to the component. These files are in `.gitignore` and will not be committed. Delete after verification.

### Story ID Format

Story IDs are derived from the file path and story name: `ui-emptystate--default`, `ui-button--primary`, etc. The full list is available at `http://localhost:6006`.

## Internationalization (i18n)

Custom i18n system without external libraries. Supports Russian (`ru`) and English (`en`), default is Russian.

### Architecture

| File / Directory | Purpose |
|---|---|
| `src/i18n/types.ts` | `Language` type (`'en' \| 'ru'`), `TranslationsMap<T>`, `createTranslations()` helper |
| `src/i18n/pluralize.ts` | Russian/English pluralization rules |
| `src/stores/language.ts` | Zustand store with `persist` middleware (localStorage key `qurvo-language`). Syncs language to API via `PATCH /api/auth/profile` |
| `src/hooks/use-local-translation.ts` | `useLocalTranslation(translations)` hook — returns `{ t, lang }` |

### How to add translations to a component

1. **Create a `.translations.ts` file** next to the component:
```typescript
import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Dashboard',
    deleteConfirm: 'Delete "{{name}}"?',
  },
  ru: {
    title: 'Дашборд',
    deleteConfirm: 'Удалить «{{name}}»?',
  },
});
```

2. **Use in component**:
```typescript
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './MyComponent.translations';

function MyComponent() {
  const { t } = useLocalTranslation(translations);
  return <h1>{t('title')}</h1>;
}
```

3. **Interpolation**: `t('deleteConfirm', { name: item.name })` — replaces `{{name}}` in the string.

4. **Pluralization**: Import `pluralize` from `@/i18n/pluralize` for Russian plural forms.

### Rules

- **Every user-visible string must use `t()`**. No hardcoded English or Russian strings in JSX.
- **Co-locate translations** — `.translations.ts` file lives next to its component.
- **Keep translation keys camelCase** — `deleteConfirm`, not `delete_confirm` or `DELETE_CONFIRM`.
- **Static arrays with labels** (tabs, options, columns) that need translation must be inside the component function (use `useMemo` with `t` dependency) — not at module level.
- **Toast messages** use `t()` too: `toast.success(t('saved'))`.
- **Language switcher** is in the sidebar user menu (Layout component).
