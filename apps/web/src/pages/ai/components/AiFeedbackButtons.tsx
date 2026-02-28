import { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useAiMessageFeedback, type FeedbackRating } from '@/features/ai/hooks/use-ai-feedback';
import translations from './AiFeedbackButtons.translations';

interface AiFeedbackButtonsProps {
  messageId: string;
}

/**
 * Thumbs-up / thumbs-down feedback widget for AI assistant messages.
 * Manages all local state (rating, comment, comment-box visibility) internally.
 * Communicates with the backend via `useAiMessageFeedback`.
 */
export function AiFeedbackButtons({ messageId }: AiFeedbackButtonsProps) {
  const { t } = useLocalTranslation(translations);
  const [feedback, setFeedback] = useState<FeedbackRating | null>(null);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState('');
  const { submitFeedback, deleteFeedback, isSubmitting } = useAiMessageFeedback(messageId);

  const handleThumbsUp = useCallback(() => {
    if (feedback === 'positive') {
      deleteFeedback(undefined, {
        onSuccess: () => setFeedback(null),
      });
    } else {
      setShowCommentBox(false);
      setComment('');
      submitFeedback({ rating: 'positive' }, {
        onSuccess: () => {
          setFeedback('positive');
        },
      });
    }
  }, [feedback, submitFeedback, deleteFeedback]);

  const handleThumbsDown = useCallback(() => {
    if (feedback === 'negative') {
      deleteFeedback(undefined, {
        onSuccess: () => {
          setFeedback(null);
          setShowCommentBox(false);
          setComment('');
        },
      });
    } else {
      setShowCommentBox(true);
      setFeedback('negative');
    }
  }, [feedback, deleteFeedback]);

  const submitNegativeFeedback = useCallback(() => {
    submitFeedback({ rating: 'negative', comment: comment.trim() || undefined }, {
      onSuccess: () => {
        setShowCommentBox(false);
      },
    });
  }, [submitFeedback, comment]);

  const cancelNegativeFeedback = useCallback(() => {
    if (feedback === 'negative' && !showCommentBox) {return;}
    setShowCommentBox(false);
    setComment('');
    if (feedback === 'negative') {
      setFeedback(null);
    }
  }, [feedback, showCommentBox]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        <button
          onClick={handleThumbsUp}
          disabled={isSubmitting}
          aria-label={t('thumbsUp')}
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded transition-colors',
            feedback === 'positive'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          <ThumbsUp className={cn('w-3.5 h-3.5', feedback === 'positive' && 'fill-current')} />
        </button>
        <button
          onClick={handleThumbsDown}
          disabled={isSubmitting}
          aria-label={t('thumbsDown')}
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded transition-colors',
            feedback === 'negative'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          <ThumbsDown className={cn('w-3.5 h-3.5', feedback === 'negative' && 'fill-current')} />
        </button>
      </div>
      {showCommentBox && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('feedbackComment')}
            rows={2}
            className="w-full resize-none bg-input/30 border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 max-h-32"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={cancelNegativeFeedback} className="h-6 text-xs px-2">
              {t('cancelFeedback')}
            </Button>
            <Button size="sm" onClick={submitNegativeFeedback} disabled={isSubmitting} className="h-6 text-xs px-2">
              {t('submitFeedback')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
