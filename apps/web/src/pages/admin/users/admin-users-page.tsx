import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDelete } from '@/hooks/use-confirm-delete';
import { apiClient } from '@/api/client';
import type { AdminUserListItem } from '@/api/generated/Api';
import { routes } from '@/lib/routes';
import { toast } from 'sonner';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './admin-users-page.translations';
import { formatDate } from '@/lib/formatting';

export default function AdminUsersPage() {
  const { t } = useLocalTranslation(translations);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirmAction = useConfirmDelete();

  const { data: users, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient.admin.adminUsersControllerListUsers(),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, is_staff }: { id: string; is_staff: boolean }) =>
      apiClient.admin.adminUsersControllerPatchUser({ id }, { is_staff }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(variables.is_staff ? t('promoteSuccess') : t('demoteSuccess'));
    },
    onError: () => toast.error(t('actionFailed')),
  });

  const handleStaffToggle = async () => {
    const user = (users ?? []).find((u) => u.id === confirmAction.itemId);
    if (!user) return;
    await patchMutation.mutateAsync({ id: user.id, is_staff: !user.is_staff });
  };

  const pendingUser = (users ?? []).find((u) => u.id === confirmAction.itemId);

  const columns = useMemo((): Column<AdminUserListItem>[] => [
    {
      key: 'email',
      header: t('email'),
      render: (row) => <span className="font-medium">{row.email}</span>,
    },
    {
      key: 'display_name',
      header: t('displayName'),
      hideOnMobile: true,
      render: (row) => <span className="text-muted-foreground">{row.display_name}</span>,
    },
    {
      key: 'is_staff',
      header: t('isStaff'),
      hideOnMobile: true,
      render: (row) =>
        row.is_staff ? (
          <Badge variant="default">{t('yes')}</Badge>
        ) : (
          <Badge variant="secondary">{t('no')}</Badge>
        ),
    },
    {
      key: 'email_verified',
      header: t('emailVerified'),
      hideOnMobile: true,
      render: (row) =>
        row.email_verified ? (
          <Badge variant="default">{t('yes')}</Badge>
        ) : (
          <Badge variant="secondary">{t('no')}</Badge>
        ),
    },
    {
      key: 'created_at',
      header: t('createdAt'),
      hideOnMobile: true,
      render: (row) => (
        <span className="text-muted-foreground text-sm">
          {formatDate(row.created_at)}
        </span>
      ),
    },
    {
      key: 'project_count',
      header: t('projectCount'),
      render: (row) => <span className="text-muted-foreground">{row.project_count}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            confirmAction.requestDelete(row.id, row.display_name || row.email);
          }}
        >
          {row.is_staff ? t('demote') : t('promote')}
        </Button>
      ),
    },
  ], [t, confirmAction]);

  if (!isLoading && isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <EmptyState
          icon={AlertTriangle}
          description={t('errorLoading')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {isLoading && <ListSkeleton count={5} />}

      {!isLoading && !isError && users && users.length === 0 && (
        <EmptyState icon={Users} description={t('noUsers')} />
      )}

      {!isLoading && !isError && users && users.length > 0 && (
        <DataTable
          columns={columns}
          data={users}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(routes.admin.users.detail(row.id))}
        />
      )}

      <ConfirmDialog
        open={confirmAction.isOpen}
        onOpenChange={confirmAction.close}
        title={pendingUser?.is_staff ? t('demoteTitle') : t('promoteTitle')}
        description={
          pendingUser?.is_staff
            ? t('demoteDescription', { name: confirmAction.itemName })
            : t('promoteDescription', { name: confirmAction.itemName })
        }
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        variant="default"
        onConfirm={handleStaffToggle}
      />
    </div>
  );
}
