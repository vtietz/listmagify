/**
 * MobileBrowseOverlay - Browse/Recommendations overlay for mobile devices.
 * 
 * Adapts to device type:
 * - Phone: Bottom sheet with swipe-to-close, full-screen on deeper exploration
 * - Tablet: Slide-over pane anchored to the active panel
 */

'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';

type BrowseTab = 'search' | 'recommendations';

interface MobileBrowseOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Callback to close the overlay */
  onClose: () => void;
  /** Currently active tab */
  activeTab?: BrowseTab;
  /** Callback when tab changes */
  onTabChange?: (tab: BrowseTab) => void;
  /** Content to render for search tab */
  searchContent?: React.ReactNode;
  /** Content to render for recommendations tab */
  recommendationsContent?: React.ReactNode;
  /** Whether to show full-screen mode (for deeper exploration) */
  fullScreen?: boolean;
}

export function MobileBrowseOverlay({
  isOpen,
  onClose,
  activeTab = 'search',
  onTabChange,
  searchContent,
  recommendationsContent,
  fullScreen = false,
}: MobileBrowseOverlayProps) {
  const { isPhone, isTablet, isDesktop } = useDeviceType();
  const [internalTab, setInternalTab] = useState<BrowseTab>(activeTab);

  const currentTab = onTabChange ? activeTab : internalTab;
  const setTab = onTabChange || setInternalTab;

  // Desktop: Don't render (use existing side panel)
  if (isDesktop) {
    return null;
  }

  // Phone: Bottom sheet
  if (isPhone) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title="Browse"
        height={fullScreen ? 'full' : 'half'}
        showCloseButton
      >
        {/* Tab switcher */}
        <div className="flex gap-2 mb-4">
          <TabButton
            isActive={currentTab === 'search'}
            onClick={() => setTab('search')}
            icon={Search}
            label="Search"
          />
          <TabButton
            isActive={currentTab === 'recommendations'}
            onClick={() => setTab('recommendations')}
            icon={Sparkles}
            label="Recommendations"
          />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {currentTab === 'search' && searchContent}
          {currentTab === 'recommendations' && recommendationsContent}
        </div>
      </BottomSheet>
    );
  }

  // Tablet: Slide-over panel
  if (isTablet) {
    return (
      <SlideOverPanel
        isOpen={isOpen}
        onClose={onClose}
        title="Browse"
        width="medium"
        showOverlay={false}
      >
        {/* Tab switcher */}
        <div className="flex gap-2 mb-4">
          <TabButton
            isActive={currentTab === 'search'}
            onClick={() => setTab('search')}
            icon={Search}
            label="Search"
          />
          <TabButton
            isActive={currentTab === 'recommendations'}
            onClick={() => setTab('recommendations')}
            icon={Sparkles}
            label="Recommendations"
          />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {currentTab === 'search' && searchContent}
          {currentTab === 'recommendations' && recommendationsContent}
        </div>
      </SlideOverPanel>
    );
  }

  return null;
}

// Tab button component
function TabButton({
  isActive,
  onClick,
  icon: Icon,
  label,
}: {
  isActive: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      className={cn(
        'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors',
        'touch-target min-h-[44px]',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

/**
 * Hook to manage mobile browse overlay state.
 */
export function useMobileBrowseOverlay() {
  const { isPhone, isTablet } = useDeviceType();
  const { isOpen, open, close, searchQuery, setSearchQuery } = useBrowsePanelStore();
  const [activeTab, setActiveTab] = useState<BrowseTab>('search');
  const [isFullScreen, setIsFullScreen] = useState(false);

  const openSearch = useCallback(() => {
    setActiveTab('search');
    open();
  }, [open]);

  const openRecommendations = useCallback(() => {
    setActiveTab('recommendations');
    open();
  }, [open]);

  const expandToFullScreen = useCallback(() => {
    setIsFullScreen(true);
  }, []);

  const collapseFromFullScreen = useCallback(() => {
    setIsFullScreen(false);
  }, []);

  return {
    isOpen,
    activeTab,
    isFullScreen,
    searchQuery,
    isMobile: isPhone || isTablet,
    openSearch,
    openRecommendations,
    close,
    setActiveTab,
    setSearchQuery,
    expandToFullScreen,
    collapseFromFullScreen,
  };
}

/**
 * QuickAddButton - One-tap "Add to panel" button for overlay results.
 */
interface QuickAddButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isCompact?: boolean;
}

export function QuickAddButton({ onClick, disabled = false, isCompact = false }: QuickAddButtonProps) {
  return (
    <button
      className={cn(
        'touch-target flex items-center justify-center rounded-full',
        'bg-primary text-primary-foreground hover:bg-primary/90',
        'transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        isCompact ? 'w-8 h-8' : 'w-10 h-10'
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      aria-label="Add to playlist"
    >
      <span className={isCompact ? 'text-lg' : 'text-xl'}>+</span>
    </button>
  );
}
