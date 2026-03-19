import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check if all words in the query appear in the text (in any order).
 * This allows "Intro Chill" to match "DJ Intro & Chill".
 * 
 * @param text - The text to search in
 * @param query - The search query (space-separated words)
 * @returns true if all query words are found in the text
 */
export function matchesAllWords(text: string, query: string): boolean {
  const textLower = text.toLowerCase();
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  
  if (queryWords.length === 0) return true;
  
  return queryWords.every(word => textLower.includes(word));
}

/**
 * Feature flag for the per-provider auth UX rollout.
 *
 * Order of precedence:
 * 1) NEXT_PUBLIC_ALLOW_PER_PANEL_INLINE_LOGIN
 * 2) ALLOW_PER_PANEL_INLINE_LOGIN (server/runtime fallback)
 * 3) defaults: true in development, false otherwise
 */
export function isPerPanelInlineLoginEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ALLOW_PER_PANEL_INLINE_LOGIN
    ?? process.env.ALLOW_PER_PANEL_INLINE_LOGIN;

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  return process.env.NODE_ENV === 'development';
}
