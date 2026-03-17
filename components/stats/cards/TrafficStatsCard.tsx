/**
 * Traffic Stats Card
 * 
 * Displays aggregated traffic analytics including:
 * - Total visits
 * - Top pages
 * - Top countries
 * - Top referrers
 * - Top search queries
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Globe, TrendingUp, Search, ExternalLink, MapPin, FileText, Tag } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface TrafficStats {
  totalVisits: number;
  uniqueDays: number;
  topPages: Array<{ path: string; visits: number }>;
  topCountries: Array<{ country: string; visits: number }>;
  topReferrers: Array<{ domain: string; visits: number }>;
  topSearchQueries: Array<{ query: string; visits: number }>;
  topUtmSources: Array<{ source: string; visits: number }>;
  dailyVisits: Array<{ date: string; visits: number }>;
}

interface TrafficStatsCardProps {
  dateRange: { from: string; to: string };
}

type TrafficViewState = 'loading' | 'empty' | 'ready';

function resolveTrafficViewState(
  isLoading: boolean,
  stats: TrafficStats | undefined,
): TrafficViewState {
  if (isLoading) {
    return 'loading';
  }

  if (!stats) {
    return 'empty';
  }

  return 'ready';
}

function TrafficBaseCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Traffic Analytics
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TopMetricListCard({
  title,
  description,
  icon,
  rows,
  valueColorClass,
  barColorClass,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  rows: Array<{ label: string; visits: number; title?: string }>;
  valueColorClass?: string;
  barColorClass: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  const maxVisits = rows[0]?.visits || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate max-w-[200px]" title={row.title ?? row.label}>
                  {row.label}
                </span>
                <span className={valueColorClass ?? 'text-muted-foreground'}>{row.visits.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColorClass}`}
                  style={{ width: `${(row.visits / maxVisits) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyVisitsCard({ dailyVisits }: { dailyVisits: TrafficStats['dailyVisits'] }) {
  if (dailyVisits.length === 0) {
    return null;
  }

  const maxDailyVisits = Math.max(...dailyVisits.map((day) => day.visits), 1);
  const firstDate = dailyVisits[0]?.date ? formatDate(dailyVisits[0].date) : '';
  const lastDate = dailyVisits.at(-1)?.date ? formatDate(dailyVisits.at(-1)!.date) : '';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Page Views per Day
        </CardTitle>
        <CardDescription>Daily traffic trend</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-32">
          {dailyVisits.map((day) => (
            <Tooltip key={day.date}>
              <TooltipTrigger asChild>
                <div
                  className="flex-1 bg-primary/80 rounded-t hover:bg-primary transition-colors cursor-default"
                  style={{ height: `${(day.visits / maxDailyVisits) * 100}%`, minHeight: '2px' }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  <div className="font-medium">{formatDate(day.date)}</div>
                  <div>{day.visits.toLocaleString()} page views</div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{firstDate}</span>
          <span>{lastDate}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function TotalViewsCard({ stats }: { stats: TrafficStats }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Total Page Views
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.totalVisits.toLocaleString()}</div>
        {stats.uniqueDays > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Across {stats.uniqueDays} {stats.uniqueDays === 1 ? 'day' : 'days'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function hasTrafficBreakdown(stats: TrafficStats): boolean {
  return (
    stats.topPages.length > 0
    || stats.topCountries.length > 0
    || stats.topReferrers.length > 0
    || stats.topSearchQueries.length > 0
    || stats.topUtmSources.length > 0
    || stats.dailyVisits.length > 0
  );
}

export function TrafficStatsCard({ dateRange }: TrafficStatsCardProps) {
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data, isLoading } = useQuery<{ data: TrafficStats }>({
    queryKey: ['stats', 'traffic', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(
        `/api/stats/traffic?from=${dateRange.from}&to=${dateRange.to}`,
        { signal }
      );
      if (!res.ok) throw new Error('Failed to fetch traffic stats');
      return res.json();
    },
    refetchOnMount: true,
  });

  const stats = data?.data;
  const viewState = resolveTrafficViewState(isLoading, stats);

  if (viewState === 'loading') {
    return (
      <TrafficBaseCard>
          <div className="text-sm text-muted-foreground">Loading...</div>
      </TrafficBaseCard>
    );
  }

  if (viewState === 'empty' || !stats) {
    return (
      <TrafficBaseCard>
          <div className="text-sm text-muted-foreground">No data available</div>
      </TrafficBaseCard>
    );
  }

  const dailyVisits: TrafficStats['dailyVisits'] = stats.dailyVisits ?? [];
  const hasDailyVisits = dailyVisits.length > 0;
  const showPagesOrReferrers = stats.topPages.length > 0 || stats.topReferrers.length > 0;
  const showSearchOrUtm = stats.topSearchQueries.length > 0 || stats.topUtmSources.length > 0;
  const showEmptyState = !hasTrafficBreakdown(stats);

  return (
    <div className="space-y-4">
      {/* Summary and Daily Views */}
      <div className={hasDailyVisits ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'}>
        <TotalViewsCard stats={stats} />
        <DailyVisitsCard dailyVisits={dailyVisits} />
      </div>

      {/* Top Pages and Top Referrers */}
      {showPagesOrReferrers && (
        <div className="grid gap-4 md:grid-cols-2">
          <TopMetricListCard
            title="Top Pages"
            description="Most visited pages"
            icon={<FileText className="h-4 w-4" />}
            rows={stats.topPages.map((page: { path: string; visits: number }) => ({
              label: page.path,
              visits: page.visits,
              title: page.path,
            }))}
            valueColorClass="font-medium"
            barColorClass="bg-primary"
          />

          <TopMetricListCard
            title="Top Referrers"
            description="External traffic sources"
            icon={<ExternalLink className="h-4 w-4" />}
            rows={stats.topReferrers.map((referrer: { domain: string; visits: number }) => ({
              label: referrer.domain,
              visits: referrer.visits,
              title: referrer.domain,
            }))}
            barColorClass="bg-blue-500"
          />
        </div>
      )}

      {/* Top Search Queries and Top UTM Sources */}
      {showSearchOrUtm && (
        <div className="grid gap-4 md:grid-cols-2">
          <TopMetricListCard
            title="Top Search Queries"
            description="Popular search terms"
            icon={<Search className="h-4 w-4" />}
            rows={stats.topSearchQueries.map((query: { query: string; visits: number }) => ({
              label: query.query,
              visits: query.visits,
              title: query.query,
            }))}
            barColorClass="bg-purple-500"
          />

          <TopMetricListCard
            title="Top UTM Sources"
            description="Campaign traffic sources"
            icon={<Tag className="h-4 w-4" />}
            rows={stats.topUtmSources.map((utm: { source: string; visits: number }) => ({
              label: utm.source,
              visits: utm.visits,
              title: utm.source,
            }))}
            barColorClass="bg-orange-500"
          />
        </div>
      )}

      {/* Top Countries */}
      <TopMetricListCard
        title="Top Countries"
        description="Visits by country"
        icon={<MapPin className="h-4 w-4" />}
        rows={stats.topCountries.map((country: { country: string; visits: number }) => ({
          label: country.country,
          visits: country.visits,
          title: country.country,
        }))}
        valueColorClass="text-muted-foreground"
        barColorClass="bg-green-500"
      />

      {/* Empty State */}
      {showEmptyState && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm">No traffic data available for this period</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
