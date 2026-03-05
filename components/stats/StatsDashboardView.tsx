'use client';

import {
  Users,
  Activity,
  BarChart3,
  Calendar,
  TrendingUp,
  Trophy,
  MessageSquare,
  Shield,
  Sparkles,
  RefreshCw,
  Globe,
  Database,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KPICard } from './components/KPICard';
import { TopPlaylistsList } from './components/TopPlaylistsList';
import { SimpleBarChart } from './charts/SimpleBarChart';
import { UsersBarChart } from './charts/UsersBarChart';
import { ActionsBarChart } from './charts/ActionsBarChart';
import { ActionDonut } from './charts/ActionDonut';
import { UserGrowthChart } from './charts/UserGrowthChart';
import { TopUsersCard } from './cards/TopUsersCard';
import { TopTracksCard } from './cards/TopTracksCard';
import { RecsStatsCard } from './cards/RecsStatsCard';
import { AuthenticationStatsCard } from './cards/AuthenticationStatsCard';
import { FeedbackStatsCard } from './cards/FeedbackStatsCard';
import { UserRegistrationChart } from './cards/UserRegistrationChart';
import { ErrorReportsCard } from './cards/ErrorReportsCard';
import { AccessRequestsCard } from './cards/AccessRequestsCard';
import { AccessRequestsTimeline } from './cards/AccessRequestsTimeline';
import { TrafficStatsCard } from './cards/TrafficStatsCard';
import type { DateRange, TimeRange, OverviewKPIs, RecsStats, EventsData, RegisteredUsersPerDay } from './types';

const sections = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'traffic', label: 'Traffic', icon: Globe },
  { id: 'rankings', label: 'Rankings', icon: Trophy },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  { id: 'auth', label: 'Authentication', icon: Shield },
  { id: 'recs', label: 'Recommendations', icon: Sparkles },
] as const;

const timeRanges: { value: TimeRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All Time' },
];

interface StatsDashboardViewProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  dateRange: DateRange;
  kpis: OverviewKPIs | undefined;
  overviewData: { data: OverviewKPIs; dbStats?: { sizeBytes: number; sizeMB: number } } | undefined;
  overviewLoading: boolean;
  events: EventsData | undefined;
  eventsLoading: boolean;
  recsData: RecsStats | undefined;
  recsLoading: boolean;
  registrationsLoading: boolean;
  registrationsData: { data: RegisteredUsersPerDay[] } | undefined;
  feedbackSummaryLoading: boolean;
  feedbackSummary: { data: { totalResponses: number } } | undefined;
  errorReportsSummaryLoading: boolean;
  errorReportsSummary: { data: unknown[]; pagination: { total: number } } | undefined;
  errorReportsResolvedSummary: { data: unknown[]; pagination: { total: number } } | undefined;
  accessRequestsSummaryLoading: boolean;
  accessRequestsSummary: { data: unknown[]; pagination: { total: number } } | undefined;
  accessRequestsApprovedSummary: { data: unknown[]; pagination: { total: number } } | undefined;
}

