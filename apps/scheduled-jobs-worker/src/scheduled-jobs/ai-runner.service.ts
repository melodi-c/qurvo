import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/**
 * Calls the internal Qurvo API (/api/ai/chat) via SSE streaming and returns
 * the final assistant text. Requires:
 *   - INTERNAL_API_URL   (e.g. "http://api:3000")
 *   - INTERNAL_API_TOKEN (a valid Bearer session token for a service/admin user)
 */
@Injectable()
export class AiRunnerService {
  private readonly apiUrl: string | undefined;
  private readonly apiToken: string | undefined;

  constructor(
    @InjectPinoLogger(AiRunnerService.name) private readonly logger: PinoLogger,
  ) {
    this.apiUrl = process.env.INTERNAL_API_URL?.replace(/\/$/, '');
    this.apiToken = process.env.INTERNAL_API_TOKEN;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiToken);
  }

  /**
   * Runs a prompt through the AI chat endpoint (SSE) and returns the full
   * assistant response as a string.
   *
   * @throws Error if the API call fails or the stream returns an error event.
   */
  async runPrompt(projectId: string, prompt: string): Promise<string> {
    if (!this.apiUrl || !this.apiToken) {
      throw new Error('INTERNAL_API_URL and INTERNAL_API_TOKEN must be configured to use AI runner');
    }

    const url = `${this.apiUrl}/api/ai/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ project_id: projectId, message: prompt }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`AI API returned HTTP ${response.status}: ${body}`);
    }

    return this.consumeSseStream(response);
  }

  private async consumeSseStream(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let hasError = false;
    let errorMessage = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE lines are separated by "\n\n" (or "\n" per event line)
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          let chunk: { type: string; content?: string; message?: string };
          try {
            chunk = JSON.parse(json);
          } catch {
            this.logger.warn({ line }, 'Failed to parse SSE line as JSON');
            continue;
          }

          if (chunk.type === 'text_delta' && typeof chunk.content === 'string') {
            fullText += chunk.content;
          } else if (chunk.type === 'error') {
            hasError = true;
            errorMessage = chunk.message ?? 'Unknown AI error';
          }
          // 'conversation', 'tool_call_start', 'tool_result', 'done' — ignored
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (hasError) {
      throw new Error(`AI stream error: ${errorMessage}`);
    }

    return fullText || '(no response)';
  }
}
