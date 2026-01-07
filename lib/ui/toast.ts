/**
 * Toast notification wrapper for sonner.
 * 
 * This module provides a typed interface to sonner's toast notifications,
 * working around TypeScript compatibility issues with verbatimModuleSyntax.
 * 
 * Usage:
 *   import { toast } from '@/lib/ui/toast';
 *   toast.success('Operation completed');
 *   toast.error('Something went wrong');
 */

// Import sonner with require to bypass verbatimModuleSyntax issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sonner = require('sonner') as { toast: ToastFunction; Toaster: ToasterComponent };

/**
 * Toast options supported by sonner
 */
export interface ToastOptions {
  id?: string | number;
  duration?: number;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  cancel?: {
    label: string;
    onClick?: () => void;
  };
  onDismiss?: () => void;
  onAutoClose?: () => void;
}

/**
 * Toast function type matching sonner's API
 */
interface ToastFunction {
  (message: string, options?: ToastOptions): string | number;
  success: (message: string, options?: ToastOptions) => string | number;
  error: (message: string, options?: ToastOptions) => string | number;
  info: (message: string, options?: ToastOptions) => string | number;
  warning: (message: string, options?: ToastOptions) => string | number;
  loading: (message: string, options?: ToastOptions) => string | number;
  promise: <T>(
    promise: Promise<T>,
    options: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: Error) => string);
    }
  ) => Promise<T>;
  dismiss: (id?: string | number) => void;
  custom: (jsx: React.ReactNode, options?: ToastOptions) => string | number;
}

/**
 * Toaster component props
 */
export interface ToasterProps {
  richColors?: boolean;
  position?: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center';
  duration?: number;
  theme?: 'light' | 'dark' | 'system';
  closeButton?: boolean;
  expand?: boolean;
  visibleToasts?: number;
  offset?: string | number;
  gap?: number;
  toastOptions?: ToastOptions;
}

/**
 * Toaster component type
 */
type ToasterComponent = React.ComponentType<ToasterProps>;

/**
 * Typed toast function for showing notifications.
 * 
 * @example
 * toast.success('Playlist saved');
 * toast.error('Failed to save');
 * toast('Neutral message');
 */
export const toast: ToastFunction = sonner.toast;

/**
 * Toaster component for rendering toast notifications.
 * Place this once at the root of your application.
 * 
 * @example
 * <Toaster richColors position="top-right" duration={5000} />
 */
export const Toaster: ToasterComponent = sonner.Toaster;
