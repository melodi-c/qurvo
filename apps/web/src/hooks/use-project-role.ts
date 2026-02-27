import { useQueryClient } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import type { ProjectWithRole } from '@/api/generated/Api';

/**
 * Returns the current user's role in the active project by reading from the
 * already-fetched ['projects'] query cache (loaded by the layout on mount).
 * Returns undefined while the projects list is not yet in cache.
 */
export function useProjectRole(): 'owner' | 'editor' | 'viewer' | undefined {
  const qc = useQueryClient();
  const projectId = useProjectId();

  if (!projectId) return undefined;

  const projects = qc.getQueryData<ProjectWithRole[]>(['projects']);
  const project = projects?.find((p) => p.id === projectId);
  return project?.role;
}
