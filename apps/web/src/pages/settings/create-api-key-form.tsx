import { useCallback } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ApiKeyCreated, CreateApiKey } from '@/api/generated/Api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useApiKeyForm, AVAILABLE_SCOPES } from './use-api-key-form';
import translations from './api-keys-tab.translations';

interface CreateApiKeyFormProps {
  createMutation: UseMutationResult<ApiKeyCreated, unknown, CreateApiKey>;
}

export function CreateApiKeyForm({ createMutation }: CreateApiKeyFormProps) {
  const { t } = useLocalTranslation(translations);
  const { showCreate, setShowCreate, name, setName, selectedScopes, expiresAt, setExpiresAt, toggleScope, handleCancel, getPayload, reset } =
    useApiKeyForm();

  const handleCreate = useCallback(() => {
    createMutation.mutate(getPayload(), {
      onSuccess: () => reset(),
    });
  }, [createMutation, getPayload, reset]);

  if (!showCreate) {
    return (
      <Button onClick={() => setShowCreate(true)}>
        <Plus className="h-4 w-4 mr-2" /> {t('newKey')}
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="space-y-4"
        >
          <Input
            placeholder={t('placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t('scopesLabel')}</Label>
            <div className="flex gap-3">
              {AVAILABLE_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">{scope}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires-at" className="text-sm text-muted-foreground">{t('expiresLabel')}</Label>
            <Input
              id="expires-at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {t('createLabel')}
            </Button>
            <Button type="button" variant="ghost" onClick={handleCancel}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
