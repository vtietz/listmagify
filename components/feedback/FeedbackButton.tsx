'use client';

import { MessageSquarePlus } from 'lucide-react';
import { FeedbackDialog } from './FeedbackDialog';
import { useDeviceType } from '@/hooks/useDeviceType';

/**
 * Floating feedback button that appears in the bottom-right corner.
 * Only visible on desktop - hidden on mobile/tablet (phone mode).
 */
export function FeedbackButton() {
  const { isPhone } = useDeviceType();

  // Don't render on phone - mobile users use menu entry instead
  if (isPhone) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <FeedbackDialog
        trigger={
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Send feedback"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span className="text-sm font-medium">Feedback</span>
          </button>
        }
      />
    </div>
  );
}
