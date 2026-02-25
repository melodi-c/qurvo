import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Bot, User, Pencil, ThumbsUp, ThumbsDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { AiToolResult } from './ai-tool-result';
import { AiToolProgress } from './ai-tool-progress';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './ai-message.translations';
import type { AiMessageData } from '@/features/ai/hooks/use-ai-chat';
import { useAiMessageFeedback, type FeedbackRating } from '@/features/ai/hooks/use-ai-feedback';

interface AiMessageProps {
  message: AiMessageData;
  isStreaming?: boolean;
  onSuggestionClick?: (text: string) => void;
  onEdit?: (sequence: number, newText: string) => void;
}

function parseSuggestions(content: string): { text: string; suggestions: string[] } {
  const match = content.match(/\[SUGGESTIONS\]\s*\n([\s\S]*?)$/);
  if (!match) return { text: content, suggestions: [] };
  const text = content.slice(0, match.index).trimEnd();
  const suggestions = match[1]
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return { text, suggestions };
}

export function AiMessage({ message, isStreaming, onSuggestionClick, onEdit }: AiMessageProps) {
  const { t } = useLocalTranslation(translations);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Feedback state
  const [feedback, setFeedback] = useState<FeedbackRating | null>(null);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState('');
  const { submitFeedback, deleteFeedback, isSubmitting } = useAiMessageFeedback(message.id);

  const canGiveFeedback = isAssistant && !isStreaming && !!message.content;

  const handleThumbsUp = useCallback(() => {
    if (feedback === 'positive') {
      deleteFeedback(undefined, {
        onSuccess: () => setFeedback(null),
      });
    } else {
      setShowCommentBox(false);
      setComment('');
      submitFeedback({ rating: 'positive' }, {
        onSuccess: () => {
          setFeedback('positive');
        },
      });
    }
  }, [feedback, submitFeedback, deleteFeedback]);

  const handleThumbsDown = useCallback(() => {
    if (feedback === 'negative') {
      deleteFeedback(undefined, {
        onSuccess: () => {
          setFeedback(null);
          setShowCommentBox(false);
          setComment('');
        },
      });
    } else {
      setShowCommentBox(true);
      setFeedback('negative');
    }
  }, [feedback, deleteFeedback]);

  const submitNegativeFeedback = useCallback(() => {
    submitFeedback({ rating: 'negative', comment: comment.trim() || undefined }, {
      onSuccess: () => {
        setShowCommentBox(false);
      },
    });
  }, [submitFeedback, comment]);

  const cancelNegativeFeedback = useCallback(() => {
    if (feedback === 'negative' && !showCommentBox) return;
    setShowCommentBox(false);
    setComment('');
    if (feedback === 'negative') {
      setFeedback(null);
    }
  }, [feedback, showCommentBox]);

  const canEdit = isUser && onEdit && message.sequence !== undefined && !isStreaming;

  const startEdit = useCallback(() => {
    setEditText(message.content ?? '');
    setIsEditing(true);
  }, [message.content]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText('');
  }, []);

  const submitEdit = useCallback(() => {
    const text = editText.trim();
    if (!text || message.sequence === undefined) return;
    setIsEditing(false);
    setEditText('');
    onEdit?.(message.sequence, text);
  }, [editText, message.sequence, onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitEdit();
      }
      if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [submitEdit, cancelEdit],
  );

  // Auto-focus and select all text when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const { text, suggestions } = useMemo(() => {
    if (message.role === 'tool') return { text: '', suggestions: [] };
    if (!isUser && message.content && !message.isStreaming) {
      return parseSuggestions(message.content);
    }
    return { text: message.content ?? '', suggestions: [] };
  }, [message.role, isUser, message.content, message.isStreaming]);

  if (message.role === 'tool') {
    if (message.isPendingTool) {
      return (
        <AiToolProgress
          toolName={message.tool_name ?? ''}
          toolArgs={message.tool_args ?? {}}
        />
      );
    }
    return (
      <AiToolResult
        toolName={message.tool_name ?? ''}
        result={message.tool_result}
        visualizationType={message.visualization_type ?? null}
      />
    );
  }

  if (!message.content && !message.isStreaming) return null;

  if (isEditing) {
    return (
      <div className="flex gap-3 flex-row-reverse">
        <div className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 bg-primary/15 text-primary">
          <User className="w-3.5 h-3.5" />
        </div>
        <div className="max-w-[80%] flex flex-col gap-2 flex-1">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            className="w-full resize-none bg-input/30 border border-primary/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 max-h-48"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={cancelEdit}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={submitEdit} disabled={!editText.trim()}>
              {t('saveAndRetry')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex gap-3', isUser && 'flex-row-reverse')}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5',
          isUser ? 'bg-primary/15 text-primary' : 'bg-accent text-muted-foreground',
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className="max-w-[80%] flex flex-col gap-2">
        <div className="relative group">
          {canEdit && isHovered && (
            <button
              onClick={startEdit}
              aria-label={t('editMessage')}
              className="absolute -left-7 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <div
            className={cn(
              'rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent/50 text-foreground',
            )}
          >
            {message.content && isUser && (
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
            )}
            {message.content && !isUser && (
              <div className="ai-markdown break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {text}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-foreground/60 ml-0.5 animate-pulse" />
                )}
              </div>
            )}
            {!message.content && message.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-foreground/60 animate-pulse" />
            )}
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => onSuggestionClick?.(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
        {canGiveFeedback && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1">
              <button
                onClick={handleThumbsUp}
                disabled={isSubmitting}
                aria-label={t('thumbsUp')}
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded transition-colors',
                  feedback === 'positive'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <ThumbsUp className={cn('w-3.5 h-3.5', feedback === 'positive' && 'fill-current')} />
              </button>
              <button
                onClick={handleThumbsDown}
                disabled={isSubmitting}
                aria-label={t('thumbsDown')}
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded transition-colors',
                  feedback === 'negative'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <ThumbsDown className={cn('w-3.5 h-3.5', feedback === 'negative' && 'fill-current')} />
              </button>
            </div>
            {showCommentBox && (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('feedbackComment')}
                  rows={2}
                  className="w-full resize-none bg-input/30 border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 max-h-32"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={cancelNegativeFeedback} className="h-6 text-xs px-2">
                    {t('cancelFeedback')}
                  </Button>
                  <Button size="sm" onClick={submitNegativeFeedback} disabled={isSubmitting} className="h-6 text-xs px-2">
                    {t('submitFeedback')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
