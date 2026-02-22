import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ProjectsService } from '../projects/projects.service';
import { AiChatService } from './ai-chat.service';
import { AiToolsService } from './ai-tools.service';
import { AiContextService } from './ai-context.service';
import { AiNotConfiguredException } from './exceptions/ai-not-configured.exception';

export type AiStreamChunk =
  | { type: 'conversation'; conversation_id: string; title: string }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; tool_call_id: string; name: string }
  | { type: 'tool_result'; tool_call_id: string; name: string; result: unknown; visualization_type: string | null }
  | { type: 'error'; message: string }
  | { type: 'done' };

const SYSTEM_PROMPT = `You are an AI analytics assistant for Qurvo, a product analytics platform.
Your role is to help users understand their data by querying analytics tools and interpreting results.

## Rules
- ALWAYS use the provided tools to answer questions about data. NEVER make up numbers.
- If the user's question is ambiguous about which event to use, call list_event_names first.
- Default date range: last 30 days from today.
- Granularity: use "day" for ranges <60 days, "week" for 60-180 days, "month" for >180 days.
- Default metric for trends: "total_events".
- Default retention type: "first_time".
- Answer in the same language the user uses.
- Today's date: {{today}}
- You have a query_unit_economics tool for unit economics analysis (UA, C1, C2, APC, AVP, ARPPU, ARPU, Churn Rate, LTV, CAC, ROI%, CM). Use it when the user asks about unit economics, revenue metrics, LTV, CAC, ROI, or monetization.
- Trend and funnel tools support per-series/per-step filters. Use filters to narrow events by property values (e.g. properties.promocode = "FEB2117"). Always use filters when the user asks about a specific property value.

## How tool results are displayed
Tool results are AUTOMATICALLY rendered as interactive charts and tables in the UI — the user can already see all the data visually.
DO NOT repeat or list raw numbers, data points, table rows, or series values from tool results. The user already sees them.
Instead, provide ONLY:
- A brief high-level summary (1-2 sentences max)
- Notable insights: trends, anomalies, peaks, drops, comparisons
- Actionable takeaways or recommendations
Keep your response short. Never enumerate data points, never restate table contents, never list values per date/period.

## Follow-up Suggestions
At the end of EVERY response, add a [SUGGESTIONS] block with exactly 3 short follow-up questions the user might ask next. Base them on the context of the conversation. Format:
[SUGGESTIONS]
- Question one?
- Question two?
- Question three?

{{project_context}}`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;
  private model: string;

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly chatService: AiChatService,
    private readonly toolsService: AiToolsService,
    private readonly contextService: AiContextService,
  ) {
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiNotConfiguredException();
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_API_BASE_URL || undefined,
    });
    return this.client;
  }

  async *chat(
    userId: string,
    params: { project_id: string; conversation_id?: string; message: string },
  ): AsyncGenerator<AiStreamChunk> {
    await this.projectsService.getMembership(userId, params.project_id);
    const client = this.getClient();

    // Create or load conversation
    let conversation: { id: string; title: string };
    let isNew = false;

    if (params.conversation_id) {
      const existing = await this.chatService.getConversation(params.conversation_id, userId);
      if (!existing) throw new Error('Conversation not found');
      conversation = { id: existing.id, title: existing.title };
    } else {
      const created = await this.chatService.createConversation(userId, params.project_id);
      conversation = { id: created.id, title: created.title };
      isNew = true;
    }

    yield { type: 'conversation', conversation_id: conversation.id, title: conversation.title };

    // Build messages
    const projectContext = await this.contextService.getProjectContext(userId, params.project_id);
    const today = new Date().toISOString().split('T')[0];
    const systemContent = SYSTEM_PROMPT
      .replace('{{today}}', today)
      .replace('{{project_context}}', projectContext);

    const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemContent }];

    // Load history
    if (!isNew) {
      const { messages: history } = await this.chatService.getMessages(conversation.id, 10000);
      for (const msg of history) {
        if (msg.role === 'user') {
          messages.push({ role: 'user', content: msg.content ?? '' });
        } else if (msg.role === 'assistant') {
          const assistantMsg: ChatCompletionMessageParam = {
            role: 'assistant',
            content: msg.content ?? null,
          };
          if (msg.tool_calls) {
            (assistantMsg as any).tool_calls = msg.tool_calls;
          }
          messages.push(assistantMsg);
        } else if (msg.role === 'tool') {
          messages.push({
            role: 'tool',
            tool_call_id: msg.tool_call_id!,
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

    // Tool-call loop (max 10 iterations)
    const tools = this.toolsService.getToolDefinitions();
    for (let i = 0; i < 10; i++) {
      const stream = await client.chat.completions.create({
        model: this.model,
        messages,
        tools,
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
        // No tool calls — final response
        await this.chatService.saveMessage(conversation.id, seq++, {
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: null,
          tool_call_id: null,
          tool_name: null,
          tool_result: null,
          visualization_type: null,
        });
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

      await this.chatService.saveMessage(conversation.id, seq++, {
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
        let vizType: string | null = null;
        try {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          const res = await this.toolsService.executeTool(
            tc.function.name,
            args,
            userId,
            params.project_id,
          );
          toolResult = res.result;
          vizType = res.visualization_type;
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : 'Unknown error' };
          this.logger.warn(`Tool ${tc.function.name} failed: ${err}`);
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

        await this.chatService.saveMessage(conversation.id, seq++, {
          role: 'tool',
          content: null,
          tool_calls: null,
          tool_call_id: tc.id,
          tool_name: tc.function.name,
          tool_result: toolResult,
          visualization_type: vizType,
        });
      }
    }

    // Auto-generate title for new conversations
    if (isNew) {
      const titleContent = params.message.slice(0, 100);
      const title = titleContent.length < params.message.length ? titleContent + '...' : titleContent;
      await this.chatService.updateTitle(conversation.id, title);
      // We don't yield the updated title — frontend will refetch conversation list
    }

    await this.chatService.touchConversation(conversation.id);
    yield { type: 'done' };
  }

  async listConversations(userId: string, projectId: string) {
    await this.projectsService.getMembership(userId, projectId);
    return this.chatService.listConversations(userId, projectId);
  }

  async getConversation(userId: string, conversationId: string, limit?: number, beforeSequence?: number) {
    const conv = await this.chatService.getConversation(conversationId, userId);
    if (!conv) throw new Error('Conversation not found');
    const { messages, hasMore } = await this.chatService.getMessages(conversationId, limit, beforeSequence);
    return { ...conv, messages, has_more: hasMore };
  }

  async deleteConversation(userId: string, conversationId: string) {
    await this.chatService.deleteConversation(conversationId, userId);
  }
}
