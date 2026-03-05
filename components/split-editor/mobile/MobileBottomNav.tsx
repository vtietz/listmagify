/**
 * MobileBottomNav - Bottom navigation bar for mobile devices.
 * 
 * Features:
 * - Panel 2 toggle: When on, shows 50/50 split with Panel 1
 * - Browse overlay buttons: Search, Last.fm, Recommendations
 * - Player toggle: Shows/hides inline player (not overlay for DnD support)
 * - When any overlay is active, Panel 2 hides and overlay takes bottom half
 */

'use client';

import { 
  Search, 
  Sparkles, 
  Radio, 
  Music2,
  LayoutPanelTop,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeviceType } from '@/hooks/useDeviceType';
import type { PanelConfig } from '@/hooks/useSplitGridStore';

export type MobileOverlay = 'none' | 'panel2' | 'search' | 'lastfm' | 'recs' | 'player';

interface MobileBottomNavProps {
  /** Available panels */
  panels: PanelConfig[];
  /** Currently active overlay */
  activeOverlay: MobileOverlay;
  /** Set the active overlay */
  setActiveOverlay: (overlay: MobileOverlay) => void;
  /** Whether Panel 2 exists */
  hasPanel2: boolean;
  /** Callback to split the first panel when Panel 2 doesn't exist */
  onSplitFirstPanel: () => void;
}

interface NavButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function NavButton({ icon: Icon, label, isActive, onClick, disabled }: NavButtonProps) {
  return (
    <button
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[52px]',
        isActive 
          ? 'bg-primary text-primary-foreground' 
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        disabled && 'opacity-40 pointer-events-none'
      )}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

export function MobileBottomNav({ 
  panels: _panels, 
  activeOverlay, 
  setActiveOverlay,
  hasPanel2,
  onSplitFirstPanel,
}: MobileBottomNavProps) {
  const { isPhone } = useDeviceType();

  // Only show on phones
  if (!isPhone) {
    return null;
  }

  const handleToggle = (overlay: MobileOverlay) => {
    if (activeOverlay === overlay) {
      setActiveOverlay('none');
    } else {
      setActiveOverlay(overlay);
    }
  };

  const handlePanel2Click = () => {
    if (!hasPanel2) {
      // Split the first panel to create Panel 2
      onSplitFirstPanel();
    }
    // Toggle the panel2 overlay
    handleToggle('panel2');
  };

  return (
    <nav 
      className="mobile-bottom-nav"
      role="navigation" 
      aria-label="Mobile navigation"
    >
      {/* Panel 2 toggle - always visible, creates panel if needed */}
      <NavButton
        icon={LayoutPanelTop}
        label="Panel 2"
        isActive={activeOverlay === 'panel2'}
        onClick={handlePanel2Click}
      />

      {/* Divider */}
      <div className="w-px h-8 bg-border mx-1" />

      {/* Browse section buttons */}
      <NavButton
        icon={Search}
        label="Search"
        isActive={activeOverlay === 'search'}
        onClick={() => handleToggle('search')}
      />

      <NavButton
        icon={Radio}
        label="Last.fm"
        isActive={activeOverlay === 'lastfm'}
        onClick={() => handleToggle('lastfm')}
      />

      <NavButton
        icon={Sparkles}
        label="Recs"
        isActive={activeOverlay === 'recs'}
        onClick={() => handleToggle('recs')}
      />

      {/* Divider */}
      <div className="w-px h-8 bg-border mx-1" />

      {/* Player toggle - shows/hides inline player */}
      <NavButton
        icon={Music2}
        label="Player"
        isActive={activeOverlay === 'player'}
        onClick={() => handleToggle('player')}
      />
    </nav>
  );
}

/**
 * Hook to manage mobile overlay state with localStorage persistence
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MobileOverlayState {
  activeOverlay: MobileOverlay;
  setActiveOverlay: (overlay: MobileOverlay) => void;
}

export const useMobileOverlayStore = create<MobileOverlayState>()(
  persist(
    (set) => ({
      activeOverlay: 'none',
      setActiveOverlay: (overlay) => set({ activeOverlay: overlay }),
    }),
    {
      name: 'mobile-overlay-state',
      // Only persist the overlay state, not any functions
      partialize: (state) => ({ activeOverlay: state.activeOverlay }),
    }
  )
);
