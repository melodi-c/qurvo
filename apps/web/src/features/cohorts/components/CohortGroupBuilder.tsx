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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PropertyConditionRow } from './PropertyConditionRow';
import { EventConditionRow } from './EventConditionRow';
import { CohortConditionRow } from './CohortConditionRow';
import { SimpleEventConditionRow } from './SimpleEventConditionRow';
import { EventSequenceRow } from './EventSequenceRow';
import { PerformedRegularlyRow } from './PerformedRegularlyRow';
import { StoppedPerformingRow } from './StoppedPerformingRow';
import { RestartedPerformingRow } from './RestartedPerformingRow';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './CohortGroupBuilder.translations';
import { createDefaultCondition, conditionKey, type CohortCondition, type CohortConditionGroup } from '../types';

/** Maximum number of OR groups allowed in the cohort builder */
const MAX_GROUPS = 10;

/** Horizontal divider with a centered label and optional subtext, used between OR groups and AND conditions */
function ConditionDivider({ label, subtext, variant }: { label: string; subtext?: string; variant: 'or' | 'and' }) {
  const isOr = variant === 'or';
  const borderClass = isOr ? 'border-primary/30' : 'border-border/40';
  const textClass = isOr
    ? 'font-bold text-primary/60'
    : 'font-semibold text-muted-foreground/50';
  const py = isOr ? 'py-1.5' : 'py-1';

  return (
    <div className={`flex flex-col items-center gap-0.5 ${py}`}>
      <div className="flex items-center gap-2 w-full">
        <div className={`flex-1 border-t ${borderClass}`} />
        <span className={`text-[10px] uppercase tracking-wider ${textClass}`}>
          {label}
        </span>
        <div className={`flex-1 border-t ${borderClass}`} />
      </div>
      {subtext && (
        <span className="text-[10px] text-muted-foreground/40 italic">
          {subtext}
        </span>
      )}
    </div>
  );
}

interface CohortGroupBuilderProps {
  /** The top-level definition is always an OR of AND groups */
  groups: CohortConditionGroup[];
  onChange: (groups: CohortConditionGroup[]) => void;
  /** Current cohort ID to exclude from cohort-ref dropdown */
  excludeCohortId?: string;
}

