/**
 * Hook for detecting small viewport height.
 * Used to decide between MiniPlayer and full player.
 * 
 * Threshold: 500px - below this, use MiniPlayer on desktop
 */

import { useState, useEffect } from 'react';

const SMALL_HEIGHT_THRESHOLD = 500;

export function useSmallViewportHeight() {
  const [isSmallHeight, setIsSmallHeight] = useState(false);

  useEffect(() => {
    // Check initial state
    const checkHeight = () => {
      setIsSmallHeight(window.innerHeight < SMALL_HEIGHT_THRESHOLD);
    };

    checkHeight();

    // Listen for resize events
    window.addEventListener('resize', checkHeight);
    
    // Also listen for orientation changes (mobile)
    window.addEventListener('orientationchange', () => {
      // Delay slightly as dimensions may not be updated immediately
      setTimeout(checkHeight, 100);
    });

    return () => {
      window.removeEventListener('resize', checkHeight);
      window.removeEventListener('orientationchange', checkHeight);
    };
  }, []);

  return isSmallHeight;
}
