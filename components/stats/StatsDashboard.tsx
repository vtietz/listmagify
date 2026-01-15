'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  Plus,
  Minus,
  Clock,
  AlertCircle,
  BarChart3,
  Calendar,
  TrendingUp,
  Trophy,
  MessageSquare,
  Shield,
  Sparkles,
} from 'lucide-react';

// Import extracted components
import { KPICard } from './components/KPICard';
import { TopPlaylistsList } from './components/TopPlaylistsList';
import { SimpleBarChart } from './charts/SimpleBarChart';
import { UsersBarChart } from './charts/UsersBarChart';
import { ActionsBarChart } from './charts/ActionsBarChart';
import { ActionDonut } from './charts/ActionDonut';
import { TopUsersCard } from './cards/TopUsersCard';
import { TopTracksCard } from './cards/TopTracksCard';
import { RecsStatsCard } from './cards/RecsStatsCard';
import { AuthenticationStatsCard } from './cards/AuthenticationStatsCard';
import { FeedbackStatsCard } from './cards/FeedbackStatsCard';
import { UserRegistrationChart } from './cards/UserRegistrationChart';
import { ErrorReportsCard } from './cards/ErrorReportsCard';
import { AccessRequestsCard } from './cards/AccessRequestsCard';
import { getDateRange, formatDuration, formatPercent } from './utils';
import type { TimeRange, OverviewKPIs, RecsStats, EventsData } from './types';

// Section navigation items
const sections = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'rankings', label: 'Rankings', icon: Trophy },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  { id: 'auth', label: 'Authentication', icon: Shield },
  { id: 'recs', label: 'Recommendations', icon: Sparkles },
];

export function StatsDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
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

  // Fetch recs stats with top tracks (not time-dependent)
  const { data: recsData, isLoading: recsLoading } = useQuery<RecsStats>({
    queryKey: ['stats', 'recs'],
    queryFn: async () => {
      const res = await fetch('/api/stats/recs?topTracksLimit=50');
      if (!res.ok) throw new Error('Failed to fetch recs stats');
      return res.json();
    },
    staleTime: 30 * 1000,
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
        {/* Header with Time Range and Section Navigation */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 -mx-4 px-4 border-b">
          {/* Time Range Selector */}
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Time Range:</span>
            {/* Mobile: Dropdown */}
            <div className="md:hidden flex-1">
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
                <SelectTrigger className="h-8 w-full">
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
          </div>
          
          {/* Section Navigation */}
          <nav className="flex gap-1 flex-wrap">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{section.label}</span>
                </a>
              );
            })}
          </nav>
        </div>

        {/* ============================================ */}
        {/* SECTION: Overview - Key Performance Metrics */}
        {/* ============================================ */}
        <section id="overview" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Overview
          </h2>
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
        </section>

        {/* ============================================ */}
        {/* SECTION: Activity - Daily Usage Patterns    */}
        {/* ============================================ */}
        <section id="activity" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity
          </h2>
          
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
        </section>

        {/* ============================================ */}
        {/* SECTION: Users - User Metrics & Growth      */}
        {/* ============================================ */}
        <section id="users" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            User Growth & Activity
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>
        </section>

        {/* ============================================ */}
        {/* SECTION: Rankings - Leaderboards            */}
        {/* ============================================ */}
        <section id="rankings" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Rankings
          </h2>
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
        </section>

        {/* ============================================ */}
        {/* SECTION: Feedback - User Satisfaction       */}
        {/* ============================================ */}
        <section id="feedback" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Feedback & Reports
          </h2>
          <div className="space-y-4">
            <FeedbackStatsCard dateRange={dateRange} isLoading={overviewLoading} />
            <ErrorReportsCard dateRange={dateRange} />
          </div>
        </section>

        {/* ============================================ */}
        {/* SECTION: Authentication - Login & Access    */}
        {/* ============================================ */}
        <section id="auth" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Authentication & Access
          </h2>
          <div className="space-y-4">
            <AuthenticationStatsCard dateRange={dateRange} />
            <AccessRequestsCard dateRange={dateRange} />
          </div>
        </section>

        {/* ============================================ */}
        {/* SECTION: Recommendations - AI/ML System     */}
        {/* ============================================ */}
        <section id="recs" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Recommendations System
          </h2>
          <div className="space-y-4">
            <RecsStatsCard data={recsData} isLoading={recsLoading} />
            
            {recsData?.enabled && (
              <TopTracksCard 
                topTracks={recsData?.topTracks} 
                totalTracks={recsData?.totalTracks}
                isLoading={recsLoading} 
              />
            )}
          </div>
        </section>

      </div>
    </TooltipProvider>
  );
}
