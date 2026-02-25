import { useState, useCallback } from 'react';

interface UseInlineEditOptions<TRow, TValues> {
  rowKey: (row: TRow) => string;
  getInitialValues: (row: TRow) => TValues;
  onSave: (row: TRow, values: TValues) => Promise<void>;
}

interface UseInlineEditReturn<TRow, TValues> {
  editingKey: string | null;
  editValues: TValues;
  setEditValues: React.Dispatch<React.SetStateAction<TValues>>;
  isEditing: (row: TRow) => boolean;
  startEdit: (row: TRow) => void;
  cancelEdit: () => void;
  saveEdit: (row: TRow) => Promise<void>;
}

export function useInlineEdit<TRow, TValues>(
  options: UseInlineEditOptions<TRow, TValues>,
): UseInlineEditReturn<TRow, TValues> {
  const { rowKey, getInitialValues, onSave } = options;

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<TValues>({} as TValues);

  const isEditing = useCallback(
    (row: TRow): boolean => editingKey === rowKey(row),
    [editingKey, rowKey],
  );

  const startEdit = useCallback(
    (row: TRow) => {
      setEditingKey(rowKey(row));
      setEditValues(getInitialValues(row));
    },
    [rowKey, getInitialValues],
  );

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
  }, []);

  const saveEdit = useCallback(
    async (row: TRow) => {
      try {
        await onSave(row, editValues);
        setEditingKey(null);
      } catch {
        // onSave is responsible for showing error feedback (e.g. toast).
        // Keep the row in editing mode so the user can retry.
      }
    },
    [onSave, editValues],
  );

  return {
    editingKey,
    editValues,
    setEditValues,
    isEditing,
    startEdit,
    cancelEdit,
    saveEdit,
  };
}
