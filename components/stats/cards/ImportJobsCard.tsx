'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Download } from 'lucide-react';
import { UserDetailDialog } from '../UserDetailDialog';

interface ImportPlaylist {
  sourcePlaylistName: string;
  status: string;
  trackCount: number;
  tracksAdded: number;
  tracksUnresolved: number;
  errorMessage: string | null;
}

interface ImportJob {
  id: string;
  sourceProvider: string;
  targetProvider: string;
  status: string;
  createdByHash: string;
  createdByRaw: string;
  creatorProvider: string;
  creatorAccountId: string;
  createdAt: string;
  completedAt: string | null;
  playlists: ImportPlaylist[];
  totalPlaylists: number;
  completedPlaylists: number;
}

interface ImportJobsCardProps {
  data?: ImportJob[];
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

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '—';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function getJobStatusDot(status: string): string {
  switch (status) {
    case 'done':
    case 'completed':
      return 'bg-green-500';
    case 'failed':
    case 'error':
      return 'bg-red-500';
    case 'running':
    case 'in_progress':
      return 'bg-blue-500';
    case 'pending':
    case 'queued':
      return 'bg-yellow-500';
    case 'partial':
      return 'bg-orange-500';
    default:
      return 'bg-gray-400';
  }
}

function getPlaylistStatusBadge(status: string): string {
  switch (status) {
    case 'done':
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400';
    case 'failed':
    case 'error':
      return 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400';
    case 'running':
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400';
    case 'pending':
    case 'queued':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400';
    case 'partial':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-950/30 dark:text-gray-400';
  }
}

function ImportJobDrilldown({ job }: { job: ImportJob }) {
  const totalUnresolved = job.playlists.reduce((sum, pl) => sum + pl.tracksUnresolved, 0);

  return (
    <tr>
      <td colSpan={7} className="px-3 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Playlist</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-right">Tracks</th>
                <th className="px-2 py-1.5 text-right">Added</th>
                <th className="px-2 py-1.5 text-right">Unresolved</th>
                <th className="px-2 py-1.5 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {job.playlists.map((pl, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="px-2 py-1.5 font-medium">{pl.sourcePlaylistName}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        getPlaylistStatusBadge(pl.status),
                      )}
                    >
                      {pl.status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{pl.trackCount}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{pl.tracksAdded}</td>
                  <td className="px-2 py-1.5 text-right">
                    {pl.tracksUnresolved > 0 ? (
                      <span className="text-orange-500">{pl.tracksUnresolved}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {pl.errorMessage ? (
                      <span className="text-red-500 truncate block max-w-[200px]" title={pl.errorMessage}>
                        {pl.errorMessage}
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
        {totalUnresolved > 0 && (
          <div className="mt-2 text-[10px] text-orange-500">
            {totalUnresolved} track{totalUnresolved !== 1 ? 's' : ''} could not be matched across providers
          </div>
        )}
      </td>
    </tr>
  );
}

function ImportJobRow({
  job,
  expanded,
  onToggle,
  onUserClick,
}: {
  job: ImportJob;
  expanded: boolean;
  onToggle: () => void;
  onUserClick: (job: ImportJob) => void;
}) {
  const totalUnresolved = job.playlists.reduce((sum, pl) => sum + pl.tracksUnresolved, 0);

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
              getJobStatusDot(job.status),
            )}
          />
        </td>
        <td className="px-3 py-2">
          <span className="font-medium">{job.sourceProvider}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="font-medium">{job.targetProvider}</span>
        </td>
        <td className="px-3 py-2 text-muted-foreground">
          {job.completedPlaylists}/{job.totalPlaylists}
        </td>
        <td className="px-3 py-2">
          {totalUnresolved > 0 ? (
            <span className="text-orange-500 font-medium">{totalUnresolved}</span>
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
        </td>
        <td className="px-3 py-2 text-muted-foreground">{timeAgo(job.createdAt)}</td>
        <td className="px-3 py-2 text-muted-foreground">
          {formatDuration(job.createdAt, job.completedAt)}
        </td>
        <td className="px-3 py-2">
          <button
            className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
            title={job.createdByHash}
            onClick={(e) => {
              e.stopPropagation();
              onUserClick(job);
            }}
          >
            {job.createdByHash.slice(0, 12)}...
          </button>
        </td>
      </tr>
      {expanded && <ImportJobDrilldown job={job} />}
    </>
  );
}

export function ImportJobsCard({ data, isLoading }: ImportJobsCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Import Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : !data || data.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No import jobs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left w-8"></th>
                    <th className="px-3 py-2 text-left">Providers</th>
                    <th className="px-3 py-2 text-left">Playlists</th>
                    <th className="px-3 py-2 text-left">Unresolved</th>
                    <th className="px-3 py-2 text-left">Created</th>
                    <th className="px-3 py-2 text-left">Duration</th>
                    <th className="px-3 py-2 text-left">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((job) => (
                    <ImportJobRow
                      key={job.id}
                      job={job}
                      expanded={expandedId === job.id}
                      onToggle={() =>
                        setExpandedId((prev) => (prev === job.id ? null : job.id))
                      }
                      onUserClick={setSelectedJob}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedJob && (
        <UserDetailDialog
          userId={selectedJob.creatorAccountId}
          userHash={selectedJob.createdByHash}
          provider={selectedJob.creatorProvider as 'spotify' | 'tidal' | null}
          open={true}
          onOpenChange={(open) => !open && setSelectedJob(null)}
        />
      )}
    </>
  );
}
