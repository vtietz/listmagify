import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigDialogDraft } from '@/components/shell/config/useConfigDialogDraft';
import { useMatchingConfigStore } from '@/hooks/useMatchingConfigStore';
import {
  DEFAULT_MATCH_THRESHOLDS,
  MATCHING_CONFIG_STORAGE_KEY,
} from '@/lib/matching/config';

function createParams(overrides: Partial<Parameters<typeof useConfigDialogDraft>[0]> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    isCompact: false,
    setCompact: vi.fn(),
    isAutoScrollText: false,
    setAutoScrollText: vi.fn(),
    isCompareEnabled: false,
    setCompareEnabled: vi.fn(),
    supportsCompare: true,
    ...overrides,
  };
}

describe('useConfigDialogDraft', () => {
  beforeEach(() => {
    localStorage.removeItem(MATCHING_CONFIG_STORAGE_KEY);
    useMatchingConfigStore.setState({
      convertThreshold: DEFAULT_MATCH_THRESHOLDS.convert,
    });
    vi.clearAllMocks();
  });

  it('resets draft values when dialog is opened', () => {
    const initialProps = createParams({
      open: false,
      isCompact: false,
      isAutoScrollText: false,
      isCompareEnabled: false,
    });

    const { result, rerender } = renderHook(
      (props: Parameters<typeof useConfigDialogDraft>[0]) => useConfigDialogDraft(props),
      { initialProps }
    );

    act(() => {
      result.current.setDraftConvertThreshold(0.91);
      result.current.setDraftCompact(true);
      result.current.setDraftAutoScrollText(true);
      result.current.setDraftCompareMode(true);
    });

    useMatchingConfigStore.setState({ convertThreshold: 0.88 });

    rerender(
      createParams({
        open: true,
        isCompact: true,
        isAutoScrollText: true,
        isCompareEnabled: true,
      })
    );

    expect(result.current.draftConvertThreshold).toBe(0.88);
    expect(result.current.draftCompact).toBe(true);
    expect(result.current.draftAutoScrollText).toBe(true);
    expect(result.current.draftCompareMode).toBe(true);
  });

  it('applies draft values on save and closes dialog', () => {
    const params = createParams();
    const { result } = renderHook(() => useConfigDialogDraft(params));

    act(() => {
      result.current.setDraftConvertThreshold(0.9);
      result.current.setDraftCompact(true);
      result.current.setDraftAutoScrollText(true);
      result.current.setDraftCompareMode(true);
    });

    act(() => {
      result.current.handleSaveConfig();
    });

    expect(useMatchingConfigStore.getState().convertThreshold).toBe(0.9);
    expect(params.setCompact).toHaveBeenCalledWith(true);
    expect(params.setAutoScrollText).toHaveBeenCalledWith(true);
    expect(params.setCompareEnabled).toHaveBeenCalledWith(true);
    expect(params.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not apply compare mode when compare is unsupported', () => {
    const params = createParams({ supportsCompare: false });
    const { result } = renderHook(() => useConfigDialogDraft(params));

    act(() => {
      result.current.setDraftCompareMode(true);
      result.current.handleSaveConfig();
    });

    expect(params.setCompareEnabled).not.toHaveBeenCalled();
    expect(params.onOpenChange).toHaveBeenCalledWith(false);
  });
});
