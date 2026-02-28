import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';

export type FeedbackRating = 'positive' | 'negative';

export function useAiMessageFeedback(messageId: string) {
  const submitMutation = useMutation({
    mutationFn: ({ rating, comment }: { rating: FeedbackRating; comment?: string }) =>
      api.aiControllerSubmitFeedback({ id: messageId }, { rating, comment }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.aiControllerDeleteFeedback({ id: messageId }),
  });

  return {
    submitFeedback: submitMutation.mutate,
    deleteFeedback: deleteMutation.mutate,
    isSubmitting: submitMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
