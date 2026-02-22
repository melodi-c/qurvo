import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AiToolResult } from './ai-tool-result';
import type { AiMessageData } from './use-ai-chat';

interface AiMessageProps {
  message: AiMessageData;
}

export function AiMessage({ message }: AiMessageProps) {
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
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
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
              {message.content}
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
  );
}
