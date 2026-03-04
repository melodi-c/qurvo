import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { aiConversations, users } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { buildConditionalUpdate } from '../utils/build-conditional-update';
import { ConversationNotFoundException } from './exceptions/conversation-not-found.exception';
import { AI_DEFAULT_CONVERSATION_TITLE } from '../constants';
import { AiMessageService } from './ai-message.service';

export type { SavedMessage } from './ai-message.service';

export interface ConversationSearchResult {
  id: string;
  title: string;
  snippet: string;
  matched_at: string;
}

@Injectable()
export class AiChatService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly messageService: AiMessageService,
  ) {}

  async createConversation(userId: string, projectId: string, title?: string) {
    const [row] = await this.db
      .insert(aiConversations)
      .values({
        user_id: userId,
        project_id: projectId,
        title: title ?? AI_DEFAULT_CONVERSATION_TITLE,
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

  // --- Message delegation ---

  getMessages(conversationId: string, limit?: number, beforeSequence?: number) {
    return this.messageService.getMessages(conversationId, limit, beforeSequence);
  }

  getNextSequence(conversationId: string) {
    return this.messageService.getNextSequence(conversationId);
  }

  saveMessage(...args: Parameters<AiMessageService['saveMessage']>) {
    return this.messageService.saveMessage(...args);
  }

  getMessageCount(conversationId: string) {
    return this.messageService.getMessageCount(conversationId);
  }

  getMessagesForSummary(conversationId: string, limit: number) {
    return this.messageService.getMessagesForSummary(conversationId, limit);
  }

  deleteMessagesAfterSequence(conversationId: string, sequence: number) {
    return this.messageService.deleteMessagesAfterSequence(conversationId, sequence);
  }

  updateMessageContent(conversationId: string, sequence: number, content: string) {
    return this.messageService.updateMessageContent(conversationId, sequence, content);
  }

  // --- Conversation-only methods ---

  async finalizeConversation(conversationId: string, title?: string) {
    await this.db
      .update(aiConversations)
      .set({ updated_at: new Date(), ...buildConditionalUpdate({ title }, ['title']) })
      .where(eq(aiConversations.id, conversationId));
  }

  async incrementTokenUsage(conversationId: string, deltaInput: number, deltaOutput: number, deltaCached = 0) {
    await this.db
      .update(aiConversations)
      .set({
        tokens_input: sql`${aiConversations.tokens_input} + ${deltaInput}`,
        tokens_output: sql`${aiConversations.tokens_output} + ${deltaOutput}`,
        tokens_cached: sql`${aiConversations.tokens_cached} + ${deltaCached}`,
      })
      .where(eq(aiConversations.id, conversationId));
  }

  async saveHistorySummary(conversationId: string, summary: string) {
    await this.db
      .update(aiConversations)
      .set({ history_summary: summary })
      .where(eq(aiConversations.id, conversationId));
  }

  async markSummaryFailed(conversationId: string) {
    await this.db
      .update(aiConversations)
      .set({ summary_failed: true })
      .where(eq(aiConversations.id, conversationId));
  }

  async searchConversations(
    userId: string,
    projectId: string,
    query: string,
    language = 'ru',
    limit = 20,
  ): Promise<ConversationSearchResult[]> {
    const ftsConfig = language === 'en' ? 'english' : language === 'ru' ? 'russian' : 'simple';
    // Use websearch_to_tsquery for robust query parsing (handles phrases, +/- operators, etc.)
    const result = await this.db.execute(sql`
      SELECT DISTINCT ON (c.id)
        c.id,
        c.title,
        ts_headline(
          ${ftsConfig},
          coalesce(m.content, ''),
          websearch_to_tsquery(${ftsConfig}, ${query}),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, ShortWord=3, HighlightAll=false, MaxFragments=2, FragmentDelimiter='' … '''
        ) AS snippet,
        m.created_at AS matched_at
      FROM ai_conversations c
      INNER JOIN ai_messages m ON m.conversation_id = c.id
      WHERE
        c.user_id = ${userId}
        AND c.project_id = ${projectId}
        AND m.content IS NOT NULL
        AND (
          to_tsvector(${ftsConfig}, coalesce(c.title, '')) @@ websearch_to_tsquery(${ftsConfig}, ${query})
          OR to_tsvector(${ftsConfig}, coalesce(m.content, '')) @@ websearch_to_tsquery(${ftsConfig}, ${query})
        )
      ORDER BY c.id, m.created_at DESC
      LIMIT ${limit}
    `);

    return result.rows.map((r) => {
      const row = r as { id: string; title: string; snippet: string; matched_at: Date | string };
      return {
        id: row.id,
        title: row.title,
        snippet: row.snippet,
        matched_at: row.matched_at instanceof Date ? row.matched_at.toISOString() : String(row.matched_at),
      };
    });
  }

  async renameConversation(conversationId: string, userId: string, title: string) {
    const [row] = await this.db
      .update(aiConversations)
      .set({ title, updated_at: new Date() })
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.user_id, userId)))
      .returning();
    return row ?? null;
  }

  // Authorized CRUD (projectId scope)

  async getConversationAuthorized(
    userId: string,
    conversationId: string,
    projectId: string,
    limit?: number,
    beforeSequence?: number,
  ) {
    const conv = await this.getConversation(conversationId, userId);
    if (!conv) {throw new ConversationNotFoundException();}
    if (conv.project_id !== projectId) {throw new ConversationNotFoundException();}
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
    if (!conv) {throw new ConversationNotFoundException();}
    if (!conv.is_shared) {throw new ConversationNotFoundException();}
    const { messages, hasMore } = await this.getMessages(conversationId, limit, beforeSequence);
    return { ...conv, messages, has_more: hasMore };
  }

  async deleteConversationAuthorized(userId: string, conversationId: string, projectId: string) {
    const conv = await this.getConversation(conversationId, userId);
    if (!conv) {throw new ConversationNotFoundException();}
    if (conv.project_id !== projectId) {throw new ConversationNotFoundException();}
    await this.deleteConversation(conversationId, userId);
  }

  async updateConversationAuthorized(
    userId: string,
    conversationId: string,
    projectId: string,
    updates: { title?: string; is_shared?: boolean },
  ) {
    const [row] = await this.db.transaction(async (tx) => {
      const [conv] = await tx
        .select()
        .from(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.user_id, userId)))
        .limit(1);
      if (!conv) {throw new ConversationNotFoundException();}
      if (conv.project_id !== projectId) {throw new ConversationNotFoundException();}

      const setFields = buildConditionalUpdate(updates, ['title', 'is_shared']);
      return tx
        .update(aiConversations)
        .set({ ...setFields, updated_at: new Date() })
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.user_id, userId)))
        .returning();
    });
    if (!row) {throw new ConversationNotFoundException();}
    return row;
  }
}
