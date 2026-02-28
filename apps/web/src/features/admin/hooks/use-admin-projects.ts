import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { toast } from 'sonner';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from '@/pages/admin/projects/admin-project-detail.translations';

export function useAdminProjectDetail(id: string | undefined) {
  const { t } = useLocalTranslation(translations);
  const queryClient = useQueryClient();

  const { data: project, isLoading: isProjectLoading } = useQuery({
    queryKey: ['admin', 'projects', id],
    queryFn: () => apiClient.admin.adminProjectsControllerGetProject({ id: id! }),
    enabled: !!id,
  });

  const { data: plans, isLoading: isPlansLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => apiClient.admin.adminPlansControllerListPlans(),
  });

  const updatePlanMutation = useMutation({
    mutationFn: (plan_id: string | null) =>
      apiClient.admin.adminProjectsControllerPatchProject({ id: id! }, { plan_id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'projects', id] });
      toast.success(t('planUpdated'));
    },
    onError: () => toast.error(t('planUpdateFailed')),
  });

  return {
    project,
    isProjectLoading,
    plans,
    isPlansLoading,
    updatePlanMutation,
  };
}
