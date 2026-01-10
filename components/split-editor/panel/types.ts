/**
 * Shared types for playlist panel subcomponents.
 */

import type { ApiError, AccessTokenExpiredError } from '@/lib/api/client';

/**
 * Union type for errors that can occur when loading a playlist.
 */
export type PlaylistPanelError = Error | ApiError | AccessTokenExpiredError;

/**
 * Grid template for track row skeleton and actual rows.
 * Matches the column layout in TableHeader and TrackRow.
 */
export const SKELETON_GRID_TEMPLATE =
  '20px 20px 28px minmax(100px, 3fr) minmax(60px, 1.5fr) minmax(60px, 1fr) 36px 36px 44px 52px';

/**
 * Default number of skeleton rows to show during loading.
 */
export const DEFAULT_SKELETON_ROW_COUNT = 12;
