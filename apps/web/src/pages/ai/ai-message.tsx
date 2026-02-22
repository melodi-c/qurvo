import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { AiToolResult } from './ai-tool-result';
import type { AiMessageData } from './use-ai-chat';

interface AiMessageProps {
  message: AiMessageData;
  onSuggestionClick?: (text: string) => void;
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

export function AiMessage({ message, onSuggestionClick }: AiMessageProps) {
  if (message.role === 'tool') {
    return (
      <AiToolResult
        toolName={message.tool_name ?? ''}
        result={message.tool_result}
        visualizationType={message.visualization_type ?? null}
      />
    );
  }

  const isUser = message.role === 'user';

  const { text, suggestions } = useMemo(() => {
    if (!isUser && message.content && !message.isStreaming) {
      return parseSuggestions(message.content);
    }
    return { text: message.content ?? '', suggestions: [] };
  }, [isUser, message.content, message.isStreaming]);

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5',
          isUser ? 'bg-primary/15 text-primary' : 'bg-accent text-muted-foreground',
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className="max-w-[80%] flex flex-col gap-2">
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
      </div>
    </div>
  );
}
