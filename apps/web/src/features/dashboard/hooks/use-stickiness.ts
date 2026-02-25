import { api } from '@/api/client';
import type { StickinessWidgetConfig, StickinessResponse, StickinessControllerGetStickinessParams } from '@/api/generated/Api';
import { createTargetEventHook } from './create-target-event-hook';

export const useStickinessData = createTargetEventHook<StickinessWidgetConfig, StickinessResponse, StickinessControllerGetStickinessParams>({
  queryKeyPrefix: 'stickiness',
  apiFn: (params) => api.stickinessControllerGetStickiness(params),
});
