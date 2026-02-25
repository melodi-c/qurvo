import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, lt, gt, count } from 'drizzle-orm';
import { aiConversations, aiMessages, users } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { buildConditionalUpdate } from '../utils/build-conditional-update';
import { ConversationNotFoundException } from './exceptions/conversation-not-found.exception';

export interface SavedMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: Record<string, unknown>[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_result: unknown;
  visualization_type: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  model_used?: string | null;
  estimated_cost_usd?: string | null;
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

  /** Fetch a conversation by ID for any project member (used when the conversation is shared). */
  async getConversationByProject(conversationId: string, projectId: string) {
    const [row] = await this.db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.project_id, projectId)))
      .limit(1);
    return row ?? null;
  }

  async listConversations(userId: string, projectId: string) {
    return this.db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        is_shared: aiConversations.is_shared,
        created_at: aiConversations.created_at,
        updated_at: aiConversations.updated_at,
      })
      .from(aiConversations)
      .where(and(eq(aiConversations.user_id, userId), eq(aiConversations.project_id, projectId)))
      .orderBy(desc(aiConversations.updated_at));
  }

  /** List conversations shared with a project (visible to all project members). */
  async listSharedConversations(projectId: string) {
    return this.db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        is_shared: aiConversations.is_shared,
        created_at: aiConversations.created_at,
        updated_at: aiConversations.updated_at,
        owner_name: users.display_name,
      })
      .from(aiConversations)
      .innerJoin(users, eq(aiConversations.user_id, users.id))
      .where(and(eq(aiConversations.project_id, projectId), eq(aiConversations.is_shared, true)))
      .orderBy(desc(aiConversations.updated_at));
  }

  async setShared(conversationId: string, userId: string, isShared: boolean) {
    const [row] = await this.db
      .update(aiConversations)
      .set({ is_shared: isShared, updated_at: new Date() })
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.user_id, userId)))
      .returning();
    return row ?? null;
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
      prompt_tokens: msg.prompt_tokens ?? null,
      completion_tokens: msg.completion_tokens ?? null,
      model_used: msg.model_used ?? null,
      estimated_cost_usd: msg.estimated_cost_usd ?? null,
    });
  }

  async finalizeConversation(conversationId: string, title?: string) {
    await this.db
      .update(aiConversations)
      .set({ updated_at: new Date(), ...buildConditionalUpdate({ title }, ['title']) })
      .where(eq(aiConversations.id, conversationId));
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

  async saveHistorySummary(conversationId: string, summary: string) {
    await this.db
      .update(aiConversations)
      .set({ history_summary: summary })
      .where(eq(aiConversations.id, conversationId));
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

  async renameConversation(conversationId: string, userId: string, title: string) {
    const [row] = await this.db
      .update(aiConversations)
      .set({ title, updated_at: new Date() })
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.user_id, userId)))
      .returning();
    return row ?? null;
  }

  // ─── Authorized CRUD (projectId scope) ────────────────────────────────────

  async getConversationAuthorized(
    userId: string,
    conversationId: string,
    projectId: string,
    limit?: number,
    beforeSequence?: number,
  ) {
    const conv = await this.getConversation(conversationId, userId);
    if (!conv) throw new ConversationNotFoundException();
    if (conv.project_id !== projectId) throw new ConversationNotFoundException();
    const { messages, hasMore } = await this.getMessages(conversationId, limit, beforeSequence);
    return { ...conv, messages, has_more: hasMore };
  }

  async getSharedConversationAuthorized(
    conversationId: string,
    projectId: string,
    limit?: number,
    beforeSequence?: number,
  ) {
    const conv = await this.getConversationByProject(conversationId, projectId);
    if (!conv) throw new ConversationNotFoundException();
    if (!conv.is_shared) throw new ConversationNotFoundException();
    const { messages, hasMore } = await this.getMessages(conversationId, limit, beforeSequence);
    return { ...conv, messages, has_more: hasMore };
  }

  async deleteConversationAuthorized(userId: string, conversationId: string, projectId: string) {
    const conv = await this.getConversation(conversationId, userId);
    if (!conv) throw new ConversationNotFoundException();
    if (conv.project_id !== projectId) throw new ConversationNotFoundException();
    await this.deleteConversation(conversationId, userId);
  }

  async renameConversationAuthorized(
    userId: string,
    conversationId: string,
    projectId: string,
    title: string,
  ) {
    const conv = await this.getConversation(conversationId, userId);
    if (!conv) throw new ConversationNotFoundException();
    if (conv.project_id !== projectId) throw new ConversationNotFoundException();
    const updated = await this.renameConversation(conversationId, userId, title);
    if (!updated) throw new ConversationNotFoundException();
    return updated;
  }

  async setSharedAuthorized(
    userId: string,
    conversationId: string,
    projectId: string,
    isShared: boolean,
  ) {
    const conv = await this.getConversation(conversationId, userId);
    if (!conv) throw new ConversationNotFoundException();
    if (conv.project_id !== projectId) throw new ConversationNotFoundException();
    const updated = await this.setShared(conversationId, userId, isShared);
    if (!updated) throw new ConversationNotFoundException();
    return updated;
  }
}
