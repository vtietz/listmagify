/**
 * Utility function for checking if a playlist is editable.
 */

import { apiFetch } from '@/lib/api/client';

export async function checkPlaylistEditable(playlistId: string): Promise<boolean> {
  try {
    const result = await apiFetch<{ isEditable: boolean }>(
      `/api/playlists/${playlistId}/permissions`
    );
    return result.isEditable;
  } catch (error) {
    console.error('Failed to check playlist permissions:', error);
    return false;
  }
}
