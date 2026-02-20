import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { InlineCreateForm } from '@/components/ui/inline-create-form';
import { api } from '@/api/client';
import { Plus, FolderOpen } from 'lucide-react';

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projectsControllerList(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => api.projectsControllerCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projectsControllerRemove({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Projects">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Project
        </Button>
      </PageHeader>

      {showCreate && (
        <InlineCreateForm
          placeholder="Project name"
          value={name}
          onChange={setName}
          isPending={createMutation.isPending}
          onSubmit={() => createMutation.mutate({ name })}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
        {!isLoading && (projects || []).map((project) => (
          <Card key={project.id} className="cursor-pointer hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2" onClick={() => { setSearchParams({ project: project.id }); navigate(`/?project=${project.id}`); }}>
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{project.name}</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/keys?project=${project.id}`)}>
                    Keys
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(project.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">slug: {project.slug}</p>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
