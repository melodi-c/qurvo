import { useMutation, useQueryClient, type QueryKey, type UseMutationOptions } from '@tanstack/react-query';
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
  onSuccess?: UseMutationOptions<TData, unknown, TVariables>['onSuccess'];
  /** Custom error handler. If provided, replaces the default toast.error behavior. */
  onError?: UseMutationOptions<TData, unknown, TVariables>['onError'];
  /** Called on both success and error (after other callbacks). */
  onSettled?: UseMutationOptions<TData, unknown, TVariables>['onSettled'];
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
    onSuccess: (data, variables, context) => {
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }

      if (options?.invalidateKeys) {
        for (const key of options.invalidateKeys) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }

      options?.onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      if (options?.onError) {
        options.onError(error, variables, context);
      } else if (options?.errorMessage) {
        toast.error(extractApiErrorMessage(error, options.errorMessage));
      }
    },
    onSettled: options?.onSettled,
  });
}
