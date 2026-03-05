import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import {
  computeEffectiveMode,
  computeVisibleCount,
  getOverflowButtonWidth,
} from './measure';
import type { AdaptiveNavProps, EffectiveDisplayMode, NavItem } from './types';

type UseOverflowMeasurementParams = {
  containerRef: RefObject<HTMLDivElement | null>;
  inlineItems: NavItem[];
  displayMode: AdaptiveNavProps['displayMode'];
  layoutMode: AdaptiveNavProps['layoutMode'];
};

type UseOverflowMeasurementResult = {
  visibleCount: number;
  effectiveMode: EffectiveDisplayMode;
  remeasure: () => void;
};

function getGapWidth(container: HTMLDivElement): number {
  const computedGap = parseFloat(getComputedStyle(container).gap || '');
  return Number.isFinite(computedGap) ? computedGap : 0;
}

function getMeasuredWidths(measureLayer: Element, key: 'icons' | 'labels'): number[] {
  return Array.from(measureLayer.querySelectorAll(`[data-measure="${key}"]`)).map((element) =>
    Math.ceil((element as HTMLElement).getBoundingClientRect().width)
  );
}

export function useOverflowMeasurement({
  containerRef,
  inlineItems,
  displayMode = 'responsive',
  layoutMode = 'horizontal',
}: UseOverflowMeasurementParams): UseOverflowMeasurementResult {
  const [visibleCount, setVisibleCount] = useState<number>(Infinity);
  const [effectiveMode, setEffectiveMode] = useState<EffectiveDisplayMode>(
    displayMode === 'responsive' ? 'with-labels' : displayMode
  );

  useEffect(() => {
    if (displayMode !== 'responsive') {
      setEffectiveMode(displayMode);
    }
  }, [displayMode]);

  const measure = useCallback(() => {
    if (layoutMode === 'burger') {
      return;
    }

    const container = containerRef.current;
    const measureLayer = container?.querySelector('[data-measure-layer="true"]');
    if (!container || !measureLayer) {
      return;
    }

    const containerWidth = Math.floor(container.getBoundingClientRect().width);
    const gapWidth = getGapWidth(container);

    const overflowButtonElement = measureLayer.querySelector(
      '[data-measure-overflow-button="true"]'
    ) as HTMLElement | null;
    const overflowButtonWidth = getOverflowButtonWidth(
      overflowButtonElement ? Math.ceil(overflowButtonElement.getBoundingClientRect().width) : undefined
    );

    const iconWidths = getMeasuredWidths(measureLayer, 'icons');
    const labelWidths = displayMode === 'responsive' ? getMeasuredWidths(measureLayer, 'labels') : [];

    const nextMode = computeEffectiveMode({
      displayMode,
      containerWidth,
      iconWidths,
      labelWidths,
      currentMode: effectiveMode,
      gapWidth,
    });

    if (nextMode !== effectiveMode) {
      setEffectiveMode(nextMode);
    }

    const modeWidths = nextMode === 'with-labels' ? labelWidths : iconWidths;
    if (modeWidths.length === 0) {
      return;
    }

    const nextVisibleCount = computeVisibleCount({
      itemWidths: modeWidths,
      inlineItems,
      containerWidth,
      overflowButtonWidth,
      gapWidth,
    });

    setVisibleCount((previous) => (previous === nextVisibleCount ? previous : nextVisibleCount));
  }, [containerRef, displayMode, effectiveMode, inlineItems, layoutMode]);

  useEffect(() => {
    if (layoutMode === 'burger') {
      return;
    }

    const timer = setTimeout(() => {
      measure();
    }, 50);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        clearTimeout(timer);
      };
    }

    let animationFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        measure();
      });
    });

    const container = containerRef.current;
    if (container) {
      observer.observe(container);
    }

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [containerRef, layoutMode, measure]);

  const itemCount = inlineItems.length;
  useEffect(() => {
    if (layoutMode === 'burger') {
      return;
    }

    const timer = setTimeout(() => {
      measure();
    }, 0);

    return () => clearTimeout(timer);
  }, [itemCount, layoutMode, measure]);

  return useMemo(
    () => ({
      visibleCount,
      effectiveMode,
      remeasure: measure,
    }),
    [effectiveMode, measure, visibleCount]
  );
}
