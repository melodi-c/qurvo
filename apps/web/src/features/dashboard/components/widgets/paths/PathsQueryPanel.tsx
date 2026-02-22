import { Plus, X, Route, Settings, Filter, Regex } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './PathsQueryPanel.translations';
import type { PathsWidgetConfig } from '@/api/generated/Api';

interface PathsQueryPanelProps {
  config: PathsWidgetConfig;
  onChange: (config: PathsWidgetConfig) => void;
}

export function PathsQueryPanel({ config, onChange }: PathsQueryPanelProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <aside className="w-full lg:w-[360px] shrink-0 border-b border-border lg:border-b-0 lg:border-r overflow-y-auto max-h-[50vh] lg:max-h-none">
      <div className="p-5 space-y-6">

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
        <section className="space-y-3">
          <SectionHeader icon={Filter} label={t('exclusions')} />
          <div className="space-y-2">
            {(config.exclusions ?? []).map((ev, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <EventNameCombobox
                  value={ev}
                  onChange={(v) => {
                    const next = [...(config.exclusions ?? [])];
                    next[idx] = v;
                    onChange({ ...config, exclusions: next });
                  }}
                  placeholder="event_name"
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => {
                    const next = (config.exclusions ?? []).filter((_, i) => i !== idx);
                    onChange({ ...config, exclusions: next.length ? next : undefined });
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={() => onChange({ ...config, exclusions: [...(config.exclusions ?? []), ''] })}
            >
              <Plus className="h-3 w-3 mr-1" /> {t('addExclusion')}
            </Button>
          </div>
        </section>

        <Separator />

        {/* Path Cleaning Rules */}
        <section className="space-y-3">
          <SectionHeader icon={Regex} label={t('pathCleaning')} />
          <div className="space-y-2">
            {(config.path_cleaning_rules ?? []).map((rule, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Input
                  value={rule.regex}
                  onChange={(e) => {
                    const next = [...(config.path_cleaning_rules ?? [])];
                    next[idx] = { ...rule, regex: e.target.value };
                    onChange({ ...config, path_cleaning_rules: next });
                  }}
                  placeholder="regex"
                  className="h-8 text-xs font-mono flex-1"
                />
                <Input
                  value={rule.alias}
                  onChange={(e) => {
                    const next = [...(config.path_cleaning_rules ?? [])];
                    next[idx] = { ...rule, alias: e.target.value };
                    onChange({ ...config, path_cleaning_rules: next });
                  }}
                  placeholder="alias"
                  className="h-8 text-xs flex-1"
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => {
                    const next = (config.path_cleaning_rules ?? []).filter((_, i) => i !== idx);
                    onChange({ ...config, path_cleaning_rules: next.length ? next : undefined });
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={() => onChange({ ...config, path_cleaning_rules: [...(config.path_cleaning_rules ?? []), { regex: '', alias: '' }] })}
            >
              <Plus className="h-3 w-3 mr-1" /> {t('addRule')}
            </Button>
          </div>
        </section>

        <Separator />

        {/* Wildcard Groups */}
        <section className="space-y-3">
          <SectionHeader icon={Settings} label={t('wildcardGroups')} />
          <div className="space-y-2">
            {(config.wildcard_groups ?? []).map((wg, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Input
                  value={wg.pattern}
                  onChange={(e) => {
                    const next = [...(config.wildcard_groups ?? [])];
                    next[idx] = { ...wg, pattern: e.target.value };
                    onChange({ ...config, wildcard_groups: next });
                  }}
                  placeholder="/product/*"
                  className="h-8 text-xs font-mono flex-1"
                />
                <Input
                  value={wg.alias}
                  onChange={(e) => {
                    const next = [...(config.wildcard_groups ?? [])];
                    next[idx] = { ...wg, alias: e.target.value };
                    onChange({ ...config, wildcard_groups: next });
                  }}
                  placeholder="Product page"
                  className="h-8 text-xs flex-1"
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => {
                    const next = (config.wildcard_groups ?? []).filter((_, i) => i !== idx);
                    onChange({ ...config, wildcard_groups: next.length ? next : undefined });
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={() => onChange({ ...config, wildcard_groups: [...(config.wildcard_groups ?? []), { pattern: '', alias: '' }] })}
            >
              <Plus className="h-3 w-3 mr-1" /> {t('addGroup')}
            </Button>
          </div>
        </section>

        <Separator />

        <CohortFilterSection
          value={config.cohort_ids ?? []}
          onChange={(cohort_ids) => onChange({ ...config, cohort_ids: cohort_ids.length ? cohort_ids : undefined })}
        />
      </div>
    </aside>
  );
}
