/**
 * Panel Virtualizer Registry Module
 * 
 * Manages registration and lookup of panel virtualizers for DnD operations.
 * Extracted from useDndOrchestrator for better modularity.
 */

import { useRef, useCallback } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { Track } from '@/lib/spotify/types';
import type { PanelVirtualizerData } from './types';

/**
 * Hook to manage panel virtualizer registration.
 * 
 * Provides a registry for panel virtualizers that can be used
 * for drop position calculations and auto-scrolling.
 * 
 * @returns Registry methods and ref to virtualizer data
 * 
 * @example
 * ```tsx
 * const { registerVirtualizer, unregisterVirtualizer, panelVirtualizersRef } = useVirtualizerRegistry();
 * 
 * // In panel component:
 * useEffect(() => {
 *   registerVirtualizer(panelId, virtualizer, scrollRef, tracks, isEditable);
 *   return () => unregisterVirtualizer(panelId);
 * }, [panelId, virtualizer, tracks, isEditable]);
 * ```
 */
export function useVirtualizerRegistry() {
  const panelVirtualizersRef = useRef<Map<string, PanelVirtualizerData>>(new Map());

  /**
   * Register a panel's virtualizer for drop calculations.
   */
  const registerVirtualizer = useCallback((
    panelId: string,
    virtualizer: Virtualizer<HTMLDivElement, Element>,
    scrollRef: { current: HTMLDivElement | null },
    filteredTracks: Track[],
    canDrop: boolean
  ) => {
    panelVirtualizersRef.current.set(panelId, { 
      virtualizer, 
      scrollRef, 
      filteredTracks, 
      canDrop 
    });
  }, []);

  /**
   * Unregister a panel's virtualizer when panel unmounts.
   */
  const unregisterVirtualizer = useCallback((panelId: string) => {
    panelVirtualizersRef.current.delete(panelId);
  }, []);

  /**
   * Get virtualizer data for a specific panel.
   */
  const getVirtualizerData = useCallback((panelId: string): PanelVirtualizerData | undefined => {
    return panelVirtualizersRef.current.get(panelId);
  }, []);

  /**
   * Get all registered panel IDs.
   */
  const getRegisteredPanelIds = useCallback((): string[] => {
    return Array.from(panelVirtualizersRef.current.keys());
  }, []);

  return {
    panelVirtualizersRef,
    registerVirtualizer,
    unregisterVirtualizer,
    getVirtualizerData,
    getRegisteredPanelIds,
  };
}
