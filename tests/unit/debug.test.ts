 what /**
 * Unit tests for Debug utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDebug, logDebug } from '@/lib/utils/debug';

describe('Debug Utilities', () => {
  let originalEnv: string | undefined;
  
  beforeEach(() => {
    // Save original env value
    originalEnv = process.env.NEXT_PUBLIC_DEBUG;
  });

  afterEach(() => {
    // Restore original env value
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DEBUG;
    } else {
      process.env.NEXT_PUBLIC_DEBUG = originalEnv;
    }
  });

  describe('isDebug', () => {
    it('should return true when NEXT_PUBLIC_DEBUG is "true"', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true';
      
      expect(isDebug()).toBe(true);
    });

    it('should return false when NEXT_PUBLIC_DEBUG is not set', () => {
      delete process.env.NEXT_PUBLIC_DEBUG;
      
      expect(isDebug()).toBe(false);
    });

    it('should return false when NEXT_PUBLIC_DEBUG is "false"', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'false';
      
      expect(isDebug()).toBe(false);
    });

    it('should return false for any non-"true" value', () => {
      process.env.NEXT_PUBLIC_DEBUG = '1';
      expect(isDebug()).toBe(false);
      
      process.env.NEXT_PUBLIC_DEBUG = 'yes';
      expect(isDebug()).toBe(false);
    });
  });

  describe('logDebug', () => {
    it('should call console.log when debug is enabled', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logDebug('Test message', { data: 'value' });
      
      expect(consoleSpy).toHaveBeenCalledWith('Test message', { data: 'value' });
      consoleSpy.mockRestore();
    });

    it('should not call console.log when debug is disabled', () => {
      delete process.env.NEXT_PUBLIC_DEBUG;
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logDebug('Test message', { data: 'value' });
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle multiple arguments', () => {
      process.env.NEXT_PUBLIC_DEBUG = 'true';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logDebug('Message', 123, true, { obj: 'data' });
      
      expect(consoleSpy).toHaveBeenCalledWith('Message', 123, true, { obj: 'data' });
      consoleSpy.mockRestore();
    });
  });
});
