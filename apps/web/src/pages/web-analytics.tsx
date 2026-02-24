import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { useWebAnalyticsParams } from '@/features/web-analytics/hooks/use-web-analytics-params';
import { useWebOverview } from '@/features/web-analytics/hooks/use-web-overview';
import { useWebPaths } from '@/features/web-analytics/hooks/use-web-paths';
import { useWebSources } from '@/features/web-analytics/hooks/use-web-sources';
import { useWebDevices } from '@/features/web-analytics/hooks/use-web-devices';
import { useWebGeography } from '@/features/web-analytics/hooks/use-web-geography';
import { WebFilterBar } from '@/features/web-analytics/components/WebFilterBar';
import { WebKpiRow } from '@/features/web-analytics/components/WebKpiRow';
import { WebTimeseriesChart, type MetricKey } from '@/features/web-analytics/components/WebTimeseriesChart';
import { WebDimensionTile } from '@/features/web-analytics/components/WebDimensionTile';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './web-analytics.translations';

export default function WebAnalyticsPage() {
  const { t } = useLocalTranslation(translations);
  const { dateFrom, dateTo, setDateRange, queryParams } = useWebAnalyticsParams();
  const [chartMetric, setChartMetric] = useState<MetricKey>('unique_visitors');

  const overview = useWebOverview(queryParams);
  const paths = useWebPaths(queryParams);
  const sources = useWebSources(queryParams);
  const devices = useWebDevices(queryParams);
  const geography = useWebGeography(queryParams);

  const pathTabs = useMemo(() => [
    { id: 'top_pages', label: t('topPages') },
    { id: 'entry_pages', label: t('entryPages') },
    { id: 'exit_pages', label: t('exitPages') },
  ] as const, [t]);

  const sourceTabs = useMemo(() => [
    { id: 'referrers', label: t('referrers') },
    { id: 'utm_sources', label: t('utmSource') },
    { id: 'utm_mediums', label: t('utmMedium') },
    { id: 'utm_campaigns', label: t('utmCampaign') },
  ] as const, [t]);

  const deviceTabs = useMemo(() => [
    { id: 'device_types', label: t('deviceType') },
    { id: 'browsers', label: t('browser') },
    { id: 'oses', label: t('os') },
  ] as const, [t]);

  const geoTabs = useMemo(() => [
    { id: 'countries', label: t('countries') },
    { id: 'regions', label: t('regions') },
    { id: 'cities', label: t('cities') },
  ] as const, [t]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      <WebFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateRangeChange={setDateRange}
      />

      <WebKpiRow
        current={overview.data?.current}
        previous={overview.data?.previous}
        isLoading={overview.isLoading}
        isError={overview.isError}
      />

      <WebTimeseriesChart
        data={overview.data?.timeseries}
        granularity={overview.data?.granularity}
        isLoading={overview.isLoading}
        metric={chartMetric}
        onMetricChange={setChartMetric}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WebDimensionTile
          title={t('paths')}
          tabs={pathTabs}
          data={{
            top_pages: paths.data?.top_pages,
            entry_pages: paths.data?.entry_pages,
            exit_pages: paths.data?.exit_pages,
          }}
          isLoading={paths.isLoading}
          isError={paths.isError}
        />
        <WebDimensionTile
          title={t('sources')}
          tabs={sourceTabs}
          data={{
            referrers: sources.data?.referrers,
            utm_sources: sources.data?.utm_sources,
            utm_mediums: sources.data?.utm_mediums,
            utm_campaigns: sources.data?.utm_campaigns,
          }}
          isLoading={sources.isLoading}
          isError={sources.isError}
        />
        <WebDimensionTile
          title={t('devices')}
          tabs={deviceTabs}
          data={{
            device_types: devices.data?.device_types,
            browsers: devices.data?.browsers,
            oses: devices.data?.oses,
          }}
          isLoading={devices.isLoading}
          isError={devices.isError}
        />
        <WebDimensionTile
          title={t('geography')}
          tabs={geoTabs}
          data={{
            countries: geography.data?.countries,
            regions: geography.data?.regions,
            cities: geography.data?.cities,
          }}
          isLoading={geography.isLoading}
          isError={geography.isError}
        />
      </div>
    </div>
  );
}
