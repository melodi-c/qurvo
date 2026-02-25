import type { ElementType, ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useProjectId } from '@/hooks/use-project-id';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './require-project.translations';

interface RequireProjectProps {
  children: ReactNode;
  icon?: ElementType;
  description?: string;
}

export function RequireProject({ children, icon = FolderOpen, description }: RequireProjectProps): ReactNode {
  const projectId = useProjectId();
  const { t } = useLocalTranslation(translations);

  if (!projectId) {
    return <EmptyState icon={icon} description={description ?? t('selectProject')} />;
  }

  return children;
}
