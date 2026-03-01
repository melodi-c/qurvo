import type { PathsWidgetConfig } from '@/api/generated/Api';
import { todayIso } from '@/lib/date-utils';

export function defaultPathsConfig(): PathsWidgetConfig {
  return {
    type: 'paths',
    date_from: '-30d',
    date_to: todayIso(),
    step_limit: 5,
  };
}
