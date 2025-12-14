import { describe, it, expect, vi } from 'vitest';
import { scrollToIndexIfOutOfView } from '@/lib/utils/virtualScroll';

describe('scrollToIndexIfOutOfView', () => {
  const HEADER_HEIGHT = 40;
  const ROW_HEIGHT = 48;

  const getItemPosition = (index: number, headerHeight = HEADER_HEIGHT) => {
    const top = headerHeight + index * ROW_HEIGHT;
    return { top, bottom: top + ROW_HEIGHT };
  };

  const createMockVirtualizer = (scrollTop: number, clientHeight: number, withScrollToOffset = true) => {
    const base: any = {
      scrollElement: { scrollTop, clientHeight },
      scrollToIndex: vi.fn(),
    };

    if (withScrollToOffset) {
      base.scrollToOffset = vi.fn();
    }

    return base;
  };

  it('should scroll to start when target is above visible range', () => {
    const virtualizer = createMockVirtualizer(500, 400);
    scrollToIndexIfOutOfView(virtualizer, 5, HEADER_HEIGHT, ROW_HEIGHT);
    const { top } = getItemPosition(5);
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(top - HEADER_HEIGHT);
  });

  it('should scroll to end when target is below visible range', () => {
    const virtualizer = createMockVirtualizer(0, 300);
    scrollToIndexIfOutOfView(virtualizer, 6, HEADER_HEIGHT, ROW_HEIGHT);
    const { bottom } = getItemPosition(6);
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(bottom - 300);
  });

  it('should not scroll when target is within visible range', () => {
    const virtualizer = createMockVirtualizer(0, 400);
    scrollToIndexIfOutOfView(virtualizer, 3, HEADER_HEIGHT, ROW_HEIGHT);
    expect(virtualizer.scrollToOffset).not.toHaveBeenCalled();
  });

  it('should handle edge case at exact viewport boundary', () => {
    const virtualizer = createMockVirtualizer(1440, 376);
    scrollToIndexIfOutOfView(virtualizer, 37, HEADER_HEIGHT, ROW_HEIGHT);
    const { bottom } = getItemPosition(37);
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(bottom - 376);
  });

  it('should scroll immediately when next item is first outside viewport', () => {
    const virtualizer = createMockVirtualizer(938, 626);
    scrollToIndexIfOutOfView(virtualizer, 31, HEADER_HEIGHT, ROW_HEIGHT);
    const { bottom } = getItemPosition(31);
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(bottom - 626);
  });

  it('should handle scrollTop=0 edge case', () => {
    const virtualizer = createMockVirtualizer(0, 400);
    
    scrollToIndexIfOutOfView(virtualizer, 0, HEADER_HEIGHT, ROW_HEIGHT);
    expect(virtualizer.scrollToOffset).not.toHaveBeenCalled();
    
    vi.clearAllMocks();
    scrollToIndexIfOutOfView(virtualizer, 7, HEADER_HEIGHT, ROW_HEIGHT);
    const { bottom } = getItemPosition(7);
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(bottom - 400);
  });

  it('should work with custom header height', () => {
    const customHeader = 60;
    const virtualizer = createMockVirtualizer(0, 300);
    scrollToIndexIfOutOfView(virtualizer, 5, customHeader, ROW_HEIGHT);
    const { bottom } = getItemPosition(5, customHeader);
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(bottom - 300);
  });

  it('should fall back to auto when no scrollElement', () => {
    const virtualizer = {
      scrollElement: null,
      scrollToIndex: vi.fn(),
    } as any;
    scrollToIndexIfOutOfView(virtualizer, 5, HEADER_HEIGHT, ROW_HEIGHT);
    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(5, { align: 'auto' });
  });

  it('should fall back to scrollTop when scrollToOffset is unavailable', () => {
    const virtualizer = createMockVirtualizer(500, 400, false);
    scrollToIndexIfOutOfView(virtualizer, 5, HEADER_HEIGHT, ROW_HEIGHT);
    const { top } = getItemPosition(5);
    expect(virtualizer.scrollElement.scrollTop).toBe(top - HEADER_HEIGHT);
  });
});
