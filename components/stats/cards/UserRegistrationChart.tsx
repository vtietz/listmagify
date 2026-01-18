'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Users } from 'lucide-react';
import { formatDate } from '../utils';
import type { RegisteredUsersPerDay } from '../types';

interface UserRegistrationChartProps {
  dateRange: { from: string; to: string };
}

export function UserRegistrationChart({ dateRange }: UserRegistrationChartProps) {
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data, isLoading } = useQuery<{ data: RegisteredUsersPerDay[] }>({
    queryKey: ['stats', 'registrations', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/stats/registrations?from=${dateRange.from}&to=${dateRange.to}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch registration stats');
      return res.json();
    },
    refetchOnMount: true,
  });

  const registrations = data?.data ?? [];
  const maxNewUsers = registrations.length > 0 ? Math.max(...registrations.map((d: RegisteredUsersPerDay) => d.newUsers), 1) : 1;
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
          <div className="space-y-2">
            <div className="flex items-end gap-1 h-32">
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
        )}
      </CardContent>
    </Card>
  );
}
