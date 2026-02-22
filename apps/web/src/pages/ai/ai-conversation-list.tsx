import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

const API_URL = import.meta.env.VITE_API_URL || '';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AiConversationListProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function useConversations(projectId: string) {
  return useQuery<Conversation[]>({
    queryKey: ['ai-conversations', projectId],
    queryFn: async () => {
      const token = localStorage.getItem('qurvo_token');
      const res = await fetch(
        `${API_URL}/api/ai/conversations?project_id=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to load conversations');
      return res.json();
    },
    enabled: !!projectId,
  });
}

function useDeleteConversation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem('qurvo_token');
      await fetch(`${API_URL}/api/ai/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-conversations', projectId] });
    },
  });
}

export function AiConversationList({ activeId, onSelect, onNew }: AiConversationListProps) {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const { data: conversations, isLoading } = useConversations(projectId);
  const deleteMutation = useDeleteConversation(projectId);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onNew}>
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading && (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading...</div>
        )}
        {conversations?.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              'group flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer text-sm transition-colors',
              activeId === conv.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
            )}
            onClick={() => onSelect(conv.id)}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 truncate">{conv.title}</span>
            <button
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate(conv.id);
              }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        {!isLoading && conversations?.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No conversations yet
          </div>
        )}
      </div>
    </div>
  );
}
