import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { ProjectsService } from '../projects/projects.service';
import { AiChatService } from './ai-chat.service';
import { AiSummarizationService } from './ai-summarization.service';
import { AiMessageHistoryBuilder } from './ai-message-history';
import { AiToolDispatcher } from './ai-tool-dispatcher';
import type { AccumulatedToolCall } from './ai-tool-dispatcher';
import { AI_CONFIG } from './ai-config.provider';
import type { AiConfig } from './ai-config.provider';
import { AiNotConfiguredException } from './exceptions/ai-not-configured.exception';
import { ConversationNotFoundException } from './exceptions/conversation-not-found.exception';
import { AI_MAX_TOOL_CALL_ITERATIONS, AI_SUMMARY_THRESHOLD, AI_SUMMARY_KEEP_RECENT, MODEL_COST_PER_1M, AI_TOOL_RESULT_MAX_CHARS } from '../constants';

type AiStreamChunk =
  | { type: 'conversation'; conversation_id: string; title: string }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; tool_call_id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool_call_id: string; name: string; result: unknown; visualization_type?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; tokens_input: number; tokens_output: number; tokens_cached: number };

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

interface StreamTurnResult {
  assistantContent: string;
  toolCalls: AccumulatedToolCall[];
  usage: TokenUsage | null;
}

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates = MODEL_COST_PER_1M[model] ?? MODEL_COST_PER_1M['gpt-4o'];
  return (promptTokens / 1_000_000) * rates.input + (completionTokens / 1_000_000) * rates.output;
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;
  private readonly model: string;
  private readonly toolDefinitions: ChatCompletionTool[];

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly chatService: AiChatService,
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    private readonly messageHistoryBuilder: AiMessageHistoryBuilder,
    private readonly toolDispatcher: AiToolDispatcher,
    private readonly summarizationService: AiSummarizationService,
  ) {
    this.model = config.model;
    this.toolDefinitions = toolDispatcher.toolDefinitions;
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
    if (!this.client) {throw new AiNotConfiguredException();}
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
    let conversation: { id: string; title: string; history_summary?: string | null; summary_failed?: boolean | null };
    let isNew = false;

    if (params.conversation_id) {
      const existing = await this.chatService.getConversation(params.conversation_id, userId);
      if (!existing) {throw new ConversationNotFoundException();}
      conversation = existing;
    } else {
      const created = await this.chatService.createConversation(userId, params.project_id);
      conversation = { id: created.id, title: created.title };
      isNew = true;
    }

    yield { type: 'conversation', conversation_id: conversation.id, title: conversation.title };

    try {
      const { messages, seq: initialSeq, shouldSummarize, existingSummary, summaryFailed, totalMessageCount } =
        await this.messageHistoryBuilder.build(conversation, isNew, params, userId);

      // Run tool-call loop
      const { seq, totalInputTokens, totalOutputTokens, totalCachedTokens } = yield* this.runToolCallLoop(client, messages, conversation.id, initialSeq, userId, params.project_id);

      // Persist cumulative token usage for this request
      if (totalInputTokens > 0 || totalOutputTokens > 0) {
        await this.chatService.incrementTokenUsage(conversation.id, totalInputTokens, totalOutputTokens, totalCachedTokens);
      }

      // Update summary when history exceeds the threshold.
      // Always refresh on first crossing (no existing summary), or when the
      // conversation has grown by at least AI_SUMMARY_KEEP_RECENT new messages
      // since the last summary was generated.
      const currentCount = seq; // seq is the next sequence number, i.e. total messages saved
      const shouldRefreshSummary =
        !summaryFailed &&
        shouldSummarize &&
        currentCount > AI_SUMMARY_THRESHOLD &&
        (!existingSummary || currentCount - totalMessageCount >= AI_SUMMARY_KEEP_RECENT);
      if (shouldRefreshSummary) {
        this.summarizationService.schedule(client, conversation.id);
      }

      yield { type: 'done', tokens_input: totalInputTokens, tokens_output: totalOutputTokens, tokens_cached: totalCachedTokens };
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
  ): AsyncGenerator<AiStreamChunk, { seq: number; totalInputTokens: number; totalOutputTokens: number; totalCachedTokens: number }> {
    let exhausted = true;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    for (let i = 0; i < AI_MAX_TOOL_CALL_ITERATIONS; i++) {
      const { assistantContent, toolCalls, usage } = yield* this.streamOneTurn(client, messages);

      // Calculate token cost if usage data is available
      const costFields = usage
        ? {
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            model_used: this.model,
            estimated_cost_usd: estimateCost(this.model, usage.promptTokens, usage.completionTokens).toFixed(8),
          }
        : {};

      if (usage) {
        totalInputTokens += usage.promptTokens;
        totalOutputTokens += usage.completionTokens;
        totalCachedTokens += usage.cachedTokens;
        this.logger.log({
          conversationId,
          model: this.model,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          cached_tokens: usage.cachedTokens,
          total_tokens: usage.promptTokens + usage.completionTokens,
          estimated_cost_usd: costFields.estimated_cost_usd,
        }, 'AI token usage');
      }

      if (toolCalls.length === 0) {
        await this.chatService.saveMessage(conversationId, seq++, {
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: null,
          tool_call_id: null,
          tool_name: null,
          tool_result: null,
          visualization_type: null,
          ...costFields,
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
        ...costFields,
      });

      // Execute tool calls and append results to messages
      const results = yield* this.toolDispatcher.dispatch(toolCalls, userId, projectId);

      for (const r of results) {
        const rawContent = JSON.stringify(r.result);
        const content = rawContent.length > AI_TOOL_RESULT_MAX_CHARS
          ? rawContent.slice(0, AI_TOOL_RESULT_MAX_CHARS) + '...[truncated]'
          : rawContent;
        messages.push({
          role: 'tool',
          tool_call_id: r.toolCallId,
          content,
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
    return { seq, totalInputTokens, totalOutputTokens, totalCachedTokens };
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
      stream_options: { include_usage: true },
    });

    let assistantContent = '';
    const toolCalls: AccumulatedToolCall[] = [];
    let usage: TokenUsage | null = null;

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
        };
      }

      const delta = chunk.choices[0]?.delta;
      if (!delta) {continue;}

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
            if (tc.id) {toolCalls[tc.index].id = tc.id;}
            if (tc.function?.name) {toolCalls[tc.index].function.name += tc.function.name;}
            if (tc.function?.arguments) {toolCalls[tc.index].function.arguments += tc.function.arguments;}
          }
        }
      }
    }

    return { assistantContent, toolCalls, usage };
  }
}
