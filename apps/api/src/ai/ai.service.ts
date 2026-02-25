import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import OpenAI from 'openai';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { ProjectsService } from '../projects/projects.service';
import { AiChatService } from './ai-chat.service';
import { AiContextService } from './ai-context.service';
import { AI_CONFIG } from './ai-config.provider';
import type { AiConfig } from './ai-config.provider';
import { AiNotConfiguredException } from './exceptions/ai-not-configured.exception';
import { ConversationNotFoundException } from './exceptions/conversation-not-found.exception';
import { buildSystemPrompt } from './system-prompt';
import { AI_TOOLS } from './tools/ai-tool.interface';
import type { AiTool } from './tools/ai-tool.interface';
import { AI_MAX_TOOL_CALL_ITERATIONS, AI_CONTEXT_MESSAGE_LIMIT, AI_SUMMARY_THRESHOLD, AI_SUMMARY_KEEP_RECENT, AI_SUMMARIZATION_MODEL } from '../constants';

type AiStreamChunk =
  | { type: 'conversation'; conversation_id: string; title: string }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; tool_call_id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool_call_id: string; name: string; result: unknown; visualization_type?: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

interface AccumulatedToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface StreamTurnResult {
  assistantContent: string;
  toolCalls: AccumulatedToolCall[];
}

interface DispatchedToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  visualizationType?: string;
}

