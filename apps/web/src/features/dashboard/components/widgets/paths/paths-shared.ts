import type { PathsWidgetConfig } from '@/api/generated/Api';
import { defaultDateRange } from '@/lib/date-utils';

export function defaultPathsConfig(): PathsWidgetConfig {
  const { from, to } = defaultDateRange();
  return {
    type: 'paths',
    date_from: from,
    date_to: to,
    step_limit: 5,
  };
}
