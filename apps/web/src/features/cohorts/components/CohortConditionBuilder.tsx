import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PropertyConditionRow, type PropertyCondition } from './PropertyConditionRow';
import { EventConditionRow, type EventCondition } from './EventConditionRow';

export type CohortCondition = PropertyCondition | EventCondition;

interface CohortConditionBuilderProps {
  match: 'all' | 'any';
  conditions: CohortCondition[];
  onMatchChange: (match: 'all' | 'any') => void;
  onConditionsChange: (conditions: CohortCondition[]) => void;
}

export function CohortConditionBuilder({
  match,
  conditions,
  onMatchChange,
  onConditionsChange,
}: CohortConditionBuilderProps) {
  const addPropertyCondition = () => {
    onConditionsChange([
      ...conditions,
      { type: 'person_property', property: '', operator: 'eq', value: '' },
    ]);
  };

  const addEventCondition = () => {
    onConditionsChange([
      ...conditions,
      { type: 'event', event_name: '', count_operator: 'gte', count: 1, time_window_days: 30 },
    ]);
  };

  const updateCondition = (idx: number, cond: CohortCondition) => {
    onConditionsChange(conditions.map((c, i) => (i === idx ? cond : c)));
  };

  const removeCondition = (idx: number) => {
    onConditionsChange(conditions.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {/* Match mode toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Match</span>
        <div className="flex gap-1">
          {(['all', 'any'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onMatchChange(mode)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                match === mode
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {mode === 'all' ? 'ALL conditions' : 'ANY condition'}
            </button>
          ))}
        </div>
      </div>

      {/* Conditions list */}
      {conditions.map((cond, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 border-t border-border/40" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {match === 'all' ? 'AND' : 'OR'}
              </span>
              <div className="flex-1 border-t border-border/40" />
            </div>
          )}
          {cond.type === 'person_property' ? (
            <PropertyConditionRow
              condition={cond}
              onChange={(c) => updateCondition(idx, c)}
              onRemove={() => removeCondition(idx)}
            />
          ) : (
            <EventConditionRow
              condition={cond}
              onChange={(c) => updateCondition(idx, c)}
              onRemove={() => removeCondition(idx)}
            />
          )}
        </div>
      ))}

      {/* Add condition button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full text-xs h-7">
            <Plus className="h-3 w-3 mr-1" />
            Add condition
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={addPropertyCondition} className="text-xs">
            Person property
          </DropdownMenuItem>
          <DropdownMenuItem onClick={addEventCondition} className="text-xs">
            Performed event
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
