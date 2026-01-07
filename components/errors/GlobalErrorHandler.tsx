"use client";

/**
 * Global Error Handler Provider
 * 
 * Listens for errors in the error store and shows appropriate notifications.
 * Renders the ErrorReportDialog for user interaction.
 */

import { useEffect } from "react";
import { subscribeToErrors, useErrorStore } from "@/lib/errors/store";
import type { AppError } from "@/lib/errors/types";
import { toast } from "@/lib/ui/toast";
import { ErrorReportDialog } from "./ErrorReportDialog";

/**
 * Get toast duration based on error severity
 */
function getToastDuration(error: AppError): number {
  switch (error.severity) {
    case "critical":
      return 10000; // 10 seconds
    case "error":
      return 7000;
    case "warning":
      return 5000;
    default:
      return 4000;
  }
}

/**
 * Get toast type based on error severity
 */
function showErrorToast(error: AppError) {
  const duration = getToastDuration(error);
  const { openDialog, markNotified } = useErrorStore.getState();
  
  // Create action to view details
  const action = {
    label: "View Details",
    onClick: () => {
      openDialog(error);
    },
  };

  switch (error.severity) {
    case "critical":
    case "error":
      toast.error(error.message, {
        id: `error-${error.id}`,
        duration,
        action,
      });
      break;
    case "warning":
      toast.warning(error.message, {
        id: `error-${error.id}`,
        duration,
        action,
      });
      break;
    default:
      toast.info(error.message, {
        id: `error-${error.id}`,
        duration,
        action,
      });
  }

  markNotified(error.id);
}

/**
 * Global Error Handler Component
 * 
 * Place this component once in your app (in Providers or layout).
 * It will:
 * - Listen for new errors and show toast notifications
 * - Render the ErrorReportDialog for detailed error viewing
 * - Allow users to report errors
 */
export function GlobalErrorHandler() {
  // Subscribe to new errors
  useEffect(() => {
    const unsubscribe = subscribeToErrors((error) => {
      // Don't auto-show toast for already notified errors
      if (error.userNotified) return;
      
      showErrorToast(error);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return <ErrorReportDialog />;
}
