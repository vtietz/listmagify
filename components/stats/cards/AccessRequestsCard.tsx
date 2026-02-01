'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Mail, AlertTriangle, ExternalLink, Activity, ChevronLeft, ChevronRight, Search, Clock } from 'lucide-react';
import { AccessRequestDetailsDialog } from '../dialogs/AccessRequestDetailsDialog';
import { cn } from '@/lib/utils';
import type { AccessRequest, AccessRequestsResponse } from '../types';

interface AccessRequestsCardProps {
  dateRange: { from: string; to: string };
}

export function AccessRequestsCard({ dateRange }: AccessRequestsCardProps) {
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'activity'>('date');
  
  const pageSize = 10;
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data, isLoading, refetch } = useQuery<AccessRequestsResponse>({
    queryKey: ['stats', 'access-requests', dateRangeKey, page, filter, searchQuery, sortBy],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const offset = page * pageSize;
      const params = new URLSearchParams({
        from: dateRange.from,
        to: dateRange.to,
        limit: String(pageSize),
        offset: String(offset),
        sortBy,
        ...(filter !== 'all' && { status: filter }),
        ...(searchQuery && { search: searchQuery }),
      });
      const res = await fetch(`/api/stats/access-requests?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch access requests');
      return res.json();
    },
    refetchOnMount: true,
  });

  // Fetch user activity (all-time) to show activity indicators
  const { data: userActivityData } = useQuery<{ data: Array<{ userId: string; eventCount: number }> }>({
    queryKey: ['stats', 'users-activity-all'],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(
        `/api/stats/users?from=1970-01-01&to=2099-12-31&limit=1000&sortBy=eventCount&sortDirection=desc`,
        { signal }
      );
      if (!res.ok) throw new Error('Failed to fetch user activity');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const requests = data?.data ?? [];
  const userActivity = userActivityData?.data ?? [];
  
  // Create a map of userId -> eventCount for quick lookup
  const activityMap = new Map<string, number>(userActivity.map((u: { userId: string; eventCount: number }) => [u.userId, u.eventCount]));
  
  // Calculate activity percentiles for relative comparison
  const allEventCounts = userActivity.map((u: { userId: string; eventCount: number }) => u.eventCount).filter((c: number) => c > 0).sort((a: number, b: number) => a - b);
  const p33 = allEventCounts[Math.floor(allEventCounts.length * 0.33)] || 0;
  const p66 = allEventCounts[Math.floor(allEventCounts.length * 0.66)] || 0;
  
  // Helper to get activity level (relative to other users)
  const getActivityLevel = (userId: string | null) => {
    if (!userId) return null;
    const count = activityMap.get(userId) ?? 0;
    if (count === 0) return { label: 'No activity', color: 'text-gray-400', icon: '○', percentile: 0 };
    if (count < p33) return { label: 'Low activity (bottom 33%)', color: 'text-yellow-600 dark:text-yellow-500', icon: '◔', percentile: 33 };
    if (count < p66) return { label: 'Medium activity (middle 33%)', color: 'text-blue-600 dark:text-blue-400', icon: '◑', percentile: 66 };
    return { label: 'High activity (top 33%)', color: 'text-green-600 dark:text-green-400', icon: '●', percentile: 100 };
  };
  const pendingCount = requests.filter((r: AccessRequest) => r.status === 'pending').length;

  const handleUpdateStatus = async (id: number, status: string, notes?: string) => {
    try {
      const res = await fetch('/api/stats/access-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, notes }),
      });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to update access request:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Access Requests
                <a
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Open Spotify Developer Dashboard"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {pendingCount > 0 && (
                  <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    {pendingCount} pending
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                User access requests from the landing page
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9 h-8 w-40"
                />
              </div>
              <div className="flex items-center gap-1 border rounded-md">
                <Button
                  size="sm"
                  variant={filter === 'all' ? 'default' : 'ghost'}
                  onClick={() => { setFilter('all'); setPage(0); }}
                  className="h-8"
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'pending' ? 'default' : 'ghost'}
                  onClick={() => { setFilter('pending'); setPage(0); }}
                  className="h-8"
                >
                  Pending
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'approved' ? 'default' : 'ghost'}
                  onClick={() => { setFilter('approved'); setPage(0); }}
                  className="h-8"
                >
                  Approved
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'rejected' ? 'default' : 'ghost'}
                  onClick={() => { setFilter('rejected'); setPage(0); }}
                  className="h-8"
                >
                  Rejected
                </Button>
              </div>
              <div className="flex items-center gap-1 border rounded-md">
                <Button
                  size="sm"
                  variant={sortBy === 'date' ? 'default' : 'ghost'}
                  onClick={() => { setSortBy('date'); setPage(0); }}
                  className="h-8 gap-1"
                  title="Sort by request date"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Date
                </Button>
                <Button
                  size="sm"
                  variant={sortBy === 'activity' ? 'default' : 'ghost'}
                  onClick={() => { setSortBy('activity'); setPage(0); }}
                  className="h-8 gap-1"
                  title="Sort by user activity"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Activity
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No access requests in this period</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((request: AccessRequest) => {
                const hasRedFlags = request.red_flags && request.red_flags !== 'null';
                return (
                  <div
                    key={request.id}
                    className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedRequest(request);
                      setShowDetailsDialog(true);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("px-2 py-0.5 rounded text-xs font-medium", getStatusColor(request.status))}>
                            {request.status}
                          </span>
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {hasRedFlags && (
                            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                              <AlertTriangle className="h-3 w-3" />
                              Review
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{request.name}</p>
                          {(request.status === 'approved' || request.status === 'removed') && (() => {
                            // Try to get activity by user_id first, fallback to spotify_username
                            const lookupId = (request as any).user_id || request.spotify_username;
                            const activity = getActivityLevel(lookupId);
                            if (activity) {
                              const eventCount: number = activityMap.get(lookupId!) ?? 0;
                              return (
                                <span 
                                  className={cn("text-xs flex items-center gap-1", activity.color)}
                                  title={`${activity.label} (${eventCount} events)`}
                                >
                                  <Activity className="h-3 w-3" />
                                  {eventCount > 0 && <span className="font-medium">{eventCount}</span>}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{new Date(request.ts).toLocaleDateString()}</span>
                          <span className="truncate">{request.email}</span>
                          {request.spotify_username && <span className="truncate">@{request.spotify_username}</span>}
                        </div>
                        {request.motivation && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{request.motivation}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {data && data.total > pageSize && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * pageSize >= data.total}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showDetailsDialog && selectedRequest && (
        <AccessRequestDetailsDialog
          request={selectedRequest}
          open={showDetailsDialog}
          onOpenChange={setShowDetailsDialog}
          onUpdateStatus={handleUpdateStatus}
          activityLevel={getActivityLevel((selectedRequest as any).user_id || selectedRequest.spotify_username)}
          eventCount={(activityMap.get((selectedRequest as any).user_id || selectedRequest.spotify_username!) ?? 0) as number}
        />
      )}
    </>
  );
}
