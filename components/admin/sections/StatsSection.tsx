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
import type { OverviewKPIs, RecsStats, EventsData, TimeRange, RegisteredUsersPerDay, StatsProviderFilter } from '@/components/stats/types';
import { buildOverviewCards } from './statsSelectors';

type OverviewResponse = {
  data: OverviewKPIs;
  dbStats?: { sizeBytes: number; sizeMB: number };
};

type RegistrationsResponse = {
  data: RegisteredUsersPerDay[];
};

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All Time' },
];

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
  const [providerFilter, setProviderFilter] = useState<StatsProviderFilter>('all');
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange]);
  const queryClient = useQueryClient();
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;
  const providerParam = providerFilter === 'all' ? '' : `&provider=${providerFilter}`;

  // Fetch overview KPIs
  const { data: overviewData, isLoading: overviewLoading, isFetching: overviewFetching } = useQuery<OverviewResponse>({
    queryKey: ['stats', 'overview', dateRangeKey, providerFilter],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/overview?from=${dateRange.from}&to=${dateRange.to}${providerParam}`, { signal });
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
  const { data: registrationsData, isLoading: registrationsLoading } = useQuery<RegistrationsResponse>({
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

  const kpis = overviewData?.data;
  const events = eventsData?.data;

  return (
    <section id="stats" className="scroll-mt-28 space-y-6">
      <StatsHeader
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        providerFilter={providerFilter}
        onProviderFilterChange={setProviderFilter}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      <OverviewSection
        overviewLoading={overviewLoading}
        recsLoading={recsLoading}
        kpis={kpis}
        overviewData={overviewData}
        recsData={recsData}
        dateRange={dateRange}
      />

      <ActivitySection eventsLoading={eventsLoading} events={events} />

      <UsersSection
        eventsLoading={eventsLoading}
        events={events}
        registrationsLoading={registrationsLoading}
        registrationsData={registrationsData}
        dateRange={dateRange}
      />

      <TrafficSection dateRange={dateRange} />

      <RankingsSection eventsLoading={eventsLoading} events={events} dateRange={dateRange} providerFilter={providerFilter} />

      <AuthenticationSection dateRange={dateRange} providerFilter={providerFilter} />

      <RecommendationsSection recsData={recsData} recsLoading={recsLoading} />
    </section>
  );
}

function StatsHeader({
  timeRange,
  onTimeRangeChange,
  providerFilter,
  onProviderFilterChange,
  isRefreshing,
  onRefresh,
}: {
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  providerFilter: StatsProviderFilter;
  onProviderFilterChange: (value: StatsProviderFilter) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <BarChart3 className="h-6 w-6" />
        Statistics
      </h2>

      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Time Range:</span>

        <div className="md:hidden">
          <Select value={timeRange} onValueChange={(value: string) => onTimeRangeChange(value as TimeRange)}>
            <SelectTrigger className="h-8 w-32" suppressHydrationWarning>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((range) => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden md:flex gap-1">
          {TIME_RANGES.map((range) => (
            <Button
              key={range.value}
              variant={timeRange === range.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onTimeRangeChange(range.value)}
            >
              {range.label}
            </Button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>

        <div className="flex gap-1">
          {(['all', 'spotify', 'tidal'] as const).map((provider) => (
            <Button
              key={provider}
              variant={providerFilter === provider ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onProviderFilterChange(provider)}
            >
              {provider === 'all' ? 'All Providers' : provider === 'spotify' ? 'Spotify' : 'TIDAL'}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({
  overviewLoading,
  recsLoading,
  kpis,
  overviewData,
  recsData,
  dateRange,
}: {
  overviewLoading: boolean;
  recsLoading: boolean;
  kpis: OverviewKPIs | undefined;
  overviewData: OverviewResponse | undefined;
  recsData: RecsStats | undefined;
  dateRange: { from: string; to: string };
}) {
  const cards = buildOverviewCards({
    overviewLoading,
    recsLoading,
    kpis,
    overviewData,
    recsData,
    dateRange,
  });

  return (
    <div>
      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5" />
        Overview
      </h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <KPICard
            key={card.title}
            title={card.title}
            value={card.value}
            {...(card.subtitle ? { subtitle: card.subtitle } : {})}
            icon={card.icon}
            description={card.description}
          />
        ))}
      </div>
    </div>
  );
}

function ActivitySection({
  eventsLoading,
  events,
}: {
  eventsLoading: boolean;
  events: EventsData | undefined;
}) {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5" />
        Activity
      </h3>

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
            <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
          ) : (
            <ActionsBarChart data={events?.dailyActions ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsersSection({
  eventsLoading,
  events,
  registrationsLoading,
  registrationsData,
  dateRange,
}: {
  eventsLoading: boolean;
  events: EventsData | undefined;
  registrationsLoading: boolean;
  registrationsData: RegistrationsResponse | undefined;
  dateRange: { from: string; to: string };
}) {
  return (
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
              <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
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
              <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
            ) : (
              <UserGrowthChart data={registrationsData?.data ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TrafficSection({ dateRange }: { dateRange: { from: string; to: string } }) {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
        <Globe className="h-5 w-5" />
        Traffic Analytics
      </h3>
      <TrafficStatsCard dateRange={dateRange} />
    </div>
  );
}

function RankingsSection({
  eventsLoading,
  events,
  dateRange,
  providerFilter,
}: {
  eventsLoading: boolean;
  events: EventsData | undefined;
  dateRange: { from: string; to: string };
  providerFilter: StatsProviderFilter;
}) {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
        <Trophy className="h-5 w-5" />
        Rankings
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <TopUsersCard dateRange={dateRange} provider={providerFilter} />

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
  );
}

function AuthenticationSection({
  dateRange,
  providerFilter,
}: {
  dateRange: { from: string; to: string };
  providerFilter: StatsProviderFilter;
}) {
  return (
    <div>
      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5" />
        Authentication
      </h3>
      <AuthenticationStatsCard dateRange={dateRange} provider={providerFilter} />
    </div>
  );
}

function RecommendationsSection({
  recsData,
  recsLoading,
}: {
  recsData: RecsStats | undefined;
  recsLoading: boolean;
}) {
  return (
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
  );
}
