'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ChevronLeft, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react';
import { UserDetailDialog } from '../UserDetailDialog';
import { cn } from '@/lib/utils';
import type { TopUser, TopUsersResponse, StatsProviderFilter } from '../types';

type UserSortField = 'eventCount' | 'byokLogins' | 'regularLogins' | 'lastActive' | 'firstLoginAt';
type SortDirection = 'asc' | 'desc';

interface TopUsersCardProps {
  dateRange: { from: string; to: string };
  provider?: StatsProviderFilter;
}

function ProviderIndicator({ provider }: { provider: TopUser['provider'] }) {
  if (!provider) {
    return null;
  }

  const isSpotify = provider === 'spotify';

  return (
    <span className="inline-flex items-center justify-center rounded-md border px-1 py-0.5" title={`Provider: ${provider}`}>
      {isSpotify ? (
        <>
          <Image
            src="/spotify/Spotify_Primary_Logo_RGB_Black.png"
            alt="Spotify"
            width={12}
            height={12}
            className="dark:hidden"
          />
          <Image
            src="/spotify/Spotify_Primary_Logo_RGB_White.png"
            alt="Spotify"
            width={12}
            height={12}
            className="hidden dark:block"
          />
        </>
      ) : (
        <Image
          src="/tidal/Tidal_(service)_logo_only.svg"
          alt="TIDAL"
          width={12}
          height={12}
          className="dark:invert"
        />
      )}
    </span>
  );
}

function formatUserDate(value: string | null): string {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toISOString().slice(0, 10);
}

function getTopUsersDescription(showUserDetails: boolean): string {
  return showUserDetails
    ? 'Click a user to see full details - Click column headers to sort'
    : 'User details disabled (no personal data fetched) - Click column headers to sort';
}

function getNextSortState(
  currentSortBy: UserSortField,
  currentSortDirection: SortDirection,
  field: UserSortField,
): { sortBy: UserSortField; sortDirection: SortDirection } {
  if (currentSortBy === field) {
    return {
      sortBy: currentSortBy,
      sortDirection: currentSortDirection === 'desc' ? 'asc' : 'desc',
    };
  }

  return { sortBy: field, sortDirection: 'desc' };
}

function SortIcon({
  field,
  sortBy,
  sortDirection,
}: {
  field: UserSortField;
  sortBy: UserSortField;
  sortDirection: SortDirection;
}) {
  if (sortBy !== field) {
    return <ArrowUpDown className="h-3 w-3" />;
  }

  return sortDirection === 'desc'
    ? <ArrowDown className="h-3 w-3" />
    : <ArrowUp className="h-3 w-3" />;
}

function SortableColumnButton({
  label,
  field,
  sortBy,
  sortDirection,
  onSort,
}: {
  label: string;
  field: UserSortField;
  sortBy: UserSortField;
  sortDirection: SortDirection;
  onSort: (field: UserSortField) => void;
}) {
  return (
    <button onClick={() => onSort(field)} className="hover:text-foreground flex items-center gap-1 ml-auto">
      {label} <SortIcon field={field} sortBy={sortBy} sortDirection={sortDirection} />
    </button>
  );
}

function TopUsersTableHeader({
  sortBy,
  sortDirection,
  onSort,
}: {
  sortBy: UserSortField;
  sortDirection: SortDirection;
  onSort: (field: UserSortField) => void;
}) {
  return (
    <div className="grid grid-cols-12 text-xs text-muted-foreground font-medium pb-2 border-b">
      <div className="col-span-1">#</div>
      <div className="col-span-3">User</div>
      <div className="col-span-2 text-right">
        <SortableColumnButton
          label="Events"
          field="eventCount"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={onSort}
        />
      </div>
      <div className="col-span-1 text-right">
        <SortableColumnButton
          label="BYOK/Std"
          field="byokLogins"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={onSort}
        />
      </div>
      <div className="col-span-2 text-right">
        <SortableColumnButton
          label="First Login"
          field="firstLoginAt"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={onSort}
        />
      </div>
      <div className="col-span-3 text-right">
        <SortableColumnButton
          label="Last Active"
          field="lastActive"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={onSort}
        />
      </div>
    </div>
  );
}

