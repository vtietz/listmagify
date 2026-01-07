"use client";

/**
 * Global error store using Zustand.
 * Manages application-wide errors for display and reporting.
 */

import { create } from "zustand";
import type { AppError } from "./types";

interface ErrorState {
  /** Current errors (limited to most recent) */
  errors: AppError[];
  /** Error currently shown in dialog (for user interaction) */
  activeError: AppError | null;
  /** Whether the error dialog is open */
  dialogOpen: boolean;
  /** Add a new error */
  addError: (error: AppError) => void;
  /** Mark error as notified */
  markNotified: (errorId: string) => void;
  /** Mark error as reported */
  markReported: (errorId: string) => void;
  /** Remove an error */
  removeError: (errorId: string) => void;
  /** Clear all errors */
  clearErrors: () => void;
  /** Open dialog for a specific error */
  openDialog: (error: AppError) => void;
  /** Close the error dialog */
  closeDialog: () => void;
  /** Get unnotified errors */
  getUnnotifiedErrors: () => AppError[];
}

const MAX_ERRORS = 50;

export const useErrorStore = create<ErrorState>((set, get) => ({
  errors: [],
  activeError: null,
  dialogOpen: false,

  addError: (error) =>
    set((state) => {
      // Deduplicate by message and category within a time window
      const recentDuplicate = state.errors.find(
        (e) =>
          e.message === error.message &&
          e.category === error.category &&
          Date.now() - new Date(e.timestamp).getTime() < 60_000 // 1 minute
      );

      if (recentDuplicate) {
        // Update existing error timestamp instead of adding duplicate
        return {
          errors: state.errors.map((e) =>
            e.id === recentDuplicate.id
              ? { ...e, timestamp: error.timestamp }
              : e
          ),
        };
      }

      // Add new error, keeping only the most recent
      const newErrors = [error, ...state.errors].slice(0, MAX_ERRORS);
      return { errors: newErrors };
    }),

  markNotified: (errorId) =>
    set((state) => ({
      errors: state.errors.map((e) =>
        e.id === errorId ? { ...e, userNotified: true } : e
      ),
    })),

  markReported: (errorId) =>
    set((state) => ({
      errors: state.errors.map((e) =>
        e.id === errorId ? { ...e, reported: true } : e
      ),
      activeError:
        state.activeError?.id === errorId
          ? { ...state.activeError, reported: true }
          : state.activeError,
    })),

  removeError: (errorId) =>
    set((state) => ({
      errors: state.errors.filter((e) => e.id !== errorId),
      activeError:
        state.activeError?.id === errorId ? null : state.activeError,
      dialogOpen:
        state.activeError?.id === errorId ? false : state.dialogOpen,
    })),

  clearErrors: () =>
    set({
      errors: [],
      activeError: null,
      dialogOpen: false,
    }),

  openDialog: (error) =>
    set({
      activeError: error,
      dialogOpen: true,
    }),

  closeDialog: () =>
    set({
      dialogOpen: false,
    }),

  getUnnotifiedErrors: () => get().errors.filter((e) => !e.userNotified),
}));

/**
 * Convenience function to add an error from anywhere in the app.
 * Can be used outside of React components.
 */
export function reportError(error: AppError): void {
  useErrorStore.getState().addError(error);
}

/**
 * Subscribe to new errors for showing notifications.
 * Returns unsubscribe function.
 */
export function subscribeToErrors(
  callback: (error: AppError) => void
): () => void {
  return useErrorStore.subscribe((state, prevState) => {
    // Find newly added errors
    const newErrors = state.errors.filter(
      (e) => !prevState.errors.find((pe) => pe.id === e.id)
    );
    newErrors.forEach(callback);
  });
}
