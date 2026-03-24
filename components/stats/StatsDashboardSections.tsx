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

type OverviewSectionProps = Pick<
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
>;

type OverviewKPIValues = {
  activeUsers: number | string;
  totalEvents: number | string;
  totalSessions: number | string;
  totalRecs: number | string;
  feedbackTotal: number | string;
  errorReports: string;
  accessRequests: string;
  dbSize: string;
};

type SummaryWithTotal = { data: unknown[]; pagination: { total: number } } | undefined;

/** Returns loading placeholder or the numeric KPI value. */
function kpiValue(isLoading: boolean, value: number | undefined): number | string {
  return isLoading ? LOADING_PLACEHOLDER : (value ?? 0);
}

/** Returns "open / resolved" summary string or the loading placeholder. */
function countSummary(isLoading: boolean, open: SummaryWithTotal, resolved: SummaryWithTotal): string {
  if (isLoading) return LOADING_PLACEHOLDER;
  return `${open?.pagination?.total ?? 0} / ${resolved?.pagination?.total ?? 0}`;
}

/** Returns the database size string or the loading placeholder. */
function dbSizeValue(isLoading: boolean, overviewData: OverviewSectionProps['overviewData']): string {
  if (isLoading) return LOADING_PLACEHOLDER;
  if (!overviewData?.dbStats) return 'N/A';
  return `${overviewData.dbStats.sizeMB} MB`;
}

/** Pure computation of KPI display values; each loader helper has its own bounded complexity. */
function computeOverviewKPIs(props: OverviewSectionProps): OverviewKPIValues {
  return {
    activeUsers:    kpiValue(props.overviewLoading, props.kpis?.activeUsers),
    totalEvents:    kpiValue(props.overviewLoading, props.kpis?.totalEvents),
    totalSessions:  kpiValue(props.overviewLoading, props.kpis?.totalSessions),
    totalRecs:      kpiValue(props.recsLoading, props.recsData?.totalTracks),
    feedbackTotal:  kpiValue(props.feedbackSummaryLoading, props.feedbackSummary?.data?.totalResponses),
    errorReports:   countSummary(props.errorReportsSummaryLoading, props.errorReportsSummary, props.errorReportsResolvedSummary),
    accessRequests: countSummary(props.accessRequestsSummaryLoading, props.accessRequestsSummary, props.accessRequestsApprovedSummary),
    dbSize:         dbSizeValue(props.overviewLoading, props.overviewData),
  };
}

/** Helper that shows a loading placeholder or the actual content. */
export function LoadingWrapper({ children, isLoading }: { children: React.ReactNode; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }
  return <>{children}</>;
}

export function OverviewSection(props: OverviewSectionProps) {
  const { dateRange } = props;
  const kpiValues = computeOverviewKPIs(props);
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
            value={kpiValues.activeUsers}
            subtitle={`${dateRange.from} to ${dateRange.to}`}
            icon={Users}
            description="Number of unique users who have interacted with the app during the selected time period"
          />
        </a>
        <a href="#activity" className="block transition-transform hover:scale-105">
          <KPICard
            title="Total Events"
            value={kpiValues.totalEvents}
            icon={Activity}
            description="Sum of all tracked events including track additions, removals, reorders, and API calls"
          />
        </a>
        <a href="#traffic" className="block transition-transform hover:scale-105">
          <KPICard
            title="Total Sessions"
            value={kpiValues.totalSessions}
            icon={Globe}
            description="Number of unique user sessions started during the selected period"
          />
        </a>
        <a href="#recs" className="block transition-transform hover:scale-105">
          <KPICard
            title="Recommendations"
            value={kpiValues.totalRecs}
            icon={Sparkles}
            description="Total number of tracks in the recommendations database"
          />
        </a>
        <a href="#feedback" className="block transition-transform hover:scale-105">
          <KPICard
            title="Feedback"
            value={kpiValues.feedbackTotal}
            icon={MessageSquare}
            description="Total feedback responses received during the selected period"
          />
        </a>
        <a href="#feedback" className="block transition-transform hover:scale-105">
          <KPICard
            title="Error Reports"
            value={kpiValues.errorReports}
            subtitle="Open / Solved"
            icon={AlertTriangle}
            description="Error reports submitted by users - open vs resolved"
          />
        </a>
        <a href="#auth" className="block transition-transform hover:scale-105">
          <KPICard
            title="Access Requests"
            value={kpiValues.accessRequests}
            subtitle="Pending / Approved"
            icon={UserPlus}
            description="Access requests from users - pending vs approved"
          />
        </a>
        <KPICard
          title="Database Size"
          value={kpiValues.dbSize}
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
              <SimpleBarChart data={events?.dailySummaries ?? []} label="" />
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
            <LoadingWrapper isLoading={eventsLoading}>
              <ActionDonut data={events?.actionDistribution ?? []} />
            </LoadingWrapper>
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
          <LoadingWrapper isLoading={eventsLoading}>
            <ActionsBarChart data={events?.dailyActions ?? []} />
          </LoadingWrapper>
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
            <LoadingWrapper isLoading={eventsLoading}>
              <UsersBarChart data={events?.dailyUsers ?? []} />
            </LoadingWrapper>
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
            <LoadingWrapper isLoading={registrationsLoading}>
              <UserGrowthChart data={registrationsData?.data ?? []} />
            </LoadingWrapper>
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