// eslint-disable-next-line complexity
export function StatsDashboardView({
  timeRange,
  onTimeRangeChange,
  onRefresh,
  isRefreshing,
  dateRange,
  kpis,
  overviewData,
  overviewLoading,
  events,
  eventsLoading,
  recsData,
  recsLoading,
  registrationsLoading,
  registrationsData,
  feedbackSummaryLoading,
  feedbackSummary,
  errorReportsSummaryLoading,
  errorReportsSummary,
  errorReportsResolvedSummary,
  accessRequestsSummaryLoading,
  accessRequestsSummary,
  accessRequestsApprovedSummary,
}: StatsDashboardViewProps) {
  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 -mx-4 px-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Time Range:</span>
            <div className="md:hidden flex-1" suppressHydrationWarning>
              <Select value={timeRange} onValueChange={(value: string) => onTimeRangeChange(value as TimeRange)}>
                <SelectTrigger className="h-8 w-full" suppressHydrationWarning>
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
            <div className="hidden md:flex gap-1 flex-1">
              {timeRanges.map((r) => (
                <Button
                  key={r.value}
                  variant={timeRange === r.value ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => onTimeRangeChange(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="ml-auto md:ml-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

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

        <section id="overview" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Overview
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <a href="#users" className="block transition-transform hover:scale-105">
              <KPICard
                title="Active Users"
                value={overviewLoading ? '...' : kpis?.activeUsers ?? 0}
                subtitle={`${dateRange.from} to ${dateRange.to}`}
                icon={Users}
                description="Number of unique users who have interacted with the app during the selected time period"
              />
            </a>
            <a href="#activity" className="block transition-transform hover:scale-105">
              <KPICard
                title="Total Events"
                value={overviewLoading ? '...' : kpis?.totalEvents ?? 0}
                icon={Activity}
                description="Sum of all tracked events including track additions, removals, reorders, and API calls"
              />
            </a>
            <a href="#traffic" className="block transition-transform hover:scale-105">
              <KPICard
                title="Total Sessions"
                value={overviewLoading ? '...' : kpis?.totalSessions ?? 0}
                icon={Globe}
                description="Number of unique user sessions started during the selected period"
              />
            </a>
            <a href="#recs" className="block transition-transform hover:scale-105">
              <KPICard
                title="Recommendations"
                value={recsLoading ? '...' : recsData?.totalTracks ?? 0}
                icon={Sparkles}
                description="Total number of tracks in the recommendations database"
              />
            </a>
            <a href="#feedback" className="block transition-transform hover:scale-105">
              <KPICard
                title="Feedback"
                value={feedbackSummaryLoading ? '...' : feedbackSummary?.data?.totalResponses ?? 0}
                icon={MessageSquare}
                description="Total feedback responses received during the selected period"
              />
            </a>
            <a href="#feedback" className="block transition-transform hover:scale-105">
              <KPICard
                title="Error Reports"
                value={errorReportsSummaryLoading ? '...' : `${errorReportsSummary?.pagination?.total ?? 0} / ${errorReportsResolvedSummary?.pagination?.total ?? 0}`}
                subtitle="Open / Solved"
                icon={AlertTriangle}
                description="Error reports submitted by users - open vs resolved"
              />
            </a>
            <a href="#auth" className="block transition-transform hover:scale-105">
              <KPICard
                title="Access Requests"
                value={accessRequestsSummaryLoading ? '...' : `${accessRequestsSummary?.pagination?.total ?? 0} / ${accessRequestsApprovedSummary?.pagination?.total ?? 0}`}
                subtitle="Pending / Approved"
                icon={UserPlus}
                description="Access requests from users - pending vs approved"
              />
            </a>
            <KPICard
              title="Database Size"
              value={overviewLoading ? '...' : overviewData?.dbStats ? `${overviewData.dbStats.sizeMB} MB` : 'N/A'}
              icon={Database}
              description="Size of the metrics database file (metrics.db) on disk"
            />
          </div>
        </section>

        <section id="activity" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity
          </h2>

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

        <section id="users" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            User Growth & Activity
          </h2>
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

            <AccessRequestsTimeline dateRange={dateRange} />

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
        </section>

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

        <section id="traffic" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Traffic Analytics
          </h2>
          <div className="space-y-4">
            <TrafficStatsCard dateRange={dateRange} />
          </div>
        </section>

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

        <section id="auth" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Authentication & Access
          </h2>
          <div className="space-y-4">
            <AuthenticationStatsCard dateRange={dateRange} />
            <AccessRequestsCard />
          </div>
        </section>

        <section id="recs" className="scroll-mt-28">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Recommendations System
          </h2>
          <div className="space-y-4">
            <RecsStatsCard isLoading={recsLoading} {...(recsData ? { data: recsData } : {})} />

            {recsData?.enabled && (
              <TopTracksCard
                topTracks={recsData.topTracks ?? []}
                totalTracks={recsData.totalTracks ?? 0}
                isLoading={recsLoading}
              />
            )}
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}
