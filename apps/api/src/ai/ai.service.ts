import * as crypto from 'crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import OpenAI from 'openai';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type Redis from 'ioredis';
import { ProjectsService } from '../projects/projects.service';
import { AiChatService } from './ai-chat.service';
import { AiContextService } from './ai-context.service';
import { AiSummarizationService } from './ai-summarization.service';
import { AI_CONFIG } from './ai-config.provider';
import type { AiConfig } from './ai-config.provider';
import { AiNotConfiguredException } from './exceptions/ai-not-configured.exception';
import { ConversationNotFoundException } from './exceptions/conversation-not-found.exception';
import { buildSystemPrompt } from './system-prompt';
import { AI_TOOLS } from './tools/ai-tool.interface';
import type { AiTool } from './tools/ai-tool.interface';
import { AI_MAX_TOOL_CALL_ITERATIONS, AI_CONTEXT_MESSAGE_LIMIT, AI_SUMMARY_THRESHOLD, AI_SUMMARY_KEEP_RECENT } from '../constants';
import { REDIS } from '../providers/redis.provider';

/** Tools whose results are cached in Redis for 5 minutes (analytics queries only). */
const CACHEABLE_TOOLS = new Set([
  'query_trend',
  'query_funnel',
  'query_retention',
  'query_lifecycle',
  'query_stickiness',
  'query_paths',
  'query_funnel_gaps',
  'analyze_metric_change',
]);

const AI_TOOL_CACHE_TTL_SECONDS = 300;

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

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

interface StreamTurnResult {
  assistantContent: string;
  toolCalls: AccumulatedToolCall[];
  usage: TokenUsage | null;
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

/** Cost per 1M tokens in USD: { input, output } */
const MODEL_COST_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates = MODEL_COST_PER_1M[model] ?? MODEL_COST_PER_1M['gpt-4o'];
  return (promptTokens / 1_000_000) * rates.input + (completionTokens / 1_000_000) * rates.output;
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
    @Inject(REDIS) private readonly redis: Redis,
    private readonly summarizationService: AiSummarizationService,
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
    let conversation: { id: string; title: string; history_summary?: string | null; summary_failed?: boolean | null };
    let isNew = false;

    if (params.conversation_id) {
      const existing = await this.chatService.getConversation(params.conversation_id, userId);
      if (!existing) throw new ConversationNotFoundException();
      conversation = existing;
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
      let summaryFailed = false;
      if (!isNew) {
        totalMessageCount = await this.chatService.getMessageCount(conversation.id);

        if (totalMessageCount > AI_SUMMARY_THRESHOLD) {
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

      // Run tool-call loop
      seq = yield* this.runToolCallLoop(client, messages, conversation.id, seq, userId, params.project_id);

      // Update summary when history exceeds the threshold.
      // Always refresh on first crossing (no existing summary), or when the
      // conversation has grown by at least AI_SUMMARY_KEEP_RECENT new messages
      // since the last summary was generated.
      const currentCount = seq; // seq is the next sequence number, i.e. total messages saved
      const shouldRefreshSummary =
        !summaryFailed &&
        currentCount > AI_SUMMARY_THRESHOLD &&
        (!existingSummary || currentCount - totalMessageCount >= AI_SUMMARY_KEEP_RECENT);
      if (shouldRefreshSummary) {
        this.summarizationService.schedule(client, conversation.id);
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
        messages.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: typeof msg.tool_result === 'string' ? msg.tool_result : JSON.stringify(msg.tool_result),
        });
      }
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
        this.logger.log({
          conversationId,
          model: this.model,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
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
        };
      }

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

    return { assistantContent, toolCalls, usage };
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

        if (CACHEABLE_TOOLS.has(tc.function.name)) {
          const cacheKey = this.buildToolCacheKey(tc.function.name, args, projectId);
          const cached = await this.redis.get(cacheKey);
          if (cached !== null) {
            const parsed = JSON.parse(cached) as { result: unknown; visualization_type?: string };
            toolResult = parsed.result;
            vizType = parsed.visualization_type;
            this.logger.debug({ tool: tc.function.name, cacheKey }, 'AI tool cache hit');
          } else {
            const res = await tool.run(args, userId, projectId);
            toolResult = res.result;
            vizType = res.visualization_type;
            await this.redis.set(
              cacheKey,
              JSON.stringify({ result: toolResult, visualization_type: vizType }),
              'EX',
              AI_TOOL_CACHE_TTL_SECONDS,
            );
          }
        } else {
          const res = await tool.run(args, userId, projectId);
          toolResult = res.result;
          vizType = res.visualization_type;
        }
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

  /**
   * Builds a stable Redis cache key for an AI tool call.
   * Uses SHA-256(tool_name + sorted JSON args + project_id) to ensure identical
   * queries with different key orderings produce the same cache key.
   */
  private buildToolCacheKey(toolName: string, args: Record<string, unknown>, projectId: string): string {
    const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
    const hash = crypto.createHash('sha256').update(`${toolName}:${sortedArgs}:${projectId}`).digest('hex');
    return `ai:tool_cache:${hash}`;
  }

}
