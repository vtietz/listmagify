'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Key } from 'lucide-react';

interface TokenEntry {
  userId: string;
  provider: string;
  status: string;
  isByok: boolean;
  updatedAt: string;
  expiresAt: number | null;
}

interface TokenStatusCardProps {
  data?: {
    tokens: TokenEntry[];
  };
  keepaliveEnabled?: boolean;
  isLoading: boolean;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function expiresIn(epochMs: number | null): string {
  if (epochMs === null) return 'N/A';
  const ms = epochMs - Date.now();
  if (ms <= 0) return 'Expired';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function getStatusBadge(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400';
    case 'needs_reauth':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400';
    case 'revoked':
      return 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-950/30 dark:text-gray-400';
  }
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

export function TokenStatusCard({ data, keepaliveEnabled, isLoading }: TokenStatusCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Token Status
          </CardTitle>
          {keepaliveEnabled !== undefined && (
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                keepaliveEnabled
                  ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400',
              )}
            >
              Keepalive {keepaliveEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : !data || data.tokens.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No tokens stored
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-left">User ID</th>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">BYOK</th>
                  <th className="px-3 py-2 text-left">Expires</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.tokens.map((token) => (
                  <tr key={`${token.userId}-${token.provider}`} className="border-b last:border-b-0">
                    <td
                      className="px-3 py-2 font-mono text-muted-foreground"
                      title={token.userId}
                    >
                      {truncateId(token.userId)}
                    </td>
                    <td className="px-3 py-2 font-medium">{token.provider}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium',
                          getStatusBadge(token.status),
                        )}
                      >
                        {token.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {token.isByok ? 'Yes' : 'No'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {expiresIn(token.expiresAt)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {timeAgo(token.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
