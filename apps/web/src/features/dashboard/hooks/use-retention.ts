import { api } from '@/api/client';
import type { RetentionWidgetConfig, RetentionResponse, RetentionControllerGetRetentionParams } from '@/api/generated/Api';
import { createTargetEventHook } from './create-target-event-hook';

export const useRetentionData = createTargetEventHook<RetentionWidgetConfig, RetentionResponse, RetentionControllerGetRetentionParams>({
  queryKeyPrefix: 'retention',
  apiFn: (params) => api.retentionControllerGetRetention(params),
  extraHash: (config) => ({
    retention_type: config.retention_type,
    periods: config.periods,
  }),
  extraParams: (config) => ({
    retention_type: config.retention_type,
    periods: config.periods,
  }),
});
