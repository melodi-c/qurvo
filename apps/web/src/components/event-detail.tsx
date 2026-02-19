import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown } from 'lucide-react';

// ─── shared event shape ───────────────────────────────────────────────────────

export interface EventLike {
  event_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  person_id: string;
  session_id: string;
  timestamp: string;
  url: string;
  referrer: string;
  page_title: string;
  page_path: string;
  device_type: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  screen_width: number;
  screen_height: number;
  country: string;
  region: string;
  city: string;
  language: string;
  timezone: string;
  sdk_name: string;
  sdk_version: string;
  properties: string;
  user_properties: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function eventBadgeVariant(eventName: string): 'default' | 'secondary' | 'outline' {
  if (eventName === '$pageview') return 'default';
  if (eventName === '$identify') return 'secondary';
  return 'outline';
}

function parseSafe(json: string): Record<string, unknown> {
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; }
}

// ─── property table ───────────────────────────────────────────────────────────

interface PropEntry {
  key: string;
  value: string | number;
}

function PropsTable({ rows }: { rows: PropEntry[] }) {
  const visible = rows.filter((r) => r.value !== '' && r.value !== 0 && r.value != null);
  if (visible.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <tbody>
        {visible.map(({ key, value }) => (
          <tr key={key} className="border-b border-border/50 last:border-0">
            <td className="py-1.5 pr-4 w-40 shrink-0 text-muted-foreground align-top">{key}</td>
            <td className="py-1.5 font-mono break-all text-foreground">{String(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} className="pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </td>
    </tr>
  );
}

function PropsTableGrouped({ groups }: { groups: { label: string; rows: PropEntry[] }[] }) {
  const nonEmpty = groups.filter((g) => g.rows.some((r) => r.value !== '' && r.value !== 0 && r.value != null));
  if (nonEmpty.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <tbody>
        {nonEmpty.map((group) => {
          const visible = group.rows.filter((r) => r.value !== '' && r.value !== 0 && r.value != null);
          if (visible.length === 0) return null;
          return (
            <>
              <SectionHeader key={`h-${group.label}`} label={group.label} />
              {visible.map(({ key, value }) => (
                <tr key={key} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-4 w-40 shrink-0 text-muted-foreground align-top">{key}</td>
                  <td className="py-1.5 font-mono break-all text-foreground">{String(value)}</td>
                </tr>
              ))}
            </>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── EventDetail panel ────────────────────────────────────────────────────────

type DetailTab = 'event' | 'person';

export function EventDetail({ event }: { event: EventLike }) {
  const [tab, setTab] = useState<DetailTab>('event');

  const browserLabel = [event.browser, event.browser_version].filter(Boolean).join(' ');
  const osLabel = [event.os, event.os_version].filter(Boolean).join(' ');
  const screenLabel = event.screen_width && event.screen_height ? `${event.screen_width} × ${event.screen_height}` : '';

  const eventGroups = [
    {
      label: 'Location',
      rows: [
        { key: 'country', value: event.country },
        { key: 'region', value: event.region },
        { key: 'city', value: event.city },
      ],
    },
    {
      label: 'Page',
      rows: [
        { key: 'url', value: event.url },
        { key: 'referrer', value: event.referrer },
        { key: 'page_title', value: event.page_title },
        { key: 'page_path', value: event.page_path },
      ],
    },
    {
      label: 'Device & Browser',
      rows: [
        { key: 'browser', value: browserLabel },
        { key: 'os', value: osLabel },
        { key: 'device_type', value: event.device_type },
        { key: 'screen', value: screenLabel },
      ],
    },
    {
      label: 'Identity & Session',
      rows: [
        { key: 'distinct_id', value: event.distinct_id },
        { key: 'person_id', value: event.person_id },
        { key: 'session_id', value: event.session_id },
        { key: 'language', value: event.language },
        { key: 'timezone', value: event.timezone },
      ],
    },
    {
      label: 'SDK',
      rows: [
        { key: 'sdk_name', value: event.sdk_name },
        { key: 'sdk_version', value: event.sdk_version },
      ],
    },
  ];

  const customProps = Object.entries(parseSafe(event.properties)).map(([key, val]) => ({
    key,
    value: typeof val === 'object' ? JSON.stringify(val) : String(val),
  }));

  if (customProps.length > 0) {
    eventGroups.push({ label: 'Custom Properties', rows: customProps });
  }

  const personRows = Object.entries(parseSafe(event.user_properties)).map(([key, val]) => ({
    key,
    value: typeof val === 'object' ? JSON.stringify(val) : String(val),
  }));

  return (
    <div className="border-b border-border bg-muted/20">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border px-4">
        {(['event', 'person'] as DetailTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'event' ? 'Event' : 'Person'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 py-3 max-h-96 overflow-y-auto">
        {tab === 'event' && <PropsTableGrouped groups={eventGroups} />}

        {tab === 'person' && (
          personRows.length === 0
            ? <p className="text-xs text-muted-foreground py-4">No person properties recorded</p>
            : <PropsTable rows={personRows} />
        )}
      </div>
    </div>
  );
}

// ─── EventTableRow ────────────────────────────────────────────────────────────

export function EventTableRow({
  event,
  expanded,
  onToggle,
  showPerson = true,
}: {
  event: EventLike;
  expanded: boolean;
  onToggle: () => void;
  showPerson?: boolean;
}) {
  const browserShort = [
    event.browser,
    event.browser_version ? event.browser_version.split('.')[0] : '',
  ].filter(Boolean).join(' ');
  const deviceSummary = [browserShort, event.os].filter(Boolean).join(' · ');

  return (
    <>
      <div
        className={`grid gap-3 px-4 py-2.5 border-b border-border cursor-pointer select-none transition-colors hover:bg-muted/40 ${expanded ? 'bg-muted/30' : ''} ${showPerson ? 'grid-cols-[20px_1fr_160px_80px_140px]' : 'grid-cols-[20px_1fr_80px_140px]'}`}
        onClick={onToggle}
      >
        <span className="flex items-center text-muted-foreground/60">
          {expanded
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />}
        </span>

        {/* Event name + url */}
        <span className="flex items-center gap-2 min-w-0">
          <Badge
            variant={eventBadgeVariant(event.event_name)}
            className="shrink-0 font-mono text-[11px] py-0 px-1.5 h-5"
          >
            {event.event_name}
          </Badge>
          {event.url && (
            <span className="text-xs text-muted-foreground truncate">{event.url}</span>
          )}
        </span>

        {/* Person (optional) */}
        {showPerson && (
          <span className="flex items-center text-xs text-muted-foreground font-mono truncate">
            {event.distinct_id}
          </span>
        )}

        {/* Time */}
        <span className="flex items-center text-xs text-muted-foreground tabular-nums">
          {formatRelativeTime(event.timestamp)}
        </span>

        {/* Browser / OS */}
        <span className="flex items-center text-xs text-muted-foreground truncate">
          {deviceSummary || <span className="text-muted-foreground/30">—</span>}
        </span>
      </div>

      {expanded && <EventDetail event={event} />}
    </>
  );
}
