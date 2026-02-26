import { Injectable } from '@nestjs/common';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import { AiChatService } from './ai-chat.service';
import { AiContextService } from './ai-context.service';
import { STATIC_SYSTEM_PROMPT, buildContextMessage } from './system-prompt';
import { AI_CONTEXT_MESSAGE_LIMIT, AI_SUMMARY_THRESHOLD, AI_SUMMARY_KEEP_RECENT, AI_TOOL_RESULT_MAX_CHARS } from '../constants';

@Injectable()
export class AiMessageHistoryBuilder {
  constructor(
    private readonly chatService: AiChatService,
    private readonly contextService: AiContextService,
  ) {}

  async build(
    conversation: { id: string; history_summary?: string | null; summary_failed?: boolean | null },
    isNew: boolean,
    params: { message: string; edit_sequence?: number; project_id: string; language?: string },
    _userId: string,
  ): Promise<{
    messages: ChatCompletionMessageParam[];
    seq: number;
    shouldSummarize: boolean;
    existingSummary: string | null;
    summaryFailed: boolean;
    totalMessageCount: number;
  }> {
    // Handle edit: truncate history and update the edited message
    if (params.edit_sequence !== undefined) {
      await this.chatService.deleteMessagesAfterSequence(conversation.id, params.edit_sequence);
      await this.chatService.updateMessageContent(conversation.id, params.edit_sequence, params.message);
    }

    // Build messages — static system prompt first (maximises OpenAI prefix-cache hits),
    // followed by dynamic context injected as a system message, then conversation history.
    const projectContext = await this.contextService.getProjectContext(params.project_id);
    const today = new Date().toISOString().split('T')[0];

    const messages: ChatCompletionMessageParam[] = [
      // 1. Static instructions — never changes, cached by OpenAI after first request.
      { role: 'system', content: STATIC_SYSTEM_PROMPT },
      // 2. Dynamic context (date, language, project data) — injected as a separate system
      //    message so the static prefix above remains cacheable across all requests.
      { role: 'system', content: buildContextMessage(today, projectContext, params.language) },
    ];

    // Load history with summarization
    let totalMessageCount = 0;
    let existingSummary: string | null = null;
    let summaryFailed = false;
    let shouldSummarize = false;
    if (!isNew) {
      totalMessageCount = await this.chatService.getMessageCount(conversation.id);

      if (totalMessageCount > AI_SUMMARY_THRESHOLD) {
        shouldSummarize = true;
        // Use the already-loaded conversation record to get any cached summary
        existingSummary = conversation.history_summary ?? null;
        summaryFailed = conversation.summary_failed ?? false;

        // Inject cached summary as a system message if available
        if (existingSummary) {
          messages.push({
            role: 'system',
            content: `## Summary of earlier conversation\n\n${existingSummary}`,
          });
        }

        // Only load the most recent messages verbatim
        const { messages: recentHistory } = await this.chatService.getMessages(conversation.id, AI_SUMMARY_KEEP_RECENT);
        this.appendHistoryMessages(messages, recentHistory);
      } else {
        // Conversation is short enough — load all messages
        const { messages: history } = await this.chatService.getMessages(conversation.id, AI_CONTEXT_MESSAGE_LIMIT);
        this.appendHistoryMessages(messages, history);
      }
    }

    // For an edit, history already includes the updated user message at edit_sequence.
    // The last message in `messages` is already the edited user message — skip re-adding.
    let seq: number;
    if (params.edit_sequence !== undefined) {
      // seq starts right after the edited message (all later messages were deleted)
      seq = params.edit_sequence + 1;
    } else {
      // Add user message normally
      messages.push({ role: 'user', content: params.message });
      seq = await this.chatService.getNextSequence(conversation.id);
      await this.chatService.saveMessage(conversation.id, seq++, {
        role: 'user',
        content: params.message,
        tool_calls: null,
        tool_call_id: null,
        tool_name: null,
        tool_result: null,
        visualization_type: null,
      });
    }

    return { messages, seq, shouldSummarize, existingSummary, summaryFailed, totalMessageCount };
  }

  private appendHistoryMessages(
    messages: ChatCompletionMessageParam[],
    msgs: Awaited<ReturnType<AiChatService['getMessages']>>['messages'],
  ): void {
    for (const msg of msgs) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content ?? '' });
      } else if (msg.role === 'assistant') {
        const assistantMsg: ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content ?? null,
          ...(msg.tool_calls ? { tool_calls: msg.tool_calls as ChatCompletionMessageToolCall[] } : {}),
        };
        messages.push(assistantMsg);
      } else if (msg.role === 'tool') {
        if (!msg.tool_call_id) continue;
        const rawContent = typeof msg.tool_result === 'string' ? msg.tool_result : JSON.stringify(msg.tool_result);
        const content = rawContent.length > AI_TOOL_RESULT_MAX_CHARS
          ? rawContent.slice(0, AI_TOOL_RESULT_MAX_CHARS) + '...[truncated]'
          : rawContent;
        messages.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content,
        });
      }
    }
  }
}
