'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users,
  Activity,
  Plus,
  Minus,
  Clock,
  AlertCircle,
  BarChart3,
  Calendar,
  HelpCircle,
  Sparkles,
  Database,
  GitBranch,
  Music,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  ThumbsUp,
  ThumbsDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { UserDetailDialog } from './UserDetailDialog';
import { cn } from '@/lib/utils';

// Time range presets
type TimeRange = 'today' | '7d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';
type UserSortField = 'eventCount' | 'tracksAdded' | 'tracksRemoved' | 'lastActive' | 'firstLoginAt';
type SortDirection = 'asc' | 'desc';

interface DateRange {
  from: string;
  to: string;
}

function getDateRange(range: TimeRange): DateRange {
  const today = new Date();
  const to = today.toISOString().split('T')[0]!;
  
  switch (range) {
    case 'today':
      return { from: to, to };
    case '7d':
      return {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case '30d':
      return {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case '90d':
      return {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case 'ytd':
      return {
        from: `${today.getFullYear()}-01-01`,
        to,
      };
    case 'all':
      // Use a very early date to capture all data
      return {
        from: '2020-01-01',
        to,
      };
    default:
      return {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
  }
}

interface OverviewKPIs {
  activeUsers: number;
  totalEvents: number;
  tracksAdded: number;
  tracksRemoved: number;
  avgApiDurationMs: number;
  errorRate: number;
  totalSessions: number;
  avgSessionDurationMs: number;
}

interface RecsStats {
  enabled: boolean;
  stats: {
    tracks: number;
    playlistSnapshots: number;
    playlistsIndexed: number;
    seqEdges: number;
    cooccurEdges: number;
    catalogEdges: number;
    artistTopTracks: number;
    albumTracks: number;
    relatedArtists: number;
    trackPopularities: number;
    dismissedRecommendations: number;
    dbSizeBytes: number;
    dbSizeMB: string;
    recentSnapshotsLast7Days: number;
    totalEdges: number;
  } | null;
  topTracks?: TopTrack[];
  totalTracks?: number;
  message?: string;
}

interface TopTrack {
  trackId: string;
  name: string;
  artist: string | null;
  edgeCount: number;
}

interface FeedbackEntry {
  id: number;
  ts: string;
  userHash: string | null;
  npsScore: number | null;
  comment: string | null;
  name?: string | null;
  email?: string | null;
}

interface FeedbackStats {
  totalResponses: number;
  averageScore: number;
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  recentFeedback: FeedbackEntry[];
}

interface TopUser {
  userHash: string;
  userId: string | null;
  eventCount: number;
  tracksAdded: number;
  tracksRemoved: number;
  lastActive: string;
  firstLoginAt: string | null;
}

interface TopUsersResponse {
  success: boolean;
  data: TopUser[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

interface DailySummary {
  date: string;
  total: number;
  trackAdds: number;
  trackRemoves: number;
  trackReorders: number;
  apiCalls: number;
  errors: number;
}

interface ActionDistribution {
  event: string;
  count: number;
}

interface TopPlaylist {
  playlistId: string;
  interactions: number;
}

interface DailyUsers {
  date: string;
  users: number;
}

interface DailyActions {
  date: string;
  actions: number;
  adds: number;
  removes: number;
  reorders: number;
}

interface RegisteredUsersPerDay {
  date: string;
  newUsers: number;
  cumulativeUsers: number;
}

interface EventsData {
  dailySummaries: DailySummary[];
  actionDistribution: ActionDistribution[];
  topPlaylists: TopPlaylist[];
  dailyUsers: DailyUsers[];
  dailyActions: DailyActions[];
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend: _trend,
  description,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          {title}
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SimpleBarChart({ data, label }: { data: DailySummary[]; label: string }) {
  const maxValue = Math.max(...data.map(d => d.total), 1);
  
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, _i) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 bg-primary/80 rounded-t hover:bg-primary transition-colors cursor-default"
                style={{ height: `${(d.total / maxValue) * 100}%`, minHeight: '2px' }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div>{d.total} events</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date ? formatDate(data[0].date) : ''}</span>
        <span>{data.at(-1)?.date ? formatDate(data.at(-1)!.date) : ''}</span>
      </div>
    </div>
  );
}

function UsersBarChart({ data }: { data: DailyUsers[] }) {
  const maxValue = Math.max(...data.map(d => d.users), 1);
  
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        No data for selected period
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {data.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 bg-blue-500/80 rounded-t hover:bg-blue-500 transition-colors cursor-default"
                style={{ height: `${(d.users / maxValue) * 100}%`, minHeight: '2px' }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div>{d.users} unique user{d.users !== 1 ? 's' : ''}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date ? formatDate(data[0].date) : ''}</span>
        <span>{data.at(-1)?.date ? formatDate(data.at(-1)!.date) : ''}</span>
      </div>
    </div>
  );
}

function ActionsBarChart({ data }: { data: DailyActions[] }) {
  const maxValue = Math.max(...data.map(d => d.actions), 1);
  
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        No data for selected period
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {data.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 rounded-t transition-colors cursor-default flex flex-col justify-end"
                style={{ height: `${(d.actions / maxValue) * 100}%`, minHeight: '2px' }}
              >
                {/* Stacked bar: adds (green), removes (red), reorders (blue) */}
                <div 
                  className="bg-green-500/80 hover:bg-green-500 w-full"
                  style={{ height: `${d.actions > 0 ? (d.adds / d.actions) * 100 : 0}%` }}
                />
                <div 
                  className="bg-red-500/80 hover:bg-red-500 w-full"
                  style={{ height: `${d.actions > 0 ? (d.removes / d.actions) * 100 : 0}%` }}
                />
                <div 
                  className="bg-blue-500/80 hover:bg-blue-500 w-full rounded-t"
                  style={{ height: `${d.actions > 0 ? (d.reorders / d.actions) * 100 : 0}%` }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm space-y-1">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded" />
                  <span>{d.adds} added</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded" />
                  <span>{d.removes} removed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded" />
                  <span>{d.reorders} reordered</span>
                </div>
                <div className="border-t pt-1 mt-1 font-medium">{d.actions} total</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date ? formatDate(data[0].date) : ''}</span>
        <span>{data.at(-1)?.date ? formatDate(data.at(-1)!.date) : ''}</span>
      </div>
      {/* Legend */}
      <div className="flex gap-4 justify-center text-xs">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded" />
          <span>Added</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-red-500 rounded" />
          <span>Removed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-500 rounded" />
          <span>Reordered</span>
        </div>
      </div>
    </div>
  );
}

function ActionDonut({ data }: { data: ActionDistribution[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const colors = ['bg-green-500', 'bg-red-500', 'bg-blue-500'];
  const labels: Record<string, string> = {
    track_add: 'Added',
    track_remove: 'Removed',
    track_reorder: 'Reordered',
  };
  
  if (total === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No actions recorded
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.event} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded ${colors[i % colors.length]}`} />
          <span className="flex-1 text-sm">{labels[d.event] || d.event}</span>
          <span className="text-sm font-medium">{d.count}</span>
          <span className="text-xs text-muted-foreground">
            ({formatPercent(d.count / total)})
          </span>
        </div>
      ))}
    </div>
  );
}

function TopPlaylistsList({ playlists }: { playlists: TopPlaylist[] }) {
  if (playlists.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No playlist interactions
      </div>
    );
  }
  
  const maxInteractions = Math.max(...playlists.map(p => p.interactions));
  
  return (
    <div className="space-y-2">
      {playlists.slice(0, 5).map((p, i) => (
        <div key={p.playlistId} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
          <div className="flex-1">
            <div
              className="bg-primary/20 rounded h-6 flex items-center px-2"
              style={{ width: `${(p.interactions / maxInteractions) * 100}%` }}
            >
              <span className="text-xs truncate">{p.playlistId.slice(0, 8)}...</span>
            </div>
          </div>
          <span className="text-sm font-medium">{p.interactions}</span>
        </div>
      ))}
    </div>
  );
}

function TopUsersCard({ 
  dateRange 
}: { 
  dateRange: { from: string; to: string } 
}) {
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<UserSortField>('eventCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedUser, setSelectedUser] = useState<TopUser | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const pageSize = 10;

  const { data, isLoading } = useQuery<TopUsersResponse>({
    queryKey: ['stats', 'users', dateRange, page, sortBy, sortDirection],
    queryFn: async () => {
      const res = await fetch(
        `/api/stats/users?from=${dateRange.from}&to=${dateRange.to}&limit=${pageSize}&offset=${page * pageSize}&sortBy=${sortBy}&sortDirection=${sortDirection}`
      );
      if (!res.ok) throw new Error('Failed to fetch top users');
      return res.json();
    },
  });

  // Check if user details are enabled (only needed on first load)
  useQuery({
    queryKey: ['stats', 'user-details-config'],
    queryFn: async () => {
      const res = await fetch('/api/stats/user-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [] }),
      });
      if (res.ok) {
        const json = await res.json();
        setShowUserDetails(json.showUserDetails ?? false);
      }
      return null;
    },
    staleTime: Infinity, // Only check once
  });

  const users: TopUser[] = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination ? Math.ceil(pagination.total / pageSize) : 0;

  const toggleSort = (field: UserSortField) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
    setPage(0); // Reset to first page on sort change
  };

  const getSortIcon = (field: UserSortField) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3" />;
    return sortDirection === 'desc' 
      ? <ArrowDown className="h-3 w-3" /> 
      : <ArrowUp className="h-3 w-3" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Top Users (by activity)
        </CardTitle>
        <CardDescription>
          {showUserDetails 
            ? 'Click a user to see full details - Click column headers to sort' 
            : 'User details disabled (no personal data fetched) - Click column headers to sort'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : users.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No user activity recorded
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="grid grid-cols-12 text-xs text-muted-foreground font-medium pb-2 border-b">
                <div className="col-span-1">#</div>
                <div className="col-span-3">User</div>
                <div className="col-span-2 text-right">
                  <button 
                    onClick={() => toggleSort('eventCount')}
                    className="hover:text-foreground flex items-center gap-1 ml-auto"
                  >
                    Events {getSortIcon('eventCount')}
                  </button>
                </div>
                <div className="col-span-1 text-right">
                  <button 
                    onClick={() => toggleSort('tracksAdded')}
                    className="hover:text-foreground flex items-center gap-1 ml-auto"
                  >
                    Added {getSortIcon('tracksAdded')}
                  </button>
                </div>
                <div className="col-span-2 text-right">
                  <button 
                    onClick={() => toggleSort('firstLoginAt')}
                    className="hover:text-foreground flex items-center gap-1 ml-auto"
                  >
                    First Login {getSortIcon('firstLoginAt')}
                  </button>
                </div>
                <div className="col-span-3 text-right">
                  <button 
                    onClick={() => toggleSort('lastActive')}
                    className="hover:text-foreground flex items-center gap-1 ml-auto"
                  >
                    Last Active {getSortIcon('lastActive')}
                  </button>
                </div>
              </div>
              {users.map((user, i) => (
                <div 
                  key={`user-${page * pageSize + i}`}
                  className={cn(
                    "grid grid-cols-12 text-sm items-center py-1.5 hover:bg-muted/50 rounded",
                    showUserDetails && "cursor-pointer"
                  )}
                  onClick={showUserDetails ? () => setSelectedUser(user) : undefined}
                  title={showUserDetails ? "Click to view user details" : "User details disabled (set STATS_SHOW_USER_DETAILS=true to enable)"}
                >
                  <div className="col-span-1 text-muted-foreground">{page * pageSize + i + 1}</div>
                  <div className="col-span-3 font-mono text-xs truncate" title={user.userHash}>
                    {user.userHash.slice(0, 12)}...
                  </div>
                  <div className="col-span-2 text-right font-medium">{user.eventCount}</div>
                  <div className="col-span-1 text-right text-green-600">{user.tracksAdded}</div>
                  <div className="col-span-2 text-right text-xs text-muted-foreground">
                    {user.firstLoginAt ? new Date(user.firstLoginAt).toLocaleDateString() : 'N/A'}
                  </div>
                  <div className="col-span-3 text-right text-xs text-muted-foreground">
                    {new Date(user.lastActive).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-xs text-muted-foreground">
                  Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, pagination?.total ?? 0)} of {pagination?.total ?? 0}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={!pagination?.hasMore}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* User Detail Dialog - only shown if STATS_SHOW_USER_DETAILS=true */}
        {showUserDetails && selectedUser && (
          <UserDetailDialog
            userId={selectedUser.userId}
            userHash={selectedUser.userHash}
            eventCount={selectedUser.eventCount}
            tracksAdded={selectedUser.tracksAdded}
            tracksRemoved={selectedUser.tracksRemoved}
            lastActive={selectedUser.lastActive}
            firstLoginAt={selectedUser.firstLoginAt}
            open={!!selectedUser}
            onOpenChange={(open) => !open && setSelectedUser(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function TopTracksCard({ 
  topTracks = [], 
  totalTracks = 0,
  isLoading 
}: { 
  topTracks?: TopTrack[]; 
  totalTracks?: number;
  isLoading: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 10;
  
  // For pagination, we'd need to refetch. For now show first 10
  const displayTracks = topTracks.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(totalTracks / pageSize);
  const maxEdges = Math.max(...topTracks.map(t => t.edgeCount), 1);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-4 w-4" />
            Top Tracks (by connections)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-4 w-4" />
          Top Tracks (by connections)
        </CardTitle>
        <CardDescription>
          Most connected tracks in the recommendation graph
        </CardDescription>
      </CardHeader>
      <CardContent>
        {displayTracks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No tracks indexed yet
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {displayTracks.map((track, i) => {
                const displayName = track.artist 
                  ? `${track.name} — ${track.artist}`
                  : track.name;
                return (
                  <div key={track.trackId} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{page * pageSize + i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="bg-green-500/20 rounded h-6 flex items-center px-2"
                        style={{ width: `${Math.max(20, (track.edgeCount / maxEdges) * 100)}%` }}
                      >
                        <span className="text-xs truncate" title={displayName}>{displayName}</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground w-16 text-right">
                      {track.edgeCount} edges
                    </span>
                  </div>
                );
              })}
            </div>
            
            {/* Pagination (simplified - would need API support for true pagination) */}
            {totalPages > 1 && topTracks.length > pageSize && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-xs text-muted-foreground">
                  Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, topTracks.length)} of {topTracks.length}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * pageSize >= topTracks.length}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecsStatsCard({ data, isLoading }: { data?: RecsStats; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Recommendations System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Recommendations System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">Not Enabled</p>
            <p className="text-sm mt-1">Set RECS_ENABLED=true to enable the recommendation system</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats = data.stats;
  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Recommendations System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">No stats available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Recommendations System
        </CardTitle>
        <CardDescription>
          Graph-based recommendation engine statistics
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Core stats */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Music className="h-3 w-3" />
              Tracks Indexed
            </div>
            <div className="text-2xl font-bold">{stats.tracks.toLocaleString()}</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              Total Edges
            </div>
            <div className="text-2xl font-bold">{stats.totalEdges.toLocaleString()}</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3 w-3" />
              DB Size
            </div>
            <div className="text-2xl font-bold">{stats.dbSizeMB} MB</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BarChart3 className="h-3 w-3" />
              Dismissed
            </div>
            <div className="text-2xl font-bold">{stats.dismissedRecommendations.toLocaleString()}</div>
          </div>
        </div>
        
        {/* Detailed breakdown */}
        <div className="mt-6 pt-4 border-t">
          <div className="text-sm font-medium mb-3">Edge Breakdown</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Sequential</div>
              <div className="font-medium">{stats.seqEdges.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Co-occurrence</div>
              <div className="font-medium">{stats.cooccurEdges.toLocaleString()}</div>
            </div>
          </div>
        </div>
        
        {stats.tracks === 0 && (
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">No data yet</p>
            <p className="text-muted-foreground mt-1">
              Open playlists in the Split Editor to start building the recommendation graph. 
              Recommendations will appear based on your playlist organization patterns.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedbackStatsCard({ 
  dateRange, 
  isLoading 
}: { 
  dateRange: DateRange; 
  isLoading: boolean; 
}) {
  const { data: feedbackData, isLoading: feedbackLoading } = useQuery<{ data: FeedbackStats }>({
    queryKey: ['stats', 'feedback', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/feedback?from=${dateRange.from}&to=${dateRange.to}`);
      if (!res.ok) throw new Error('Failed to fetch feedback');
      return res.json();
    },
  });

  const loading = isLoading || feedbackLoading;
  const stats = feedbackData?.data;

  const getNpsColor = (nps: number) => {
    if (nps >= 50) return 'text-green-500';
    if (nps >= 0) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getNpsBgColor = (nps: number) => {
    if (nps >= 50) return 'bg-green-500/10';
    if (nps >= 0) return 'bg-yellow-500/10';
    return 'bg-red-500/10';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5" />
          User Feedback (NPS)
        </CardTitle>
        <CardDescription>
          Net Promoter Score and user comments for the selected period
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading...
          </div>
        ) : !stats || stats.totalResponses === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquarePlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No feedback received in this period</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* NPS Score Display */}
            <div className={`p-4 rounded-lg ${getNpsBgColor(stats.nps)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Net Promoter Score</div>
                  <div className={`text-4xl font-bold ${getNpsColor(stats.nps)}`}>
                    {stats.nps > 0 ? '+' : ''}{stats.nps}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Average Rating</div>
                  <div className="text-2xl font-bold">{stats.averageScore}/10</div>
                </div>
              </div>
            </div>

            {/* Response breakdown */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <ThumbsUp className="h-4 w-4 mx-auto mb-1 text-green-500" />
                <div className="text-lg font-bold text-green-500">{stats.promoters}</div>
                <div className="text-xs text-muted-foreground">Promoters (9-10)</div>
              </div>
              <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                <div className="h-4 w-4 mx-auto mb-1 rounded-full bg-yellow-500/50" />
                <div className="text-lg font-bold text-yellow-500">{stats.passives}</div>
                <div className="text-xs text-muted-foreground">Passives (7-8)</div>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-lg">
                <ThumbsDown className="h-4 w-4 mx-auto mb-1 text-red-500" />
                <div className="text-lg font-bold text-red-500">{stats.detractors}</div>
                <div className="text-xs text-muted-foreground">Detractors (0-6)</div>
              </div>
            </div>

            {/* Total responses */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {stats.totalResponses} total response{stats.totalResponses !== 1 ? 's' : ''}
            </div>

            {/* Recent feedback with comments */}
            {stats.recentFeedback.some((f: FeedbackEntry) => f.comment) && (
              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-3">Recent Comments</div>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {stats.recentFeedback
                    .filter((f: FeedbackEntry) => f.comment)
                    .slice(0, 5)
                    .map((feedback: FeedbackEntry) => (
                      <div 
                        key={feedback.id} 
                        className="p-3 bg-muted/50 rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {typeof feedback.npsScore === 'number' ? (
                            <span className={`font-medium ${
                              feedback.npsScore >= 9 ? 'text-green-500' :
                              feedback.npsScore >= 7 ? 'text-yellow-500' :
                              'text-red-500'
                            }`}>
                              {feedback.npsScore}/10
                            </span>
                          ) : (
                            <span className="font-medium text-muted-foreground">No score</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(feedback.ts).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-muted-foreground">{feedback.comment}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UserRegistrationChart({ 
  dateRange 
}: { 
  dateRange: { from: string; to: string } 
}) {
  const { data, isLoading } = useQuery<{ data: RegisteredUsersPerDay[] }>({
    queryKey: ['stats', 'registrations', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/stats/registrations?from=${dateRange.from}&to=${dateRange.to}`);
      if (!res.ok) throw new Error('Failed to fetch registration stats');
      return res.json();
    },
  });

  const registrations = data?.data ?? [];
  const maxNewUsers = registrations.length > 0 ? Math.max(...registrations.map((d: RegisteredUsersPerDay) => d.newUsers), 1) : 1;
  const maxCumulative = registrations.length > 0 ? Math.max(...registrations.map((d: RegisteredUsersPerDay) => d.cumulativeUsers), 1) : 1;
  const totalNewUsers = registrations.reduce((sum: number, d: RegisteredUsersPerDay) => sum + d.newUsers, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          First Logins
        </CardTitle>
        <CardDescription>
          {totalNewUsers} new user{totalNewUsers !== 1 ? 's' : ''} logged in for the first time in this period
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : registrations.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">
            No first logins in selected period
          </div>
        ) : (
          <div className="space-y-6">
            {/* First logins per day */}
            <div className="space-y-2">
              <div className="text-sm font-medium">First Logins</div>
              <div className="flex items-end gap-1 h-24">
                {registrations.map((d: RegisteredUsersPerDay) => (
                  <Tooltip key={d.date}>
                    <TooltipTrigger asChild>
                      <div
                        className="flex-1 bg-green-500/80 rounded-t hover:bg-green-500 transition-colors cursor-default"
                        style={{ height: `${(d.newUsers / maxNewUsers) * 100}%`, minHeight: d.newUsers > 0 ? '3px' : '0px' }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-sm">
                        <div className="font-medium">{formatDate(d.date)}</div>
                        <div>{d.newUsers} new user{d.newUsers !== 1 ? 's' : ''}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{registrations[0]?.date ? formatDate(registrations[0].date) : ''}</span>
                <span>{registrations.at(-1)?.date ? formatDate(registrations.at(-1)!.date) : ''}</span>
              </div>
            </div>

            {/* Cumulative users growth */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Total Users Growth</div>
              <div className="h-24 relative">
                <svg className="w-full h-full" preserveAspectRatio="none">
                  <polyline
                    points={registrations.map((d: RegisteredUsersPerDay, i: number) => {
                      const x = registrations.length > 1 ? (i / (registrations.length - 1)) * 100 : 50;
                      const y = 100 - (d.cumulativeUsers / maxCumulative) * 100;
                      return `${x},${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-blue-500"
                    vectorEffect="non-scaling-stroke"
                  />
                  <polyline
                    points={registrations.map((d: RegisteredUsersPerDay, i: number) => {
                      const x = registrations.length > 1 ? (i / (registrations.length - 1)) * 100 : 50;
                      const y = 100 - (d.cumulativeUsers / maxCumulative) * 100;
                      return `${x},${y}`;
                    }).join(' ') + ` 100,100 0,100`}
                    fill="currentColor"
                    className="text-blue-500/20"
                  />
                </svg>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{registrations[0]?.cumulativeUsers ?? 0} users</span>
                <span>{registrations.at(-1)?.cumulativeUsers ?? 0} users</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange]);

  // Fetch overview KPIs
  const { data: overviewData, isLoading: overviewLoading } = useQuery<{ data: OverviewKPIs }>({
    queryKey: ['stats', 'overview', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/stats/overview?from=${dateRange.from}&to=${dateRange.to}`);
      if (!res.ok) throw new Error('Failed to fetch overview');
      return res.json();
    },
  });

  // Fetch events data
  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ data: EventsData }>({
    queryKey: ['stats', 'events', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/stats/events?from=${dateRange.from}&to=${dateRange.to}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },
  });

  // Fetch recs stats with top tracks (not time-dependent)
  const { data: recsData, isLoading: recsLoading } = useQuery<RecsStats>({
    queryKey: ['stats', 'recs'],
    queryFn: async () => {
      const res = await fetch('/api/stats/recs?topTracksLimit=50');
      if (!res.ok) throw new Error('Failed to fetch recs stats');
      return res.json();
    },
    staleTime: 30 * 1000, // Refresh every 30 seconds
  });

  const kpis = overviewData?.data;
  const events = eventsData?.data;

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: 'ytd', label: 'YTD' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Time Range:</span>
        <div className="flex gap-1">
          {timeRanges.map((r) => (
            <Button
              key={r.value}
              variant={timeRange === r.value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTimeRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Active Users"
          value={overviewLoading ? '...' : kpis?.activeUsers ?? 0}
          subtitle={`${dateRange.from} to ${dateRange.to}`}
          icon={Users}
          description="Number of unique users who have interacted with the app during the selected time period"
        />
        <KPICard
          title="Total Events"
          value={overviewLoading ? '...' : kpis?.totalEvents ?? 0}
          icon={Activity}
          description="Sum of all tracked events including track additions, removals, reorders, and API calls"
        />
        <KPICard
          title="Tracks Added"
          value={overviewLoading ? '...' : kpis?.tracksAdded ?? 0}
          icon={Plus}
          description="Number of tracks added to playlists by users"
        />
        <KPICard
          title="Tracks Removed"
          value={overviewLoading ? '...' : kpis?.tracksRemoved ?? 0}
          icon={Minus}
          description="Number of tracks removed from playlists by users"
        />
        <KPICard
          title="Avg API Duration"
          value={overviewLoading ? '...' : formatDuration(kpis?.avgApiDurationMs ?? 0)}
          icon={Clock}
          description="Average time taken for Spotify API calls to complete"
        />
        <KPICard
          title="Error Rate"
          value={overviewLoading ? '...' : formatPercent(kpis?.errorRate ?? 0)}
          icon={AlertCircle}
          description="Percentage of API calls that resulted in errors"
        />
        <KPICard
          title="Total Sessions"
          value={overviewLoading ? '...' : kpis?.totalSessions ?? 0}
          icon={Users}
          description="Number of unique user sessions started during the selected period"
        />
        <KPICard
          title="Avg Session Duration"
          value={overviewLoading ? '...' : formatDuration(kpis?.avgSessionDurationMs ?? 0)}
          icon={Clock}
          description="Average time users spent in a single session"
        />
      </div>

      {/* Charts Row 1: Daily Activity */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Daily Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
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

      {/* Charts Row 2: Users per Day and User Registrations */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Active Users per Day
            </CardTitle>
            <CardDescription>
              Unique users active each day
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <UsersBarChart data={events?.dailyUsers ?? []} />
            )}
          </CardContent>
        </Card>

        <UserRegistrationChart dateRange={dateRange} />
      </div>

      {/* Charts Row 3: Actions per Day */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Actions per Day
          </CardTitle>
          <CardDescription>
            Track additions, removals, and reorders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : (
            <ActionsBarChart data={events?.dailyActions ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Rankings Row: Top Users and Top Playlists */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Users Ranking */}
        <TopUsersCard dateRange={dateRange} />

        {/* Top Playlists */}
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

      {/* User Feedback / NPS */}
      <FeedbackStatsCard dateRange={dateRange} isLoading={overviewLoading} />

      {/* Recommendations System Stats */}
      <RecsStatsCard data={recsData} isLoading={recsLoading} />
      
      {/* Top Tracks from Recommendation Graph */}
      {recsData?.enabled && (
        <TopTracksCard 
          topTracks={recsData?.topTracks} 
          totalTracks={recsData?.totalTracks}
          isLoading={recsLoading} 
        />
      )}
      </div>
    </TooltipProvider>
  );
}
