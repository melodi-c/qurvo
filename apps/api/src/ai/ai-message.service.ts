import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, lt, gt, count } from 'drizzle-orm';
import { aiMessages } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';

export interface SavedMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: Record<string, unknown>[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_result: unknown;
  reasoning_content?: string | null;
  visualization_type: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  model_used?: string | null;
  estimated_cost_usd?: string | null;
}

@Injectable()
export class AiMessageService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getMessages(conversationId: string, limit = 30, beforeSequence?: number) {
    const conditions = [eq(aiMessages.conversation_id, conversationId)];
    if (beforeSequence !== undefined) {
      conditions.push(lt(aiMessages.sequence, beforeSequence));
    }

    const rows = await this.db
      .select()
      .from(aiMessages)
      .where(and(...conditions))
      .orderBy(desc(aiMessages.sequence))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    if (hasMore) {rows.pop();}

    return { messages: rows.reverse(), hasMore };
  }

  async getNextSequence(conversationId: string): Promise<number> {
    const [row] = await this.db
      .select({ sequence: aiMessages.sequence })
      .from(aiMessages)
      .where(eq(aiMessages.conversation_id, conversationId))
      .orderBy(desc(aiMessages.sequence))
      .limit(1);
    return row ? row.sequence + 1 : 0;
  }

  async saveMessage(conversationId: string, sequence: number, msg: SavedMessage) {
    await this.db.insert(aiMessages).values({
      conversation_id: conversationId,
      sequence,
      role: msg.role,
      content: msg.content,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      tool_name: msg.tool_name,
      tool_result: msg.tool_result,
      reasoning_content: msg.reasoning_content ?? null,
      visualization_type: msg.visualization_type,
      prompt_tokens: msg.prompt_tokens ?? null,
      completion_tokens: msg.completion_tokens ?? null,
      model_used: msg.model_used ?? null,
      estimated_cost_usd: msg.estimated_cost_usd ?? null,
    });
  }

  async getMessageCount(conversationId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(aiMessages)
      .where(eq(aiMessages.conversation_id, conversationId));
    return row?.count ?? 0;
  }

  async getMessagesForSummary(conversationId: string, limit: number) {
    const rows = await this.db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversation_id, conversationId))
      .orderBy(aiMessages.sequence)
      .limit(limit);
    return rows;
  }

  async deleteMessagesAfterSequence(conversationId: string, sequence: number) {
    await this.db
      .delete(aiMessages)
      .where(and(eq(aiMessages.conversation_id, conversationId), gt(aiMessages.sequence, sequence)));
  }

  async updateMessageContent(conversationId: string, sequence: number, content: string) {
    await this.db
      .update(aiMessages)
      .set({ content })
      .where(and(eq(aiMessages.conversation_id, conversationId), eq(aiMessages.sequence, sequence)));
  }
}
