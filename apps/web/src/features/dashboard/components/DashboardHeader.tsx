import { useState } from 'react';
import { CalendarDays, Pencil, X, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ShareDialog } from '@/components/ui/share-dialog';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { useDashboardStore } from '../store';
import { hasActiveOverrides } from '../lib/filter-overrides';
import { useProjectId } from '@/hooks/use-project-id';
import { useProjectStore } from '@/stores/project';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getPresetLabelKey, formatAbsoluteDate, resolveRelativeDate, isRelativeDate } from '@/lib/date-utils';
import dateRangeTranslations from '@/components/ui/date-range-section.translations';
import translations from './DashboardHeader.translations';

function useDateRangeLabel(dateFrom: string | null, dateTo: string | null) {
  const { t: tDate } = useLocalTranslation(dateRangeTranslations);
  const { t } = useLocalTranslation(translations);
  const timezone = useProjectStore((s) => s.projectTimezone);

  if (!dateFrom || !dateTo) {
    return t('perWidget');
  }

  const presetKey = getPresetLabelKey(dateFrom);
  if (presetKey) {
    return tDate(presetKey);
  }

  const fromDisplay = isRelativeDate(dateFrom)
    ? formatAbsoluteDate(resolveRelativeDate(dateFrom, timezone))
    : formatAbsoluteDate(dateFrom);
  const toDisplay = isRelativeDate(dateTo)
    ? formatAbsoluteDate(resolveRelativeDate(dateTo, timezone))
    : formatAbsoluteDate(dateTo);

  return `${fromDisplay} – ${toDisplay}`;
}

export function DashboardHeader() {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const localName = useDashboardStore((s) => s.localName);
  const dashboardId = useDashboardStore((s) => s.dashboardId);
  const filterOverrides = useDashboardStore((s) => s.filterOverrides);
  const setLocalName = useDashboardStore((s) => s.setLocalName);
  const setDateRange = useDashboardStore((s) => s.setDateRange);
  const enterEditMode = useDashboardStore((s) => s.enterEditMode);
  const cancelEditMode = useDashboardStore((s) => s.cancelEditMode);
  const projectId = useProjectId();
  const timezone = useProjectStore((s) => s.projectTimezone);
  const { t } = useLocalTranslation(translations);
  const [shareOpen, setShareOpen] = useState(false);

  const hasDateRange = hasActiveOverrides(filterOverrides);
  const dateLabel = useDateRangeLabel(filterOverrides.dateFrom, filterOverrides.dateTo);

  return (
    <>
      <PageHeader
        title={
          isEditing ? (
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              aria-label={t('dashboardName')}
              className="text-base font-semibold h-auto py-1"
            />
          ) : (
            <h1 className="text-base font-semibold truncate">{localName}</h1>
          )
        }
      >
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {/* Date range: badge in view mode, popover in edit mode */}
          {isEditing ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  {dateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="space-y-3">
                  {hasDateRange && filterOverrides.dateFrom && filterOverrides.dateTo ? (
                    <>
                      <DateRangeSection
                        dateFrom={filterOverrides.dateFrom}
                        dateTo={filterOverrides.dateTo}
                        onChange={(from, to) => setDateRange(from, to)}
                        timezone={timezone}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setDateRange(null, null)}
                      >
                        {t('clearDateRange')}
                      </Button>
                    </>
                  ) : (
                    <DateRangeSection
                      dateFrom="-30d"
                      dateTo={new Date().toISOString().slice(0, 10)}
                      onChange={(from, to) => setDateRange(from, to)}
                      timezone={timezone}
                    />
                  )}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Badge variant="secondary" className="gap-1.5">
              <CalendarDays className="h-3 w-3" />
              {dateLabel}
            </Badge>
          )}

          {!isEditing && dashboardId && (
            <Button variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4 mr-2" />
              {t('share')}
            </Button>
          )}
          <Button
            variant={isEditing ? 'secondary' : 'outline'}
            onClick={() => (isEditing ? cancelEditMode() : enterEditMode())}
          >
            {isEditing ? (
              <>
                <X className="h-4 w-4 mr-2" />
                {t('cancel')}
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4 mr-2" />
                {t('edit')}
              </>
            )}
          </Button>
        </div>
      </PageHeader>

      {dashboardId && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          resourceType="dashboard"
          resourceId={dashboardId}
          projectId={projectId}
        />
      )}
    </>
  );
}
