'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { UserDetailDialog } from '../UserDetailDialog';

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
  sourcePlaylistId: string;
  targetProvider: string;
  targetPlaylistId: string;
  syncInterval: string;
  nextRunAt: string | null;
  consecutiveFailures: number;
  createdByHash: string;
  createdByRaw: string;
  creatorProvider: string;
  creatorAccountId: string;
  createdAt: string;
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

interface ProviderDirectionStats {
  direction: string;
  total: number;
  active: number;
  failing: number;
  totalRuns: number;
  successfulRuns: number;
  totalUnresolved: number;
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

function computeProviderStats(pairs: SyncPair[]): ProviderDirectionStats[] {
  const byDirection = new Map<string, ProviderDirectionStats>();

  for (const pair of pairs) {
    const key = `${pair.sourceProvider} → ${pair.targetProvider}`;
    let stats = byDirection.get(key);
    if (!stats) {
      stats = { direction: key, total: 0, active: 0, failing: 0, totalRuns: 0, successfulRuns: 0, totalUnresolved: 0 };
      byDirection.set(key, stats);
    }
    stats.total++;
    if (pair.syncInterval !== 'off') stats.active++;
    if (pair.consecutiveFailures > 0) stats.failing++;

    const runs = pair.recentRuns ?? (pair.latestRun ? [pair.latestRun] : []);
    for (const run of runs) {
      stats.totalRuns++;
      if (run.status === 'done' || run.status === 'completed') stats.successfulRuns++;
      stats.totalUnresolved += run.tracksUnresolved;
    }
  }

  return Array.from(byDirection.values());
}

function ProviderStatsRow({ stats }: { stats: ProviderDirectionStats }) {
  const successRate = stats.totalRuns > 0
    ? Math.round((stats.successfulRuns / stats.totalRuns) * 100)
    : 0;

  return (
    <div className="flex items-center gap-4 p-2 rounded-lg border text-xs">
      <span className="font-medium min-w-[120px]">{stats.direction}</span>
      <span className="text-muted-foreground">{stats.total} pairs ({stats.active} active)</span>
      <span className={cn(
        'font-medium',
        successRate >= 80 ? 'text-green-500' : successRate >= 50 ? 'text-yellow-500' : 'text-red-500',
      )}>
        {successRate}% success
      </span>
      {stats.failing > 0 && (
        <span className="text-red-500">{stats.failing} failing</span>
      )}
      {stats.totalUnresolved > 0 && (
        <span className="text-orange-500">{stats.totalUnresolved} unresolved tracks</span>
      )}
    </div>
  );
}

function UnmatchedTracksList({ warnings }: { warnings: SyncPairWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="mt-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-orange-500 mb-1.5">
        <AlertTriangle className="h-3 w-3" />
        Unmatched Tracks
      </div>
      <div className="space-y-0.5">
        {warnings.map((w, i) => (
          <div key={i} className="text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">{w.title}</span>
            {w.artists.length > 0 && (
              <span> — {w.artists.join(', ')}</span>
            )}
            <span className="text-orange-500/70 ml-1">({w.reason})</span>
          </div>
        ))}
      </div>
    </div>
  );
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

  // Collect all unmatched tracks from recent runs
  const allWarnings = runs.flatMap((r) => r.warnings ?? []);
  // Deduplicate by title+artists
  const seen = new Set<string>();
  const uniqueWarnings = allWarnings.filter((w) => {
    const key = `${w.title}|${w.artists.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

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
        <UnmatchedTracksList warnings={uniqueWarnings} />
      </td>
    </tr>
  );
}

function SyncPairRow({
  pair,
  expanded,
  onToggle,
  onUserClick,
  now,
}: {
  pair: SyncPair;
  expanded: boolean;
  onToggle: () => void;
  onUserClick: (pair: SyncPair) => void;
  now: number;
}) {
  const run = pair.latestRun;
  const unresolvedCount = pair.recentRuns
    ?.reduce((sum, r) => sum + r.tracksUnresolved, 0) ?? (run?.tracksUnresolved ?? 0);

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
          <div>
            <span className="font-medium">{pair.sourceProvider}</span>
            <span className="text-muted-foreground mx-1.5">→</span>
            <span className="font-medium">{pair.targetProvider}</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5" title={`${pair.sourcePlaylistId} → ${pair.targetPlaylistId}`}>
            {pair.sourcePlaylistId.slice(0, 8)}... → {pair.targetPlaylistId.slice(0, 8)}...
          </div>
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
          {unresolvedCount > 0 ? (
            <span className="text-orange-500 font-medium">{unresolvedCount}</span>
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
        <td className="px-3 py-2">
          <button
            className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
            title={pair.createdByHash}
            onClick={(e) => {
              e.stopPropagation();
              onUserClick(pair);
            }}
          >
            {pair.createdByHash.slice(0, 12)}...
          </button>
        </td>
      </tr>
      {expanded && <SyncPairDrilldown pair={pair} />}
    </>
  );
}

function SyncSchedulerHeader({
  data,
  workerEnabled,
  providerStats,
}: {
  data: SyncSchedulerCardProps['data'];
  workerEnabled: boolean | undefined;
  providerStats: ProviderDirectionStats[];
}) {
  return (
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
        <>
          <div className="grid grid-cols-4 gap-3 mt-3">
            <KpiBox label="Total" value={data.totalPairs} colorClass="text-foreground" />
            <KpiBox label="Active" value={data.activePairs} colorClass="text-green-500" />
            <KpiBox label="Failing" value={data.failingPairs} colorClass="text-red-500" />
            <KpiBox label="Disabled" value={data.disabledPairs} colorClass="text-muted-foreground" />
          </div>
          {providerStats.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {providerStats.map((stats) => (
                <ProviderStatsRow key={stats.direction} stats={stats} />
              ))}
            </div>
          )}
        </>
      )}
    </CardHeader>
  );
}

function SyncSchedulerTable({
  data,
  isLoading,
  effectiveExpandedId,
  now,
  onToggle,
  onUserClick,
}: {
  data: SyncSchedulerCardProps['data'];
  isLoading: boolean;
  effectiveExpandedId: string | null;
  now: number;
  onToggle: (pairId: string) => void;
  onUserClick: (pair: SyncPair) => void;
}) {
  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (!data || data.pairs.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        No sync pairs configured
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-3 py-2 text-left w-8"></th>
            <th className="px-3 py-2 text-left">Direction</th>
            <th className="px-3 py-2 text-left">Interval</th>
            <th className="px-3 py-2 text-left">Last Run</th>
            <th className="px-3 py-2 text-left">Failures</th>
            <th className="px-3 py-2 text-left">Unresolved</th>
            <th className="px-3 py-2 text-left">Next Run</th>
            <th className="px-3 py-2 text-left">Owner</th>
          </tr>
        </thead>
        <tbody>
          {data.pairs.map((pair) => (
            <SyncPairRow
              key={pair.id}
              pair={pair}
              expanded={effectiveExpandedId === pair.id}
              onToggle={() => onToggle(pair.id)}
              onUserClick={onUserClick}
              now={now}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SyncSchedulerCard({ data, workerEnabled, isLoading }: SyncSchedulerCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [now] = useState(() => Date.now());
  const [selectedPair, setSelectedPair] = useState<SyncPair | null>(null);

  const providerStats = data ? computeProviderStats(data.pairs) : [];

  // Auto-expand first failing pair until the user interacts
  const autoExpandId = !hasInteracted
    ? (data?.pairs.find((p) => p.consecutiveFailures > 0)?.id ?? null)
    : null;
  const effectiveExpandedId = expandedId ?? autoExpandId;

  return (
    <>
      <Card>
        <SyncSchedulerHeader data={data} workerEnabled={workerEnabled} providerStats={providerStats} />
        <CardContent>
          <SyncSchedulerTable
            data={data}
            isLoading={isLoading}
            effectiveExpandedId={effectiveExpandedId}
            now={now}
            onToggle={(pairId) => {
              setHasInteracted(true);
              setExpandedId((prev) => prev === pairId ? null : pairId);
            }}
            onUserClick={setSelectedPair}
          />
        </CardContent>
      </Card>

      {selectedPair && (
        <UserDetailDialog
          userId={selectedPair.creatorAccountId}
          userHash={selectedPair.createdByHash}
          provider={selectedPair.creatorProvider as 'spotify' | 'tidal' | null}
          open={true}
          onOpenChange={(open) => !open && setSelectedPair(null)}
        />
      )}
    </>
  );
}
