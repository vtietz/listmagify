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

import { useEffect, useSyncExternalStore } from 'react';

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

const DEFAULT_DEVICE_INFO: DeviceInfo = {
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

function computeDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') return DEFAULT_DEVICE_INFO;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const deviceType = getDeviceType(width);
  const orientation = getOrientation(width, height);

  // Landscape phones use desktop layout for better space utilization
  // This makes isPhone=false so components render desktop mode
  const isPhoneLandscape = deviceType === 'phone' && orientation === 'landscape';
  const effectiveIsPhone = deviceType === 'phone' && !isPhoneLandscape;

  return {
    deviceType,
    orientation,
    hasTouch: checkTouchSupport(),
    isPhone: effectiveIsPhone,
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop' || isPhoneLandscape,
    maxPanels: MAX_PANELS_BY_DEVICE[deviceType],
    viewportWidth: width,
    viewportHeight: height,
  };
}

// ---------------------------------------------------------------------------
// Shared store
// ---------------------------------------------------------------------------

let currentDeviceInfo: DeviceInfo = DEFAULT_DEVICE_INFO;
let hasHydrated = false;
let listenersAttached = false;
const subscribers = new Set<() => void>();

function emitChange() {
  for (const callback of subscribers) callback();
}

function updateCurrentDeviceInfo(force: boolean = false) {
  if (typeof window === 'undefined') return;
  if (!hasHydrated && !force) return;

  const next = computeDeviceInfo();

  // Avoid spurious re-renders
  if (
    !force &&
    next.deviceType === currentDeviceInfo.deviceType &&
    next.orientation === currentDeviceInfo.orientation &&
    next.hasTouch === currentDeviceInfo.hasTouch &&
    next.viewportWidth === currentDeviceInfo.viewportWidth &&
    next.viewportHeight === currentDeviceInfo.viewportHeight
  ) {
    return;
  }

  currentDeviceInfo = next;
  emitChange();
}

function ensureWindowListeners() {
  if (typeof window === 'undefined') return;
  if (listenersAttached) return;
  listenersAttached = true;

  const handleChange = () => updateCurrentDeviceInfo();
  window.addEventListener('resize', handleChange);
  window.addEventListener('orientationchange', handleChange);
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  ensureWindowListeners();
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot(): DeviceInfo {
  return currentDeviceInfo;
}

function getServerSnapshot(): DeviceInfo {
  return DEFAULT_DEVICE_INFO;
}

/**
 * Hook to detect device type, orientation, and touch support.
 * Re-evaluates on window resize and orientation change.
 * 
 * IMPORTANT: Returns desktop defaults on first render to avoid hydration mismatch.
 * Actual device values are set after mount via useEffect.
 */
export function useDeviceType(): DeviceInfo {
  // Shared store means device detection happens once per page load,
  // instead of re-starting from defaults for each mounted component.
  // We still keep SSR markup stable by only switching to real values after mount.
  const deviceInfo = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    hasHydrated = true;
    ensureWindowListeners();
    updateCurrentDeviceInfo(true);
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
