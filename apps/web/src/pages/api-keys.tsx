import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineCreateForm } from '@/components/ui/inline-create-form';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { api } from '@/api/client';
import { Plus, Key, Copy, Check } from 'lucide-react';

export default function ApiKeysPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const { data: keys, isLoading } = useQuery({
    queryKey: ['apiKeys', projectId],
    queryFn: () => api.apiKeysControllerList({ projectId }),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => api.apiKeysControllerCreate({ projectId }, data),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ['apiKeys', projectId] });
      setShowCreate(false);
      setName('');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.apiKeysControllerRevoke({ projectId, keyId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apiKeys', projectId] }),
  });

  const copyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="API Keys">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Key
        </Button>
      </PageHeader>

      {!projectId && (
        <EmptyState icon={Key} description="Select a project to manage API keys" />
      )}

      {projectId && (
        <>
          {createdKey && (
            <Card className="border-green-800">
              <CardContent className="pt-6">
                <p className="text-sm text-green-400 mb-2">API Key created. Copy it now — it won't be shown again.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted p-3 rounded text-sm break-all">{createdKey}</code>
                  <Button size="icon" variant="outline" onClick={copyKey}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCreatedKey(null)}>Dismiss</Button>
              </CardContent>
            </Card>
          )}

          {showCreate && (
            <InlineCreateForm
              placeholder="Key name (e.g. production)"
              value={name}
              onChange={setName}
              isPending={createMutation.isPending}
              onSubmit={() => createMutation.mutate({ name })}
              onCancel={() => setShowCreate(false)}
            />
          )}

          {isLoading && <ListSkeleton count={2} height="h-20" />}

          <div className="space-y-3">
            {(keys || []).map((key) => (
              <Card key={key.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-sm">{key.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {key.key_prefix}... &middot; Created {new Date(key.created_at).toLocaleDateString()}
                          {key.revoked_at && <span className="text-red-400 ml-2">Revoked</span>}
                        </p>
                      </div>
                    </div>
                    {!key.revoked_at && (
                      <Button size="sm" variant="destructive" onClick={() => revokeMutation.mutate(key.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
