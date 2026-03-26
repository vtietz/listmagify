import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_MATCH_THRESHOLDS,
  MATCHING_CONFIG_STORAGE_KEY,
  deriveManualThreshold,
  normalizeConvertThreshold,
} from '@/lib/matching/config';

interface MatchingConfigState {
  convertThreshold: number;
  setConvertThreshold: (value: number) => void;
}

export const useMatchingConfigStore = create<MatchingConfigState>()(
  persist(
    (set) => ({
      convertThreshold: DEFAULT_MATCH_THRESHOLDS.convert,
      setConvertThreshold: (value) => {
        set({ convertThreshold: normalizeConvertThreshold(value) });
      },
    }),
    {
      name: MATCHING_CONFIG_STORAGE_KEY,
      partialize: (state) => ({ convertThreshold: state.convertThreshold }),
    },
  ),
);

export function useDerivedManualThreshold(): number {
  const convertThreshold = useMatchingConfigStore((state) => state.convertThreshold);
  return deriveManualThreshold(convertThreshold);
}
