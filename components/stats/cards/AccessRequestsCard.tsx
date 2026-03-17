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

interface ActivityLevel {
  label: string;
  color: string;
  icon: string;
  percentile: number;
}

function buildActivityStats(userActivity: Array<{ userId: string; eventCount: number }>) {
  const activityMap = new Map<string, number>(
    userActivity.map((u: { userId: string; eventCount: number }) => [u.userId, u.eventCount]),
  );
  const allEventCounts = userActivity
    .map((u: { userId: string; eventCount: number }) => u.eventCount)
    .filter((count: number) => count > 0)
    .sort((a: number, b: number) => a - b);

  return {
    activityMap,
    p33: allEventCounts[Math.floor(allEventCounts.length * 0.33)] || 0,
    p66: allEventCounts[Math.floor(allEventCounts.length * 0.66)] || 0,
  };
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

function getLookupId(request: AccessRequest): string | null {
  return (request as any).user_id || request.spotify_username || null;
}

function getActivityLevel(
  userId: string | null,
  activityMap: Map<string, number>,
  p33: number,
  p66: number,
): ActivityLevel | null {
  if (!userId) {
    return null;
  }

  const count = activityMap.get(userId) ?? 0;
  if (count === 0) {
    return { label: 'No activity', color: 'text-gray-400', icon: '○', percentile: 0 };
  }

  if (count < p33) {
    return {
      label: 'Low activity (bottom 33%)',
      color: 'text-yellow-600 dark:text-yellow-500',
      icon: '◔',
      percentile: 33,
    };
  }

  if (count < p66) {
    return {
      label: 'Medium activity (middle 33%)',
      color: 'text-blue-600 dark:text-blue-400',
      icon: '◑',
      percentile: 66,
    };
  }

  return {
    label: 'High activity (top 33%)',
    color: 'text-green-600 dark:text-green-400',
    icon: '●',
    percentile: 100,
  };
}

function AccessRequestActivityBadge({
  request,
  activityMap,
  p33,
  p66,
}: {
  request: AccessRequest;
  activityMap: Map<string, number>;
  p33: number;
  p66: number;
}) {
  if (request.status !== 'approved' && request.status !== 'removed') {
    return null;
  }

  const lookupId = getLookupId(request);
  const activity = getActivityLevel(lookupId, activityMap, p33, p66);
  if (!activity || !lookupId) {
    return null;
  }

  const eventCount: number = activityMap.get(lookupId) ?? 0;
  return (
    <span
      className={cn('text-xs flex items-center gap-1', activity.color)}
      title={`${activity.label} (${eventCount} events)`}
    >
      <Activity className="h-3 w-3" />
      {eventCount > 0 && <span className="font-medium">{eventCount}</span>}
    </span>
  );
}

function AccessRequestItem({
  request,
  activityMap,
  p33,
  p66,
  onSelect,
}: {
  request: AccessRequest;
  activityMap: Map<string, number>;
  p33: number;
  p66: number;
  onSelect: (request: AccessRequest) => void;
}) {
  const hasRedFlags = request.red_flags && request.red_flags !== 'null';

  return (
    <div
      className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onSelect(request)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getStatusColor(request.status))}>
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
            <AccessRequestActivityBadge request={request} activityMap={activityMap} p33={p33} p66={p66} />
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
}

function AccessRequestsFilters({
  searchQuery,
  setSearchQuery,
  setPage,
  filter,
  setFilter,
  sortBy,
  setSortBy,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  setPage: (page: number) => void;
  filter: 'all' | 'pending' | 'approved' | 'rejected';
  setFilter: (filter: 'all' | 'pending' | 'approved' | 'rejected') => void;
  sortBy: 'date' | 'activity';
  setSortBy: (sort: 'date' | 'activity') => void;
}) {
  const resetToFirstPage = () => setPage(0);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <div className="relative flex-1 sm:flex-initial">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            resetToFirstPage();
          }}
          className="pl-9 h-8 w-full sm:w-40"
        />
      </div>
      <div className="flex items-center gap-1 border rounded-md overflow-x-auto">
        <Button
          size="sm"
          variant={filter === 'all' ? 'default' : 'ghost'}
          onClick={() => { setFilter('all'); resetToFirstPage(); }}
          className="h-8 whitespace-nowrap"
        >
          All
        </Button>
        <Button
          size="sm"
          variant={filter === 'pending' ? 'default' : 'ghost'}
          onClick={() => { setFilter('pending'); resetToFirstPage(); }}
          className="h-8 whitespace-nowrap"
        >
          Pending
        </Button>
        <Button
          size="sm"
          variant={filter === 'approved' ? 'default' : 'ghost'}
          onClick={() => { setFilter('approved'); resetToFirstPage(); }}
          className="h-8 whitespace-nowrap"
        >
          Approved
        </Button>
        <Button
          size="sm"
          variant={filter === 'rejected' ? 'default' : 'ghost'}
          onClick={() => { setFilter('rejected'); resetToFirstPage(); }}
          className="h-8 whitespace-nowrap"
        >
          Rejected
        </Button>
      </div>
      <div className="flex items-center gap-1 border rounded-md">
        <Button
          size="sm"
          variant={sortBy === 'date' ? 'default' : 'ghost'}
          onClick={() => { setSortBy('date'); resetToFirstPage(); }}
          className="h-8 gap-1 flex-1 sm:flex-initial whitespace-nowrap"
          title="Sort by request date"
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Date</span>
        </Button>
        <Button
          size="sm"
          variant={sortBy === 'activity' ? 'default' : 'ghost'}
          onClick={() => { setSortBy('activity'); resetToFirstPage(); }}
          className="h-8 gap-1 flex-1 sm:flex-initial whitespace-nowrap"
          title="Sort by user activity"
        >
          <Activity className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Activity</span>
        </Button>
      </div>
    </div>
  );
}

