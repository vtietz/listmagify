'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Mail, AlertTriangle, Copy, Check, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AccessRequest } from '../types';
import { useState, type ReactNode } from 'react';

interface AccessRequestDetailsDialogProps {
  request: AccessRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: number, status: string, notes?: string) => Promise<void>;
  activityLevel?: { label: string; color: string; icon: string; percentile: number } | null;
  eventCount?: number;
}

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  removed: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

function parseRedFlags(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
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
  const redFlags = parseRedFlags(request.red_flags);

  if (!open) return null;

  const handleCopy = async (text: string, fieldName: string) => {
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      return;
    }

    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleStatusUpdate = async (status: string) => {
    await onUpdateStatus(request.id, status);
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div className="bg-background rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-2xl font-bold">Access Request Details</h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>✕</Button>
          </div>
          <AccessRequestDetailsContent
            request={request}
            redFlags={redFlags}
            copiedField={copiedField}
            onCopy={handleCopy}
            activityLevel={activityLevel}
            eventCount={eventCount}
          />
          <div className="flex gap-2 pt-4 border-t">
            <AccessRequestStatusActions
              status={request.status}
              onApprove={() => handleStatusUpdate('approved')}
              onReject={() => handleStatusUpdate('rejected')}
              onRemove={() => setShowRemoveConfirm(true)}
            />
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </div>
      <RemoveAccessConfirmation
        open={showRemoveConfirm}
        name={request.name}
        onCancel={() => setShowRemoveConfirm(false)}
        onConfirm={async () => {
          await onUpdateStatus(request.id, 'removed');
          setShowRemoveConfirm(false);
          onOpenChange(false);
        }}
      />
    </div>
  );
}

function AccessRequestDetailsContent({
  request,
  redFlags,
  copiedField,
  onCopy,
  activityLevel,
  eventCount,
}: {
  request: AccessRequest;
  redFlags: string[];
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
  activityLevel: { label: string; color: string; icon: string; percentile: number } | null | undefined;
  eventCount: number | undefined;
}) {
  const showActivity = (request.status === 'approved' || request.status === 'removed') && activityLevel;

  return (
    <div className="space-y-4">
      {redFlags.length > 0 ? <RedFlagsAlert redFlags={redFlags} /> : null}

      <div>
        <div className="text-sm font-medium text-muted-foreground">Timestamp</div>
        <div>{new Date(request.ts).toLocaleString()}</div>
      </div>

      <CopyableInfoRow
        label="Name"
        value={request.name}
        fieldName="name"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <CopyableInfoRow
        label="Email"
        value={request.email}
        fieldName="email"
        copiedField={copiedField}
        onCopy={onCopy}
        icon={<Mail className="h-4 w-4" />}
      />

      {request.spotify_username ? (
        <CopyableInfoRow
          label="Spotify Username"
          value={request.spotify_username}
          fieldName="username"
          copiedField={copiedField}
          onCopy={onCopy}
        />
      ) : null}

      <div>
        <div className="text-sm font-medium text-muted-foreground">Status</div>
        <div className="flex items-center gap-3 mt-1">
          <span className={cn('inline-block px-3 py-1 rounded text-sm font-medium', STATUS_COLORS[request.status] || STATUS_COLORS.pending)}>
            {request.status}
          </span>
          {showActivity ? (
            <div className={cn('flex items-center gap-1.5 text-sm', activityLevel.color)}>
              <Activity className="h-4 w-4" />
              <span className="font-medium">{eventCount !== undefined && eventCount > 0 ? `${eventCount} events` : 'No activity'}</span>
              <span className="text-xs text-muted-foreground">({activityLevel.label})</span>
            </div>
          ) : null}
        </div>
      </div>

      {request.motivation ? (
        <TextBlock label="Motivation" className="p-3 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 rounded text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
          {request.motivation}
        </TextBlock>
      ) : null}

      {request.notes ? (
        <TextBlock label="Admin Notes" className="p-3 bg-muted rounded text-sm whitespace-pre-wrap">
          {request.notes}
        </TextBlock>
      ) : null}
    </div>
  );
}

function RedFlagsAlert({ redFlags }: { redFlags: string[] }) {
  return (
    <div className="bg-red-50 dark:bg-red-950 border-2 border-red-500 rounded-lg p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">Suspicious Patterns Detected</h3>
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
  );
}

function CopyableInfoRow({
  label,
  value,
  fieldName,
  copiedField,
  onCopy,
  icon,
}: {
  label: string;
  value: string;
  fieldName: string;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
  icon?: ReactNode;
}) {
  const isCopied = copiedField === fieldName;

  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <div className={cn('font-medium', icon ? 'font-mono text-sm flex items-center gap-2' : '')}>
          {icon}
          {value}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onCopy(value, fieldName)}
          title={`Copy ${label.toLowerCase()}`}
        >
          {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

function TextBlock({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className={className}>{children}</div>
    </div>
  );
}

function AccessRequestStatusActions({
  status,
  onApprove,
  onReject,
  onRemove,
}: {
  status: string;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
  onRemove: () => void;
}) {
  if (status === 'pending') {
    return (
      <>
        <Button onClick={onApprove} className="bg-green-600 hover:bg-green-700">
          <ActionLabel label="Approve" icon={<CheckCircle className="h-4 w-4" />} />
        </Button>
        <Button onClick={onReject} variant="destructive">
          <ActionLabel label="Reject" icon={<XCircle className="h-4 w-4" />} />
        </Button>
      </>
    );
  }

  if (status === 'approved') {
    return (
      <Button onClick={onRemove} variant="destructive">
        <ActionLabel label="Remove Access" icon={<XCircle className="h-4 w-4" />} />
      </Button>
    );
  }

  if (status === 'removed') {
    return (
      <Button onClick={onApprove} className="bg-green-600 hover:bg-green-700">
        <ActionLabel label="Re-activate Access" icon={<CheckCircle className="h-4 w-4" />} />
      </Button>
    );
  }

  return null;
}

function ActionLabel({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
      <Mail className="h-3.5 w-3.5" />
    </div>
  );
}

function RemoveAccessConfirmation({
  open,
  name,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-background rounded-lg shadow-lg max-w-md w-full m-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="bg-red-100 dark:bg-red-900/20 p-2 rounded-full">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-2">Remove Access</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to remove access for <strong>{name}</strong>?
            </p>
            <div className="bg-muted rounded-lg p-3 text-sm space-y-2">
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>User will receive an email notification</span>
              </p>
              <p className="text-muted-foreground">They can request access again later if needed.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <XCircle className="h-4 w-4 mr-2" />
            Remove Access
          </Button>
        </div>
      </div>
    </div>
  );
}
