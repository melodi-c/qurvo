import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { extractApiErrorMessage } from '@/lib/utils';

interface UseMutationWithToastOptions<TData, TVariables> {
  /** Toast message on success. If omitted, no success toast is shown. */
  successMessage?: string;
  /** Fallback toast message on error. If omitted, raw error message is shown. */
  errorMessage?: string;
  /** Query keys to invalidate after successful mutation. */
  invalidateKeys?: QueryKey[];
  /** Additional callback after success (runs after toast + invalidation). */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Custom error handler. If provided, replaces the default toast.error behavior. */
  onError?: (error: unknown, variables: TVariables) => void;
  /** Called on both success and error (after other callbacks). */
  onSettled?: (data: TData | undefined, error: unknown | null, variables: TVariables) => void;
}

/**
 * Wraps `useMutation` with automatic toast notifications and query invalidation.
 *
 * @example
 * const mutation = useMutationWithToast(
 *   (data: UpdateDto) => api.update(data),
 *   { successMessage: t('saved'), errorMessage: t('saveFailed'), invalidateKeys: [['projects']] },
 * );
 */
export function useMutationWithToast<TData = unknown, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationWithToastOptions<TData, TVariables>,
) {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: (data, variables) => {
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }

      if (options?.invalidateKeys) {
        for (const key of options.invalidateKeys) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }

      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      if (options?.onError) {
        options.onError(error, variables);
      } else if (options?.errorMessage) {
        toast.error(extractApiErrorMessage(error, options.errorMessage));
      }
    },
    onSettled: options?.onSettled
      ? (data, error, variables) => options.onSettled!(data, error, variables)
      : undefined,
  });
}
