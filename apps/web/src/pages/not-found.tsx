import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { routes } from '@/lib/routes';
import translations from './not-found.translations';

export default function NotFoundPage() {
  const { t } = useLocalTranslation(translations);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <EmptyState
        icon={FileQuestion}
        title={t('title')}
        description={t('description')}
        action={
          <Button asChild>
            <Link to={routes.home()}>{t('goHome')}</Link>
          </Button>
        }
      />
    </div>
  );
}
