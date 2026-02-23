import { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PropertyConditionRow } from './PropertyConditionRow';
import { EventConditionRow } from './EventConditionRow';
import { CohortConditionRow } from './CohortConditionRow';
import { FirstTimeEventRow } from './FirstTimeEventRow';
import { NotPerformedEventRow } from './NotPerformedEventRow';
import { EventSequenceRow } from './EventSequenceRow';
import { PerformedRegularlyRow } from './PerformedRegularlyRow';
import { StoppedPerformingRow } from './StoppedPerformingRow';
import { RestartedPerformingRow } from './RestartedPerformingRow';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './CohortGroupBuilder.translations';
import { createDefaultCondition, type CohortCondition, type CohortConditionGroup } from '../types';

interface CohortGroupBuilderProps {
  /** The top-level definition is always an OR of AND groups */
  groups: CohortConditionGroup[];
  onChange: (groups: CohortConditionGroup[]) => void;
  /** Current cohort ID to exclude from cohort-ref dropdown */
  excludeCohortId?: string;
}

export function CohortGroupBuilder({ groups, onChange, excludeCohortId }: CohortGroupBuilderProps) {
  const { t } = useLocalTranslation(translations);

  const addGroup = useCallback(() => {
    onChange([...groups, { type: 'AND', values: [] }]);
  }, [groups, onChange]);

  const updateGroup = useCallback((groupIdx: number, group: CohortConditionGroup) => {
    onChange(groups.map((g, i) => (i === groupIdx ? group : g)));
  }, [groups, onChange]);

  const removeGroup = useCallback((groupIdx: number) => {
    onChange(groups.filter((_, i) => i !== groupIdx));
  }, [groups, onChange]);

  return (
    <div className="space-y-3">
      {groups.map((group, groupIdx) => (
        <div key={groupIdx}>
          {groupIdx > 0 && (
            <div className="flex items-center gap-2 py-1.5">
              <div className="flex-1 border-t border-primary/30" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary/60">
                {t('or')}
              </span>
              <div className="flex-1 border-t border-primary/30" />
            </div>
          )}
          <AndGroupCard
            group={group}
            onUpdate={(g) => updateGroup(groupIdx, g)}
            onRemove={groups.length > 1 ? () => removeGroup(groupIdx) : undefined}
            excludeCohortId={excludeCohortId}
          />
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs h-7 border-dashed"
        onClick={addGroup}
      >
        <Plus className="h-3 w-3 mr-1" />
        {t('addOrGroup')}
      </Button>
    </div>
  );
}

/** A single AND group — a card with conditions joined by AND */
function AndGroupCard({
  group,
  onUpdate,
  onRemove,
  excludeCohortId,
}: {
  group: CohortConditionGroup;
  onUpdate: (g: CohortConditionGroup) => void;
  onRemove?: () => void;
  excludeCohortId?: string;
}) {
  const { t } = useLocalTranslation(translations);
  const conditions = group.values as CohortCondition[];

  const addCondition = useCallback((type: CohortCondition['type']) => {
    onUpdate({ ...group, values: [...conditions, createDefaultCondition(type)] });
  }, [group, conditions, onUpdate]);

  const updateCondition = useCallback((idx: number, cond: CohortCondition) => {
    onUpdate({ ...group, values: conditions.map((c, i) => (i === idx ? cond : c)) });
  }, [group, conditions, onUpdate]);

  const removeCondition = useCallback((idx: number) => {
    onUpdate({ ...group, values: conditions.filter((_, i) => i !== idx) });
  }, [group, conditions, onUpdate]);

  const conditionTypes = useMemo(() => ({
    basic: [
      { type: 'person_property' as const, label: t('personProperty') },
      { type: 'event' as const, label: t('performedEvent') },
      { type: 'cohort' as const, label: t('cohortMembership') },
    ],
    behavioral: [
      { type: 'first_time_event' as const, label: t('firstTimeEvent') },
      { type: 'not_performed_event' as const, label: t('notPerformedEvent') },
      { type: 'event_sequence' as const, label: t('eventSequence') },
      { type: 'performed_regularly' as const, label: t('performedRegularly') },
      { type: 'stopped_performing' as const, label: t('stoppedPerforming') },
      { type: 'restarted_performing' as const, label: t('restartedPerforming') },
    ],
  }), [t]);

  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
      {onRemove && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="text-[10px] text-muted-foreground/50 hover:text-destructive transition-colors"
          >
            &times;
          </button>
        </div>
      )}

      {conditions.map((cond, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 border-t border-border/40" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {t('and')}
              </span>
              <div className="flex-1 border-t border-border/40" />
            </div>
          )}
          <ConditionSwitch
            condition={cond}
            onChange={(c) => updateCondition(idx, c)}
            onRemove={() => removeCondition(idx)}
            excludeCohortId={excludeCohortId}
          />
        </div>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full text-xs h-7">
            <Plus className="h-3 w-3 mr-1" />
            {t('addCondition')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <div className="px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('basicConditions')}</span>
          </div>
          {conditionTypes.basic.map((ct) => (
            <DropdownMenuItem key={ct.type} onClick={() => addCondition(ct.type)} className="text-xs">
              {ct.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('behavioralConditions')}</span>
          </div>
          {conditionTypes.behavioral.map((ct) => (
            <DropdownMenuItem key={ct.type} onClick={() => addCondition(ct.type)} className="text-xs">
              {ct.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Renders the right row component for a condition type */
function ConditionSwitch({
  condition,
  onChange,
  onRemove,
  excludeCohortId,
}: {
  condition: CohortCondition;
  onChange: (c: CohortCondition) => void;
  onRemove: () => void;
  excludeCohortId?: string;
}) {
  switch (condition.type) {
    case 'person_property':
      return <PropertyConditionRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'event':
      return <EventConditionRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'cohort':
      return <CohortConditionRow condition={condition} onChange={onChange} onRemove={onRemove} excludeCohortId={excludeCohortId} />;
    case 'first_time_event':
      return <FirstTimeEventRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'not_performed_event':
      return <NotPerformedEventRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'event_sequence':
      return <EventSequenceRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'performed_regularly':
      return <PerformedRegularlyRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'stopped_performing':
      return <StoppedPerformingRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'restarted_performing':
      return <RestartedPerformingRow condition={condition} onChange={onChange} onRemove={onRemove} />;
  }
}
