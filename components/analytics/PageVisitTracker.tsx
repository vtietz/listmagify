/**
 * Page Visit Tracker
 * 
 * Client component that tracks page visits for analytics.
 * Automatically sends visit data on mount (client-side only).
 */

'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function PageVisitTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Track page visit
    const trackVisit = async () => {
      try {
        // Build full path with search params
        const query = searchParams?.toString();
        const fullPath = query ? `${pathname}?${query}` : pathname;
        
        await fetch('/api/track/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fullPath }),
        });
      } catch (error) {
        // Silently fail - tracking should never break the app
        console.debug('[PageVisitTracker] Failed to track visit:', error);
      }
    };

    trackVisit();
  }, [pathname, searchParams]);

  // This component renders nothing
  return null;
}
