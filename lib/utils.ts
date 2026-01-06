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
