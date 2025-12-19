'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  Activity,
  Plus,
  Minus,
  Clock,
  AlertCircle,
  BarChart3,
  Calendar,
} from 'lucide-react';

// Time range presets
type TimeRange = 'today' | '7d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';

interface DateRange {
  from: string;
  to: string;
}

function getDateRange(range: TimeRange): DateRange {
  const today = new Date();
  const to = today.toISOString().split('T')[0]!;
  
  switch (range) {
    case 'today':
      return { from: to, to };
    case '7d':
      return {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case '30d':
      return {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case '90d':
      return {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case 'ytd':
      return {
        from: `${today.getFullYear()}-01-01`,
        to,
      };
    case 'all':
      // Use a very early date to capture all data
      return {
        from: '2020-01-01',
        to,
      };
    default:
      return {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
  }
}

interface OverviewKPIs {
  activeUsers: number;
  totalEvents: number;
  tracksAdded: number;
  tracksRemoved: number;
  avgApiDurationMs: number;
  errorRate: number;
  totalSessions: number;
  avgSessionDurationMs: number;
}

interface DailySummary {
  date: string;
  total: number;
  trackAdds: number;
  trackRemoves: number;
  trackReorders: number;
  apiCalls: number;
  errors: number;
}

interface ActionDistribution {
  event: string;
  count: number;
}

interface TopPlaylist {
  playlistId: string;
  interactions: number;
}

interface EventsData {
  dailySummaries: DailySummary[];
  actionDistribution: ActionDistribution[];
  topPlaylists: TopPlaylist[];
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function SimpleBarChart({ data, label }: { data: DailySummary[]; label: string }) {
  const maxValue = Math.max(...data.map(d => d.total), 1);
  
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => (
          <div
            key={d.date}
            className="flex-1 bg-primary/80 rounded-t hover:bg-primary transition-colors"
            style={{ height: `${(d.total / maxValue) * 100}%`, minHeight: '2px' }}
            title={`${d.date}: ${d.total} events`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function ActionDonut({ data }: { data: ActionDistribution[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const colors = ['bg-green-500', 'bg-red-500', 'bg-blue-500'];
  const labels: Record<string, string> = {
    track_add: 'Added',
    track_remove: 'Removed',
    track_reorder: 'Reordered',
  };
  
  if (total === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No actions recorded
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.event} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded ${colors[i % colors.length]}`} />
          <span className="flex-1 text-sm">{labels[d.event] || d.event}</span>
          <span className="text-sm font-medium">{d.count}</span>
          <span className="text-xs text-muted-foreground">
            ({formatPercent(d.count / total)})
          </span>
        </div>
      ))}
    </div>
  );
}

function TopPlaylistsList({ playlists }: { playlists: TopPlaylist[] }) {
  if (playlists.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No playlist interactions
      </div>
    );
  }
  
  const maxInteractions = Math.max(...playlists.map(p => p.interactions));
  
  return (
    <div className="space-y-2">
      {playlists.slice(0, 5).map((p, i) => (
        <div key={p.playlistId} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
          <div className="flex-1">
            <div
              className="bg-primary/20 rounded h-6 flex items-center px-2"
              style={{ width: `${(p.interactions / maxInteractions) * 100}%` }}
            >
              <span className="text-xs truncate">{p.playlistId.slice(0, 8)}...</span>
            </div>
          </div>
          <span className="text-sm font-medium">{p.interactions}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange]);

  // Fetch overview KPIs
  const { data: overviewData, isLoading: overviewLoading } = useQuery<{ data: OverviewKPIs }>({
    queryKey: ['stats', 'overview', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/stats/overview?from=${dateRange.from}&to=${dateRange.to}`);
      if (!res.ok) throw new Error('Failed to fetch overview');
      return res.json();
    },
  });

  // Fetch events data
  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ data: EventsData }>({
    queryKey: ['stats', 'events', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/stats/events?from=${dateRange.from}&to=${dateRange.to}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },
  });

  const kpis = overviewData?.data;
  const events = eventsData?.data;

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: 'ytd', label: 'YTD' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Time Range:</span>
        <div className="flex gap-1">
          {timeRanges.map((r) => (
            <Button
              key={r.value}
              variant={timeRange === r.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTimeRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Active Users"
          value={overviewLoading ? '...' : kpis?.activeUsers ?? 0}
          subtitle={`${dateRange.from} to ${dateRange.to}`}
          icon={Users}
        />
        <KPICard
          title="Total Events"
          value={overviewLoading ? '...' : kpis?.totalEvents ?? 0}
          icon={Activity}
        />
        <KPICard
          title="Tracks Added"
          value={overviewLoading ? '...' : kpis?.tracksAdded ?? 0}
          icon={Plus}
        />
        <KPICard
          title="Tracks Removed"
          value={overviewLoading ? '...' : kpis?.tracksRemoved ?? 0}
          icon={Minus}
        />
        <KPICard
          title="Avg API Duration"
          value={overviewLoading ? '...' : formatDuration(kpis?.avgApiDurationMs ?? 0)}
          icon={Clock}
        />
        <KPICard
          title="Error Rate"
          value={overviewLoading ? '...' : formatPercent(kpis?.errorRate ?? 0)}
          icon={AlertCircle}
        />
        <KPICard
          title="Total Sessions"
          value={overviewLoading ? '...' : kpis?.totalSessions ?? 0}
          icon={Users}
        />
        <KPICard
          title="Avg Session Duration"
          value={overviewLoading ? '...' : formatDuration(kpis?.avgSessionDurationMs ?? 0)}
          icon={Clock}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Daily Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : events?.dailySummaries && events.dailySummaries.length > 0 ? (
              <SimpleBarChart data={events.dailySummaries} label="" />
            ) : (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                No data for selected period
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Action Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading...</div>
            ) : (
              <ActionDonut data={events?.actionDistribution ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Playlists */}
      <Card>
        <CardHeader>
          <CardTitle>Top Playlists (by interactions)</CardTitle>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <TopPlaylistsList playlists={events?.topPlaylists ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
