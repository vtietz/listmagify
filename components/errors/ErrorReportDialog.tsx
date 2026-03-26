"use client";

/**
 * Error Report Dialog Component
 * 
 * Displays error details and allows users to optionally send a report.
 * Shows a countdown timer for rate limit errors.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useErrorStore } from "@/lib/errors/store";
import type { AppError } from "@/lib/errors/types";
import { useErrorReportForm } from "@/hooks/dialogs/useErrorReportForm";
import { AlertTriangle, CheckCircle, ClipboardCopy, Clock, Loader2, Send, X } from "lucide-react";

/**
 * Format seconds into human-readable time
 */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "Ready to retry";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Get icon and color for error severity
 */
function getSeverityStyles(severity: AppError["severity"]) {
  switch (severity) {
    case "critical":
      return { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" };
    case "error":
      return { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/10" };
    case "warning":
      return { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10" };
    case "info":
    default:
      return { icon: AlertTriangle, color: "text-blue-500", bg: "bg-blue-500/10" };
  }
}

/**
 * Get human-readable category name
 */
function getCategoryLabel(category: AppError["category"]): string {
  switch (category) {
    case "rate_limit":
      return "Rate Limit";
    case "auth":
      return "Authentication";
    case "network":
      return "Network";
    case "api":
      return "API Error";
    case "validation":
      return "Validation";
    default:
      return "Error";
  }
}

interface ErrorReportDialogProps {
  /** Override for testing */
  testError?: AppError;
}

export function ErrorReportDialog({ testError }: ErrorReportDialogProps) {
  const { activeError, dialogOpen, closeDialog, markReported } = useErrorStore();
  const error = testError || activeError;
  const {
    userDescription,
    setUserDescription,
    isSubmitting,
    isCopying,
    submitSuccess,
    timeRemaining,
    handleCopyReport,
    handleSubmitReport,
  } = useErrorReportForm({
    error,
    dialogOpen,
    closeDialog,
    markReported,
  });

  if (!error) return null;

  const { icon: SeverityIcon, color, bg } = getSeverityStyles(error.severity);
  const isRateLimit = error.category === "rate_limit";
  const showRetryTimer = isRateLimit && timeRemaining !== null;

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${bg}`}>
              <SeverityIcon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                {getCategoryLabel(error.category)}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {new Date(error.timestamp).toLocaleString()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <ErrorMessageSection message={error.message} details={error.details} />
          {showRetryTimer ? <RetryCountdownSection timeRemaining={timeRemaining} /> : null}
          {error.requestPath ? <RequestPathSection requestPath={error.requestPath} /> : null}
          <ReportDetailsSection
            submitSuccess={submitSuccess}
            userDescription={userDescription}
            onDescriptionChange={setUserDescription}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogActions
            submitSuccess={submitSuccess}
            isSubmitting={isSubmitting}
            isCopying={isCopying}
            reported={error.reported}
            onClose={closeDialog}
            onCopy={handleCopyReport}
            onSubmit={handleSubmitReport}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorMessageSection({ message, details }: { message: string; details: string | undefined }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-foreground">{message}</p>
      {details ? <p className="mt-2 text-muted-foreground text-xs">{details}</p> : null}
    </div>
  );
}

function RetryCountdownSection({ timeRemaining }: { timeRemaining: number | null }) {
  if (timeRemaining === null) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-sm font-medium">{timeRemaining > 0 ? 'Time until retry:' : 'Ready to retry!'}</p>
        {timeRemaining > 0 ? (
          <p className="text-lg font-mono text-primary">{formatTimeRemaining(timeRemaining)}</p>
        ) : null}
      </div>
    </div>
  );
}

function RequestPathSection({ requestPath }: { requestPath: string }) {
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium">Request: </span>
      <code className="bg-muted px-1 py-0.5 rounded">{requestPath}</code>
    </div>
  );
}

function ReportDetailsSection({
  submitSuccess,
  userDescription,
  onDescriptionChange,
}: {
  submitSuccess: boolean;
  userDescription: string;
  onDescriptionChange: (value: string) => void;
}) {
  if (submitSuccess) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500">
        <CheckCircle className="h-4 w-4" />
        <p className="text-sm font-medium">Report sent successfully!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="error-description">
        Additional details (optional)
      </label>
      <Textarea
        id="error-description"
        placeholder="Describe what you were doing when this error occurred..."
        value={userDescription}
        onChange={(e) => onDescriptionChange(e.target.value)}
        rows={3}
        className="resize-none text-sm"
      />
      <p className="text-xs text-muted-foreground">This helps us understand and fix the issue faster.</p>
    </div>
  );
}

function DialogActions({
  submitSuccess,
  isSubmitting,
  isCopying,
  reported,
  onClose,
  onCopy,
  onSubmit,
}: {
  submitSuccess: boolean;
  isSubmitting: boolean;
  isCopying: boolean;
  reported: boolean;
  onClose: () => void;
  onCopy: () => Promise<void>;
  onSubmit: () => Promise<void>;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
        <X className="h-4 w-4 mr-2" />
        {submitSuccess ? 'Close' : 'Dismiss'}
      </Button>

      {!submitSuccess ? (
        <>
          <Button variant="outline" onClick={onCopy} disabled={isSubmitting || isCopying}>
            {isCopying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardCopy className="h-4 w-4 mr-2" />}
            Copy report
          </Button>

          <Button onClick={onSubmit} disabled={isSubmitting || reported}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {reported ? 'Already Reported' : 'Send Report'}
          </Button>
        </>
      ) : null}
    </>
  );
}
