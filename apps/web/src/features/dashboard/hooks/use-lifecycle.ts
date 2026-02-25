import { api } from '@/api/client';
import type { LifecycleWidgetConfig, LifecycleResponse, LifecycleControllerGetLifecycleParams } from '@/api/generated/Api';
import { createTargetEventHook } from './create-target-event-hook';

export const useLifecycleData = createTargetEventHook<LifecycleWidgetConfig, LifecycleResponse, LifecycleControllerGetLifecycleParams>({
  queryKeyPrefix: 'lifecycle',
  apiFn: (params) => api.lifecycleControllerGetLifecycle(params),
});
