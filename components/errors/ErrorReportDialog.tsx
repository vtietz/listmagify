"use client";

/**
 * Error Report Dialog Component
 * 
 * Displays error details and allows users to optionally send a report.
 * Shows a countdown timer for rate limit errors.
 */

import { useState, useEffect, useCallback } from "react";
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
import type { AppError, ErrorReport } from "@/lib/errors/types";
import { toast } from "@/lib/ui/toast";
import { AlertTriangle, Clock, Send, X, CheckCircle, Loader2 } from "lucide-react";

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
  
  const [userDescription, setUserDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Calculate time remaining for rate limit countdown
  useEffect(() => {
    if (!error?.retryAfter) {
      setTimeRemaining(null);
      return;
    }

    const calculateRemaining = () => {
      const retryAt = new Date(error.retryAfter!.retryAt).getTime();
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setTimeRemaining(remaining);
      return remaining;
    };

    calculateRemaining();
    const interval = setInterval(() => {
      if (calculateRemaining() <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [error?.retryAfter]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!dialogOpen) {
      setUserDescription("");
      setSubmitSuccess(false);
    }
  }, [dialogOpen]);

  const handleSubmitReport = useCallback(async () => {
    if (!error || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const report: ErrorReport = {
        error,
        userDescription: userDescription.trim() || undefined,
        environment: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          screenSize: `${window.screen.width}x${window.screen.height}`,
          timestamp: new Date().toISOString(),
        },
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
      };

      const response = await fetch("/api/error-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });

      if (response.ok) {
        setSubmitSuccess(true);
        markReported(error.id);
        // Auto-close after success
        setTimeout(() => {
          closeDialog();
        }, 2000);
      } else {
        const data = await response.json().catch(() => ({ message: 'Unknown error' }));
        toast.error(data.message || "Failed to submit error report");
        console.error("Failed to submit error report:", data);
      }
    } catch (err) {
      toast.error("Failed to submit error report. Please try again.");
      console.error("Error submitting report:", err);
    } finally {
      setIsSubmitting(false);
    }
  }, [error, userDescription, isSubmitting, markReported, closeDialog]);

  if (!error) return null;

  const { icon: SeverityIcon, color, bg } = getSeverityStyles(error.severity);
  const isRateLimit = error.category === "rate_limit";

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
          {/* Error message */}
          <div className="text-sm">
            <p className="font-medium text-foreground">{error.message}</p>
            {error.details && (
              <p className="mt-2 text-muted-foreground text-xs">{error.details}</p>
            )}
          </div>

          {/* Rate limit countdown */}
          {isRateLimit && timeRemaining !== null && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {timeRemaining > 0 ? "Time until retry:" : "Ready to retry!"}
                </p>
                {timeRemaining > 0 && (
                  <p className="text-lg font-mono text-primary">
                    {formatTimeRemaining(timeRemaining)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Request path if available */}
          {error.requestPath && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Request: </span>
              <code className="bg-muted px-1 py-0.5 rounded">{error.requestPath}</code>
            </div>
          )}

          {/* Success message */}
          {submitSuccess ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500">
              <CheckCircle className="h-4 w-4" />
              <p className="text-sm font-medium">Report sent successfully!</p>
            </div>
          ) : (
            /* User description input */
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="error-description">
                Additional details (optional)
              </label>
              <Textarea
                id="error-description"
                placeholder="Describe what you were doing when this error occurred..."
                value={userDescription}
                onChange={(e) => setUserDescription(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
              <p className="text-xs text-muted-foreground">
                This helps us understand and fix the issue faster.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={closeDialog}
            disabled={isSubmitting}
          >
            <X className="h-4 w-4 mr-2" />
            {submitSuccess ? "Close" : "Dismiss"}
          </Button>
          
          {!submitSuccess && (
            <Button
              onClick={handleSubmitReport}
              disabled={isSubmitting || error.reported}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {error.reported ? "Already Reported" : "Send Report"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
