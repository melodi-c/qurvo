# Web App — UI Design System

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
| `--color-border` | `#27272a` | Borders |
| `--radius` | `0.5rem` | Border radius base |

## Utility

`cn()` from `src/lib/utils.ts` — combines `clsx` + `tailwind-merge`. Use in every component that accepts `className`.

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
| `Skeleton` | `skeleton.tsx` | `className` | Loading placeholders. Prefer `ListSkeleton` for repeated rows |
| `Tooltip` | `tooltip.tsx` | Compound: `Tooltip`, `TooltipTrigger`, `TooltipContent`. `TooltipProvider` is mounted at app root | Button hints, metric explanations |
| `Separator` | `separator.tsx` | `orientation`: horizontal/vertical | Visual dividers between sections |
| `Toaster` (sonner) | `sonner.tsx` | Mounted once in `App.tsx` | Use `toast.success()`, `toast.error()` from `sonner` for notifications |

### Custom Components

| Component | File | Key Props | When to use |
|---|---|---|---|
| `DataTable<T>` | `data-table.tsx` | `columns: Column<T>[]`, `data: T[]`, `rowKey`, `onRowClick?` | Generic typed table for list pages (insights, cohorts, projects, api-keys) |
| `PageHeader` | `page-header.tsx` | `title: string`, `children?` (action slot) | Page title with optional action button. Use on every top-level page |
| `EmptyState` | `empty-state.tsx` | `icon`, `title?`, `description`, `action?`, `className?` | Empty/placeholder states. Without `title` — compact style (icon + text). With `title` — icon in circle + heading + description + optional action |
| `InlineCreateForm` | `inline-create-form.tsx` | `placeholder`, `value`, `onChange`, `isPending`, `onSubmit`, `onCancel`, `submitLabel?`, `pendingLabel?`, `autoFocus?` | Quick create forms that appear inline (projects, dashboards, api-keys) |
| `ListSkeleton` | `list-skeleton.tsx` | `count?` (default 3), `height?` (default "h-16"), `className?` | Loading skeleton for list pages. Replaces repeated `Array.from().map(Skeleton)` pattern |
| `TablePagination` | `table-pagination.tsx` | `page`, `onPageChange`, `hasMore`, `className?` | Previous/Next pagination for tables (events, persons, person-detail) |
| `EditorHeader` | `editor-header.tsx` | `backPath`, `backLabel`, `name`, `onNameChange`, `placeholder`, `onSave`, `isSaving`, `isValid`, `saveError?` | Editor page header with back link, inline name input, save/discard buttons (trend-editor, funnel-editor) |
| `Metric` | `metric.tsx` | `label`, `value`, `accent?` | Large numeric display for KPIs in editor results panels |
| `SectionHeader` | `section-header.tsx` | `icon: ElementType`, `label` | Uppercase section labels with icon in query panels |
| `PillToggleGroup` | `pill-toggle-group.tsx` | `options: { label, value }[]`, `value`, `onChange`, `className?` | Toggle between small set of options (chart type, match mode). Renders pill-shaped buttons |
| `DateRangeSection` | `date-range-section.tsx` | `dateFrom`, `dateTo`, `onChange(from, to)` | Date range picker with preset buttons (7d/30d/90d/6m/1y) + date inputs. Use in query panels |
| `CohortFilterSection` | `cohort-filter-section.tsx` | `value: string[]`, `onChange(cohortIds)` | Cohort multi-select filter with section header. Use in query panels |
| `BreakdownSection` | `breakdown-section.tsx` | `value: string`, `onChange(value)` | Breakdown property input with section header. Use in query panels |
| `Breadcrumbs` | `breadcrumbs.tsx` | `items: BreadcrumbItem[]`, `className?` | Navigation breadcrumbs. Each item has `label` + optional `path`. Last item renders as plain text, rest as links. Use in editor headers |

## Shared Hooks (`src/hooks/`)

| Hook | File | Signature | When to use |
|---|---|---|---|
| `useDebounce<T>` | `use-debounce.ts` | `(value: T, delay: number) => T` | Debounce any value (search input, form state hash). Returns debounced copy after `delay` ms of inactivity |

## Code Rules

### File Organization
- **Hooks and utility functions MUST NOT live in the same file as components.** Keep hooks in `hooks/` directories, utilities in `lib/` or dedicated files. Component files should only contain the component itself and its types/props interface.
- One component per file. Co-locating small internal sub-components is acceptable only if they are not exported.

### Reusability
- **Prefer creating reusable components over inline implementations.** If a UI pattern appears (or could appear) in more than one place, extract it into a shared component in `components/ui/`. Use existing components whenever possible instead of writing custom markup.
- Before writing a new component, check if an existing one in `components/ui/` already solves the problem or can be composed to solve it.

### Memoization
- Use `useCallback` for functions passed as props to child components or used in dependency arrays.
- Use `useMemo` for expensive computations and derived data that would otherwise recalculate on every render.
- Event handlers defined inline in JSX (e.g. `onClick={() => setOpen(true)}`) do NOT need `useCallback` — only wrap when the function is passed down or is a dep.

## Patterns

### Combobox Pattern
Compose `Popover` + `Command` for searchable dropdowns. See `EventNameCombobox` and `CohortSelector` for reference implementations.

### Page Layout
All pages inside `<Layout>` receive `p-6` padding via `<main>`. Editor pages that need full-height override with `className="-m-6 h-full flex flex-col overflow-hidden"`.

### Editor Page Structure
```
EditorHeader (back, name, save/discard)
├── QueryPanel (left sidebar, ~420px)
└── main (flex-1, overflow-auto)
    ├── EmptyState (not configured)
    ├── Skeleton (loading)
    ├── EmptyState (no results)
    └── Results (Metric bar + Chart)
```

### List Page Structure
```
PageHeader (title + "New" button)
├── EmptyState (no project)
├── ListSkeleton (loading)
├── EmptyState (no data, with action)
└── DataTable (data)
```

### Query Panel Sections
Query panels (TrendQueryPanel, FunnelQueryPanel) compose reusable section components separated by `<Separator />`:
```
DateRangeSection (date presets + from/to inputs)
Separator
[Widget-specific sections] (Series builder, Steps, Display, etc.)
Separator
CohortFilterSection (multi-select cohort filter)
Separator
BreakdownSection (breakdown property input)
```
All query panel sections are self-contained components in `components/ui/`. Widget-specific sections stay in the widget's own directory.

### Project Context
Current project ID is always passed via `?project=<uuid>` in URL search params. Read with `useSearchParams()`. Layout preserves `project` param on navigation via `navLink()` helper.

### Toast Notifications
Use `toast.success()` / `toast.error()` from `sonner` for user feedback after mutations. Never use `alert()`.

### Drag & Drop
Use `useDragReorder<T>` hook from `QueryItemCard.tsx` for reorderable lists via native HTML5 drag events.

### Charts
- **Line/Bar charts**: Use `TrendChart` with Recharts. Supports `compact` mode for dashboard widgets.
- **Funnel charts**: Use `FunnelChart` — pure CSS/div visualization, no Recharts. Supports `breakdown` mode.
- Both chart components accept `compact?: boolean` for dashboard widget rendering.
