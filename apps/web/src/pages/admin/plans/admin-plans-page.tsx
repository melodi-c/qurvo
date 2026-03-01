import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useDeleteWithConfirm } from '@/hooks/use-delete-with-confirm';
import { api } from '@/api/client';
import type { AdminPlan, CreatePlanFeatures } from '@/api/generated/Api';
import { PlanDialog } from './PlanDialog';
import translations from './admin-plans-page.translations';

const FEATURE_KEYS: (keyof CreatePlanFeatures)[] = [
  'cohorts',
  'lifecycle',
  'stickiness',
  'api_export',
  'ai_insights',
];

function formatLimit(value: number | null | undefined, unlimited: string): string {
  if (value === null || value === undefined || value === -1) {return unlimited;}
  return value.toLocaleString();
}

export default function AdminPlansPage() {
  const { t } = useLocalTranslation(translations);
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<AdminPlan | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => api.adminPlansControllerListPlans(),
  });

  const { confirmDelete, handleDelete } = useDeleteWithConfirm(
    (id: string) => api.adminPlansControllerDeletePlan({ id }),
    {
      successMessage: t('deleteSuccess'),
      invalidateKeys: [['admin', 'plans']],
      onError: (error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          toast.error(t('deleteConflict'));
        } else {
          toast.error(t('deleteError'));
        }
      },
    },
  );

  const handleSuccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
  }, [queryClient]);

  const columns: Column<AdminPlan>[] = [
    {
      key: 'name',
      header: t('name'),
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'slug',
      header: t('slug'),
      render: (row) => (
        <span className="text-muted-foreground font-mono text-xs">{row.slug}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'events_limit',
      header: t('eventsLimit'),
      render: (row) => (
        <span className="text-sm">{formatLimit(row.events_limit, t('unlimited'))}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'data_retention_days',
      header: t('dataRetentionDays'),
      render: (row) => (
        <span className="text-sm">{formatLimit(row.data_retention_days, t('unlimited'))}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'max_projects',
      header: t('maxProjects'),
      render: (row) => (
        <span className="text-sm">{formatLimit(row.max_projects, t('unlimited'))}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'is_public',
      header: t('isPublic'),
      render: (row) =>
        row.is_public ? (
          <Badge variant="default">{t('yes')}</Badge>
        ) : (
          <Badge variant="secondary">{t('no')}</Badge>
        ),
    },
    {
      key: 'features',
      header: t('features'),
      render: (row) => {
        const enabled = FEATURE_KEYS.filter((k) => row.features[k]);
        if (enabled.length === 0) {return <span className="text-muted-foreground text-xs">&mdash;</span>;}
        return (
          <div className="flex flex-wrap gap-1">
            {enabled.map((k) => (
              <Badge key={k} variant="outline" className="text-xs">
                {k}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setEditPlan(row)}
            title={t('edit')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => confirmDelete.requestDelete(row.id, row.name)}
            title={t('delete')}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')}>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('newPlan')}
        </Button>
      </PageHeader>

      {isLoading && <ListSkeleton count={4} />}

      {!isLoading && plans?.length === 0 && (
        <EmptyState
          icon={CreditCard}
          title={t('noPlans')}
          description={t('noPlansDescription')}
        />
      )}

      {!isLoading && plans && plans.length > 0 && (
        <DataTable columns={columns} data={plans} rowKey={(row) => row.id} />
      )}

      {/* Create dialog */}
      <PlanDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleSuccess}
      />

      {/* Edit dialog */}
      {editPlan && (
        <PlanDialog
          open={!!editPlan}
          onOpenChange={(open) => { if (!open) {setEditPlan(null);} }}
          plan={editPlan}
          onSuccess={handleSuccess}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirmDelete.isOpen}
        onOpenChange={confirmDelete.close}
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: confirmDelete.itemName })}
        confirmLabel={t('deleteConfirm')}
        onConfirm={handleDelete}
      />
    </div>
  );
}
