/**
 * Hook for DnD mode preview based on Ctrl key and mouse hover state.
 */

'use client';

import { useState, useEffect } from 'react';

export function useDndModePreview(
  canMove: boolean,
  isDragSource: boolean | undefined,
  storedDndMode: 'move' | 'copy'
) {
  const [isMouseOver, setIsMouseOver] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  // Global Ctrl key tracking for mode preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(false);
    };
    const handleBlur = () => setIsCtrlPressed(false);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const isDragging = isDragSource !== undefined;
  const showCtrlInvert =
    isCtrlPressed &&
    canMove &&
    ((isDragging && isDragSource) || (!isDragging && isMouseOver));

  const dndMode = showCtrlInvert
    ? storedDndMode === 'copy'
      ? 'move'
      : 'copy'
    : storedDndMode;

  return {
    isMouseOver,
    setIsMouseOver,
    isCtrlPressed,
    dndMode,
  };
}
