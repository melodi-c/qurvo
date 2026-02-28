import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { routes } from '@/lib/routes';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from '@/pages/projects.translations';

export function useProjects() {
  const { t } = useLocalTranslation(translations);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: projects, isLoading, isError, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projectsControllerList(),
  });

  const isFirstProject = !projects || projects.length === 0;

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => api.projectsControllerCreate(data),
    onSuccess: async (newProject) => {
      if (isFirstProject) {
        await queryClient.invalidateQueries({ queryKey: ['projects'] });
        navigate(routes.dashboards.list(newProject.id));
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const createDemoMutation = useMutation({
    mutationFn: () => api.projectsControllerCreateDemo(),
    onSuccess: async (demoProject) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('demoCreated'));
      navigate(routes.dashboards.list(demoProject.id));
    },
    onError: () => toast.error(t('demoFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projectsControllerRemove({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(t('deleted'));
    },
    onError: () => toast.error(t('deleteFailed')),
  });

  return {
    projects,
    isLoading,
    isError,
    refetch,
    createMutation,
    createDemoMutation,
    deleteMutation,
  };
}
