/**
 * Hook for detecting device type and orientation.
 * Provides responsive breakpoints for phone, tablet, and desktop.
 * 
 * Breakpoints:
 * - Phone: <600px
 * - Tablet: ≥600px and <1024px
 * - Desktop: ≥1024px
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export type DeviceType = 'phone' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';

// Breakpoint thresholds (in pixels)
export const BREAKPOINTS = {
  PHONE_MAX: 600,
  TABLET_MAX: 1024,
} as const;

// Max panels per device type
export const MAX_PANELS_BY_DEVICE = {
  phone: 2,
  tablet: 16, // Soft limit, performance guidance above 6
  desktop: 16,
} as const;

// Performance warning threshold for tablets
export const TABLET_PERFORMANCE_WARNING_THRESHOLD = 6;

export interface DeviceInfo {
  /** Current device type based on viewport width */
  deviceType: DeviceType;
  /** Current orientation based on viewport dimensions */
  orientation: Orientation;
  /** Whether the device supports touch */
  hasTouch: boolean;
  /** Whether the device is a phone */
  isPhone: boolean;
  /** Whether the device is a tablet */
  isTablet: boolean;
  /** Whether the device is a desktop */
  isDesktop: boolean;
  /** Maximum panels allowed for current device */
  maxPanels: number;
  /** Viewport width */
  viewportWidth: number;
  /** Viewport height */
  viewportHeight: number;
}

/**
 * Determine device type from viewport width.
 */
function getDeviceType(width: number): DeviceType {
  if (width < BREAKPOINTS.PHONE_MAX) return 'phone';
  if (width < BREAKPOINTS.TABLET_MAX) return 'tablet';
  return 'desktop';
}

/**
 * Determine orientation from viewport dimensions.
 */
function getOrientation(width: number, height: number): Orientation {
  return width >= height ? 'landscape' : 'portrait';
}

/**
 * Check if the device supports touch.
 */
function checkTouchSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is IE-specific
    navigator.msMaxTouchPoints > 0
  );
}

/**
 * Hook to detect device type, orientation, and touch support.
 * Re-evaluates on window resize and orientation change.
 */
export function useDeviceType(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => {
    // SSR-safe defaults
    if (typeof window === 'undefined') {
      return {
        deviceType: 'desktop',
        orientation: 'landscape',
        hasTouch: false,
        isPhone: false,
        isTablet: false,
        isDesktop: true,
        maxPanels: MAX_PANELS_BY_DEVICE.desktop,
        viewportWidth: 1920,
        viewportHeight: 1080,
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const deviceType = getDeviceType(width);
    
    return {
      deviceType,
      orientation: getOrientation(width, height),
      hasTouch: checkTouchSupport(),
      isPhone: deviceType === 'phone',
      isTablet: deviceType === 'tablet',
      isDesktop: deviceType === 'desktop',
      maxPanels: MAX_PANELS_BY_DEVICE[deviceType],
      viewportWidth: width,
      viewportHeight: height,
    };
  });

  const updateDeviceInfo = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const deviceType = getDeviceType(width);
    
    setDeviceInfo({
      deviceType,
      orientation: getOrientation(width, height),
      hasTouch: checkTouchSupport(),
      isPhone: deviceType === 'phone',
      isTablet: deviceType === 'tablet',
      isDesktop: deviceType === 'desktop',
      maxPanels: MAX_PANELS_BY_DEVICE[deviceType],
      viewportWidth: width,
      viewportHeight: height,
    });
  }, []);

  useEffect(() => {
    // Listen for resize events
    window.addEventListener('resize', updateDeviceInfo);
    
    // Listen for orientation change (mobile browsers)
    window.addEventListener('orientationchange', updateDeviceInfo);

    // Cleanup
    return () => {
      window.removeEventListener('resize', updateDeviceInfo);
      window.removeEventListener('orientationchange', updateDeviceInfo);
    };
  }, [updateDeviceInfo]);

  // Sync with actual window dimensions on mount (after hydration)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const deviceType = getDeviceType(width);
      
      // Only update if different from initial SSR values
      if (width !== deviceInfo.viewportWidth || height !== deviceInfo.viewportHeight) {
        setDeviceInfo({
          deviceType,
          orientation: getOrientation(width, height),
          hasTouch: checkTouchSupport(),
          isPhone: deviceType === 'phone',
          isTablet: deviceType === 'tablet',
          isDesktop: deviceType === 'desktop',
          maxPanels: MAX_PANELS_BY_DEVICE[deviceType],
          viewportWidth: width,
          viewportHeight: height,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return deviceInfo;
}

/**
 * Get CSS class names for orientation-aware layouts.
 */
export function getOrientationClasses(deviceInfo: DeviceInfo): string {
  const classes: string[] = [];
  
  classes.push(`device-${deviceInfo.deviceType}`);
  classes.push(`orientation-${deviceInfo.orientation}`);
  
  if (deviceInfo.hasTouch) {
    classes.push('has-touch');
  }
  
  return classes.join(' ');
}

/**
 * Hook to get the preferred split orientation based on device and screen orientation.
 * - Phone portrait: vertical (top/bottom)
 * - Phone landscape: horizontal (left/right)
 * - Tablet portrait: vertical (stacked rows)
 * - Tablet landscape: horizontal (columns)
 * - Desktop: follows preference or defaults to horizontal
 */
export function usePreferredSplitOrientation(): 'horizontal' | 'vertical' {
  const { deviceType, orientation } = useDeviceType();
  
  if (deviceType === 'desktop') {
    return 'horizontal'; // Desktop keeps existing behavior
  }
  
  // Phone and tablet: orientation-aware
  return orientation === 'portrait' ? 'vertical' : 'horizontal';
}