export function CohortGroupBuilder({ groups, onChange, excludeCohortId }: CohortGroupBuilderProps) {
  const { t } = useLocalTranslation(translations);

  const atMaxGroups = groups.length >= MAX_GROUPS;

  const addGroup = useCallback(() => {
    if (groups.length >= MAX_GROUPS) {return;}
    onChange([...groups, { type: 'AND', values: [], _key: conditionKey() }]);
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
        <div key={group._key ?? groupIdx}>
          {groupIdx > 0 && (
            <ConditionDivider label={t('or')} subtext={t('orSubtext')} variant="or" />
          )}
          <AndGroupCard
            group={group}
            groupIndex={groupIdx}
            onUpdate={(g) => updateGroup(groupIdx, g)}
            onRemove={groups.length > 1 ? () => removeGroup(groupIdx) : undefined}
            excludeCohortId={excludeCohortId}
          />
        </div>
      ))}

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-full" tabIndex={atMaxGroups ? 0 : undefined}>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-7 border-dashed"
              onClick={addGroup}
              disabled={atMaxGroups}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('addOrGroup')}
            </Button>
          </span>
        </TooltipTrigger>
        {atMaxGroups && (
          <TooltipContent>
            {t('maxGroupsReached', { max: String(MAX_GROUPS) })}
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}

/** A single AND group — a card with conditions joined by AND */
function AndGroupCard({
  group,
  groupIndex,
  onUpdate,
  onRemove,
  excludeCohortId,
}: {
  group: CohortConditionGroup;
  groupIndex: number;
  onUpdate: (g: CohortConditionGroup) => void;
  onRemove?: () => void;
  excludeCohortId?: string;
}) {
  const { t } = useLocalTranslation(translations);
  const conditions = group.values as CohortCondition[];

  const groupLabel = String(groupIndex + 1);

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
      { type: 'person_property' as const, label: t('personProperty'), description: t('descPersonProperty') },
      { type: 'event' as const, label: t('performedEvent'), description: t('descPerformedEvent') },
      { type: 'cohort' as const, label: t('cohortMembership'), description: t('descCohortMembership') },
    ],
    behavioral: [
      { type: 'first_time_event' as const, label: t('firstTimeEvent'), description: t('descFirstTimeEvent') },
      { type: 'not_performed_event' as const, label: t('notPerformedEvent'), description: t('descNotPerformedEvent') },
      { type: 'event_sequence' as const, label: t('eventSequence'), description: t('descEventSequence') },
      { type: 'not_performed_event_sequence' as const, label: t('notPerformedEventSequence'), description: t('descNotPerformedEventSequence') },
      { type: 'performed_regularly' as const, label: t('performedRegularly'), description: t('descPerformedRegularly') },
      { type: 'stopped_performing' as const, label: t('stoppedPerforming'), description: t('descStoppedPerforming') },
      { type: 'restarted_performing' as const, label: t('restartedPerforming'), description: t('descRestartedPerforming') },
    ],
  }), [t]);

  return (
    <div className="relative rounded-lg border border-border bg-muted/10 p-3 space-y-2.5">
      {/* Group label badge (1, 2, 3...) */}
      <div className="absolute top-2 left-2 flex items-center justify-center h-4 w-4 rounded-sm bg-muted text-[10px] font-bold text-muted-foreground select-none">
        {groupLabel}
      </div>

      {onRemove && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            aria-label={t('removeGroup')}
            className="text-muted-foreground/50 hover:text-destructive"
          >
            &times;
          </Button>
        </div>
      )}

      {/* Add top padding when no remove button to offset the group label badge */}
      {!onRemove && <div className="h-2" />}

      {conditions.map((cond, idx) => (
        <div key={cond._key ?? idx}>
          {idx > 0 && (
            <ConditionDivider label={t('and')} subtext={t('andSubtext')} variant="and" />
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
        <DropdownMenuContent align="start" className="w-64">
          <div className="px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('basicConditions')}</span>
          </div>
          {conditionTypes.basic.map((ct) => (
            <DropdownMenuItem key={ct.type} onClick={() => addCondition(ct.type)} className="text-xs flex flex-col items-start gap-0.5 py-2">
              <span>{ct.label}</span>
              <span className="text-[10px] text-muted-foreground font-normal leading-tight">{ct.description}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('behavioralConditions')}</span>
          </div>
          {conditionTypes.behavioral.map((ct) => (
            <DropdownMenuItem key={ct.type} onClick={() => addCondition(ct.type)} className="text-xs flex flex-col items-start gap-0.5 py-2">
              <span>{ct.label}</span>
              <span className="text-[10px] text-muted-foreground font-normal leading-tight">{ct.description}</span>
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
      return <SimpleEventConditionRow condition={condition} onChange={onChange} onRemove={onRemove} variant="first_time" />;
    case 'not_performed_event':
      return <SimpleEventConditionRow condition={condition} onChange={onChange} onRemove={onRemove} variant="not_performed" />;
    case 'event_sequence':
      return <EventSequenceRow condition={condition} onChange={onChange} onRemove={onRemove} variant="performed" />;
    case 'not_performed_event_sequence':
      return <EventSequenceRow condition={condition} onChange={onChange} onRemove={onRemove} variant="not_performed" />;
    case 'performed_regularly':
      return <PerformedRegularlyRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'stopped_performing':
      return <StoppedPerformingRow condition={condition} onChange={onChange} onRemove={onRemove} />;
    case 'restarted_performing':
      return <RestartedPerformingRow condition={condition} onChange={onChange} onRemove={onRemove} />;
  }
}
