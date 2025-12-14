import type { Virtualizer } from '@tanstack/react-virtual';

/**
 * Scrolls to a virtualized row only when it is outside the visible viewport.
 * Uses index-based visibility checks to ensure immediate scrolling even when
 * the target item is not yet realized in the virtual items list.
 */
export function scrollToIndexIfOutOfView(
  virtualizer: Virtualizer<any, any>,
  targetIndex: number,
  headerOffset: number,
  rowHeight: number
) {
  const scrollElement = virtualizer.scrollElement;
  if (!scrollElement) {
    virtualizer.scrollToIndex(targetIndex, { align: 'auto' });
    return;
  }

  const scrollTop = scrollElement.scrollTop;
  const clientHeight = scrollElement.clientHeight;

  const itemTop = headerOffset + targetIndex * rowHeight;
  const itemBottom = itemTop + rowHeight;

  const visibleTop = scrollTop + headerOffset;
  const visibleBottom = scrollTop + clientHeight;

  if (itemTop < visibleTop) {
    // Align item fully into view at top (just below sticky header)
    const offset = itemTop - headerOffset;
    if (virtualizer.scrollToOffset) {
      virtualizer.scrollToOffset(offset);
    } else {
      scrollElement.scrollTop = offset;
    }
    return;
  }

  if (itemBottom > visibleBottom) {
    // Align item fully into view at bottom
    const offset = itemBottom - clientHeight;
    if (virtualizer.scrollToOffset) {
      virtualizer.scrollToOffset(offset);
    } else {
      scrollElement.scrollTop = offset;
    }
  }
}