function TopUsersRow({
  user,
  index,
  page,
  pageSize,
  showUserDetails,
  onSelect,
}: {
  user: TopUser;
  index: number;
  page: number;
  pageSize: number;
  showUserDetails: boolean;
  onSelect: (user: TopUser) => void;
}) {
  const title = showUserDetails
    ? 'Click to view user details'
    : 'User details disabled (set STATS_SHOW_USER_DETAILS=true to enable)';

  return (
    <div
      className={cn(
        'grid grid-cols-12 text-sm items-center py-1.5 hover:bg-muted/50 rounded',
        showUserDetails && 'cursor-pointer',
      )}
      onClick={showUserDetails ? () => onSelect(user) : undefined}
      title={title}
    >
      <div className="col-span-1 text-muted-foreground">{page * pageSize + index + 1}</div>
      <div className="col-span-3 flex items-center gap-1.5 min-w-0" title={user.userHash}>
        <span className="font-mono text-xs truncate">{user.userHash.slice(0, 12)}...</span>
        <ProviderIndicator provider={user.provider} />
      </div>
      <div className="col-span-2 text-right font-medium">{user.eventCount}</div>
      <div className="col-span-1 text-right" title={`BYOK: ${user.byokLogins}, Standard: ${user.regularLogins}`}>
        <span className="text-cyan-600">{user.byokLogins}</span>
        <span className="text-muted-foreground">/{user.regularLogins}</span>
      </div>
      <div className="col-span-2 text-right text-xs text-muted-foreground">{formatUserDate(user.firstLoginAt)}</div>
      <div className="col-span-3 text-right text-xs text-muted-foreground">{formatUserDate(user.lastActive)}</div>
    </div>
  );
}

function TopUsersPagination({
  page,
  pageSize,
  total,
  hasMore,
  setPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  setPage: (updater: (page: number) => number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t">
      <span className="text-xs text-muted-foreground">
        Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasMore}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TopUsersContent({
  isLoading,
  users,
  page,
  pageSize,
  sortBy,
  sortDirection,
  showUserDetails,
  pagination,
  onSort,
  onSelectUser,
  setPage,
}: {
  isLoading: boolean;
  users: TopUser[];
  page: number;
  pageSize: number;
  sortBy: UserSortField;
  sortDirection: SortDirection;
  showUserDetails: boolean;
  pagination: TopUsersResponse['pagination'] | undefined;
  onSort: (field: UserSortField) => void;
  onSelectUser: (user: TopUser) => void;
  setPage: (updater: (page: number) => number) => void;
}) {
  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (users.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">No user activity recorded</div>;
  }

  return (
    <>
      <div className="space-y-2">
        <TopUsersTableHeader sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
        {users.map((user, index) => (
          <TopUsersRow
            key={`user-${page * pageSize + index}`}
            user={user}
            index={index}
            page={page}
            pageSize={pageSize}
            showUserDetails={showUserDetails}
            onSelect={onSelectUser}
          />
        ))}
      </div>

      <TopUsersPagination
        page={page}
        pageSize={pageSize}
        total={pagination?.total ?? 0}
        hasMore={pagination?.hasMore ?? false}
        setPage={setPage}
      />
    </>
  );
}

function TopUsersDetailsDialog({
  showUserDetails,
  selectedUser,
  clearSelection,
}: {
  showUserDetails: boolean;
  selectedUser: TopUser | null;
  clearSelection: () => void;
}) {
  if (!showUserDetails || !selectedUser) {
    return null;
  }

  return (
    <UserDetailDialog
      userId={selectedUser.userId}
      userHash={selectedUser.userHash}
      eventCount={selectedUser.eventCount}
      tracksAdded={selectedUser.tracksAdded}
      tracksRemoved={selectedUser.tracksRemoved}
      lastActive={selectedUser.lastActive}
      firstLoginAt={selectedUser.firstLoginAt}
      provider={selectedUser.provider ?? null}
      open={true}
      onOpenChange={(open) => !open && clearSelection()}
    />
  );
}

export function TopUsersCard({ dateRange, provider = 'all' }: TopUsersCardProps) {
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<UserSortField>('eventCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedUser, setSelectedUser] = useState<TopUser | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const pageSize = 10;
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;
  const providerParam = provider === 'all' ? '' : `&provider=${provider}`;

  const { data, isLoading } = useQuery<TopUsersResponse>({
    queryKey: ['stats', 'users', dateRangeKey, provider, page, sortBy, sortDirection],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(
        `/api/stats/users?from=${dateRange.from}&to=${dateRange.to}&limit=${pageSize}&offset=${page * pageSize}&sortBy=${sortBy}&sortDirection=${sortDirection}${providerParam}`,
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

  const toggleSort = (field: UserSortField) => {
    const nextSort = getNextSortState(sortBy, sortDirection, field);
    setSortBy(nextSort.sortBy);
    setSortDirection(nextSort.sortDirection);
    setPage(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Top Users (by activity)
        </CardTitle>
        <CardDescription>
          {getTopUsersDescription(showUserDetails)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TopUsersContent
          isLoading={isLoading}
          users={users}
          page={page}
          pageSize={pageSize}
          sortBy={sortBy}
          sortDirection={sortDirection}
          showUserDetails={showUserDetails}
          pagination={pagination}
          onSort={toggleSort}
          onSelectUser={setSelectedUser}
          setPage={setPage}
        />

        <TopUsersDetailsDialog
          showUserDetails={showUserDetails}
          selectedUser={selectedUser}
          clearSelection={() => setSelectedUser(null)}
        />
      </CardContent>
    </Card>
  );
}
