import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { aiMessageFeedback, aiMessages } from '@qurvo/db';
import { DRIZZLE } from '../providers/drizzle.provider';
import type { Database } from '@qurvo/db';
import { MessageFeedbackNotFoundException } from './exceptions/message-feedback-not-found.exception';
import { MessageNotFoundException } from './exceptions/message-not-found.exception';

export type FeedbackRating = 'positive' | 'negative';

@Injectable()
export class AiFeedbackService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async upsertFeedback(
    messageId: string,
    userId: string,
    rating: FeedbackRating,
    comment?: string,
  ) {
    // Verify the message exists
    const [message] = await this.db
      .select({ id: aiMessages.id })
      .from(aiMessages)
      .where(eq(aiMessages.id, messageId))
      .limit(1);
    if (!message) {throw new MessageNotFoundException();}

    const [existing] = await this.db
      .select({ id: aiMessageFeedback.id })
      .from(aiMessageFeedback)
      .where(and(eq(aiMessageFeedback.message_id, messageId), eq(aiMessageFeedback.user_id, userId)))
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(aiMessageFeedback)
        .set({ rating, comment: comment ?? null })
        .where(eq(aiMessageFeedback.id, existing.id))
        .returning();
      return row;
    }

    const [row] = await this.db
      .insert(aiMessageFeedback)
      .values({ message_id: messageId, user_id: userId, rating, comment: comment ?? null })
      .returning();
    return row;
  }

  async deleteFeedback(messageId: string, userId: string) {
    const [existing] = await this.db
      .select({ id: aiMessageFeedback.id })
      .from(aiMessageFeedback)
      .where(and(eq(aiMessageFeedback.message_id, messageId), eq(aiMessageFeedback.user_id, userId)))
      .limit(1);

    if (!existing) {throw new MessageFeedbackNotFoundException();}

    await this.db
      .delete(aiMessageFeedback)
      .where(eq(aiMessageFeedback.id, existing.id));
  }
}
