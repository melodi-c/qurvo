import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import { extractApiErrorMessage } from '@/lib/utils';

const SAVE_COHORT_LIMIT = 500;

interface SaveAsCohortOptions {
  successMessage: string;
  errorMessage: string;
}

export function useSaveAsCohort(options: SaveAsCohortOptions) {
  const projectId = useProjectId();

  return useMutation({
    mutationFn: (params: { name: string; personIds: string[] }) =>
      api.staticCohortsControllerCreateStaticCohort(
        { projectId },
        {
          name: params.name,
          person_ids: params.personIds.slice(0, SAVE_COHORT_LIMIT),
        },
      ),
    onSuccess: () => {
      toast.success(options.successMessage);
    },
    onError: (err) => {
      toast.error(extractApiErrorMessage(err, options.errorMessage));
    },
  });
}

export { SAVE_COHORT_LIMIT };
