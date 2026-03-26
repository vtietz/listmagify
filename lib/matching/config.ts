import type { MusicProviderId } from '@/lib/music-provider/types';

export const DEFAULT_MATCH_THRESHOLDS = {
  convert: 0.82,
  manual: 0.72,
} as const;

export const MATCHING_CONFIG_STORAGE_KEY = 'matching-config-storage';

const MIN_CONVERT_THRESHOLD = 0.75;
const MAX_CONVERT_THRESHOLD = 0.95;
const MANUAL_GAP = 0.1;

function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}

export function normalizeConvertThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MATCH_THRESHOLDS.convert;
  }

  return roundTwo(Math.max(MIN_CONVERT_THRESHOLD, Math.min(MAX_CONVERT_THRESHOLD, value)));
}

export function deriveManualThreshold(convertThreshold: number): number {
  return roundTwo(Math.max(0.5, convertThreshold - MANUAL_GAP));
}

export function getConfiguredMatchThresholds(): { convert: number; manual: number } {
  if (typeof window === 'undefined') {
    return {
      convert: DEFAULT_MATCH_THRESHOLDS.convert,
      manual: DEFAULT_MATCH_THRESHOLDS.manual,
    };
  }

  try {
    const stored = window.localStorage.getItem(MATCHING_CONFIG_STORAGE_KEY);
    if (!stored) {
      return {
        convert: DEFAULT_MATCH_THRESHOLDS.convert,
        manual: DEFAULT_MATCH_THRESHOLDS.manual,
      };
    }

    const parsed = JSON.parse(stored) as { state?: { convertThreshold?: number } };
    const convert = normalizeConvertThreshold(parsed?.state?.convertThreshold ?? DEFAULT_MATCH_THRESHOLDS.convert);
    const manual = deriveManualThreshold(convert);

    return { convert, manual };
  } catch {
    return {
      convert: DEFAULT_MATCH_THRESHOLDS.convert,
      manual: DEFAULT_MATCH_THRESHOLDS.manual,
    };
  }
}

export function formatProviderName(providerId: MusicProviderId): string {
  return providerId === 'tidal' ? 'TIDAL' : 'Spotify';
}
