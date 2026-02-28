import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { AdminUserProject } from '@/api/generated/Api';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './admin-user-detail.translations';
import { formatDate } from '@/lib/formatting';
import { useAdminUserDetail } from '@/features/admin/hooks/use-admin-users';

export default function AdminUserDetailPage() {
  const { t } = useLocalTranslation(translations);
  const { id } = useParams<{ id: string }>();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { user, isLoading, isError, refetch, patchMutation } = useAdminUserDetail(id);

  const handleStaffToggle = async () => {
    if (!user) return;
    await patchMutation.mutateAsync(!user.is_staff);
    setConfirmOpen(false);
  };

  const projectColumns = useMemo((): Column<AdminUserProject>[] => [
    {
      key: 'name',
      header: t('projectName'),
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'role',
      header: t('projectRole'),
      render: (row) => <Badge variant="secondary">{row.role}</Badge>,
    },
  ], [t]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <ListSkeleton count={3} />
      </div>
    );
  }

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

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title={user.display_name || user.email} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('userInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">{t('email')}</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">{t('createdAt')}</p>
              <p className="font-medium">{formatDate(user.created_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">{t('isStaff')}</p>
              <div className="flex items-center gap-2">
                {user.is_staff ? (
                  <Badge variant="default">{t('yes')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('no')}</Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmOpen(true)}
                >
                  {user.is_staff ? t('demote') : t('promote')}
                </Button>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">{t('emailVerified')}</p>
              {user.email_verified ? (
                <Badge variant="default">{t('yes')}</Badge>
              ) : (
                <Badge variant="secondary">{t('no')}</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t('projects')}</h2>
        {user.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noProjects')}</p>
        ) : (
          <DataTable
            columns={projectColumns}
            data={user.projects}
            rowKey={(row) => row.id}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={user.is_staff ? t('demoteTitle') : t('promoteTitle')}
        description={user.is_staff ? t('demoteDescription') : t('promoteDescription')}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        variant="default"
        onConfirm={handleStaffToggle}
      />
    </div>
  );
}
