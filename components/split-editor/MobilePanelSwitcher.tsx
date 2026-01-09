/**
 * MobilePanelSwitcher - Bottom bar for switching panels on phones.
 * Shows tabs for each panel with quick-switch functionality.
 */

'use client';

import { useMemo } from 'react';
import { ListMusic, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePanelFocusStore } from '@/hooks/usePanelFocusStore';
import { useDeviceType } from '@/hooks/useDeviceType';
import type { PanelConfig } from '@/hooks/useSplitGridStore';

interface MobilePanelSwitcherProps {
  /** Available panels */
  panels: PanelConfig[];
  /** Map of playlist ID to playlist name */
  playlistNames: Map<string, string>;
}

/**
 * Get icon for panel based on its type/content.
 */
function getPanelIcon(panel: PanelConfig) {
  if (!panel.playlistId) {
    return Search;
  }
  return ListMusic;
}

/**
 * Get label for panel.
 */
function getPanelLabel(panel: PanelConfig, playlistNames: Map<string, string>, index: number): string {
  if (!panel.playlistId) {
    return 'Browse';
  }
  const name = playlistNames.get(panel.playlistId);
  return name || `Panel ${index + 1}`;
}

export function MobilePanelSwitcher({ panels, playlistNames }: MobilePanelSwitcherProps) {
  const { isPhone } = useDeviceType();
  const { focusedPanelId, focusPanel, isSwitcherVisible } = usePanelFocusStore();

  // Only show on phones with multiple panels
  if (!isPhone || panels.length < 2 || !isSwitcherVisible) {
    return null;
  }

  // Limit to 2 panels on phones
  const visiblePanels = panels.slice(0, 2);

  return (
    <div className="panel-switcher" role="tablist" aria-label="Panel switcher">
      {visiblePanels.map((panel, index) => {
        const Icon = getPanelIcon(panel);
        const label = getPanelLabel(panel, playlistNames, index);
        const isActive = focusedPanelId === panel.id;

        return (
          <button
            key={panel.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${panel.id}`}
            className={cn('panel-switcher-tab', isActive && 'active')}
            onClick={() => focusPanel(panel.id)}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hook to get panel switcher props from current state.
 */
export function useMobilePanelSwitcher(panels: PanelConfig[]) {
  const { focusedPanelId, focusPanel } = usePanelFocusStore();
  const { isPhone } = useDeviceType();

  // Auto-focus first panel if none focused on phone
  useMemo(() => {
    if (isPhone && panels.length > 0 && !focusedPanelId) {
      focusPanel(panels[0]!.id);
    }
  }, [isPhone, panels, focusedPanelId, focusPanel]);

  return {
    focusedPanelId,
    focusPanel,
    isVisible: isPhone && panels.length >= 2,
  };
}
