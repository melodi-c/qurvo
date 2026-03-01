import { useCallback } from 'react';
import { type QueryKey } from '@tanstack/react-query';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';

interface UseDeleteWithConfirmOptions<TData> {
  /** Toast message shown after successful deletion. */
  successMessage?: string;
  /** Fallback toast message shown on error. */
  errorMessage?: string;
  /** Query keys to invalidate after successful deletion. */
  invalidateKeys?: QueryKey[];
  /** Additional callback after success (runs after toast + invalidation + dialog close). */
  onSuccess?: (data: TData) => void;
  /** Custom error handler. Replaces the default toast.error behavior. */
  onError?: (error: unknown) => void;
}

/**
 * Combines `useConfirmDelete()` + `useMutation` + toast + invalidation in one hook.
 *
 * @example
 * const { confirmDelete, handleDelete, isDeleting } = useDeleteWithConfirm(
 *   (id: string) => api.delete({ id }),
 *   { successMessage: t('deleted'), errorMessage: t('deleteFailed'), invalidateKeys: [['items']] },
 * );
 *
 * // In JSX:
 * <Button onClick={() => confirmDelete.requestDelete(item.id, item.name)}>Delete</Button>
 * <ConfirmDialog open={confirmDelete.isOpen} onOpenChange={confirmDelete.close}
 *   onConfirm={handleDelete} ... />
 */
export function useDeleteWithConfirm<TData = unknown>(
  mutationFn: (id: string) => Promise<TData>,
  options?: UseDeleteWithConfirmOptions<TData>,
) {
  const confirmState = useConfirmDelete();

  const mutation = useMutationWithToast<TData, string>(mutationFn, {
    successMessage: options?.successMessage,
    errorMessage: options?.errorMessage,
    invalidateKeys: options?.invalidateKeys,
    onSuccess: (data) => {
      confirmState.close();
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });

  const handleDelete = useCallback(async () => {
    await mutation.mutateAsync(confirmState.itemId);
  }, [mutation, confirmState.itemId]);

  return {
    /** State for the ConfirmDialog (isOpen, itemId, itemName, requestDelete, close). */
    confirmDelete: confirmState,
    /** Async handler to pass as `onConfirm` to ConfirmDialog. */
    handleDelete,
    /** Whether the delete mutation is in flight. */
    isDeleting: mutation.isPending,
  };
}
