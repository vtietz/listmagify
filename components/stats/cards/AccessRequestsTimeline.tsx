'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserPlus } from 'lucide-react';
import { formatDate } from '../utils';

interface AccessRequestTimelineData {
  date: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface AccessRequestsTimelineProps {
  dateRange: { from: string; to: string };
}

export function AccessRequestsTimeline({ dateRange }: AccessRequestsTimelineProps) {
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data, isLoading } = useQuery<{ data: AccessRequestTimelineData[] }>({
    queryKey: ['stats', 'access-requests-timeline', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(
        `/api/stats/access-requests-timeline?from=${dateRange.from}&to=${dateRange.to}`,
        { signal }
      );
      if (!res.ok) throw new Error('Failed to fetch access requests timeline');
      return res.json();
    },
    refetchOnMount: true,
  });

  const timeline = data?.data ?? [];
  const maxTotal = timeline.length > 0 ? Math.max(...timeline.map((d: AccessRequestTimelineData) => d.total), 1) : 1;
  const totalRequests = timeline.reduce((sum: number, d: AccessRequestTimelineData) => sum + d.total, 0);
  const totalApproved = timeline.reduce((sum: number, d: AccessRequestTimelineData) => sum + d.approved, 0);
  const totalPending = timeline.reduce((sum: number, d: AccessRequestTimelineData) => sum + d.pending, 0);
  const totalRejected = timeline.reduce((sum: number, d: AccessRequestTimelineData) => sum + d.rejected, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Access Requests
        </CardTitle>
        <CardDescription>
          {totalRequests} total request{totalRequests !== 1 ? 's' : ''} in this period
          {totalRequests > 0 && (
            <span className="block text-xs mt-1">
              <span className="text-green-600">{totalApproved} approved</span>
              {' • '}
              <span className="text-yellow-600">{totalPending} pending</span>
              {' • '}
              <span className="text-red-600">{totalRejected} rejected</span>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : timeline.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">
            No access requests in selected period
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-end gap-1 h-32">
              {timeline.map((d: AccessRequestTimelineData) => {
                const approvedHeight = (d.approved / maxTotal) * 100;
                const pendingHeight = (d.pending / maxTotal) * 100;
                const rejectedHeight = (d.rejected / maxTotal) * 100;
                const totalHeight = approvedHeight + pendingHeight + rejectedHeight;

                return (
                  <Tooltip key={d.date}>
                    <TooltipTrigger asChild>
                      <div
                        className="flex-1 flex flex-col-reverse gap-0.5 cursor-default"
                        style={{ height: `${totalHeight}%`, minHeight: d.total > 0 ? '3px' : '0px' }}
                      >
                        {d.approved > 0 && (
                          <div
                            className="bg-green-500/80 hover:bg-green-500 transition-colors rounded-t"
                            style={{ 
                              height: `${(d.approved / d.total) * 100}%`,
                              minHeight: '2px'
                            }}
                          />
                        )}
                        {d.pending > 0 && (
                          <div
                            className="bg-yellow-500/80 hover:bg-yellow-500 transition-colors"
                            style={{ 
                              height: `${(d.pending / d.total) * 100}%`,
                              minHeight: '2px'
                            }}
                          />
                        )}
                        {d.rejected > 0 && (
                          <div
                            className="bg-red-500/80 hover:bg-red-500 transition-colors"
                            style={{ 
                              height: `${(d.rejected / d.total) * 100}%`,
                              minHeight: '2px'
                            }}
                          />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-sm">
                        <div className="font-medium">{formatDate(d.date)}</div>
                        <div className="space-y-0.5 mt-1">
                          <div className="text-green-400">{d.approved} approved</div>
                          <div className="text-yellow-400">{d.pending} pending</div>
                          <div className="text-red-400">{d.rejected} rejected</div>
                          <div className="border-t border-gray-600 pt-0.5 mt-0.5 font-medium">
                            {d.total} total
                          </div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{timeline[0]?.date ? formatDate(timeline[0].date) : ''}</span>
              <span>{timeline.at(-1)?.date ? formatDate(timeline.at(-1)!.date) : ''}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
