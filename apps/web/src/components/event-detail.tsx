import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { TabNav } from '@/components/ui/tab-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';
import { api } from '@/api/client';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useEventDefinitions, buildDescriptionMap } from '@/hooks/use-event-definitions';
import { EventTypeIcon } from '@/components/EventTypeIcon';
import { PropsTable, PropsTableGrouped } from '@/components/event-props-table';
import type { PropEntry } from '@/components/event-props-table';
import { formatDateTime } from '@/lib/formatting';
import translations from './event-detail.translations';

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
  properties?: string;
  user_properties?: string;
}

function parseSafe(json: string | undefined): Record<string, unknown> {
  if (!json) {return {};}
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; }
}

// value renderers

function ExternalLinkValue({ value }: { value: string }) {
  if (!value) {return null;}
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
  const { link } = useAppNavigate();
  if (!personId) {return null;}
  if (projectId) {
    return (
      <Link
        to={link.persons.detail(personId)}
        className="text-blue-400 hover:text-blue-300 hover:underline font-mono break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {personId}
      </Link>
    );
  }
  return <span className="font-mono break-all">{personId}</span>;
}

// EventDetail panel

type DetailTab = 'event' | 'person';

export function EventDetail({ event, projectId }: { event: EventLike; projectId?: string }) {
  const { t } = useLocalTranslation(translations);
  const [tab, setTab] = useState<DetailTab>('event');
  const { data: definitions = [] } = useEventDefinitions();
  const eventDescriptions = useMemo(() => buildDescriptionMap(definitions), [definitions]);

  // Lazy-load properties & user_properties via separate endpoint
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['event-detail', event.event_id, projectId],
    queryFn: () =>
      api.eventsControllerGetEventDetail({
        eventId: event.event_id,
        project_id: projectId!,
        timestamp: event.timestamp,
      }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const browserLabel = [event.browser, event.browser_version].filter(Boolean).join(' ');
  const osLabel = [event.os, event.os_version].filter(Boolean).join(' ');
  const screenLabel = event.screen_width && event.screen_height ? `${event.screen_width} × ${event.screen_height}` : '';

  const linkRenderer = (value: string) => <ExternalLinkValue value={value} />;

  const eventGroups: { label: string; rows: PropEntry[] }[] = [
    {
      label: t('groupLocation'),
      rows: [
        { key: 'country', value: event.country },
        { key: 'region', value: event.region },
        { key: 'city', value: event.city },
      ],
    },
    {
      label: t('groupPage'),
      rows: [
        { key: 'url', value: event.url, render: linkRenderer },
        { key: 'referrer', value: event.referrer, render: linkRenderer },
        { key: 'page_title', value: event.page_title },
        { key: 'page_path', value: event.page_path },
      ],
    },
    {
      label: t('groupDevice'),
      rows: [
        { key: 'browser', value: browserLabel },
        { key: 'os', value: osLabel },
        { key: 'device_type', value: event.device_type },
        { key: 'screen', value: screenLabel },
      ],
    },
    {
      label: t('groupIdentity'),
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
      label: t('groupSdk'),
      rows: [
        { key: 'sdk_name', value: event.sdk_name },
        { key: 'sdk_version', value: event.sdk_version },
      ],
    },
  ];

  const properties = detail?.properties ?? event.properties;
  const userProperties = detail?.user_properties ?? event.user_properties;

  if (properties) {
    const customProps = Object.entries(parseSafe(properties)).map(([key, val]) => ({
      key,
      value: typeof val === 'object' ? JSON.stringify(val) : String(val),
    }));
    if (customProps.length > 0) {
      eventGroups.push({ label: t('groupCustomProperties'), rows: customProps });
    }
  }

  const personRows: PropEntry[] = userProperties
    ? Object.entries(parseSafe(userProperties)).map(([key, val]) => ({
        key,
        value: typeof val === 'object' ? JSON.stringify(val) : String(val),
      }))
    : [];

  return (
    <div className="border-b border-border bg-muted/20">
      {/* Header: event name + timestamp */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-0">
        <EventTypeIcon eventName={event.event_name} />
        {eventDescriptions[event.event_name] ? (
          <>
            <span className="text-xs font-medium">{eventDescriptions[event.event_name]}</span>
            <span className="text-[11px] font-mono text-muted-foreground">{event.event_name}</span>
          </>
        ) : (
          <span className="text-xs font-medium">{event.event_name}</span>
        )}
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</span>
      </div>

      {/* Tab bar */}
      <div className="px-4 mt-2">
        <TabNav
          tabs={[{ id: 'event' as const, label: t('tabEvent') }, { id: 'person' as const, label: t('tabPerson') }]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* Content */}
      <div className="px-4 py-3 max-h-96 overflow-y-auto">
        {tab === 'event' && (
          <>
            <PropsTableGrouped groups={eventGroups} />
            {detailLoading && !properties && (
              <div className="space-y-2 pt-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            )}
          </>
        )}
        {tab === 'person' && (
          detailLoading && !userProperties
            ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            )
            : personRows.length === 0
              ? <p className="text-xs text-muted-foreground py-4">{t('noPersonProperties')}</p>
              : <PropsTable rows={personRows} />
        )}
      </div>
    </div>
  );
}
