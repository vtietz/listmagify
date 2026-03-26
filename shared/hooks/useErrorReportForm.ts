import { useCallback, useEffect, useState } from 'react';
import type { AppError, ErrorReport } from '@/lib/errors/types';
import { toast } from '@/lib/ui/toast';

type UseErrorReportFormInput = {
  error: AppError | null;
  dialogOpen: boolean;
  closeDialog: () => void;
  markReported: (id: string) => void;
};

type ErrorReportEnvironment = NonNullable<ErrorReport['environment']>;

function buildEnvironment(): ErrorReportEnvironment {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    timestamp: new Date().toISOString(),
  };
}

function buildReport(error: AppError, userDescription: string): ErrorReport {
  const trimmedDescription = userDescription.trim();

  return {
    error,
    ...(trimmedDescription ? { userDescription: trimmedDescription } : {}),
    environment: buildEnvironment(),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  };
}

export function useErrorReportForm({
  error,
  dialogOpen,
  closeDialog,
  markReported,
}: UseErrorReportFormInput) {
  const [userDescription, setUserDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

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

  useEffect(() => {
    if (dialogOpen) {
      return;
    }

    setUserDescription('');
    setSubmitSuccess(false);
  }, [dialogOpen]);

  const handleSubmitReport = useCallback(async () => {
    if (!error || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const report = buildReport(error, userDescription);

      const response = await fetch('/api/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: 'Unknown error' }));
        toast.error(data.message || 'Failed to submit error report');
        console.error('Failed to submit error report:', data);
        return;
      }

      setSubmitSuccess(true);
      markReported(error.id);
      setTimeout(() => {
        closeDialog();
      }, 2000);
    } catch (err) {
      toast.error('Failed to submit error report. Please try again.');
      console.error('Error submitting report:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [closeDialog, error, isSubmitting, markReported, userDescription]);

  const handleCopyReport = useCallback(async () => {
    if (!error || isCopying) {
      return;
    }

    setIsCopying(true);

    try {
      const report = buildReport(error, userDescription);
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success('Error report copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy report to clipboard');
      console.error('Error copying report:', err);
    } finally {
      setIsCopying(false);
    }
  }, [error, isCopying, userDescription]);

  return {
    userDescription,
    setUserDescription,
    isSubmitting,
    isCopying,
    submitSuccess,
    timeRemaining,
    handleCopyReport,
    handleSubmitReport,
  };
}
