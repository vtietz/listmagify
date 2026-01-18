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
  const dailyVisits: TrafficStats['dailyVisits'] = stats?.dailyVisits ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Traffic Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Traffic Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No data available</div>
        </CardContent>
      </Card>
    );
  }

  const hasDailyVisits = dailyVisits.length > 0;
  const hasTopPages = stats.topPages.length > 0;
  const hasTopUtmSources = stats.topUtmSources.length > 0;
  const maxDailyVisits = Math.max(...dailyVisits.map((day) => day.visits), 1);

  return (
    <div className="space-y-4">
      {/* Summary and Daily Views */}
      <div className={hasDailyVisits ? 'grid gap-4 md:grid-cols-2' : 'space-y-4'}>
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

        {hasDailyVisits && (
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
                <span>{dailyVisits[0]?.date ? formatDate(dailyVisits[0].date) : ''}</span>
                <span>{dailyVisits.at(-1)?.date ? formatDate(dailyVisits.at(-1)!.date) : ''}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Pages and Top Referrers */}
      {(hasTopPages || stats.topReferrers.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {hasTopPages && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Top Pages
                </CardTitle>
                <CardDescription>Most visited pages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.topPages.map((page: { path: string; visits: number }, idx: number) => {
                    const maxVisits = stats.topPages[0]?.visits || 1;
                    const percentage = (page.visits / maxVisits) * 100;
                    
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-mono text-xs truncate max-w-[200px]" title={page.path}>
                            {page.path}
                          </span>
                          <span className="font-medium">{page.visits.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {stats.topReferrers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Top Referrers
                </CardTitle>
                <CardDescription>External traffic sources</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.topReferrers.map((referrer: { domain: string; visits: number }, idx: number) => {
                    const maxVisits = stats.topReferrers[0]?.visits || 1;
                    const percentage = (referrer.visits / maxVisits) * 100;
                    
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate max-w-[200px]" title={referrer.domain}>
                            {referrer.domain}
                          </span>
                          <span className="text-muted-foreground">{referrer.visits.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Top Search Queries and Top UTM Sources */}
      {(stats.topSearchQueries.length > 0 || hasTopUtmSources) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats.topSearchQueries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Top Search Queries
                </CardTitle>
                <CardDescription>Popular search terms</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.topSearchQueries.map((query: { query: string; visits: number }, idx: number) => {
                    const maxVisits = stats.topSearchQueries[0]?.visits || 1;
                    const percentage = (query.visits / maxVisits) * 100;
                    
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate max-w-[200px]" title={query.query}>
                            {query.query}
                          </span>
                          <span className="text-muted-foreground">{query.visits.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {hasTopUtmSources && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Top UTM Sources
                </CardTitle>
                <CardDescription>Campaign traffic sources</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.topUtmSources.map((utm: { source: string; visits: number }, idx: number) => {
                    const maxVisits = stats.topUtmSources[0]?.visits || 1;
                    const percentage = (utm.visits / maxVisits) * 100;
                    
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate max-w-[200px]" title={utm.source}>
                            {utm.source}
                          </span>
                          <span className="text-muted-foreground">{utm.visits.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-500 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Top Countries */}
      {stats.topCountries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Top Countries
            </CardTitle>
            <CardDescription>Visits by country</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topCountries.map((country: { country: string; visits: number }, idx: number) => {
                const maxVisits = stats.topCountries[0]?.visits || 1;
                const percentage = (country.visits / maxVisits) * 100;
                
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{country.country}</span>
                      <span className="text-muted-foreground">{country.visits.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {stats.topPages.length === 0 && 
       stats.topCountries.length === 0 && 
       stats.topReferrers.length === 0 && 
       stats.topSearchQueries.length === 0 &&
      stats.topUtmSources.length === 0 &&
      dailyVisits.length === 0 && (
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
