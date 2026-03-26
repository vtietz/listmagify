'use client';

import { useEffect, useMemo, useState } from 'react';

export function useContextMenuPosition(position?: { x: number; y: number }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const menuPosition = useMemo(() => {
    if (!position || !mounted) return null;

    const viewportWidth = window.innerWidth;
    const padding = 8;

    // Estimate width for initial horizontal clamping.
    const menuWidth = 220;

    let left = position.x;
    if (left + menuWidth > viewportWidth - padding) {
      left = Math.max(padding, viewportWidth - menuWidth - padding);
    }

    // Keep top near trigger; final vertical clamping is done after measuring actual menu height.
    const top = Math.max(padding, position.y);

    return { left, top };
  }, [position, mounted]);

  return { mounted, menuPosition };
}
