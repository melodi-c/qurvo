import { useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useProjectId } from '@/hooks/use-project-id';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './index.translations';
import { AiListView } from './ai-list-view';
import { AiChatView } from './ai-chat-view';

export default function AiPage() {
  const { t } = useLocalTranslation(translations);
  const [searchParams] = useSearchParams();
  const projectId = useProjectId();
  const chatId = searchParams.get('chat');

  if (!projectId) {
    return <EmptyState icon={Sparkles} description={t('selectProject')} />;
  }

  if (chatId) {
    return <AiChatView chatId={chatId === 'new' ? null : chatId} projectId={projectId} />;
  }

  return <AiListView projectId={projectId} />;
}
