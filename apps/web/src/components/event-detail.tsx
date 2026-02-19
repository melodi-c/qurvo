import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Globe, UserCheck, Zap, ExternalLink, LogOut, UserPen, Smartphone } from 'lucide-react';

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
  if (eventName === '$pageleave') return 'default';
  if (eventName === '$identify') return 'secondary';
  if (eventName === '$set' || eventName === '$set_once') return 'secondary';
  if (eventName === '$screen') return 'default';
  return 'outline';
}

function EventTypeIcon({ eventName }: { eventName: string }) {
  if (eventName === '$pageview') return <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  if (eventName === '$pageleave') return <LogOut className="h-3.5 w-3.5 text-orange-400 shrink-0" />;
  if (eventName === '$identify') return <UserCheck className="h-3.5 w-3.5 text-violet-400 shrink-0" />;
  if (eventName === '$set' || eventName === '$set_once') return <UserPen className="h-3.5 w-3.5 text-green-400 shrink-0" />;
  if (eventName === '$screen') return <Smartphone className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
  return <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
}

function parseSafe(json: string): Record<string, unknown> {
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; }
}

// ─── value renderers ──────────────────────────────────────────────────────────

function ExternalLinkValue({ value }: { value: string }) {
  if (!value) return null;
  if (value.startsWith('http')) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline break-all font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {value}
        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
      </a>
    );
  }
  return <span className="font-mono break-all">{value}</span>;
}

function PersonLink({ personId, projectId }: { personId: string; projectId?: string }) {
  if (!personId) return null;
  if (projectId) {
    return (
      <Link
        to={`/persons/${personId}?project=${projectId}`}
        className="text-blue-400 hover:text-blue-300 hover:underline font-mono break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {personId}
      </Link>
    );
  }
  return <span className="font-mono break-all">{personId}</span>;
}

// ─── property table ───────────────────────────────────────────────────────────

type PropValue = string | number | undefined | null;

interface PropEntry {
  key: string;
  value: PropValue;
  render?: (value: string) => React.ReactNode;
}

function isNonEmpty(v: PropValue): boolean {
  return v !== '' && v !== 0 && v != null;
}

function PropsTable({ rows }: { rows: PropEntry[] }) {
  const visible = rows.filter((r) => isNonEmpty(r.value));
  if (visible.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <tbody>
        {visible.map(({ key, value, render }) => (
          <tr key={key} className="border-b border-border/50 last:border-0">
            <td className="py-1.5 pr-4 w-40 shrink-0 text-muted-foreground align-top">{key}</td>
            <td className="py-1.5 text-foreground">
              {render ? render(String(value)) : <span className="font-mono break-all">{String(value)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PropsTableGrouped({ groups }: { groups: { label: string; rows: PropEntry[] }[] }) {
  const nonEmpty = groups.filter((g) => g.rows.some((r) => isNonEmpty(r.value)));
  if (nonEmpty.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <tbody>
        {nonEmpty.map((group) => {
          const visible = group.rows.filter((r) => isNonEmpty(r.value));
          if (visible.length === 0) return null;
          return (
            <tr key={`section-${group.label}`}>
              <td colSpan={2} className="p-0">
                <table className="w-full">
                  <tbody>
                    <tr>
                      <td colSpan={2} className="pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        {group.label}
                      </td>
                    </tr>
                    {visible.map(({ key, value, render }) => (
                      <tr key={key} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-4 w-40 shrink-0 text-muted-foreground align-top">{key}</td>
                        <td className="py-1.5 text-foreground">
                          {render ? render(String(value)) : <span className="font-mono break-all">{String(value)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── EventDetail panel ────────────────────────────────────────────────────────

type DetailTab = 'event' | 'person';

export function EventDetail({ event, projectId }: { event: EventLike; projectId?: string }) {
  const [tab, setTab] = useState<DetailTab>('event');

  const browserLabel = [event.browser, event.browser_version].filter(Boolean).join(' ');
  const osLabel = [event.os, event.os_version].filter(Boolean).join(' ');
  const screenLabel = event.screen_width && event.screen_height ? `${event.screen_width} × ${event.screen_height}` : '';

  const linkRenderer = (value: string) => <ExternalLinkValue value={value} />;

  const eventGroups: { label: string; rows: PropEntry[] }[] = [
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
        { key: 'url', value: event.url, render: linkRenderer },
        { key: 'referrer', value: event.referrer, render: linkRenderer },
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
        {
          key: 'person_id',
          value: event.person_id,
          render: () => <PersonLink personId={event.person_id} projectId={projectId} />,
        },
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

  const personRows: PropEntry[] = Object.entries(parseSafe(event.user_properties)).map(([key, val]) => ({
    key,
    value: typeof val === 'object' ? JSON.stringify(val) : String(val),
  }));

  return (
    <div className="border-b border-border bg-muted/20">
      {/* Header: event name + timestamp */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-0">
        <EventTypeIcon eventName={event.event_name} />
        <span className="text-xs font-medium">{event.event_name}</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border px-4 mt-2">
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
  projectId,
}: {
  event: EventLike;
  expanded: boolean;
  onToggle: () => void;
  showPerson?: boolean;
  projectId?: string;
}) {
  // Show path portion of URL to save space
  const urlDisplay = (() => {
    if (!event.url) return event.page_path || '';
    try { return new URL(event.url).pathname || event.url; } catch { return event.url; }
  })();

  return (
    <>
      <div
        className={`grid gap-3 px-4 py-2.5 border-b border-border cursor-pointer select-none transition-colors hover:bg-muted/40 ${expanded ? 'bg-muted/30' : ''} ${showPerson ? 'grid-cols-[20px_1fr_160px_80px]' : 'grid-cols-[20px_1fr_80px]'}`}
        onClick={onToggle}
      >
        {/* Chevron */}
        <span className="flex items-center text-muted-foreground/60">
          {expanded
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />}
        </span>

        {/* Event type icon + name badge + url path */}
        <span className="flex items-center gap-2 min-w-0">
          <EventTypeIcon eventName={event.event_name} />
          <Badge
            variant={eventBadgeVariant(event.event_name)}
            className="shrink-0 font-mono text-[11px] py-0 px-1.5 h-5"
          >
            {event.event_name}
          </Badge>
          {urlDisplay && (
            <span className="text-xs text-muted-foreground/70 truncate font-mono">{urlDisplay}</span>
          )}
        </span>

        {/* Person (optional) — clickable link */}
        {showPerson && (
          <span className="flex items-center min-w-0">
            {projectId && event.person_id ? (
              <Link
                to={`/persons/${event.person_id}?project=${projectId}`}
                className="text-xs text-muted-foreground font-mono truncate hover:text-foreground hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {event.distinct_id}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground font-mono truncate">{event.distinct_id}</span>
            )}
          </span>
        )}

        {/* Time */}
        <span className="flex items-center text-xs text-muted-foreground tabular-nums" title={new Date(event.timestamp).toLocaleString()}>
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>

      {expanded && <EventDetail event={event} projectId={projectId} />}
    </>
  );
}
