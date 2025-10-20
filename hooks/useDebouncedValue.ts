/**
 * Hook to debounce a value with a specified delay.
 * Useful for search inputs to reduce the frequency of updates.
 */

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay: number = 150): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
