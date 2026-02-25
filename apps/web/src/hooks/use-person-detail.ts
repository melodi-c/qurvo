import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useProjectId } from '@/hooks/use-project-id';
import { api } from '@/api/client';

const LIMIT = 50;

export function usePersonDetail() {
  const { personId } = useParams<{ personId: string }>();
  const projectId = useProjectId();
  const [page, setPage] = useState(0);

  const { data: person, isLoading: personLoading, isError: personError } = useQuery({
    queryKey: ['person', projectId, personId],
    queryFn: () =>
      api.personsControllerGetPersonById({ personId: personId!, project_id: projectId }),
    enabled: !!projectId && !!personId,
  });

  const { data: events, isLoading: eventsLoading, isError: eventsError } = useQuery({
    queryKey: ['person-events', projectId, personId, page],
    queryFn: () =>
      api.personsControllerGetPersonEvents({
        personId: personId!,
        project_id: projectId,
        limit: LIMIT,
        offset: page * LIMIT,
      }),
    enabled: !!projectId && !!personId,
  });

  return {
    personId,
    projectId,
    person,
    personLoading,
    personError,
    events,
    eventsLoading,
    eventsError,
    page,
    setPage,
    limit: LIMIT,
  };
}
