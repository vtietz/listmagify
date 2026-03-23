'use client';

/**
 * Section components for StatsDashboardView.
 * Extracted to keep the view file below the max-lines limit.
 */

import {
  Users,
  Activity,
  BarChart3,
  TrendingUp,
  Trophy,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { UserRegistrationChart } from './cards/UserRegistrationChart';
import { AccessRequestsTimeline } from './cards/AccessRequestsTimeline';
import {
  AlertTriangle,
  Database,
  Globe,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import type { StatsDashboardViewProps } from './types';

const LOADING_PLACEHOLDER = '...';

/** Helper that shows a loading placeholder or the actual content. */
export function LoadingCard({ children, isLoading }: { children: React.ReactNode; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }
  return <>{children}</>;
}

export function OverviewSection({
  overviewLoading,
  recsLoading,
  feedbackSummaryLoading,
  errorReportsSummaryLoading,
  accessRequestsSummaryLoading,
  kpis,
  recsData,
  overviewData,
  feedbackSummary,
  errorReportsSummary,
  errorReportsResolvedSummary,
  accessRequestsSummary,
  accessRequestsApprovedSummary,
  dateRange,
}: Pick<
  StatsDashboardViewProps,
  | 'overviewLoading'
  | 'recsLoading'
  | 'feedbackSummaryLoading'
  | 'errorReportsSummaryLoading'
  | 'accessRequestsSummaryLoading'
  | 'kpis'
  | 'recsData'
  | 'overviewData'
  | 'feedbackSummary'
  | 'errorReportsSummary'
  | 'errorReportsResolvedSummary'
  | 'accessRequestsSummary'
  | 'accessRequestsApprovedSummary'
  | 'dateRange'
>) {
  const activeUsers = overviewLoading ? LOADING_PLACEHOLDER : (kpis?.activeUsers ?? 0);
  const totalEvents = overviewLoading ? LOADING_PLACEHOLDER : (kpis?.totalEvents ?? 0);
  const totalSessions = overviewLoading ? LOADING_PLACEHOLDER : (kpis?.totalSessions ?? 0);
  const totalRecs = recsLoading ? LOADING_PLACEHOLDER : (recsData?.totalTracks ?? 0);
  const feedbackTotal = feedbackSummaryLoading ? LOADING_PLACEHOLDER : (feedbackSummary?.data?.totalResponses ?? 0);
  const errorOpen = errorReportsSummary?.pagination?.total ?? 0;
  const errorSolved = errorReportsResolvedSummary?.pagination?.total ?? 0;
  const errorReports = errorReportsSummaryLoading ? LOADING_PLACEHOLDER : `${errorOpen} / ${errorSolved}`;
  const accessPending = accessRequestsSummary?.pagination?.total ?? 0;
  const accessApproved = accessRequestsApprovedSummary?.pagination?.total ?? 0;
  const accessRequests = accessRequestsSummaryLoading ? LOADING_PLACEHOLDER : `${accessPending} / ${accessApproved}`;
  const dbSize = overviewLoading ? LOADING_PLACEHOLDER : (overviewData?.dbStats ? `${overviewData.dbStats.sizeMB} MB` : 'N/A');

  return (
    <section id="overview" className="scroll-mt-28">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5" />
        Overview
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <a href="#users" className="block transition-transform hover:scale-105">
          <KPICard
            title="Active Users"
            value={activeUsers}
            subtitle={`${dateRange.from} to ${dateRange.to}`}
            icon={Users}
            description="Number of unique users who have interacted with the app during the selected time period"
          />
        </a>
        <a href="#activity" className="block transition-transform hover:scale-105">
          <KPICard
            title="Total Events"
            value={totalEvents}
            icon={Activity}
            description="Sum of all tracked events including track additions, removals, reorders, and API calls"
          />
        </a>
        <a href="#traffic" className="block transition-transform hover:scale-105">
          <KPICard
            title="Total Sessions"
            value={totalSessions}
            icon={Globe}
            description="Number of unique user sessions started during the selected period"
          />
        </a>
        <a href="#recs" className="block transition-transform hover:scale-105">
          <KPICard
            title="Recommendations"
            value={totalRecs}
            icon={Sparkles}
            description="Total number of tracks in the recommendations database"
          />
        </a>
        <a href="#feedback" className="block transition-transform hover:scale-105">
          <KPICard
            title="Feedback"
            value={feedbackTotal}
            icon={MessageSquare}
            description="Total feedback responses received during the selected period"
          />
        </a>
        <a href="#feedback" className="block transition-transform hover:scale-105">
          <KPICard
            title="Error Reports"
            value={errorReports}
            subtitle="Open / Solved"
            icon={AlertTriangle}
            description="Error reports submitted by users - open vs resolved"
          />
        </a>
        <a href="#auth" className="block transition-transform hover:scale-105">
          <KPICard
            title="Access Requests"
            value={accessRequests}
            subtitle="Pending / Approved"
            icon={UserPlus}
            description="Access requests from users - pending vs approved"
          />
        </a>
        <KPICard
          title="Database Size"
          value={dbSize}
          icon={Database}
          description="Size of the metrics database file (metrics.db) on disk"
        />
      </div>
    </section>
  );
}

export function ActivitySection({ events, eventsLoading }: Pick<StatsDashboardViewProps, 'events' | 'eventsLoading'>) {
  const hasDailyData = !eventsLoading && events?.dailySummaries && events.dailySummaries.length > 0;
  return (
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
              <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
            ) : hasDailyData ? (
              <SimpleBarChart data={events!.dailySummaries} label="" />
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
            <LoadingCard isLoading={eventsLoading}>
              <ActionDonut data={events?.actionDistribution ?? []} />
            </LoadingCard>
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
          <LoadingCard isLoading={eventsLoading}>
            <ActionsBarChart data={events?.dailyActions ?? []} />
          </LoadingCard>
        </CardContent>
      </Card>
    </section>
  );
}

export function UsersSection({
  events,
  eventsLoading,
  registrationsLoading,
  registrationsData,
  dateRange,
}: Pick<StatsDashboardViewProps, 'events' | 'eventsLoading' | 'registrationsLoading' | 'registrationsData' | 'dateRange'>) {
  return (
    <section id="users" className="scroll-mt-28">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        User Growth &amp; Activity
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
            <LoadingCard isLoading={eventsLoading}>
              <UsersBarChart data={events?.dailyUsers ?? []} />
            </LoadingCard>
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
            <LoadingCard isLoading={registrationsLoading}>
              <UserGrowthChart data={registrationsData?.data ?? []} />
            </LoadingCard>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function RankingsSection({ events, eventsLoading, dateRange }: Pick<StatsDashboardViewProps, 'events' | 'eventsLoading' | 'dateRange'>) {
  return (
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
  );
}

export function RecsSection({
  recsData,
  recsLoading,
}: Pick<StatsDashboardViewProps, 'recsData' | 'recsLoading'>) {
  return (
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
  );
}
