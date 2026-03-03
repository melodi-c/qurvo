import type { PathsWidgetConfig } from '@/api/generated/Api';

export function defaultPathsConfig(): PathsWidgetConfig {
  return {
    type: 'paths',
    date_from: '-30d',
    date_to: '-0d',
    step_limit: 5,
  };
}
