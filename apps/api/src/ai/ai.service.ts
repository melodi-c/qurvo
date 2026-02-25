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
import { AiNotConfiguredException } from './exceptions/ai-not-configured.exception';
import { ConversationNotFoundException } from './exceptions/conversation-not-found.exception';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';
import { AppNotFoundException } from '../exceptions/app-not-found.exception';
import { buildSystemPrompt } from './system-prompt';
import { AI_TOOLS } from './tools/ai-tool.interface';
import type { AiTool } from './tools/ai-tool.interface';
import { AI_MAX_TOOL_CALL_ITERATIONS, AI_CONTEXT_MESSAGE_LIMIT } from '../constants';

export type AiStreamChunk =
  | { type: 'conversation'; conversation_id: string; title: string }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; tool_call_id: string; name: string }
  | { type: 'tool_result'; tool_call_id: string; name: string; result: unknown; visualization_type?: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

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
    @Inject(AI_TOOLS) tools: AiTool[],
    private readonly contextService: AiContextService,
  ) {
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
    this.toolMap = new Map(tools.map((t) => [t.name, t]));
    this.toolDefinitions = tools.map((t) => t.definition());
  }

  onModuleInit() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: process.env.OPENAI_API_BASE_URL || undefined,
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
    params: { project_id: string; conversation_id?: string; message: string },
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
      // Build messages
      const projectContext = await this.contextService.getProjectContext(params.project_id);
      const today = new Date().toISOString().split('T')[0];
      const systemContent = buildSystemPrompt(today, projectContext);

      const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemContent }];

      // Load history
      if (!isNew) {
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

      // Add user message
      messages.push({ role: 'user', content: params.message });
      let seq = await this.chatService.getNextSequence(conversation.id);
      await this.chatService.saveMessage(conversation.id, seq++, {
        role: 'user',
        content: params.message,
        tool_calls: null,
        tool_call_id: null,
        tool_name: null,
        tool_result: null,
        visualization_type: null,
      });

      // Run tool-call loop
      seq = yield* this.runToolCallLoop(client, messages, conversation.id, seq, userId, params.project_id);

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
      const stream = await client.chat.completions.create({
        model: this.model,
        messages,
        tools: this.toolDefinitions,
        stream: true,
      });

      let assistantContent = '';
      const toolCalls: { id: string; function: { name: string; arguments: string } }[] = [];

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

      // Execute tool calls
      for (const tc of toolCalls) {
        yield { type: 'tool_call_start', tool_call_id: tc.id, name: tc.function.name };

        let toolResult: unknown;
        let vizType: string | undefined;
        try {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          const tool = this.toolMap.get(tc.function.name);
          if (!tool) throw new Error(`Unknown tool: ${tc.function.name}`);
          const res = await tool.run(args, userId, projectId);
          toolResult = res.result;
          vizType = res.visualization_type;
        } catch (err) {
          this.logger.warn({ err, tool: tc.function.name }, `Tool ${tc.function.name} failed`);
          const safeMessage =
            err instanceof AppBadRequestException || err instanceof AppNotFoundException
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

        const toolResultStr = JSON.stringify(toolResult);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolResultStr,
        });

        await this.chatService.saveMessage(conversationId, seq++, {
          role: 'tool',
          content: null,
          tool_calls: null,
          tool_call_id: tc.id,
          tool_name: tc.function.name,
          tool_result: toolResult,
          visualization_type: vizType ?? null,
        });
      }
    }

    if (exhausted) {
      this.logger.warn({ conversationId }, `Tool-call loop exhausted after ${AI_MAX_TOOL_CALL_ITERATIONS} iterations`);
      yield { type: 'text_delta', content: '\n\n[Analysis was cut short due to reaching the tool call limit. Please try a more specific question.]' };
    }
    return seq;
  }

  async listConversations(userId: string, projectId: string) {
    await this.projectsService.getMembership(userId, projectId);
    return this.chatService.listConversations(userId, projectId);
  }

  async getConversation(userId: string, conversationId: string, limit?: number, beforeSequence?: number) {
    const conv = await this.chatService.getConversation(conversationId, userId);
    if (!conv) throw new ConversationNotFoundException();
    const { messages, hasMore } = await this.chatService.getMessages(conversationId, limit, beforeSequence);
    return { ...conv, messages, has_more: hasMore };
  }

  async deleteConversation(userId: string, conversationId: string) {
    await this.chatService.deleteConversation(conversationId, userId);
  }
}
