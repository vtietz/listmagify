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
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
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

function SyncPairDrilldown({ run }: { run: SyncPairLatestRun }) {
  return (
    <tr>
      <td colSpan={7} className="px-3 pb-3">
        <div className="space-y-2">
          {run.errorMessage && (
            <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded text-sm">
              <span className="font-medium">Error:</span> {run.errorMessage}
            </div>
          )}
          {run.warnings.length > 0 && (
            <div className="p-3 rounded border text-sm">
              <div className="font-medium mb-1">Unresolved tracks:</div>
              <ul className="space-y-1">
                {run.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {w.title} — {w.artists.join(', ')} ({w.reason})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Added: {run.tracksAdded}</span>
            <span>Removed: {run.tracksRemoved}</span>
            <span>Unresolved: {run.tracksUnresolved}</span>
            {run.completedAt && <span>Completed: {timeAgo(run.completedAt)}</span>}
          </div>
        </div>
      </td>
    </tr>
  );
}

function SyncPairRow({
  pair,
  expanded,
  onToggle,
}: {
  pair: SyncPair;
  expanded: boolean;
  onToggle: () => void;
}) {
  const run = pair.latestRun;
  const hasDetails = run && (run.errorMessage || run.warnings.length > 0);
  const isClickable = !!hasDetails;

  return (
    <>
      <tr
        className={cn(
          'border-b last:border-b-0',
          isClickable && 'cursor-pointer hover:bg-muted/50 transition-colors',
        )}
        onClick={isClickable ? onToggle : undefined}
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
        <td className="px-3 py-2 text-muted-foreground">
          {pair.nextRunAt ? timeAgo(pair.nextRunAt) : '—'}
        </td>
      </tr>
      {expanded && run && <SyncPairDrilldown run={run} />}
    </>
  );
}

export function SyncSchedulerCard({ data, workerEnabled, isLoading }: SyncSchedulerCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
