'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';

interface SyncPairWarning {
  title: string;
  artists: string[];
  reason: string;
}

interface SyncPairLatestRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  tracksAdded: number;
  tracksRemoved: number;
  tracksUnresolved: number;
  errorMessage: string | null;
  warnings: SyncPairWarning[];
}

interface SyncPair {
  id: string;
  sourceProvider: string;
  sourcePlaylistName: string;
  targetProvider: string;
  targetPlaylistName: string;
  syncInterval: string;
  nextRunAt: string | null;
  consecutiveFailures: number;
  latestRun: SyncPairLatestRun | null;
  recentRuns?: SyncPairLatestRun[];
}

interface SyncSchedulerCardProps {
  data?: {
    totalPairs: number;
    activePairs: number;
    failingPairs: number;
    disabledPairs: number;
    pairs: SyncPair[];
  };
  workerEnabled?: boolean;
  isLoading: boolean;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(ms);
  const suffix = ms >= 0 ? 'ago' : 'from now';
  const s = Math.floor(abs / 1000);
  if (s < 60) return `${s}s ${suffix}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${suffix}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${suffix}`;
  const d = Math.floor(h / 24);
  return `${d}d ${suffix}`;
}

function getStatusDotColor(status: string | undefined): string {
  switch (status) {
    case 'done':
    case 'completed':
      return 'bg-green-500';
    case 'failed':
    case 'error':
      return 'bg-red-500';
    case 'pending':
    case 'executing':
    case 'running':
      return 'bg-yellow-500';
    default:
      return 'bg-gray-400';
  }
}

function KpiBox({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="text-center p-3 rounded-lg border">
      <div className={cn('text-xl font-bold', colorClass)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function getRunStatusBadge(status: string): string {
  switch (status) {
    case 'done':
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400';
    case 'failed':
    case 'error':
      return 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400';
    case 'pending':
    case 'executing':
    case 'running':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-950/30 dark:text-gray-400';
  }
}

function SyncPairDrilldown({ pair }: { pair: SyncPair }) {
  const runs = pair.recentRuns ?? (pair.latestRun ? [pair.latestRun] : []);

  if (runs.length === 0) {
    return (
      <tr>
        <td colSpan={8} className="px-3 pb-3">
          <div className="text-xs text-muted-foreground">No runs yet</div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={8} className="px-3 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-left">Started</th>
                <th className="px-2 py-1.5 text-right">Added</th>
                <th className="px-2 py-1.5 text-right">Removed</th>
                <th className="px-2 py-1.5 text-right">Unresolved</th>
                <th className="px-2 py-1.5 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b last:border-b-0">
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        getRunStatusBadge(run.status),
                      )}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{timeAgo(run.startedAt)}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{run.tracksAdded}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{run.tracksRemoved}</td>
                  <td className="px-2 py-1.5 text-right">
                    {run.tracksUnresolved > 0 ? (
                      <span className="text-orange-500">{run.tracksUnresolved}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {run.errorMessage ? (
                      <span className="text-red-500 truncate block max-w-[300px]" title={run.errorMessage}>
                        {run.errorMessage}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function SyncPairRow({
  pair,
  expanded,
  onToggle,
  now,
}: {
  pair: SyncPair;
  expanded: boolean;
  onToggle: () => void;
  now: number;
}) {
  const run = pair.latestRun;

  return (
    <>
      <tr
        className="border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              run ? getStatusDotColor(run.status) : 'bg-gray-400',
            )}
          />
        </td>
        <td className="px-3 py-2">
          <span className="font-medium">{pair.sourcePlaylistName}</span>
          <span className="text-muted-foreground mx-1">({pair.sourceProvider})</span>
        </td>
        <td className="px-3 py-2 text-muted-foreground">→</td>
        <td className="px-3 py-2">
          <span className="font-medium">{pair.targetPlaylistName}</span>
          <span className="text-muted-foreground mx-1">({pair.targetProvider})</span>
        </td>
        <td className="px-3 py-2 text-muted-foreground">{pair.syncInterval}</td>
        <td className="px-3 py-2">
          {run ? timeAgo(run.startedAt) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-3 py-2">
          {pair.consecutiveFailures > 0 ? (
            <span className="text-red-500 font-medium">{pair.consecutiveFailures}</span>
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
        </td>
        <td className="px-3 py-2">
          {pair.nextRunAt ? (
            new Date(pair.nextRunAt).getTime() < now ? (
              <span className="text-red-500" title={pair.nextRunAt}>overdue ({timeAgo(pair.nextRunAt)})</span>
            ) : (
              <span className="text-muted-foreground">{timeAgo(pair.nextRunAt)}</span>
            )
          ) : '—'}
        </td>
      </tr>
      {expanded && <SyncPairDrilldown pair={pair} />}
    </>
  );
}

export function SyncSchedulerCard({ data, workerEnabled, isLoading }: SyncSchedulerCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Sync Scheduler
          </CardTitle>
          {workerEnabled !== undefined && (
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                workerEnabled
                  ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400',
              )}
            >
              {workerEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
        {data && (
          <div className="grid grid-cols-4 gap-3 mt-3">
            <KpiBox label="Total" value={data.totalPairs} colorClass="text-foreground" />
            <KpiBox label="Active" value={data.activePairs} colorClass="text-green-500" />
            <KpiBox label="Failing" value={data.failingPairs} colorClass="text-red-500" />
            <KpiBox label="Disabled" value={data.disabledPairs} colorClass="text-muted-foreground" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : !data || data.pairs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No sync pairs configured
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2 text-left">Target</th>
                  <th className="px-3 py-2 text-left">Interval</th>
                  <th className="px-3 py-2 text-left">Last Run</th>
                  <th className="px-3 py-2 text-left">Failures</th>
                  <th className="px-3 py-2 text-left">Next Run</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((pair) => (
                  <SyncPairRow
                    key={pair.id}
                    pair={pair}
                    expanded={expandedId === pair.id}
                    onToggle={() =>
                      setExpandedId((prev) => (prev === pair.id ? null : pair.id))
                    }
                    now={now}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
