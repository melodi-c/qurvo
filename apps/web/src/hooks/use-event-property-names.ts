import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { api } from '@/api/client';
import { usePropertyDefinitions, buildPropertyDescriptionMap } from './use-property-definitions';

export function useEventPropertyNames(eventName?: string) {
  const projectId = useProjectId();

  const namesQuery = useQuery({
    queryKey: ['event-property-names', projectId, eventName ?? ''],
    queryFn: async () => {
      const result = await api.eventsControllerGetEventPropertyNames({
        project_id: projectId,
        event_name: eventName || undefined,
      });
      return result.property_names;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: definitions = [] } = usePropertyDefinitions('event', eventName);
  const descriptions = useMemo(() => buildPropertyDescriptionMap(definitions), [definitions]);

  return {
    ...namesQuery,
    descriptions,
  };
}
