import { useState, useCallback } from 'react';

const AVAILABLE_SCOPES = ['ingest', 'read'] as const;

export { AVAILABLE_SCOPES };

export interface ApiKeyFormState {
  showCreate: boolean;
  name: string;
  selectedScopes: string[];
  expiresAt: string;
}

export interface UseApiKeyFormReturn extends ApiKeyFormState {
  setShowCreate: (value: boolean) => void;
  setName: (value: string) => void;
  setExpiresAt: (value: string) => void;
  toggleScope: (scope: string) => void;
  handleCancel: () => void;
  getPayload: () => { name: string; scopes?: string[]; expires_at?: string };
  reset: () => void;
}

function resetState() {
  return {
    showCreate: false,
    name: '',
    selectedScopes: [] as string[],
    expiresAt: '',
  };
}

export function useApiKeyForm(): UseApiKeyFormReturn {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');

  const reset = useCallback(() => {
    const s = resetState();
    setShowCreate(s.showCreate);
    setName(s.name);
    setSelectedScopes(s.selectedScopes);
    setExpiresAt(s.expiresAt);
  }, []);

  const handleCancel = useCallback(() => {
    reset();
  }, [reset]);

  const toggleScope = useCallback((scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }, []);

  const getPayload = useCallback((): { name: string; scopes?: string[]; expires_at?: string } => {
    const payload: { name: string; scopes?: string[]; expires_at?: string } = { name };
    if (selectedScopes.length > 0) payload.scopes = selectedScopes;
    if (expiresAt) payload.expires_at = new Date(expiresAt).toISOString();
    return payload;
  }, [name, selectedScopes, expiresAt]);

  return {
    showCreate,
    setShowCreate,
    name,
    setName,
    selectedScopes,
    expiresAt,
    setExpiresAt,
    toggleScope,
    handleCancel,
    getPayload,
    reset,
  };
}
