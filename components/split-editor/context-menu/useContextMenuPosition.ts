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
    const viewportHeight = window.innerHeight;
    const padding = 8;

    // Estimate menu dimensions (actual width ~200px, height varies)
    const menuWidth = 220;
    const menuHeight = 450; // Conservative estimate for full menu

    let left = position.x;
    if (left + menuWidth > viewportWidth - padding) {
      left = Math.max(padding, viewportWidth - menuWidth - padding);
    }

    let top = position.y;
    if (top + menuHeight > viewportHeight - padding) {
      top = Math.max(padding, viewportHeight - menuHeight - padding);
    }

    return { left, top };
  }, [position, mounted]);

  return { mounted, menuPosition };
}
