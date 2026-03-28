import { useCallback, useEffect, useState } from 'react';
import { useMatchingConfigStore } from '@/lib/matching/useMatchingConfigStore';

interface UseConfigDialogDraftParams {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCompact: boolean;
  setCompact: (value: boolean) => void;
  isAutoScrollText: boolean;
  setAutoScrollText: (value: boolean) => void;
  isCompareEnabled: boolean;
  setCompareEnabled: (value: boolean) => void;
  supportsCompare: boolean;
}

interface ConfigDialogDraftState {
  draftConvertThreshold: number;
  setDraftConvertThreshold: (value: number) => void;
  draftCompact: boolean;
  setDraftCompact: (value: boolean | ((current: boolean) => boolean)) => void;
  draftAutoScrollText: boolean;
  setDraftAutoScrollText: (value: boolean | ((current: boolean) => boolean)) => void;
  draftCompareMode: boolean;
  setDraftCompareMode: (value: boolean | ((current: boolean) => boolean)) => void;
  handleSaveConfig: () => void;
}

export function useConfigDialogDraft({
  open,
  onOpenChange,
  isCompact,
  setCompact,
  isAutoScrollText,
  setAutoScrollText,
  isCompareEnabled,
  setCompareEnabled,
  supportsCompare,
}: UseConfigDialogDraftParams): ConfigDialogDraftState {
  const convertThreshold = useMatchingConfigStore((state) => state.convertThreshold);
  const setConvertThreshold = useMatchingConfigStore((state) => state.setConvertThreshold);

  const [draftConvertThreshold, setDraftConvertThreshold] = useState(convertThreshold);
  const [draftCompact, setDraftCompact] = useState(isCompact);
  const [draftAutoScrollText, setDraftAutoScrollText] = useState(isAutoScrollText);
  const [draftCompareMode, setDraftCompareMode] = useState(isCompareEnabled);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftConvertThreshold(convertThreshold);
    setDraftCompact(isCompact);
    setDraftAutoScrollText(isAutoScrollText);
    setDraftCompareMode(isCompareEnabled);
  }, [open, convertThreshold, isCompact, isAutoScrollText, isCompareEnabled]);

  const handleSaveConfig = useCallback(() => {
    setConvertThreshold(draftConvertThreshold);
    setCompact(draftCompact);
    setAutoScrollText(draftAutoScrollText);
    if (supportsCompare) {
      setCompareEnabled(draftCompareMode);
    }
    onOpenChange(false);
  }, [
    draftConvertThreshold,
    draftCompact,
    draftAutoScrollText,
    draftCompareMode,
    setConvertThreshold,
    setCompact,
    setAutoScrollText,
    setCompareEnabled,
    supportsCompare,
    onOpenChange,
  ]);

  return {
    draftConvertThreshold,
    setDraftConvertThreshold,
    draftCompact,
    setDraftCompact,
    draftAutoScrollText,
    setDraftAutoScrollText,
    draftCompareMode,
    setDraftCompareMode,
    handleSaveConfig,
  };
}
