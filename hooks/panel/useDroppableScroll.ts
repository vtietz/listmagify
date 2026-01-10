/**
 * Hook for droppable scroll area with combined ref callback.
 */

'use client';

import { useRef, useCallback, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';

export function useDroppableScroll(
  panelId: string,
  playlistId: string | null | undefined,
  canDropBasic: boolean
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  // Panel-level droppable
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `panel-${panelId}`,
    disabled: !canDropBasic,
    data: { type: 'panel', panelId, playlistId },
  });

  // Combined ref callback for scroll container
  const scrollDroppableRef = useCallback(
    (el: HTMLDivElement | null) => {
      (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      setDroppableRef(el);
      setScrollElement(el);
    },
    [setDroppableRef]
  );

  return {
    scrollRef,
    scrollElement,
    scrollDroppableRef,
  };
}
