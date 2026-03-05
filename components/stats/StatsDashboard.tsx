'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StatsDashboardView } from './StatsDashboardView';
import { getDateRange } from './utils';
import type { TimeRange, OverviewKPIs, RecsStats, EventsData, RegisteredUsersPerDay } from './types';

export function StatsDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange]);
  const queryClient = useQueryClient();
  
  // Create stable query key parts from dateRange to avoid reference issues
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
  const { data: registrationsData, isLoading: registrationsLoading } = useQuery<{ data: RegisteredUsersPerDay[] }>({
    queryKey: ['stats', 'registrations', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/registrations?from=${dateRange.from}&to=${dateRange.to}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch registration stats');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Fetch feedback summary
  const { data: feedbackSummary, isLoading: feedbackSummaryLoading } = useQuery<{ data: { totalResponses: number } }>({
    queryKey: ['stats', 'feedback-summary', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/feedback?from=${dateRange.from}&to=${dateRange.to}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch feedback');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Fetch error reports summary
  const { data: errorReportsSummary, isLoading: errorReportsSummaryLoading } = useQuery<{ data: any[]; pagination: { total: number } }>({
    queryKey: ['stats', 'error-reports-summary', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/error-reports?from=${dateRange.from}&to=${dateRange.to}&limit=1&resolved=false`, { signal });
      if (!res.ok) throw new Error('Failed to fetch error reports');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Fetch resolved error reports count
  const { data: errorReportsResolvedSummary } = useQuery<{ data: any[]; pagination: { total: number } }>({
    queryKey: ['stats', 'error-reports-resolved-summary', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/error-reports?from=${dateRange.from}&to=${dateRange.to}&limit=1&resolved=true`, { signal });
      if (!res.ok) throw new Error('Failed to fetch error reports');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Fetch access requests summary
  const { data: accessRequestsSummary, isLoading: accessRequestsSummaryLoading } = useQuery<{ data: any[]; pagination: { total: number } }>({
    queryKey: ['stats', 'access-requests-summary', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/access-requests?from=${dateRange.from}&to=${dateRange.to}&limit=1&status=pending`, { signal });
      if (!res.ok) throw new Error('Failed to fetch access requests');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Fetch approved access requests count
  const { data: accessRequestsApprovedSummary } = useQuery<{ data: any[]; pagination: { total: number } }>({
    queryKey: ['stats', 'access-requests-approved-summary', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/access-requests?from=${dateRange.from}&to=${dateRange.to}&limit=1&status=approved`, { signal });
      if (!res.ok) throw new Error('Failed to fetch access requests');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Manual refresh function - only refresh core queries to avoid overwhelming the server
  // Child cards (auth, traffic, feedback, etc.) will refresh on scroll/mount
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stats', 'overview', dateRangeKey] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'events', dateRangeKey] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'recs'] });
  };

  // Filter spinner to only stats queries with current dateRangeKey
  const isRefreshing = overviewFetching || eventsFetching || recsFetching;

  const kpis = overviewData?.data;
  const events = eventsData?.data;

  return (
    <StatsDashboardView
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      dateRange={dateRange}
      kpis={kpis}
      overviewData={overviewData}
      overviewLoading={overviewLoading}
      events={events}
      eventsLoading={eventsLoading}
      recsData={recsData}
      recsLoading={recsLoading}
      registrationsLoading={registrationsLoading}
      registrationsData={registrationsData}
      feedbackSummaryLoading={feedbackSummaryLoading}
      feedbackSummary={feedbackSummary}
      errorReportsSummaryLoading={errorReportsSummaryLoading}
      errorReportsSummary={errorReportsSummary}
      errorReportsResolvedSummary={errorReportsResolvedSummary}
      accessRequestsSummaryLoading={accessRequestsSummaryLoading}
      accessRequestsSummary={accessRequestsSummary}
      accessRequestsApprovedSummary={accessRequestsApprovedSummary}
    />
  );
}
