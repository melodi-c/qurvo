import { useParams } from 'react-router-dom';

export function useProjectId(): string {
  const { projectId } = useParams<{ projectId: string }>();
  return projectId ?? '';
}
