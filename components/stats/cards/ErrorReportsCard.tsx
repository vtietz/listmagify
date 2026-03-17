'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ErrorReportDetailsDialog } from '../dialogs/ErrorReportDetailsDialog';
import { cn } from '@/lib/utils';
import type { ErrorReport, ErrorReportsResponse } from '../types';

interface ErrorReportsCardProps {
  dateRange: { from: string; to: string };
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-red-600';
    case 'error':
      return 'text-red-500';
    case 'warning':
      return 'text-yellow-500';
    default:
      return 'text-blue-500';
  }
}

function getCategoryBadge(category: string): string {
  const colors: Record<string, string> = {
    rate_limit: 'bg-yellow-100 text-yellow-800',
    auth: 'bg-red-100 text-red-800',
    network: 'bg-blue-100 text-blue-800',
    api: 'bg-purple-100 text-purple-800',
    validation: 'bg-orange-100 text-orange-800',
    unknown: 'bg-gray-100 text-gray-800',
  };
  return colors[category] ?? 'bg-gray-100 text-gray-800';
}

function ErrorReportsFilters({
  searchQuery,
  setSearchQuery,
  setPage,
  filter,
  setFilter,
  unresolvedCount,
  handleResolveAll,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  setPage: (value: number) => void;
  filter: 'all' | 'unresolved' | 'resolved';
  setFilter: (value: 'all' | 'unresolved' | 'resolved') => void;
  unresolvedCount: number;
  handleResolveAll: () => Promise<void>;
}) {
  const resetToFirstPage = () => setPage(0);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <div className="relative flex-1 sm:flex-initial">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search errors..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            resetToFirstPage();
          }}
          className="pl-9 h-8 w-full sm:w-48"
        />
      </div>
      <div className="flex items-center gap-1 border rounded-md">
        <Button
          size="sm"
          variant={filter === 'all' ? 'default' : 'ghost'}
          onClick={() => { setFilter('all'); resetToFirstPage(); }}
          className="h-8 flex-1 sm:flex-initial whitespace-nowrap"
        >
          All
        </Button>
        <Button
          size="sm"
          variant={filter === 'unresolved' ? 'default' : 'ghost'}
          onClick={() => { setFilter('unresolved'); resetToFirstPage(); }}
          className="h-8 flex-1 sm:flex-initial whitespace-nowrap"
        >
          Unresolved
        </Button>
        <Button
          size="sm"
          variant={filter === 'resolved' ? 'default' : 'ghost'}
          onClick={() => { setFilter('resolved'); resetToFirstPage(); }}
          className="h-8 flex-1 sm:flex-initial whitespace-nowrap"
        >
          Resolved
        </Button>
      </div>
      {unresolvedCount > 0 && filter !== 'resolved' && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleResolveAll}
          className="h-8 whitespace-nowrap"
        >
          Resolve All
        </Button>
      )}
    </div>
  );
}

function ErrorReportItem({
  report,
  onOpen,
  onToggleResolved,
}: {
  report: ErrorReport;
  onOpen: (report: ErrorReport) => void;
  onToggleResolved: (reportId: string, resolved: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors',
        report.resolved ? 'opacity-60' : '',
      )}
      onClick={() => onOpen(report)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getCategoryBadge(report.error_category))}>
              {report.error_category}
            </span>
            <span className={cn('text-xs font-medium', getSeverityColor(report.error_severity))}>
              {report.error_severity}
            </span>
            {report.resolved ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : null}
          </div>
          <p className="text-sm font-medium truncate">{report.error_message}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{new Date(report.ts).toLocaleString()}</span>
            <span>{report.user_name || 'Anonymous'}</span>
            <span className="truncate">{report.report_id}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onToggleResolved(report.report_id, !report.resolved);
          }}
        >
          {report.resolved ? 'Unresolve' : 'Resolve'}
        </Button>
      </div>
    </div>
  );
}

function ErrorReportsContent({
  isLoading,
  reports,
  onOpen,
  onToggleResolved,
}: {
  isLoading: boolean;
  reports: ErrorReport[];
  onOpen: (report: ErrorReport) => void;
  onToggleResolved: (reportId: string, resolved: boolean) => void;
}) {
  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (reports.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No error reports in this period</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reports.map((report: ErrorReport) => (
        <ErrorReportItem
          key={report.id}
          report={report}
          onOpen={onOpen}
          onToggleResolved={onToggleResolved}
        />
      ))}
    </div>
  );
}

function ErrorReportsPagination({
  pagination,
  page,
  pageSize,
  setPage,
}: {
  pagination: ErrorReportsResponse['pagination'] | undefined;
  page: number;
  pageSize: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  if (!pagination || pagination.total <= pageSize) {
    return null;
  }

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t">
      <div className="text-sm text-muted-foreground">
        Showing {pagination.offset + 1}-{Math.min(pagination.offset + pageSize, pagination.total)} of {pagination.total}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage((prev) => Math.max(0, prev - 1))}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage((prev) => prev + 1)}
          disabled={!pagination.hasMore}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ErrorReportsCard({ dateRange }: ErrorReportsCardProps) {
  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data, isLoading, refetch } = useQuery<ErrorReportsResponse>({
    queryKey: ['stats', 'error-reports', dateRangeKey, page, filter, searchQuery],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const offset = page * pageSize;
      const params = new URLSearchParams({
        from: dateRange.from,
        to: dateRange.to,
        limit: String(pageSize),
        offset: String(offset),
        ...(filter !== 'all' && { resolved: String(filter === 'resolved') }),
        ...(searchQuery && { search: searchQuery }),
      });
      const res = await fetch(`/api/stats/error-reports?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch error reports');
      return res.json();
    },
    refetchOnMount: true,
  });

  const reports = data?.data ?? [];
  const pagination = data?.pagination;
  const unresolvedCount = reports.filter((r: ErrorReport) => !r.resolved).length;

  const handleMarkResolved = async (reportId: string, resolved: boolean) => {
    try {
      const res = await fetch('/api/stats/error-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, resolved }),
      });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to update error report:', error);
    }
  };

  const handleResolveAll = async () => {
    if (!confirm('Mark all unresolved errors as resolved?')) return;
    
    try {
      const res = await fetch('/api/stats/error-reports/resolve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          from: dateRange.from, 
          to: dateRange.to 
        }),
      });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to resolve all errors:', error);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="h-4 w-4" />
                Error Reports
                {unresolvedCount > 0 && (
                  <span className="text-sm bg-red-100 text-red-800 px-2 py-1 rounded">
                    {unresolvedCount} unresolved
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                User-submitted error reports from the application
              </CardDescription>
            </div>
            <ErrorReportsFilters
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setPage={setPage}
              filter={filter}
              setFilter={setFilter}
              unresolvedCount={unresolvedCount}
              handleResolveAll={handleResolveAll}
            />
          </div>
        </CardHeader>
        <CardContent>
          <ErrorReportsContent
            isLoading={isLoading}
            reports={reports}
            onOpen={(report) => {
              setSelectedReport(report);
              setShowDetailsDialog(true);
            }}
            onToggleResolved={handleMarkResolved}
          />

          <ErrorReportsPagination
            pagination={pagination}
            page={page}
            pageSize={pageSize}
            setPage={setPage}
          />
        </CardContent>
      </Card>

      {showDetailsDialog && selectedReport && (
        <ErrorReportDetailsDialog
          report={selectedReport}
          open={showDetailsDialog}
          onOpenChange={setShowDetailsDialog}
          onMarkResolved={handleMarkResolved}
        />
      )}
    </>
  );
}
