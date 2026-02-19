import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/api/client';
import type { EventRow } from '@/api/generated/Api';
import { ChevronRight, ChevronDown, Globe, Monitor, MapPin, FileText, Cpu, User, Settings } from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function eventBadgeVariant(eventName: string): 'default' | 'secondary' | 'outline' {
  if (eventName === '$pageview') return 'default';
  if (eventName === '$identify') return 'secondary';
  return 'outline';
}

function parseSafe(json: string): Record<string, unknown> {
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; }
}

// ─── sub-components ──────────────────────────────────────────────────────────

function PropRow({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value === undefined || value === null || value === '' || value === 0) return null;
  return (
    <div className="flex gap-3 py-1 text-sm leading-snug">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all font-mono text-xs text-foreground">{String(value)}</span>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="pl-1 border-l border-border ml-0.5">
        {children}
      </div>
    </div>
  );
}

function CustomPropertiesSection({ json }: { json: string }) {
  const props = parseSafe(json);
  const entries = Object.entries(props).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return null;
  return (
    <Section icon={<Settings className="h-3 w-3" />} title="Custom Properties">
      {entries.map(([key, val]) => (
        <PropRow key={key} label={key} value={typeof val === 'object' ? JSON.stringify(val) : String(val)} />
      ))}
    </Section>
  );
}

function UserPropertiesPanel({ json }: { json: string }) {
  const props = parseSafe(json);
  const entries = Object.entries(props).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No person properties recorded</p>;
  }
  return (
    <div>
      {entries.map(([key, val]) => (
        <PropRow key={key} label={key} value={typeof val === 'object' ? JSON.stringify(val) : String(val)} />
      ))}
    </div>
  );
}

type DetailTab = 'event' | 'person';

