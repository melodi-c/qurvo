import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/api/client';

export default function PersonsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['persons', projectId, search, page],
    queryFn: () =>
      api.personsControllerGetPersons({
        project_id: projectId,
        ...(search ? { search } : {}),
        limit,
        offset: page * limit,
      }),
    enabled: !!projectId,
  });

  const persons = data?.persons ?? [];
  const total = data?.total ?? 0;

  if (!projectId) {
    return <div className="text-muted-foreground">Select a project first</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Persons</h1>
        {total > 0 && (
          <p className="text-sm text-muted-foreground mt-1">{total.toLocaleString()} total</p>
        )}
      </div>

      <Input
        placeholder="Search by identifier..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        className="max-w-sm"
      />

      <Card className="py-0 gap-0">
        <CardContent className="pt-4">
          {isLoading && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Identifier</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">First Seen</th>
                    <th className="pb-2 pr-4">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {persons.map((person) => {
                    const props = person.properties as Record<string, unknown>;
                    const displayId = person.distinct_ids[0] ?? person.id.slice(0, 8);
                    const name = String(props['name'] ?? props['$name'] ?? '');
                    const email = String(props['email'] ?? props['$email'] ?? '');
                    return (
                      <tr
                        key={person.id}
                        className="border-b border-border hover:bg-muted/50 cursor-pointer"
                        onClick={() =>
                          navigate(`/persons/${person.id}?project=${projectId}`)
                        }
                      >
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground truncate max-w-[160px]">
                          {displayId}
                        </td>
                        <td className="py-2 pr-4 font-medium">{name || '—'}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{email || '—'}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {new Date(person.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {new Date(person.updated_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                  {persons.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        No persons found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between items-center py-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * limit + persons.length >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
