import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import OpenAI from 'openai';
import { AiChatService } from './ai-chat.service';
import { AI_SUMMARIZATION_MODEL, AI_SUMMARY_KEEP_RECENT, AI_RETRY_MAX_ATTEMPTS, AI_RETRY_BASE_DELAY_MS } from '../constants';

@Injectable()
export class AiSummarizationService implements OnModuleDestroy {
  private readonly logger = new Logger(AiSummarizationService.name);
  private readonly activeTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly chatService: AiChatService) {}

  onModuleDestroy(): void {
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }

  /**
   * Schedules summarization with up to 2 retries (3 total attempts) using exponential
   * backoff (30 s, 60 s). Logs every failure. If all attempts fail, marks the
   * conversation with summary_failed = true so no further attempts are made.
   */
  schedule(client: OpenAI, conversationId: string, attempt = 1): void {
    this.update(client, conversationId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { conversationId, attempt, error: message },
        `Summarization failed (attempt ${attempt}/${AI_RETRY_MAX_ATTEMPTS})`,
      );

      if (attempt < AI_RETRY_MAX_ATTEMPTS) {
        const delayMs = AI_RETRY_BASE_DELAY_MS * attempt; // 30 s, 60 s
        const timer = setTimeout(() => {
          this.activeTimers.delete(timer);
          this.schedule(client, conversationId, attempt + 1);
        }, delayMs);
        this.activeTimers.add(timer);
      } else {
        this.logger.error(
          { conversationId },
          'Summarization permanently failed after 3 attempts — marking summary_failed in DB',
        );
        this.chatService.markSummaryFailed(conversationId).catch((dbErr: unknown) => {
          this.logger.error(
            { conversationId, error: dbErr instanceof Error ? dbErr.message : String(dbErr) },
            'Failed to persist summary_failed flag',
          );
        });
      }
    });
  }

  /**
   * Generates a concise summary of all messages older than AI_SUMMARY_KEEP_RECENT
   * using a cheaper/faster model, then persists it to ai_conversations.history_summary.
   * Called fire-and-forget after the main turn completes.
   */
  async update(client: OpenAI, conversationId: string): Promise<void> {
    // Load all messages except the most recent AI_SUMMARY_KEEP_RECENT (those stay verbatim)
    const totalCount = await this.chatService.getMessageCount(conversationId);
    const oldMessagesCount = totalCount - AI_SUMMARY_KEEP_RECENT;
    if (oldMessagesCount <= 0) {return;}

    const oldMessages = await this.chatService.getMessagesForSummary(conversationId, oldMessagesCount);
    if (oldMessages.length === 0) {return;}

    // Build a readable transcript of the older messages for the summarizer
    const transcript = oldMessages
      .map((msg) => {
        if (msg.role === 'user') {
          return `User: ${msg.content ?? ''}`;
        } else if (msg.role === 'assistant') {
          const parts: string[] = [];
          if (msg.content) {parts.push(`Assistant: ${msg.content}`);}
          if (msg.tool_calls) {parts.push(`[Used tools: ${(msg.tool_calls as Array<{ function?: { name?: string } }>).map((tc) => tc?.function?.name).filter(Boolean).join(', ')}]`);}
          return parts.join('\n');
        } else if (msg.role === 'tool') {
          const resultStr = typeof msg.tool_result === 'string'
            ? msg.tool_result
            : JSON.stringify(msg.tool_result);
          const truncated = resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr;
          return `[Tool result for ${msg.tool_name ?? 'unknown'}: ${truncated}]`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');

    const response = await client.chat.completions.create({
      model: AI_SUMMARIZATION_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that summarizes conversations. ' +
            'Produce a concise but comprehensive summary of the conversation transcript provided. ' +
            'Include: key topics discussed, any analytics queries run and their findings, ' +
            'important facts or decisions reached, and any open questions. ' +
            'Keep the summary under 500 words. Write in third person.',
        },
        {
          role: 'user',
          content: `Please summarize the following conversation transcript:\n\n${transcript}`,
        },
      ],
      stream: false,
    });

    const summary = response.choices[0]?.message?.content;
    if (summary) {
      await this.chatService.saveHistorySummary(conversationId, summary);
      this.logger.debug({ conversationId, summaryLength: summary.length }, 'History summary updated');
    }
  }
}
