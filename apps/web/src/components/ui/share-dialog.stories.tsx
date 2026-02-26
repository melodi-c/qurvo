import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShareDialog } from './share-dialog';
import { Button } from './button';
import type { ShareToken } from '@/api/generated/Api';

const RESOURCE_TYPE = 'dashboard' as const;
const RESOURCE_ID = 'dashboard-1';
const PROJECT_ID = 'proj-1';

const MOCK_TOKENS: ShareToken[] = [
  {
    id: 'token-1',
    token: 'abc123xyz',
    resource_type: 'dashboard',
    resource_id: RESOURCE_ID,
    project_id: PROJECT_ID,
    created_by: 'user-1',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    expires_at: null,
  },
  {
    id: 'token-2',
    token: 'def456uvw',
    resource_type: 'dashboard',
    resource_id: RESOURCE_ID,
    project_id: PROJECT_ID,
    created_by: 'user-1',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  },
];

function makeQueryClient(tokens?: ShareToken[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (tokens !== undefined) {
    qc.setQueryData(['share-tokens', RESOURCE_TYPE, RESOURCE_ID, PROJECT_ID], tokens);
  }
  return qc;
}

const meta: Meta = {
  title: 'UI/ShareDialog',
  tags: ['autodocs'],
};

export default meta;

export const WithTokens: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <QueryClientProvider client={makeQueryClient(MOCK_TOKENS)}>
        <Button onClick={() => setOpen(true)}>Share</Button>
        <ShareDialog
          open={open}
          onOpenChange={setOpen}
          resourceType={RESOURCE_TYPE}
          resourceId={RESOURCE_ID}
          projectId={PROJECT_ID}
        />
      </QueryClientProvider>
    );
  },
};

export const Empty: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <QueryClientProvider client={makeQueryClient([])}>
        <Button onClick={() => setOpen(true)}>Share</Button>
        <ShareDialog
          open={open}
          onOpenChange={setOpen}
          resourceType={RESOURCE_TYPE}
          resourceId={RESOURCE_ID}
          projectId={PROJECT_ID}
        />
      </QueryClientProvider>
    );
  },
};

export const Loading: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    // No pre-seeded data + network never resolves = loading state
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
          queryFn: () => new Promise(() => {}),
        },
      },
    });
    return (
      <QueryClientProvider client={qc}>
        <Button onClick={() => setOpen(true)}>Share</Button>
        <ShareDialog
          open={open}
          onOpenChange={setOpen}
          resourceType={RESOURCE_TYPE}
          resourceId={RESOURCE_ID}
          projectId={PROJECT_ID}
        />
      </QueryClientProvider>
    );
  },
};

export const InsightType: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    const insightTokens: ShareToken[] = [
      {
        id: 'token-3',
        token: 'ghi789rst',
        resource_type: 'insight',
        resource_id: 'insight-1',
        project_id: PROJECT_ID,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        expires_at: null,
      },
    ];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['share-tokens', 'insight', 'insight-1', PROJECT_ID], insightTokens);
    return (
      <QueryClientProvider client={qc}>
        <Button onClick={() => setOpen(true)}>Share Insight</Button>
        <ShareDialog
          open={open}
          onOpenChange={setOpen}
          resourceType="insight"
          resourceId="insight-1"
          projectId={PROJECT_ID}
        />
      </QueryClientProvider>
    );
  },
};
