'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Mail, AlertTriangle, Copy, Check, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AccessRequest } from '../types';
import { useState } from 'react';

interface AccessRequestDetailsDialogProps {
  request: AccessRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: number, status: string, notes?: string) => Promise<void>;
  activityLevel?: { label: string; color: string; icon: string; percentile: number } | null;
  eventCount?: number;
}

export function AccessRequestDetailsDialog({
  request,
  open,
  onOpenChange,
  onUpdateStatus,
  activityLevel,
  eventCount,
}: AccessRequestDetailsDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  
  if (!open) return null;

  const redFlags = request.red_flags ? JSON.parse(request.red_flags) as string[] : [];
  
  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'removed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" 
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="bg-background rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-2xl font-bold">Access Request Details</h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>✕</Button>
          </div>
          
          <div className="space-y-4">
            {redFlags.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950 border-2 border-red-500 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                      Suspicious Patterns Detected
                    </h3>
                    <ul className="space-y-1 text-sm text-red-800 dark:text-red-200">
                      {redFlags.map((flag, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-red-500 mt-0.5">•</span>
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-muted-foreground">Timestamp</div>
              <div>{new Date(request.ts).toLocaleString()}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Name</div>
              <div className="flex items-center gap-2">
                <div className="font-medium">{request.name}</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => copyToClipboard(request.name, 'name')}
                  title="Copy name"
                >
                  {copiedField === 'name' ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Email</div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {request.email}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => copyToClipboard(request.email, 'email')}
                  title="Copy email"
                >
                  {copiedField === 'email' ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            {request.spotify_username && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Spotify Username</div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{request.spotify_username}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(request.spotify_username!, 'username')}
                    title="Copy username"
                  >
                    {copiedField === 'username' ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <div className="flex items-center gap-3 mt-1">
                <span className={cn("inline-block px-3 py-1 rounded text-sm font-medium", getStatusColor(request.status))}>
                  {request.status}
                </span>
                {(request.status === 'approved' || request.status === 'removed') && activityLevel && (
                  <div className={cn("flex items-center gap-1.5 text-sm", activityLevel.color)}>
                    <Activity className="h-4 w-4" />
                    <span className="font-medium">
                      {eventCount !== undefined && eventCount > 0 ? `${eventCount} events` : 'No activity'}
                    </span>
                    <span className="text-xs text-muted-foreground">({activityLevel.label})</span>
                  </div>
                )}
              </div>
            </div>

            {request.motivation && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Motivation</div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 rounded text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                  {request.motivation}
                </div>
              </div>
            )}

            {request.notes && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Admin Notes</div>
                <div className="p-3 bg-muted rounded text-sm whitespace-pre-wrap">{request.notes}</div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              {request.status === 'pending' && (
                <>
                  <Button
                    onClick={async () => {
                      await onUpdateStatus(request.id, 'approved');
                      onOpenChange(false);
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4" />
                      <span>Approve</span>
                      <Mail className="h-3.5 w-3.5" />
                    </div>
                  </Button>
                  <Button
                    onClick={async () => {
                      await onUpdateStatus(request.id, 'rejected');
                      onOpenChange(false);
                    }}
                    variant="destructive"
                  >
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-4 w-4" />
                      <span>Reject</span>
                      <Mail className="h-3.5 w-3.5" />
                    </div>
                  </Button>
                </>
              )}
              {request.status === 'approved' && (
                <Button
                  onClick={() => setShowRemoveConfirm(true)}
                  variant="destructive"
                >
                  <div className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4" />
                    <span>Remove Access</span>
                    <Mail className="h-3.5 w-3.5" />
                  </div>
                </Button>
              )}
              {request.status === 'removed' && (
                <Button
                  onClick={async () => {
                    await onUpdateStatus(request.id, 'approved');
                    onOpenChange(false);
                  }}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4" />
                    <span>Re-activate Access</span>
                    <Mail className="h-3.5 w-3.5" />
                  </div>
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Remove Access Confirmation Dialog */}
      {showRemoveConfirm && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" 
          onClick={() => setShowRemoveConfirm(false)}
        >
          <div 
            className="bg-background rounded-lg shadow-lg max-w-md w-full m-4 p-6" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-red-100 dark:bg-red-900/20 p-2 rounded-full">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">Remove Access</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you sure you want to remove access for <strong>{request.name}</strong>?
                </p>
                <div className="bg-muted rounded-lg p-3 text-sm space-y-2">
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>User will receive an email notification</span>
                  </p>
                  <p className="text-muted-foreground">
                    They can request access again later if needed.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowRemoveConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await onUpdateStatus(request.id, 'removed');
                  setShowRemoveConfirm(false);
                  onOpenChange(false);
                }}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Remove Access
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
