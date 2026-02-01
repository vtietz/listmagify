'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Activity,
  BarChart3,
  TrendingUp,
  Trophy,
  Shield,
  Sparkles,
  Globe,
  Database,
  Calendar,
  RefreshCw,
} from 'lucide-react';

// Import components from stats
import { KPICard } from '@/components/stats/components/KPICard';
import { TopPlaylistsList } from '@/components/stats/components/TopPlaylistsList';
import { SimpleBarChart } from '@/components/stats/charts/SimpleBarChart';
import { UsersBarChart } from '@/components/stats/charts/UsersBarChart';
import { ActionsBarChart } from '@/components/stats/charts/ActionsBarChart';
import { ActionDonut } from '@/components/stats/charts/ActionDonut';
import { UserGrowthChart } from '@/components/stats/charts/UserGrowthChart';
import { TopUsersCard } from '@/components/stats/cards/TopUsersCard';
import { TopTracksCard } from '@/components/stats/cards/TopTracksCard';
import { RecsStatsCard } from '@/components/stats/cards/RecsStatsCard';
import { AuthenticationStatsCard } from '@/components/stats/cards/AuthenticationStatsCard';
import { UserRegistrationChart } from '@/components/stats/cards/UserRegistrationChart';
import { TrafficStatsCard } from '@/components/stats/cards/TrafficStatsCard';
import { getDateRange } from '@/components/stats/utils';
import type { OverviewKPIs, RecsStats, EventsData, TimeRange } from '@/components/stats/types';

/**
 * Stats Section - Usage analytics and metrics
 * 
 * This section contains monitoring and analytics:
 * - Overview KPIs
 * - Activity charts
 * - User growth
 * - Traffic analytics
 * - Rankings
 * - Authentication stats
 * - Recommendations system
 * 
 * Includes its own time range selector for filtering analytics data.
 */
export function StatsSection() {
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange]);
  const queryClient = useQueryClient();
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  // Fetch overview KPIs
  const { data: overviewData, isLoading: overviewLoading, isFetching: overviewFetching } = useQuery<{ data: OverviewKPIs; dbStats?: { sizeBytes: number; sizeMB: number } }>({
    queryKey: ['stats', 'overview', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/overview?from=${dateRange.from}&to=${dateRange.to}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch overview');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Fetch events data
  const { data: eventsData, isLoading: eventsLoading, isFetching: eventsFetching } = useQuery<{ data: EventsData }>({
    queryKey: ['stats', 'events', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/events?from=${dateRange.from}&to=${dateRange.to}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Fetch recs stats with top tracks (not time-dependent)
  const { data: recsData, isLoading: recsLoading, isFetching: recsFetching } = useQuery<RecsStats>({
    queryKey: ['stats', 'recs'],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch('/api/stats/recs?topTracksLimit=50', { signal });
      if (!res.ok) throw new Error('Failed to fetch recs stats');
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnMount: true,
  });

  // Fetch user registrations for growth chart
  const { data: registrationsData, isLoading: registrationsLoading } = useQuery<{ data: any[] }>({
    queryKey: ['stats', 'registrations', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/registrations?from=${dateRange.from}&to=${dateRange.to}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch registration stats');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Manual refresh function
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stats', 'overview', dateRangeKey] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'events', dateRangeKey] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'recs'] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'registrations', dateRangeKey] });
  };

  const isRefreshing = overviewFetching || eventsFetching || recsFetching;

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: 'ytd', label: 'YTD' },
    { value: 'all', label: 'All Time' },
  ];

  const kpis = overviewData?.data;
  const events = eventsData?.data;

  return (
    <section id="stats" className="scroll-mt-28 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Statistics
        </h2>
        
        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Time Range:</span>
          {/* Mobile: Dropdown */}
          <div className="md:hidden">
            <Select value={timeRange} onValueChange={(value: string) => setTimeRange(value as TimeRange)}>
              <SelectTrigger className="h-8 w-32" suppressHydrationWarning>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeRanges.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Desktop: Buttons */}
          <div className="hidden md:flex gap-1">
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
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ============================================ */}
      {/* Overview - Key Performance Metrics          */}
      {/* ============================================ */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Overview
        </h3>
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
            title="Total Sessions"
            value={overviewLoading ? '...' : kpis?.totalSessions ?? 0}
            icon={Globe}
            description="Number of unique user sessions started during the selected period"
          />
          <KPICard
            title="Recommendations"
            value={recsLoading ? '...' : recsData?.totalTracks ?? 0}
            icon={Sparkles}
            description="Total number of tracks in the recommendations database"
          />
          <KPICard
            title="Database Size"
            value={overviewLoading ? '...' : overviewData?.dbStats ? `${overviewData.dbStats.sizeMB} MB` : 'N/A'}
            icon={Database}
            description="Size of the metrics database file (metrics.db) on disk"
          />
        </div>
      </div>

      {/* ============================================ */}
      {/* Activity - Daily Usage Patterns             */}
      {/* ============================================ */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Activity
        </h3>
        
        {/* Daily Events and Action Distribution */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-4">
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

        {/* Actions per Day (Stacked) */}
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

      {/* ============================================ */}
      {/* Users - User Metrics & Growth               */}
      {/* ============================================ */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          User Growth & Activity
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Users per Day
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

          <UserRegistrationChart dateRange={dateRange} />
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Users Growth
              </CardTitle>
              <CardDescription>
                Cumulative user count over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {registrationsLoading ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  Loading...
                </div>
              ) : (
                <UserGrowthChart data={registrationsData?.data ?? []} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ============================================ */}
      {/* Traffic - Page Analytics                    */}
      {/* ============================================ */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Traffic Analytics
        </h3>
        <TrafficStatsCard dateRange={dateRange} />
      </div>

      {/* ============================================ */}
      {/* Rankings - Leaderboards                     */}
      {/* ============================================ */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Rankings
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <TopUsersCard dateRange={dateRange} />

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
      </div>

      {/* ============================================ */}
      {/* Authentication - Login Stats                */}
      {/* ============================================ */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Authentication
        </h3>
        <AuthenticationStatsCard dateRange={dateRange} />
      </div>

      {/* ============================================ */}
      {/* Recommendations - AI/ML System              */}
      {/* ============================================ */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Recommendations System
        </h3>
        <div className="space-y-4">
          {recsData && <RecsStatsCard data={recsData} isLoading={recsLoading} />}
          
          {recsData?.enabled && recsData?.topTracks && (
            <TopTracksCard 
              topTracks={recsData.topTracks} 
              totalTracks={recsData.totalTracks ?? 0}
              isLoading={recsLoading} 
            />
          )}
        </div>
      </div>
    </section>
  );
}