function isAiSafeError(err: unknown): err is Error & { isSafeForAi: true } {
  return err instanceof Error && 'isSafeForAi' in err && (err as any).isSafeForAi === true;
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;
  private readonly model: string;
  private readonly toolMap: Map<string, AiTool>;
  private readonly toolDefinitions: ChatCompletionTool[];

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly chatService: AiChatService,
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    @Inject(AI_TOOLS) tools: AiTool[],
    private readonly contextService: AiContextService,
  ) {
    this.model = config.model;
    this.toolMap = new Map(tools.map((t) => [t.name, t]));
    this.toolDefinitions = tools.map((t) => t.definition());
  }

  onModuleInit() {
    if (this.config.apiKey) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });
      this.logger.log('OpenAI client initialized');
    } else {
      this.logger.warn('OPENAI_API_KEY not set — AI features will be unavailable');
    }
  }

  private getClient(): OpenAI {
    if (!this.client) throw new AiNotConfiguredException();
    return this.client;
  }

  /** Pre-stream validation: throws domain exceptions before SSE headers are sent. */
  async validateChatAccess(userId: string, projectId: string): Promise<void> {
    await this.projectsService.getMembership(userId, projectId);
    this.getClient();
  }

  async *chat(
    userId: string,
    params: { project_id: string; conversation_id?: string; message: string; language?: string; edit_sequence?: number },
  ): AsyncGenerator<AiStreamChunk> {
    const client = this.getClient();

    // Create or load conversation
    let conversation: { id: string; title: string };
    let isNew = false;

    if (params.conversation_id) {
      const existing = await this.chatService.getConversation(params.conversation_id, userId);
      if (!existing) throw new ConversationNotFoundException();
      conversation = { id: existing.id, title: existing.title };
    } else {
      const created = await this.chatService.createConversation(userId, params.project_id);
      conversation = { id: created.id, title: created.title };
      isNew = true;
    }

    yield { type: 'conversation', conversation_id: conversation.id, title: conversation.title };

    try {
      // Handle edit: truncate history and update the edited message
      if (params.edit_sequence !== undefined) {
        await this.chatService.deleteMessagesAfterSequence(conversation.id, params.edit_sequence);
        await this.chatService.updateMessageContent(conversation.id, params.edit_sequence, params.message);
      }

      // Build messages
      const projectContext = await this.contextService.getProjectContext(params.project_id);
      const today = new Date().toISOString().split('T')[0];
      const systemContent = buildSystemPrompt(today, projectContext, params.language);

      const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemContent }];

      // Load history with summarization
      let totalMessageCount = 0;
      let existingSummary: string | null = null;
      if (!isNew) {
        totalMessageCount = await this.chatService.getMessageCount(conversation.id);

        if (totalMessageCount > AI_SUMMARY_THRESHOLD) {
          // Load the conversation record to get any cached summary
          const convRecord = await this.chatService.getConversation(conversation.id, userId);
          existingSummary = convRecord?.history_summary ?? null;

          // Inject cached summary as a system message if available
          if (existingSummary) {
            messages.push({
              role: 'system',
              content: `## Summary of earlier conversation\n\n${existingSummary}`,
            });
          }

          // Only load the most recent messages verbatim
          const { messages: recentHistory } = await this.chatService.getMessages(conversation.id, AI_SUMMARY_KEEP_RECENT);
          for (const msg of recentHistory) {
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
              messages.push({
                role: 'tool',
                tool_call_id: msg.tool_call_id,
                content: typeof msg.tool_result === 'string' ? msg.tool_result : JSON.stringify(msg.tool_result),
              });
            }
          }
        } else {
          // Conversation is short enough — load all messages
          const { messages: history } = await this.chatService.getMessages(conversation.id, AI_CONTEXT_MESSAGE_LIMIT);
          for (const msg of history) {
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
              messages.push({
                role: 'tool',
                tool_call_id: msg.tool_call_id,
                content: typeof msg.tool_result === 'string' ? msg.tool_result : JSON.stringify(msg.tool_result),
              });
            }
          }
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

      // Run tool-call loop
      seq = yield* this.runToolCallLoop(client, messages, conversation.id, seq, userId, params.project_id);

      // Update summary when history exceeds the threshold.
      // Always refresh on first crossing (no existing summary), or when the
      // conversation has grown by at least AI_SUMMARY_KEEP_RECENT new messages
      // since the last summary was generated.
      const currentCount = seq; // seq is the next sequence number, i.e. total messages saved
      const shouldRefreshSummary =
        currentCount > AI_SUMMARY_THRESHOLD &&
        (!existingSummary || currentCount - totalMessageCount >= AI_SUMMARY_KEEP_RECENT);
      if (shouldRefreshSummary) {
        this.updateHistorySummary(client, conversation.id).catch((err) => {
          this.logger.warn({ err, conversationId: conversation.id }, 'Failed to update history summary');
        });
      }

      yield { type: 'done' };
    } finally {
      // Finalize conversation: updates title + updated_at.
      // Runs on both normal completion and client disconnect (generator return).
      const derivedTitle = isNew
        ? (params.message.length > 100 ? params.message.slice(0, 100) + '...' : params.message)
        : undefined;
      await this.chatService.finalizeConversation(conversation.id, derivedTitle).catch((err) => {
        this.logger.warn({ err, conversationId: conversation.id }, 'Failed to finalize conversation on cleanup');
      });
    }
  }

  private async *runToolCallLoop(
    client: OpenAI,
    messages: ChatCompletionMessageParam[],
    conversationId: string,
    seq: number,
    userId: string,
    projectId: string,
  ): AsyncGenerator<AiStreamChunk, number> {
    let exhausted = true;

    for (let i = 0; i < AI_MAX_TOOL_CALL_ITERATIONS; i++) {
      const { assistantContent, toolCalls } = yield* this.streamOneTurn(client, messages);

      if (toolCalls.length === 0) {
        await this.chatService.saveMessage(conversationId, seq++, {
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: null,
          tool_call_id: null,
          tool_name: null,
          tool_result: null,
          visualization_type: null,
        });
        exhausted = false;
        break;
      }

      // Save assistant message with tool calls
      const serializedToolCalls = toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));

      messages.push({
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: serializedToolCalls,
      });

      await this.chatService.saveMessage(conversationId, seq++, {
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: serializedToolCalls,
        tool_call_id: null,
        tool_name: null,
        tool_result: null,
        visualization_type: null,
      });

      // Execute tool calls and append results to messages
      const results = yield* this.dispatchToolCalls(toolCalls, userId, projectId);

      for (const r of results) {
        messages.push({
          role: 'tool',
          tool_call_id: r.toolCallId,
          content: JSON.stringify(r.result),
        });

        await this.chatService.saveMessage(conversationId, seq++, {
          role: 'tool',
          content: null,
          tool_calls: null,
          tool_call_id: r.toolCallId,
          tool_name: r.toolName,
          tool_result: r.result,
          visualization_type: r.visualizationType ?? null,
        });
      }
    }

    if (exhausted) {
      this.logger.warn({ conversationId }, `Tool-call loop exhausted after ${AI_MAX_TOOL_CALL_ITERATIONS} iterations`);
      yield { type: 'text_delta', content: '\n\n[Analysis was cut short due to reaching the tool call limit. Please try a more specific question.]' };
    }
    return seq;
  }

  private async *streamOneTurn(
    client: OpenAI,
    messages: ChatCompletionMessageParam[],
  ): AsyncGenerator<AiStreamChunk, StreamTurnResult> {
    const stream = await client.chat.completions.create({
      model: this.model,
      messages,
      tools: this.toolDefinitions,
      stream: true,
    });

    let assistantContent = '';
    const toolCalls: AccumulatedToolCall[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        assistantContent += delta.content;
        yield { type: 'text_delta', content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: '', function: { name: '', arguments: '' } };
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }
    }

    return { assistantContent, toolCalls };
  }

  private async *dispatchToolCalls(
    toolCalls: AccumulatedToolCall[],
    userId: string,
    projectId: string,
  ): AsyncGenerator<AiStreamChunk, DispatchedToolResult[]> {
    const results: DispatchedToolResult[] = [];

    for (const tc of toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        // args unavailable — yield empty object
      }
      yield { type: 'tool_call_start', tool_call_id: tc.id, name: tc.function.name, args: parsedArgs };

      let toolResult: unknown;
      let vizType: string | undefined;
      try {
        const args = parsedArgs;
        const tool = this.toolMap.get(tc.function.name);
        if (!tool) throw new Error(`Unknown tool: ${tc.function.name}`);
        const res = await tool.run(args, userId, projectId);
        toolResult = res.result;
        vizType = res.visualization_type;
      } catch (err) {
        this.logger.warn({ err, tool: tc.function.name }, `Tool ${tc.function.name} failed`);
        const safeMessage = isAiSafeError(err)
          ? err.message
          : 'The query failed. Please try a different approach.';
        toolResult = { error: safeMessage };
      }

      yield {
        type: 'tool_result',
        tool_call_id: tc.id,
        name: tc.function.name,
        result: toolResult,
        visualization_type: vizType,
      };

      results.push({ toolCallId: tc.id, toolName: tc.function.name, result: toolResult, visualizationType: vizType });
    }

    return results;
  }

  async listConversations(userId: string, projectId: string) {
    return this.chatService.listConversations(userId, projectId);
  }

  async getConversation(userId: string, conversationId: string, projectId: string, limit?: number, beforeSequence?: number) {
    const conv = await this.chatService.getConversation(conversationId, userId);
    if (!conv) throw new ConversationNotFoundException();
    if (conv.project_id !== projectId) throw new ConversationNotFoundException();
    const { messages, hasMore } = await this.chatService.getMessages(conversationId, limit, beforeSequence);
    return { ...conv, messages, has_more: hasMore };
  }

  async deleteConversation(userId: string, conversationId: string, projectId: string) {
    const conv = await this.chatService.getConversation(conversationId, userId);
    if (!conv) throw new ConversationNotFoundException();
    if (conv.project_id !== projectId) throw new ConversationNotFoundException();
    await this.chatService.deleteConversation(conversationId, userId);
  }

  async renameConversation(userId: string, conversationId: string, projectId: string, title: string) {
    const conv = await this.chatService.getConversation(conversationId, userId);
    if (!conv) throw new ConversationNotFoundException();
    if (conv.project_id !== projectId) throw new ConversationNotFoundException();
    const updated = await this.chatService.renameConversation(conversationId, userId, title);
    if (!updated) throw new ConversationNotFoundException();
    return updated;
  }

  /**
   * Generates a concise summary of all messages older than AI_SUMMARY_KEEP_RECENT
   * using a cheaper/faster model, then persists it to ai_conversations.history_summary.
   * Called fire-and-forget after the main turn completes.
   */
  private async updateHistorySummary(client: OpenAI, conversationId: string): Promise<void> {
    // Load all messages except the most recent AI_SUMMARY_KEEP_RECENT (those stay verbatim)
    const totalCount = await this.chatService.getMessageCount(conversationId);
    const oldMessagesCount = totalCount - AI_SUMMARY_KEEP_RECENT;
    if (oldMessagesCount <= 0) return;

    const oldMessages = await this.chatService.getMessagesForSummary(conversationId, oldMessagesCount);
    if (oldMessages.length === 0) return;

    // Build a readable transcript of the older messages for the summarizer
    const transcript = oldMessages
      .map((msg) => {
        if (msg.role === 'user') {
          return `User: ${msg.content ?? ''}`;
        } else if (msg.role === 'assistant') {
          const parts: string[] = [];
          if (msg.content) parts.push(`Assistant: ${msg.content}`);
          if (msg.tool_calls) parts.push(`[Used tools: ${(msg.tool_calls as Array<{ function?: { name?: string } }>).map((tc) => tc?.function?.name).filter(Boolean).join(', ')}]`);
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
