'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users,
  Activity,
  Plus,
  Minus,
  Clock,
  AlertCircle,
  BarChart3,
  Calendar,
  HelpCircle,
  MousePointerClick,
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

interface DailyUsers {
  date: string;
  users: number;
}

interface DailyActions {
  date: string;
  actions: number;
  adds: number;
  removes: number;
  reorders: number;
}

interface EventsData {
  dailySummaries: DailySummary[];
  actionDistribution: ActionDistribution[];
  topPlaylists: TopPlaylist[];
  dailyUsers: DailyUsers[];
  dailyActions: DailyActions[];
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  description,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          {title}
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SimpleBarChart({ data, label }: { data: DailySummary[]; label: string }) {
  const maxValue = Math.max(...data.map(d => d.total), 1);
  
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 bg-primary/80 rounded-t hover:bg-primary transition-colors cursor-default"
                style={{ height: `${(d.total / maxValue) * 100}%`, minHeight: '2px' }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div>{d.total} events</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date ? formatDate(data[0].date) : ''}</span>
        <span>{data.at(-1)?.date ? formatDate(data.at(-1)!.date) : ''}</span>
      </div>
    </div>
  );
}

function UsersBarChart({ data }: { data: DailyUsers[] }) {
  const maxValue = Math.max(...data.map(d => d.users), 1);
  
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        No data for selected period
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {data.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 bg-blue-500/80 rounded-t hover:bg-blue-500 transition-colors cursor-default"
                style={{ height: `${(d.users / maxValue) * 100}%`, minHeight: '2px' }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div>{d.users} unique user{d.users !== 1 ? 's' : ''}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date ? formatDate(data[0].date) : ''}</span>
        <span>{data.at(-1)?.date ? formatDate(data.at(-1)!.date) : ''}</span>
      </div>
    </div>
  );
}

function ActionsBarChart({ data }: { data: DailyActions[] }) {
  const maxValue = Math.max(...data.map(d => d.actions), 1);
  
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        No data for selected period
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {data.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 rounded-t transition-colors cursor-default flex flex-col justify-end"
                style={{ height: `${(d.actions / maxValue) * 100}%`, minHeight: '2px' }}
              >
                {/* Stacked bar: adds (green), removes (red), reorders (blue) */}
                <div 
                  className="bg-green-500/80 hover:bg-green-500 w-full"
                  style={{ height: `${d.actions > 0 ? (d.adds / d.actions) * 100 : 0}%` }}
                />
                <div 
                  className="bg-red-500/80 hover:bg-red-500 w-full"
                  style={{ height: `${d.actions > 0 ? (d.removes / d.actions) * 100 : 0}%` }}
                />
                <div 
                  className="bg-blue-500/80 hover:bg-blue-500 w-full rounded-t"
                  style={{ height: `${d.actions > 0 ? (d.reorders / d.actions) * 100 : 0}%` }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm space-y-1">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded" />
                  <span>{d.adds} added</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded" />
                  <span>{d.removes} removed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded" />
                  <span>{d.reorders} reordered</span>
                </div>
                <div className="border-t pt-1 mt-1 font-medium">{d.actions} total</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date ? formatDate(data[0].date) : ''}</span>
        <span>{data.at(-1)?.date ? formatDate(data.at(-1)!.date) : ''}</span>
      </div>
      {/* Legend */}
      <div className="flex gap-4 justify-center text-xs">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded" />
          <span>Added</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-red-500 rounded" />
          <span>Removed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-500 rounded" />
          <span>Reordered</span>
        </div>
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
    <TooltipProvider>
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
          description="Number of unique users who have interacted with the app during the selected time period"
        />
        <KPICard
          title="Total Events"
          value={overviewLoading ? '...' : kpis?.totalEvents ?? 0}
          icon={Activity}
          description="Sum of all tracked events including track additions, removals, reorders, and API calls"
        />
        <KPICard
          title="Tracks Added"
          value={overviewLoading ? '...' : kpis?.tracksAdded ?? 0}
          icon={Plus}
          description="Number of tracks added to playlists by users"
        />
        <KPICard
          title="Tracks Removed"
          value={overviewLoading ? '...' : kpis?.tracksRemoved ?? 0}
          icon={Minus}
          description="Number of tracks removed from playlists by users"
        />
        <KPICard
          title="Avg API Duration"
          value={overviewLoading ? '...' : formatDuration(kpis?.avgApiDurationMs ?? 0)}
          icon={Clock}
          description="Average time taken for Spotify API calls to complete"
        />
        <KPICard
          title="Error Rate"
          value={overviewLoading ? '...' : formatPercent(kpis?.errorRate ?? 0)}
          icon={AlertCircle}
          description="Percentage of API calls that resulted in errors"
        />
        <KPICard
          title="Total Sessions"
          value={overviewLoading ? '...' : kpis?.totalSessions ?? 0}
          icon={Users}
          description="Number of unique user sessions started during the selected period"
        />
        <KPICard
          title="Avg Session Duration"
          value={overviewLoading ? '...' : formatDuration(kpis?.avgSessionDurationMs ?? 0)}
          icon={Clock}
          description="Average time users spent in a single session"
        />
      </div>

      {/* Charts Row 1: Daily Activity */}
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

      {/* Charts Row 2: Users and Actions per Day */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users per Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <UsersBarChart data={events?.dailyUsers ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Actions per Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <ActionsBarChart data={events?.dailyActions ?? []} />
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
    </TooltipProvider>
  );
}
