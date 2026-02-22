import type { PathsWidgetConfig } from '@/api/generated/Api';

export function defaultPathsConfig(): PathsWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'paths',
    date_from: from,
    date_to: to,
    step_limit: 5,
  };
}
