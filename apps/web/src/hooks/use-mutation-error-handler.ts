import { useCallback } from 'react';
import { toast } from 'sonner';
import { extractApiErrorMessage } from '@/lib/utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from '@/lib/mutation-error.translations';

type TranslationKey = keyof typeof translations.en;

/**
 * Returns a callback that shows a toast with the error message.
 * Use as `onError` in useMutation options.
 *
 * @example
 * const onMutationError = useMutationErrorHandler();
 * useMutation({ ..., onError: onMutationError('createDashboardFailed') });
 */
export function useMutationErrorHandler() {
  const { t } = useLocalTranslation(translations);

  return useCallback(
    (key: TranslationKey) => (err: unknown) => {
      toast.error(extractApiErrorMessage(err, t(key)));
    },
    [t],
  );
}
