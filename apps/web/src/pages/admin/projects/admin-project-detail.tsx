import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getRoleLabel } from '@/lib/i18n-utils';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { AlertTriangle, Users, Copy, Check } from 'lucide-react';
import type { AdminProjectMember, AdminPlan } from '@/api/generated/Api';
import translations from './admin-project-detail.translations';
import { useAdminProjectDetail } from '@/features/admin/hooks/use-admin-projects';

export default function AdminProjectDetailPage() {
  const { t } = useLocalTranslation(translations);
  const { id } = useParams<{ id: string }>();
  const { copied, copy } = useCopyToClipboard(2000, () => toast.error(t('copyFailed')));

  const { project, isProjectLoading, isProjectError, refetchProject, plans, isPlansLoading, updatePlanMutation } = useAdminProjectDetail(id);

  const memberColumns: Column<AdminProjectMember>[] = useMemo(() => [
    {
      key: 'display_name',
      header: t('displayName'),
      render: (row) => <span className="font-medium">{row.display_name}</span>,
    },
    {
      key: 'email',
      header: t('email'),
      render: (row) => <span className="text-muted-foreground">{row.email}</span>,
    },
    {
      key: 'role',
      header: t('role'),
      render: (row) => <Badge variant="outline">{getRoleLabel(row.role)}</Badge>,
    },
  ], [t]);

  if (isProjectLoading) {
    return (
      <div className="space-y-6">
        <ListSkeleton count={3} height="h-32" />
      </div>
    );
  }

  if (isProjectError || !project) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={AlertTriangle}
          description={t('errorLoading')}
          action={
            <Button variant="outline" onClick={() => refetchProject()}>
              {t('retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const handlePlanChange = (value: string) => {
    if (value === '__none__') {
      updatePlanMutation.mutate(null);
    } else {
      updatePlanMutation.mutate(value);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={project.name} />

      {/* Plan Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('plan')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('currentPlan')}:</span>
            {project.plan_name ? (
              <Badge variant="default">{project.plan_name}</Badge>
            ) : (
              <Badge variant="secondary">{t('noPlan')}</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{t('changePlan')}:</span>
            <Select
              value={project.plan_id ?? '__none__'}
              onValueChange={handlePlanChange}
              disabled={isPlansLoading || updatePlanMutation.isPending}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('selectPlan')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('noPlan')}</SelectItem>
                {(plans ?? []).map((plan: AdminPlan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Members Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('members')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {project.members.length === 0 ? (
            <EmptyState
              icon={Users}
              description={t('noMembersDescription')}
              className="py-8"
            />
          ) : (
            <DataTable
              columns={memberColumns}
              data={project.members}
              rowKey={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>

      {/* Project Token Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('projectToken')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted p-3 rounded text-sm break-all">{project.token}</code>
            <Button size="icon" variant="outline" onClick={() => copy(project.token)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
