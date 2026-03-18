import type { LucideIcon } from 'lucide-react';
import { Users, Activity, Globe, Sparkles, Database } from 'lucide-react';
import type { OverviewKPIs, RecsStats } from '@/components/stats/types';

type OverviewResponse = {
  data: OverviewKPIs;
  dbStats?: { sizeBytes: number; sizeMB: number };
};

export type OverviewCard = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  description: string;
};

function getDatabaseSizeLabel(overviewLoading: boolean, overviewData?: OverviewResponse): string {
  if (overviewLoading) {
    return '...';
  }

  if (!overviewData?.dbStats) {
    return 'N/A';
  }

  return `${overviewData.dbStats.sizeMB} MB`;
}

function getOverviewMetricValue(overviewLoading: boolean, value: number | undefined): string | number {
  if (overviewLoading) {
    return '...';
  }

  return value ?? 0;
}

function getRecommendationsValue(recsLoading: boolean, recsData?: RecsStats): string | number {
  if (recsLoading) {
    return '...';
  }

  return recsData?.totalTracks ?? 0;
}

export function buildOverviewCards({
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
}): OverviewCard[] {
  const activeUsers = getOverviewMetricValue(overviewLoading, kpis?.activeUsers);
  const totalEvents = getOverviewMetricValue(overviewLoading, kpis?.totalEvents);
  const totalSessions = getOverviewMetricValue(overviewLoading, kpis?.totalSessions);
  const recommendations = getRecommendationsValue(recsLoading, recsData);
  const databaseSize = getDatabaseSizeLabel(overviewLoading, overviewData);

  return [
    {
      title: 'Active Users',
      value: activeUsers,
      subtitle: `${dateRange.from} to ${dateRange.to}`,
      icon: Users,
      description:
        'Number of unique users who have interacted with the app during the selected time period',
    },
    {
      title: 'Total Events',
      value: totalEvents,
      icon: Activity,
      description:
        'Sum of all tracked events including track additions, removals, reorders, and API calls',
    },
    {
      title: 'Total Sessions',
      value: totalSessions,
      icon: Globe,
      description: 'Number of unique user sessions started during the selected period',
    },
    {
      title: 'Recommendations',
      value: recommendations,
      icon: Sparkles,
      description: 'Total number of tracks in the recommendations database',
    },
    {
      title: 'Database Size',
      value: databaseSize,
      icon: Database,
      description: 'Size of the metrics database file (metrics.db) on disk',
    },
  ];
}
