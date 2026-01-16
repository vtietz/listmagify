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
  const { data, isLoading } = useQuery<{ data: TrafficStats }>({
    queryKey: ['stats', 'traffic', dateRange],
    queryFn: async () => {
      const res = await fetch(
        `/api/stats/traffic?from=${dateRange.from}&to=${dateRange.to}`
      );
      if (!res.ok) throw new Error('Failed to fetch traffic stats');
      return res.json();
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const stats = data?.data;

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

  return (
    <div className="space-y-4">
      {/* Summary Card */}
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

      {/* Top Pages */}
      {stats.topPages.length > 0 && (
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

      {/* Top Referrers */}
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

      {/* Top Search Queries */}
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

      {/* Top UTM Sources */}
      {stats.topUtmSources.length > 0 && (
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

      {/* Empty State */}
      {stats.topPages.length === 0 && 
       stats.topCountries.length === 0 && 
       stats.topReferrers.length === 0 && 
       stats.topSearchQueries.length === 0 &&
       stats.topUtmSources.length === 0 && (
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
