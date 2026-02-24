import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, lt } from 'drizzle-orm';
import { aiConversations, aiMessages } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';

export interface SavedMessage {
  role: string;
  content: string | null;
  tool_calls: unknown | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_result: unknown | null;
  visualization_type: string | null;
}

@Injectable()
export class AiChatService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async createConversation(userId: string, projectId: string, title?: string) {
    const [row] = await this.db
      .insert(aiConversations)
      .values({
        user_id: userId,
        project_id: projectId,
        title: title ?? 'New conversation',
      })
      .returning();
    return row;
  }

  async getConversation(conversationId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.user_id, userId)))
      .limit(1);
    return row ?? null;
  }

  async listConversations(userId: string, projectId: string) {
    return this.db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        created_at: aiConversations.created_at,
        updated_at: aiConversations.updated_at,
      })
      .from(aiConversations)
      .where(and(eq(aiConversations.user_id, userId), eq(aiConversations.project_id, projectId)))
      .orderBy(desc(aiConversations.updated_at));
  }

  async deleteConversation(conversationId: string, userId: string) {
    await this.db
      .delete(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.user_id, userId)));
  }

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
    if (hasMore) rows.pop();

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
      visualization_type: msg.visualization_type,
    });
  }

  async finalizeConversation(conversationId: string, title?: string) {
    const set: Record<string, unknown> = { updated_at: new Date() };
    if (title !== undefined) set.title = title;
    await this.db
      .update(aiConversations)
      .set(set)
      .where(eq(aiConversations.id, conversationId));
  }
}
