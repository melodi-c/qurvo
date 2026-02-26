import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useProjectId } from '@/hooks/use-project-id';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { routes } from '@/lib/routes';
import translations from './ai-tab-nav.translations';

export function AiTabNav() {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();
  const location = useLocation();

  const chatPath = projectId ? routes.ai(projectId) : routes.ai.pattern;
  const discoveriesPath = projectId ? routes.aiDiscoveries(projectId) : routes.aiDiscoveries.pattern;
  const monitorsPath = projectId ? routes.aiMonitors(projectId) : routes.aiMonitors.pattern;
  const scheduledJobsPath = projectId ? routes.aiScheduledJobs(projectId) : routes.aiScheduledJobs.pattern;

  const tabs = useMemo(
    () => [
      { id: 'chat', label: t('chat'), path: chatPath },
      { id: 'discoveries', label: t('discoveries'), path: discoveriesPath },
      { id: 'monitors', label: t('monitors'), path: monitorsPath },
      { id: 'scheduledJobs', label: t('scheduledJobs'), path: scheduledJobsPath },
    ],
    [t, chatPath, discoveriesPath, monitorsPath, scheduledJobsPath],
  );

  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const isActive =
          tab.id === 'chat'
            ? location.pathname === tab.path
            : location.pathname.startsWith(tab.path);

        return (
          <Link
            key={tab.id}
            to={tab.path}
            className={cn(
              'relative px-3 py-2 text-sm font-medium transition-colors -mb-px',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {isActive && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
