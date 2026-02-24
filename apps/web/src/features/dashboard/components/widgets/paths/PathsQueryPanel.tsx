import { Route, Settings, Filter, Regex } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { SectionHeader } from '@/components/ui/section-header';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { EditableListSection } from './EditableListSection';
import translations from './PathsQueryPanel.translations';
import type { PathsWidgetConfig, PathCleaningRuleConfig, WildcardGroupConfig } from '@/api/generated/Api';

interface PathsQueryPanelProps {
  config: PathsWidgetConfig;
  onChange: (config: PathsWidgetConfig) => void;
}

export function PathsQueryPanel({ config, onChange }: PathsQueryPanelProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <QueryPanelShell>

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange({ ...config, date_from, date_to })}
        />

        <Separator />

        {/* Path Settings */}
        <section className="space-y-3">
          <SectionHeader icon={Route} label={t('pathSettings')} />

          <div className="space-y-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('steps')}</span>
              <Input
                type="number"
                min={3}
                max={10}
                value={config.step_limit}
                onChange={(e) => onChange({ ...config, step_limit: Math.min(10, Math.max(3, Number(e.target.value) || 5)) })}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('startEvent')}</span>
              <EventNameCombobox
                value={config.start_event ?? ''}
                onChange={(v) => onChange({ ...config, start_event: v || undefined })}
                placeholder={t('anyEvent')}
              />
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('endEvent')}</span>
              <EventNameCombobox
                value={config.end_event ?? ''}
                onChange={(v) => onChange({ ...config, end_event: v || undefined })}
                placeholder={t('anyEvent')}
              />
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('minUsersPerPath')}</span>
              <Input
                type="number"
                min={1}
                value={config.min_persons ?? 1}
                onChange={(e) => onChange({ ...config, min_persons: Math.max(1, Number(e.target.value) || 1) })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </section>

        <Separator />

        {/* Exclusions */}
        <EditableListSection<string>
          icon={Filter}
          label={t('exclusions')}
          items={config.exclusions ?? []}
          addLabel={t('addExclusion')}
          emptyItem=""
          renderItem={(ev, _idx, onItemChange) => (
            <EventNameCombobox
              value={ev}
              onChange={onItemChange}
              placeholder="event_name"
            />
          )}
          onChange={(items) => onChange({ ...config, exclusions: items.length ? items : undefined })}
        />

        <Separator />

        {/* Path Cleaning Rules */}
        <EditableListSection<PathCleaningRuleConfig>
          icon={Regex}
          label={t('pathCleaning')}
          items={config.path_cleaning_rules ?? []}
          addLabel={t('addRule')}
          emptyItem={{ regex: '', alias: '' }}
          renderItem={(rule, _idx, onItemChange) => (
            <>
              <Input
                value={rule.regex}
                onChange={(e) => onItemChange({ ...rule, regex: e.target.value })}
                placeholder="regex"
                className="h-8 text-xs font-mono flex-1"
              />
              <Input
                value={rule.alias}
                onChange={(e) => onItemChange({ ...rule, alias: e.target.value })}
                placeholder="alias"
                className="h-8 text-xs flex-1"
              />
            </>
          )}
          onChange={(items) => onChange({ ...config, path_cleaning_rules: items.length ? items : undefined })}
        />

        <Separator />

        {/* Wildcard Groups */}
        <EditableListSection<WildcardGroupConfig>
          icon={Settings}
          label={t('wildcardGroups')}
          items={config.wildcard_groups ?? []}
          addLabel={t('addGroup')}
          emptyItem={{ pattern: '', alias: '' }}
          renderItem={(wg, _idx, onItemChange) => (
            <>
              <Input
                value={wg.pattern}
                onChange={(e) => onItemChange({ ...wg, pattern: e.target.value })}
                placeholder="/product/*"
                className="h-8 text-xs font-mono flex-1"
              />
              <Input
                value={wg.alias}
                onChange={(e) => onItemChange({ ...wg, alias: e.target.value })}
                placeholder="Product page"
                className="h-8 text-xs flex-1"
              />
            </>
          )}
          onChange={(items) => onChange({ ...config, wildcard_groups: items.length ? items : undefined })}
        />

        <Separator />

        <CohortFilterSection
          value={config.cohort_ids ?? []}
          onChange={(cohort_ids) => onChange({ ...config, cohort_ids: cohort_ids.length ? cohort_ids : undefined })}
        />
    </QueryPanelShell>
  );
}
