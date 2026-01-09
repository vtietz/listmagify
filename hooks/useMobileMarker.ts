/**
 * Hook for managing mobile-friendly marker behavior.
 * 
 * On mobile devices, enforces single marker per panel to keep the UX simple.
 * Setting a new marker replaces the prior one.
 */

'use client';

import { useCallback } from 'react';
import { useInsertionPointsStore } from './useInsertionPointsStore';
import { useDeviceType } from './useDeviceType';
import { toast } from '@/lib/ui/toast';

export interface MobileMarkerActions {
  /** Set marker at position (replaces existing on mobile) */
  setMarker: (playlistId: string, position: number) => void;
  /** Remove marker from playlist */
  removeMarker: (playlistId: string) => void;
  /** Clear all markers */
  clearAllMarkers: () => void;
  /** Check if marker exists at position */
  hasMarkerAt: (playlistId: string, position: number) => boolean;
  /** Get marker position for playlist (first marker on desktop, only marker on mobile) */
  getMarkerPosition: (playlistId: string) => number | null;
  /** Whether device enforces single marker */
  isSingleMarkerMode: boolean;
}

/**
 * Hook for mobile-friendly marker management.
 * Enforces single marker per panel on phones/tablets.
 */
export function useMobileMarker(_playlistId: string | undefined): MobileMarkerActions {
  const { isPhone, isTablet: _isTablet } = useDeviceType();
  const { 
    markPoint, 
    clearPlaylist, 
    clearAll, 
    hasMarkerAt, 
    getMarkers 
  } = useInsertionPointsStore();

  // Single marker mode on phones (tablets can have multiple)
  const isSingleMarkerMode = isPhone;

  const setMarker = useCallback((targetPlaylistId: string, position: number) => {
    if (isSingleMarkerMode) {
      // Clear existing markers first
      clearPlaylist(targetPlaylistId);
    }
    markPoint(targetPlaylistId, position);
    
    // Announce for accessibility
    toast.success(`Marker set at position ${position + 1}`, { duration: 2000 });
  }, [isSingleMarkerMode, clearPlaylist, markPoint]);

  const removeMarker = useCallback((targetPlaylistId: string) => {
    clearPlaylist(targetPlaylistId);
    toast.info('Marker removed', { duration: 2000 });
  }, [clearPlaylist]);

  const clearAllMarkers = useCallback(() => {
    clearAll();
    toast.info('All markers cleared', { duration: 2000 });
  }, [clearAll]);

  const checkMarkerAt = useCallback((targetPlaylistId: string, position: number) => {
    return hasMarkerAt(targetPlaylistId, position);
  }, [hasMarkerAt]);

  const getMarkerPosition = useCallback((targetPlaylistId: string): number | null => {
    const markers = getMarkers(targetPlaylistId);
    if (markers.length === 0) return null;
    return markers[0]!.index;
  }, [getMarkers]);

  return {
    setMarker,
    removeMarker,
    clearAllMarkers,
    hasMarkerAt: checkMarkerAt,
    getMarkerPosition,
    isSingleMarkerMode,
  };
}

/**
 * Marker context menu actions for track rows.
 * Returns action handlers for context menu items.
 */
export interface MarkerContextActions {
  /** Add marker before this track */
  addMarkerBefore: () => void;
  /** Add marker after this track */
  addMarkerAfter: () => void;
  /** Remove marker at this position */
  removeMarkerHere: () => void;
  /** Whether there's a marker before this track */
  hasMarkerBefore: boolean;
  /** Whether there's a marker after this track */
  hasMarkerAfter: boolean;
}

export function useMarkerContextActions(
  playlistId: string | undefined,
  trackPosition: number,
  isEditable: boolean
): MarkerContextActions | null {
  const { setMarker, removeMarker: _removeMarker, hasMarkerAt, isSingleMarkerMode: _isSingleMarkerMode } = useMobileMarker(playlistId);

  if (!playlistId || !isEditable) {
    return null;
  }

  const hasMarkerBefore = hasMarkerAt(playlistId, trackPosition);
  const hasMarkerAfter = hasMarkerAt(playlistId, trackPosition + 1);

  return {
    addMarkerBefore: () => setMarker(playlistId, trackPosition),
    addMarkerAfter: () => setMarker(playlistId, trackPosition + 1),
    removeMarkerHere: () => {
      if (hasMarkerBefore) {
        // Remove marker before by unmarking at the position
        useInsertionPointsStore.getState().unmarkPoint(playlistId, trackPosition);
        toast.info('Marker removed', { duration: 2000 });
      } else if (hasMarkerAfter) {
        useInsertionPointsStore.getState().unmarkPoint(playlistId, trackPosition + 1);
        toast.info('Marker removed', { duration: 2000 });
      }
    },
    hasMarkerBefore,
    hasMarkerAfter,
  };
}
