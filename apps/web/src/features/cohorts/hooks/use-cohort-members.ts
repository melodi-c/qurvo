import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import { useDebounce } from '@/hooks/use-debounce';
import { extractApiErrorMessage } from '@/lib/utils';

const PERSONS_LIMIT = 10;
const MEMBERS_LIMIT = 20;

interface MutationMessages {
  success: string;
  error: string;
}

export function useAddCohortMembers(cohortId: string, messages: MutationMessages) {
  const projectId = useProjectId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (personIds: string[]) =>
      api.staticCohortsControllerAddMembers(
        { projectId, cohortId },
        { person_ids: personIds },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId, cohortId, 'count'] });
      qc.invalidateQueries({ queryKey: ['cohorts', projectId, cohortId, 'members'] });
      toast.success(messages.success);
    },
    onError: (err) => {
      toast.error(extractApiErrorMessage(err, messages.error));
    },
  });
}

export function useRemoveCohortMembers(cohortId: string, messages: MutationMessages) {
  const projectId = useProjectId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (personIds: string[]) =>
      api.staticCohortsControllerRemoveMembers(
        { projectId, cohortId },
        { person_ids: personIds },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cohorts', projectId, cohortId, 'count'] });
      qc.invalidateQueries({ queryKey: ['cohorts', projectId, cohortId, 'members'] });
      toast.success(messages.success);
    },
    onError: (err) => {
      toast.error(extractApiErrorMessage(err, messages.error));
    },
  });
}

export function usePersonSearch(search: string, page: number) {
  const projectId = useProjectId();
  const debouncedSearch = useDebounce(search, 400);

  return useQuery({
    queryKey: ['persons-search', projectId, debouncedSearch, page],
    queryFn: () =>
      api.personsControllerGetPersons({
        project_id: projectId,
        search: debouncedSearch || undefined,
        limit: PERSONS_LIMIT,
        offset: page * PERSONS_LIMIT,
      }),
    enabled: !!projectId,
  });
}

export function useStaticCohortMembers(cohortId: string, page: number) {
  const projectId = useProjectId();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['cohorts', projectId, cohortId, 'members', page],
    queryFn: () =>
      api.staticCohortsControllerGetMembers({
        projectId,
        cohortId,
        limit: MEMBERS_LIMIT,
        offset: page * MEMBERS_LIMIT,
      }),
    enabled: !!projectId && !!cohortId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cohorts', projectId, cohortId, 'members'] });
  };

  return { ...query, invalidate };
}

export { PERSONS_LIMIT, MEMBERS_LIMIT };