function AccessRequestsPagination({
  page,
  pageSize,
  total,
  setPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  if (total <= pageSize) {
    return null;
  }

  return (
    <div className="flex items-center justify-between border-t pt-4 mt-4">
      <p className="text-sm text-muted-foreground">
        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((prev) => Math.max(0, prev - 1))}
          disabled={page === 0}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((prev) => prev + 1)}
          disabled={(page + 1) * pageSize >= total}
          className="gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function AccessRequestsContent({
  isLoading,
  requests,
  activityMap,
  p33,
  p66,
  onSelect,
}: {
  isLoading: boolean;
  requests: AccessRequest[];
  activityMap: Map<string, number>;
  p33: number;
  p66: number;
  onSelect: (request: AccessRequest) => void;
}) {
  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }
  if (requests.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No access requests</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {requests.map((request: AccessRequest) => (
        <AccessRequestItem
          key={request.id}
          request={request}
          activityMap={activityMap}
          p33={p33}
          p66={p66}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function AccessRequestsHeaderTitle({ pendingCount }: { pendingCount: number }) {
  return (
    <CardTitle className="flex items-center gap-2 flex-wrap">
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
      {pendingCount > 0 ? (
        <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
          {pendingCount} pending
        </span>
      ) : null}
    </CardTitle>
  );
}

function getSelectedActivityStats(
  selectedRequest: AccessRequest | null,
  activityMap: Map<string, number>,
  p33: number,
  p66: number,
) {
  const lookupId = selectedRequest ? getLookupId(selectedRequest) : null;
  const activityLevel = getActivityLevel(lookupId, activityMap, p33, p66);
  const eventCount = lookupId ? (activityMap.get(lookupId) ?? 0) : 0;
  return { activityLevel, eventCount };
}

function AccessRequestsDialog({
  show,
  request,
  setShow,
  onUpdateStatus,
  activityLevel,
  eventCount,
}: {
  show: boolean;
  request: AccessRequest | null;
  setShow: (open: boolean) => void;
  onUpdateStatus: (id: number, status: string, notes?: string) => Promise<void>;
  activityLevel: ActivityLevel | null;
  eventCount: number;
}) {
  if (!show || !request) {
    return null;
  }
  return (
    <AccessRequestDetailsDialog
      request={request}
      open={show}
      onOpenChange={setShow}
      onUpdateStatus={onUpdateStatus}
      activityLevel={activityLevel}
      eventCount={eventCount}
    />
  );
}

export function AccessRequestsCard() {
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'activity'>('date');
  const pageSize = 10;

  const { data, isLoading, refetch } = useQuery<AccessRequestsResponse>({
    queryKey: ['stats', 'access-requests', page, filter, searchQuery, sortBy],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const offset = page * pageSize;
      const params = new URLSearchParams({
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
  const { activityMap, p33, p66 } = buildActivityStats(userActivity);
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

  const selectedActivityStats = getSelectedActivityStats(selectedRequest, activityMap, p33, p66);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div>
              <AccessRequestsHeaderTitle pendingCount={pendingCount} />
              <CardDescription>User access requests from the landing page</CardDescription>
            </div>
            <AccessRequestsFilters
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setPage={setPage}
              filter={filter}
              setFilter={setFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
            />
          </div>
        </CardHeader>
        <CardContent>
          <AccessRequestsContent
            isLoading={isLoading}
            requests={requests}
            activityMap={activityMap}
            p33={p33}
            p66={p66}
            onSelect={(request) => {
              setSelectedRequest(request);
              setShowDetailsDialog(true);
            }}
          />
          <AccessRequestsPagination page={page} pageSize={pageSize} total={data?.total ?? 0} setPage={setPage} />
        </CardContent>
      </Card>

      <AccessRequestsDialog
        show={showDetailsDialog}
        request={selectedRequest}
        setShow={setShowDetailsDialog}
        onUpdateStatus={handleUpdateStatus}
        activityLevel={selectedActivityStats.activityLevel}
        eventCount={selectedActivityStats.eventCount}
      />
    </>
  );
}
