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
 * 
 * Mobile-specific toasts:
 *   toast.markerSet('Marker set at position 5');
 *   toast.reorderSuccess('Track moved to position 3');
 *   toast.performanceHint('6 panels open - consider closing some');
 */

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
 * Extended toast function with mobile-specific helpers
 */
interface ExtendedToastFunction extends ToastFunction {
  /** Toast for marker set/cleared - short duration with ARIA live announcement */
  markerSet: (message: string) => string | number;
  /** Toast for marker cleared */
  markerCleared: (message?: string) => string | number;
  /** Toast for successful reorder operation */
  reorderSuccess: (message: string) => string | number;
  /** Toast for performance hint (unobtrusive) */
  performanceHint: (message: string) => string | number;
  /** Toast for drag operation feedback */
  dragFeedback: (message: string, type?: 'copy' | 'move') => string | number;
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

// Lazy-load sonner to avoid server-side evaluation issues
// The actual sonner import happens only when toast functions are called (client-side only)
function getSonner() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('sonner') as { toast: ToastFunction; Toaster: ToasterComponent };
}

// Create a proxy that lazily accesses sonner's toast
const extendedToast: ExtendedToastFunction = Object.assign(
  function toastFn(message: string, options?: ToastOptions) {
    return getSonner().toast(message, options);
  },
  {
    success: (message: string, options?: ToastOptions) => getSonner().toast.success(message, options),
    error: (message: string, options?: ToastOptions) => getSonner().toast.error(message, options),
    info: (message: string, options?: ToastOptions) => getSonner().toast.info(message, options),
    warning: (message: string, options?: ToastOptions) => getSonner().toast.warning(message, options),
    loading: (message: string, options?: ToastOptions) => getSonner().toast.loading(message, options),
    promise: <T,>(
      promise: Promise<T>,
      options: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((error: Error) => string);
      }
    ) => getSonner().toast.promise(promise, options),
    dismiss: (id?: string | number) => getSonner().toast.dismiss(id),
    custom: (jsx: React.ReactNode, options?: ToastOptions) => getSonner().toast.custom(jsx, options),
    
    // Mobile-specific toast helpers
    markerSet: (message: string) => getSonner().toast.success(message, {
      duration: 2000,
      id: 'marker-action',
    }),
    
    markerCleared: (message = 'Marker cleared') => getSonner().toast.info(message, {
      duration: 2000,
      id: 'marker-action',
    }),
    
    reorderSuccess: (message: string) => getSonner().toast.success(message, {
      duration: 2000,
      id: 'reorder-action',
    }),
    
    performanceHint: (message: string) => getSonner().toast.info(message, {
      duration: 5000,
      id: 'performance-hint',
    }),
    
    dragFeedback: (message: string, type: 'copy' | 'move' = 'copy') => {
      const icon = type === 'copy' ? '📋' : '↔️';
      return getSonner().toast(`${icon} ${message}`, {
        duration: 1500,
        id: 'drag-feedback',
      });
    },
  }
) as ExtendedToastFunction;

/**
 * Typed toast function for showing notifications.
 * 
 * @example
 * toast.success('Playlist saved');
 * toast.error('Failed to save');
 * toast('Neutral message');
 * toast.markerSet('Marker set at position 5');
 * toast.performanceHint('Consider closing some panels');
 */
export const toast: ExtendedToastFunction = extendedToast;

/**
 * Toaster component for rendering toast notifications.
 * Place this once at the root of your application.
 * 
 * @example
 * <Toaster richColors position="top-right" duration={5000} />
 */
// Re-export Toaster directly from sonner to avoid SSR issues
// This works because Next.js handles the client-only import properly when used in JSX
export { Toaster } from 'sonner';
