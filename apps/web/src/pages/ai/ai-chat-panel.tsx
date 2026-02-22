import { useState, useRef, useEffect, useCallback } from 'react';
import { SendHorizonal, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiMessage } from './ai-message';
import type { AiMessageData } from './use-ai-chat';

interface AiChatPanelProps {
  messages: AiMessageData[];
  isStreaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function AiChatPanel({ messages, isStreaming, error, onSend, onStop }: AiChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
            <p className="text-lg font-medium text-foreground mb-1">Ask about your data</p>
            <p>Try: "How many signups last week?" or "Show me a retention chart"</p>
          </div>
        )}
        {messages.map((msg) => (
          <AiMessage key={msg.id} message={msg} />
        ))}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your analytics data..."
            rows={1}
            className="flex-1 resize-none bg-accent/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 max-h-32"
            style={{ minHeight: '38px' }}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button size="icon" variant="outline" onClick={onStop} className="shrink-0">
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="shrink-0"
            >
              <SendHorizonal className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
