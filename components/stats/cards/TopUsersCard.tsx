'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ChevronLeft, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react';
import { UserDetailDialog } from '../UserDetailDialog';
import { cn } from '@/lib/utils';
import type { TopUser, TopUsersResponse } from '../types';

type UserSortField = 'eventCount' | 'tracksAdded' | 'tracksRemoved' | 'lastActive' | 'firstLoginAt';
type SortDirection = 'asc' | 'desc';

interface TopUsersCardProps {
  dateRange: { from: string; to: string };
}

export function TopUsersCard({ dateRange }: TopUsersCardProps) {
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<UserSortField>('eventCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedUser, setSelectedUser] = useState<TopUser | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const pageSize = 10;
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data, isLoading } = useQuery<TopUsersResponse>({
    queryKey: ['stats', 'users', dateRangeKey, page, sortBy, sortDirection],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(
        `/api/stats/users?from=${dateRange.from}&to=${dateRange.to}&limit=${pageSize}&offset=${page * pageSize}&sortBy=${sortBy}&sortDirection=${sortDirection}`,
        { signal }
      );
      if (!res.ok) throw new Error('Failed to fetch top users');
      return res.json();
    },
    refetchOnMount: true,
  });

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
    staleTime: Infinity,
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
    setPage(0);
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
