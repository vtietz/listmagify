import { memo } from 'react';
import { TrackRowWithHooks } from './TrackRowWithHooks';

export { TrackRowInner } from './TrackRowInner';
export type { TrackRowProps, TrackRowSharedContext, TrackRowInnerProps } from './types';

export const TrackRow = memo(TrackRowWithHooks);
