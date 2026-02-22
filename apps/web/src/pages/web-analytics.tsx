import { useState } from 'react';
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

const PATH_TABS = [
  { id: 'top_pages', label: 'Top Pages' },
  { id: 'entry_pages', label: 'Entry Pages' },
  { id: 'exit_pages', label: 'Exit Pages' },
] as const;

const SOURCE_TABS = [
  { id: 'referrers', label: 'Referrers' },
  { id: 'utm_sources', label: 'UTM Source' },
  { id: 'utm_mediums', label: 'UTM Medium' },
  { id: 'utm_campaigns', label: 'UTM Campaign' },
] as const;

const DEVICE_TABS = [
  { id: 'device_types', label: 'Device Type' },
  { id: 'browsers', label: 'Browser' },
  { id: 'oses', label: 'OS' },
] as const;

const GEO_TABS = [
  { id: 'countries', label: 'Countries' },
  { id: 'regions', label: 'Regions' },
  { id: 'cities', label: 'Cities' },
] as const;

export default function WebAnalyticsPage() {
  const { dateFrom, dateTo, setDateRange, queryParams } = useWebAnalyticsParams();
  const [chartMetric, setChartMetric] = useState<MetricKey>('unique_visitors');

  const overview = useWebOverview(queryParams);
  const paths = useWebPaths(queryParams);
  const sources = useWebSources(queryParams);
  const devices = useWebDevices(queryParams);
  const geography = useWebGeography(queryParams);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader title="Web Analytics" />
        <WebFilterBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateRangeChange={setDateRange}
        />
      </div>

      <WebKpiRow
        current={overview.data?.current}
        previous={overview.data?.previous}
        isLoading={overview.isLoading}
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
          title="Paths"
          tabs={PATH_TABS}
          data={{
            top_pages: paths.data?.top_pages,
            entry_pages: paths.data?.entry_pages,
            exit_pages: paths.data?.exit_pages,
          }}
          isLoading={paths.isLoading}
        />
        <WebDimensionTile
          title="Sources"
          tabs={SOURCE_TABS}
          data={{
            referrers: sources.data?.referrers,
            utm_sources: sources.data?.utm_sources,
            utm_mediums: sources.data?.utm_mediums,
            utm_campaigns: sources.data?.utm_campaigns,
          }}
          isLoading={sources.isLoading}
        />
        <WebDimensionTile
          title="Devices"
          tabs={DEVICE_TABS}
          data={{
            device_types: devices.data?.device_types,
            browsers: devices.data?.browsers,
            oses: devices.data?.oses,
          }}
          isLoading={devices.isLoading}
        />
        <WebDimensionTile
          title="Geography"
          tabs={GEO_TABS}
          data={{
            countries: geography.data?.countries,
            regions: geography.data?.regions,
            cities: geography.data?.cities,
          }}
          isLoading={geography.isLoading}
        />
      </div>
    </div>
  );
}
