import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { api } from '@/api/client';
import { GranularityEnum } from '@/api/generated/Api';
import { BarChart3, Users, Activity } from 'lucide-react';

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();

  const { data: counts } = useQuery({
    queryKey: ['counts', projectId],
    queryFn: () => api.analyticsControllerGetCounts({ project_id: projectId, from, to }),
    enabled: !!projectId,
  });

  const { data: trends } = useQuery({
    queryKey: ['trends', projectId],
    queryFn: () => api.analyticsControllerGetTrends({ project_id: projectId, from, to, granularity: GranularityEnum.Day }),
    enabled: !!projectId,
  });

  const { data: topEvents } = useQuery({
    queryKey: ['topEvents', projectId],
    queryFn: () => api.analyticsControllerGetTopEvents({ project_id: projectId, from, to, limit: 10 }),
    enabled: !!projectId,
  });

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a project to view analytics
      </div>
    );
  }

  const stats = [
    { label: 'Total Events', value: counts?.count || '0', icon: BarChart3 },
    { label: 'Unique Users', value: counts?.unique_users || '0', icon: Users },
    { label: 'Sessions', value: counts?.sessions || '0', icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Number(stat.value).toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events over time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="period"
                  stroke="#a1a1aa"
                  fontSize={12}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis stroke="#a1a1aa" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Line type="monotone" dataKey="count" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="unique_users" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(topEvents || []).map((event, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="font-medium">{event.event_name}</span>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{Number(event.count).toLocaleString()} events</span>
                  <span>{Number(event.unique_users).toLocaleString()} users</span>
                </div>
              </div>
            ))}
            {(!topEvents || topEvents.length === 0) && (
              <p className="text-muted-foreground text-sm">No events yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
