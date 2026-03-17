'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, AlertCircle } from 'lucide-react';
import { formatDate } from '../utils';
import type { AuthStats } from '../types';

interface AuthenticationStatsCardProps {
  dateRange: { from: string; to: string };
}

type DailyAuthStat = {
  date: string;
  successes: number;
  failures: number;
  byokSuccesses: number;
};

function DailyAuthBar({ day, maxValue }: { day: DailyAuthStat; maxValue: number }) {
  const total = day.successes + day.failures;
  const regularSuccesses = day.successes - day.byokSuccesses;
  const segments = [
    {
      key: 'failures',
      count: day.failures,
      className: 'bg-red-500/80 rounded-t hover:bg-red-500 transition-colors',
    },
    {
      key: 'byok',
      count: day.byokSuccesses,
      className: 'bg-purple-500/80 rounded-t hover:bg-purple-500 transition-colors',
    },
    {
      key: 'regular',
      count: regularSuccesses,
      className: 'bg-green-500/80 rounded-t hover:bg-green-500 transition-colors',
    },
  ]
    .map((segment) => ({
      ...segment,
      height: total > 0 ? (segment.count / maxValue) * 100 : 0,
    }))
    .filter((segment) => segment.count > 0 && segment.height > 0);

  const tooltipRows = [
    { key: 'regular', count: regularSuccesses, className: 'text-green-500', label: 'regular' },
    { key: 'byok', count: day.byokSuccesses, className: 'text-purple-500', label: 'BYOK' },
    {
      key: 'failures',
      count: day.failures,
      className: 'text-red-500',
      label: `failure${day.failures !== 1 ? 's' : ''}`,
      icon: '✗',
    },
  ].filter((row) => row.count > 0);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex-1 flex flex-col justify-end gap-0.5">
          {segments.map((segment) => (
            <div
              key={`${day.date}-${segment.key}`}
              className={segment.className}
              style={{ height: `${segment.height}%`, minHeight: '2px' }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-sm">
          <div className="font-medium">{formatDate(day.date)}</div>
          {tooltipRows.map((row) => (
            <div key={`${day.date}-${row.key}`} className={row.className}>
              {row.icon ?? '✓'} {row.count} {row.label}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function AuthenticationStatsCard({ dateRange }: AuthenticationStatsCardProps) {
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data, isLoading } = useQuery<{ data: AuthStats }>({
    queryKey: ['stats', 'auth', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/auth?from=${dateRange.from}&to=${dateRange.to}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch auth stats');
      return res.json();
    },
    refetchOnMount: true,
  });

  const stats = data?.data;
  const maxValue = stats?.dailyStats.length
    ? Math.max(...stats.dailyStats.map((d: { successes: number; failures: number }) => d.successes + d.failures), 1)
    : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Authentication Activity
        </CardTitle>
        <CardDescription>
          Login successes and failures for the selected period
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading...
          </div>
        ) : !stats ? (
          <div className="text-center py-8 text-muted-foreground">
            No authentication data available
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-500/10 rounded-lg">
                <div className="text-2xl font-bold text-green-500">
                  {stats.loginSuccesses}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Successful Logins</div>
                {(stats.byokLogins > 0 || stats.regularLogins > 0) && (
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      <span>{stats.byokLogins} BYOK</span>
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span>{stats.regularLogins} Regular</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="text-center p-4 bg-red-500/10 rounded-lg">
                <div className="text-2xl font-bold text-red-500">
                  {stats.loginFailures}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Failed Attempts</div>
              </div>
              <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                <div className="text-2xl font-bold text-blue-500">
                  {(stats.successRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">Success Rate</div>
              </div>
            </div>

            {stats.dailyStats.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-3">Daily Authentication Activity</div>
                <div className="flex items-end gap-1 h-32">
                  {stats.dailyStats.map((d: { date: string; successes: number; failures: number; byokSuccesses: number }) => (
                    <DailyAuthBar key={d.date} day={d} maxValue={maxValue} />
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded" />
                    <span className="text-muted-foreground">Regular</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-purple-500 rounded" />
                    <span className="text-muted-foreground">BYOK</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded" />
                    <span className="text-muted-foreground">Failures</span>
                  </div>
                </div>
              </div>
            )}

            {stats.recentFailures.length > 0 && (
              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-3">Recent Failed Attempts</div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {stats.recentFailures.map((failure: { ts: string; errorCode: string | null }, idx: number) => (
                    <div 
                      key={idx} 
                      className="flex items-start gap-3 p-2 bg-red-500/5 rounded text-sm"
                    >
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">
                          {new Date(failure.ts).toLocaleString()}
                        </div>
                        {failure.errorCode && (
                          <div className="font-mono text-xs truncate mt-0.5" title={failure.errorCode}>
                            {failure.errorCode}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.loginFailures === 0 && stats.loginSuccesses === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No authentication events in this period
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
