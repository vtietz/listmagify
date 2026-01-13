'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ErrorReport } from '../types';

interface ErrorReportDetailsDialogProps {
  report: ErrorReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkResolved: (reportId: string, resolved: boolean) => Promise<void>;
}

export function ErrorReportDetailsDialog({
  report,
  open,
  onOpenChange,
  onMarkResolved,
}: ErrorReportDetailsDialogProps) {
  if (!open) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'error': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      default: return 'text-blue-500';
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      rate_limit: 'bg-yellow-100 text-yellow-800',
      auth: 'bg-red-100 text-red-800',
      network: 'bg-blue-100 text-blue-800',
      api: 'bg-purple-100 text-purple-800',
      validation: 'bg-orange-100 text-orange-800',
      unknown: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || colors.unknown;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" 
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="bg-background rounded-lg shadow-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto m-4" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-2xl font-bold">Error Report Details</h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>✕</Button>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Report ID</div>
              <div className="font-mono text-sm">{report.report_id}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Timestamp</div>
              <div>{new Date(report.ts).toLocaleString()}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">User</div>
              <div>{report.user_name || 'Anonymous'} {report.user_id ? `(${report.user_id})` : ''}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Category / Severity</div>
              <div className="flex gap-2 mt-1">
                <span className={cn("px-2 py-0.5 rounded text-xs font-medium", getCategoryBadge(report.error_category))}>
                  {report.error_category}
                </span>
                <span className={cn("px-2 py-0.5 rounded text-xs font-medium", getSeverityColor(report.error_severity))}>
                  {report.error_severity}
                </span>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Error Message</div>
              <div className="p-3 bg-muted rounded text-sm">{report.error_message}</div>
            </div>

            {report.error_details && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Details</div>
                <div className="p-3 bg-muted rounded text-sm whitespace-pre-wrap">{report.error_details}</div>
              </div>
            )}

            {report.user_description && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">User Description</div>
                <div className="p-3 bg-blue-50 border-l-4 border-blue-500 rounded text-sm">{report.user_description}</div>
              </div>
            )}

            {report.error_request_path && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Request Path</div>
                <div className="font-mono text-sm">{report.error_request_path}</div>
              </div>
            )}

            {report.error_status_code && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Status Code</div>
                <div>{report.error_status_code}</div>
              </div>
            )}

            {report.environment_json && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Environment</div>
                <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
                  {JSON.stringify(JSON.parse(report.environment_json), null, 2)}
                </pre>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={() => {
                  onMarkResolved(report.report_id, !report.resolved);
                  onOpenChange(false);
                }}
              >
                {report.resolved ? 'Mark as Unresolved' : 'Mark as Resolved'}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
