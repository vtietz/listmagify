import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdaptiveNav } from '@widgets/shell/HeaderComponents';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { availableProviders: ['spotify'] },
  }),
}));

vi.mock('@/components/ui/adaptive-nav', () => ({
  AdaptiveNav: ({ items }: { items: Array<{ id: string; label: string; visible?: boolean; hidden?: boolean }> }) => (
    <div>
      {items.filter((item) => item.visible !== false && item.hidden !== true).map((item) => (
        <span key={item.id}>{item.label}</span>
      ))}
    </div>
  ),
}));

vi.mock('@/components/feedback', () => ({
  FeedbackDialog: () => null,
}));

function renderHeaderNav(showSecureLinks: boolean) {
  render(
    <AdaptiveNav
      isPhone={false}
      showSecureLinks={showSecureLinks}
      pathname="/split-editor"
      hasStatsAccess={true}
      isBrowseOpen={false}
      toggleBrowse={vi.fn()}
      isPlayerVisible={false}
      togglePlayerVisible={vi.fn()}
      supportsPlayer={true}
      isCompact={false}
      setCompact={vi.fn()}
      isAutoScrollText={false}
      setAutoScrollText={vi.fn()}
      isCompareEnabled={false}
      setCompareEnabled={vi.fn()}
      supportsCompare={true}
      markerStats={{ playlistIds: [], playlistCount: 0, totalMarkers: 0 }}
      clearAllMarkers={vi.fn()}
    />
  );
}

describe('HeaderComponents AdaptiveNav secure links', () => {
  it('hides secured navigation links when showSecureLinks is false', () => {
    renderHeaderNav(false);

    expect(screen.queryByText('Playlists')).not.toBeInTheDocument();
    expect(screen.queryByText('Panels')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows secured navigation links when showSecureLinks is true', () => {
    renderHeaderNav(true);

    expect(screen.getByText('Playlists')).toBeInTheDocument();
    expect(screen.getByText('Panels')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});