function EventDetail({ event }: { event: EventRow }) {
  const [tab, setTab] = useState<DetailTab>('event');

  const browserLabel = [event.browser, event.browser_version].filter(Boolean).join(' ');
  const osLabel = [event.os, event.os_version].filter(Boolean).join(' ');
  const screenLabel = event.screen_width && event.screen_height ? `${event.screen_width} × ${event.screen_height}` : '';

  return (
    <div className="bg-background border border-border rounded-md mx-2 mb-1 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="font-semibold text-sm">{event.event_name}</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(event.timestamp).toLocaleString()} · {event.distinct_id}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {(['event', 'person'] as DetailTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'event' ? 'Event Properties' : 'Person Properties'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'event' && (
        <div className="columns-1 md:columns-2 gap-8">
          {/* Geo */}
          {(event.country || event.region || event.city) && (
            <Section icon={<MapPin className="h-3 w-3" />} title="Location">
              <PropRow label="Country" value={event.country} />
              <PropRow label="Region" value={event.region} />
              <PropRow label="City" value={event.city} />
            </Section>
          )}

          {/* Page */}
          {(event.url || event.referrer || event.page_title || event.page_path) && (
            <Section icon={<Globe className="h-3 w-3" />} title="Page">
              <PropRow label="URL" value={event.url} />
              <PropRow label="Referrer" value={event.referrer} />
              <PropRow label="Title" value={event.page_title} />
              <PropRow label="Path" value={event.page_path} />
            </Section>
          )}

          {/* Device */}
          {(browserLabel || osLabel || event.device_type || screenLabel) && (
            <Section icon={<Monitor className="h-3 w-3" />} title="Device & Browser">
              <PropRow label="Browser" value={browserLabel} />
              <PropRow label="OS" value={osLabel} />
              <PropRow label="Device" value={event.device_type} />
              <PropRow label="Screen" value={screenLabel} />
            </Section>
          )}

          {/* Identity & Session */}
          <Section icon={<User className="h-3 w-3" />} title="Identity & Session">
            <PropRow label="Distinct ID" value={event.distinct_id} />
            <PropRow label="Person ID" value={event.person_id} />
            <PropRow label="Session ID" value={event.session_id} />
            <PropRow label="Language" value={event.language} />
            <PropRow label="Timezone" value={event.timezone} />
          </Section>

          {/* SDK */}
          {(event.sdk_name || event.sdk_version) && (
            <Section icon={<Cpu className="h-3 w-3" />} title="SDK">
              <PropRow label="Name" value={event.sdk_name} />
              <PropRow label="Version" value={event.sdk_version} />
            </Section>
          )}

          {/* Custom properties */}
          <CustomPropertiesSection json={event.properties} />
        </div>
      )}

      {tab === 'person' && (
        <div>
          <Section icon={<FileText className="h-3 w-3" />} title="Person Properties">
            <UserPropertiesPanel json={event.user_properties} />
          </Section>
        </div>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const [filters, setFilters] = useState({ event_name: '', distinct_id: '' });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', projectId, filters, page],
    queryFn: () =>
      api.analyticsControllerGetEvents({
        project_id: projectId,
        ...(filters.event_name ? { event_name: filters.event_name } : {}),
        ...(filters.distinct_id ? { distinct_id: filters.distinct_id } : {}),
        limit: limit,
        offset: page * limit,
      }),
    enabled: !!projectId,
  });

  if (!projectId) {
    return <div className="text-muted-foreground">Select a project first</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Event Explorer</h1>

      <div className="flex gap-3">
        <Input
          placeholder="Filter by event name"
          value={filters.event_name}
          onChange={(e) => { setFilters((f) => ({ ...f, event_name: e.target.value })); setPage(0); }}
          className="max-w-xs"
        />
        <Input
          placeholder="Filter by distinct_id"
          value={filters.distinct_id}
          onChange={(e) => { setFilters((f) => ({ ...f, distinct_id: e.target.value })); setPage(0); }}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (
            <div>
              {/* Table header */}
              <div className="grid grid-cols-[28px_1fr_180px_100px_120px] gap-3 px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground">
                <span />
                <span>Event</span>
                <span>Person</span>
                <span>When</span>
                <span>Browser</span>
              </div>

              {/* Rows */}
              {(events ?? []).map((event) => {
                const isExpanded = expandedRow === event.event_id;
                const browserLabel = [event.browser, event.browser_version ? event.browser_version.split('.')[0] : ''].filter(Boolean).join(' ');
                const osLabel = event.os || '';
                return (
                  <div key={event.event_id}>
                    <div
                      className={`grid grid-cols-[28px_1fr_180px_100px_120px] gap-3 px-4 py-2.5 border-b border-border cursor-pointer transition-colors hover:bg-muted/40 ${isExpanded ? 'bg-muted/30' : ''}`}
                      onClick={() => setExpandedRow(isExpanded ? null : event.event_id)}
                    >
                      {/* Chevron */}
                      <span className="flex items-center text-muted-foreground">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </span>

                      {/* Event name */}
                      <span className="flex items-center gap-2 min-w-0">
                        <Badge variant={eventBadgeVariant(event.event_name)} className="shrink-0 font-mono text-xs">
                          {event.event_name}
                        </Badge>
                        {event.url && (
                          <span className="text-xs text-muted-foreground truncate">{event.url}</span>
                        )}
                      </span>

                      {/* Person */}
                      <span className="flex items-center text-xs text-muted-foreground font-mono truncate">
                        {event.distinct_id}
                      </span>

                      {/* Time */}
                      <span className="flex items-center text-xs text-muted-foreground">
                        {formatRelativeTime(event.timestamp)}
                      </span>

                      {/* Browser */}
                      <span className="flex items-center text-xs text-muted-foreground truncate">
                        {browserLabel || osLabel
                          ? <span className="truncate">{[browserLabel, osLabel].filter(Boolean).join(' · ')}</span>
                          : <span className="text-muted-foreground/40">—</span>
                        }
                      </span>
                    </div>

                    {isExpanded && <EventDetail event={event} />}
                  </div>
                );
              })}

              {(events ?? []).length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-12">No events found</p>
              )}

              {/* Pagination */}
              <div className="flex justify-between items-center px-4 py-3 border-t border-border">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button variant="outline" size="sm" disabled={(events ?? []).length < limit} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
