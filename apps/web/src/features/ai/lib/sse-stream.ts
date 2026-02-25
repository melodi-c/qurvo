export interface SseConversationEvent {
  type: 'conversation';
  conversation_id: string;
}

export interface SseTextDeltaEvent {
  type: 'text_delta';
  content: string;
}

export interface SseToolCallStartEvent {
  type: 'tool_call_start';
  tool_call_id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface SseToolResultEvent {
  type: 'tool_result';
  tool_call_id: string;
  name: string;
  result: unknown;
  visualization_type?: string | null;
}

export interface SseErrorEvent {
  type: 'error';
  message: string;
}

export interface SseDoneEvent {
  type: 'done';
}

export type SseChunk =
  | SseConversationEvent
  | SseTextDeltaEvent
  | SseToolCallStartEvent
  | SseToolResultEvent
  | SseErrorEvent
  | SseDoneEvent;

export interface SseStreamCallbacks {
  onConversation: (conversationId: string) => void;
  onTextDelta: (content: string) => void;
  onToolCallStart: (event: SseToolCallStartEvent) => void;
  onToolResult: (event: SseToolResultEvent) => void;
  onError: (message: string) => void;
}

export async function consumeSseStream(
  response: Response,
  callbacks: SseStreamCallbacks,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json) continue;

      let chunk: SseChunk;
      try {
        chunk = JSON.parse(json);
      } catch {
        continue;
      }

      switch (chunk.type) {
        case 'conversation':
          callbacks.onConversation(chunk.conversation_id);
          break;
        case 'text_delta':
          callbacks.onTextDelta(chunk.content);
          break;
        case 'tool_call_start':
          callbacks.onToolCallStart(chunk);
          break;
        case 'tool_result':
          callbacks.onToolResult(chunk);
          break;
        case 'error':
          callbacks.onError(chunk.message);
          break;
        case 'done':
          break;
      }
    }
  }
}
