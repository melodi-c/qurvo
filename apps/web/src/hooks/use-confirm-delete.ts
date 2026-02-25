import { useState, useCallback } from 'react';

interface UseConfirmState {
  id: string;
  name: string;
}

export function useConfirmDelete() {
  const [state, setState] = useState<UseConfirmState | null>(null);

  const requestDelete = useCallback((id: string, name: string) => {
    setState({ id, name });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  return {
    isOpen: state !== null,
    itemId: state?.id ?? '',
    itemName: state?.name ?? '',
    requestDelete,
    close,
  };
}
