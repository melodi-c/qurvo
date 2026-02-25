import { useState, useRef, useEffect, useCallback } from 'react';
import { SendHorizonal, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiMessage } from './ai-message';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './ai-chat-panel.translations';
import type { AiMessageData } from '@/features/ai/hooks/use-ai-chat';

interface AiChatPanelProps {
  messages: AiMessageData[];
  isStreaming: boolean;
  error: string | null;
  onSend?: (text: string) => void;
  onStop?: () => void;
  onEdit?: (sequence: number, newText: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  readOnly?: boolean;
  readOnlyMessage?: string;
}

export function AiChatPanel({
  messages,
  isStreaming,
  error,
  onSend,
  onStop,
  onEdit,
  hasMore,
  isLoadingMore,
  onLoadMore,
  readOnly = false,
  readOnlyMessage,
}: AiChatPanelProps) {
  const { t } = useLocalTranslation(translations);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const isInitialLoadRef = useRef(true);

  // Auto-scroll to bottom on new messages (but not when loading older messages)
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    // On initial load, scroll to bottom instantly (no animation)
    if (isInitialLoadRef.current && messages.length > 0) {
      isInitialLoadRef.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      return;
    }

    // If messages were prepended (loading older), maintain scroll position
    if (messages.length > prevCount && prevCount > 0) {
      const container = scrollContainerRef.current;
      if (container) {
        const addedCount = messages.length - prevCount;
        // Check if the first new message has a lower sequence (= older messages prepended)
        const isOlderPrepended =
          messages[0]?.sequence !== undefined &&
          addedCount > 0 &&
          container.scrollTop < 100;
        if (isOlderPrepended) return; // Don't auto-scroll
      }
    }

    // For new messages at the bottom, auto-scroll
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && !readOnly) inputRef.current?.focus();
  }, [isStreaming, readOnly]);

  // Detect scroll to top for loading more messages
  const handleScroll = useCallback(() => {
    if (!hasMore || isLoadingMore || !onLoadMore) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    if (container.scrollTop < 50) {
      const prevScrollHeight = container.scrollHeight;
      onLoadMore();
      // Restore scroll position after prepend
      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight;
      });
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming || !onSend) return;
    setInput('');
    onSend(text);
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
            <p className="text-lg font-medium text-foreground mb-1">{t('askTitle')}</p>
            <p>{t('askHint')}</p>
          </div>
        )}
        {messages.map((msg) => (
          <AiMessage
            key={msg.id}
            message={msg}
            isStreaming={isStreaming}
            onSuggestionClick={readOnly ? undefined : onSend}
            onEdit={readOnly ? undefined : onEdit}
          />
        ))}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {readOnly ? (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground text-center">
            {readOnlyMessage}
          </p>
        </div>
      ) : (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('inputPlaceholder')}
              rows={1}
              className="flex-1 resize-none bg-input/30 border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 max-h-32"
              style={{ minHeight: '38px' }}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button size="icon" variant="outline" onClick={onStop} className="shrink-0" aria-label={t('stopStreaming')}>
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="shrink-0"
                aria-label={t('sendMessage')}
              >
                <SendHorizonal className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
