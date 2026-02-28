import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useMutationErrorHandler } from '@/hooks/use-mutation-error-handler';

export type FeedbackRating = 'positive' | 'negative';

export function useAiMessageFeedback(messageId: string) {
  const onError = useMutationErrorHandler();

  const submitMutation = useMutation({
    mutationFn: ({ rating, comment }: { rating: FeedbackRating; comment?: string }) =>
      api.aiControllerSubmitFeedback({ id: messageId }, { rating, comment }),
    onError: onError('submitFeedbackFailed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.aiControllerDeleteFeedback({ id: messageId }),
    onError: onError('deleteFeedbackFailed'),
  });

  return {
    submitFeedback: submitMutation.mutate,
    deleteFeedback: deleteMutation.mutate,
    isSubmitting: submitMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
