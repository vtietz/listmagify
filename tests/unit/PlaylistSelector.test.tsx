/**
 * Unit tests for PlaylistSelector component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { PlaylistSelector } from '@/components/split/PlaylistSelector';
import type { ComponentProps } from 'react';

// Mock the API client
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api/client';

describe('PlaylistSelector', () => {
  let queryClient: QueryClient;
  let mockOnSelectPlaylist: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    mockOnSelectPlaylist = vi.fn();
    
    // Mock playlists API response
    vi.mocked(apiFetch).mockResolvedValue({
      items: [
        { id: 'playlist1', name: 'My Playlist 1', owner: { displayName: 'User 1' }, tracksTotal: 10 },
        { id: 'playlist2', name: 'My Playlist 2', owner: { displayName: 'User 2' }, tracksTotal: 20 },
        { id: 'playlist3', name: 'Another Playlist', owner: { displayName: 'User 3' }, tracksTotal: 30 },
      ],
      nextCursor: null,
      total: 3,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  const renderComponent = (props: Partial<ComponentProps<typeof PlaylistSelector>> = {}) => {
    const defaultProps: { selectedPlaylistId: string | null; onSelectPlaylist: (playlistId: string) => void } = {
      selectedPlaylistId: null,
      onSelectPlaylist: mockOnSelectPlaylist as (playlistId: string) => void,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <PlaylistSelector {...defaultProps} {...props} />
      </QueryClientProvider>
    );
  };

  it('should render with placeholder text when no playlist is selected', () => {
    renderComponent();
    
    expect(screen.getByRole('combobox', { name: /select playlist/i })).toBeInTheDocument();
    expect(screen.getByText('Select a playlist...')).toBeInTheDocument();
  });

  it('should display selected playlist name', () => {
    renderComponent({
      selectedPlaylistId: 'playlist1',
      selectedPlaylistName: 'My Playlist 1',
    });
    
    expect(screen.getByText('My Playlist 1')).toBeInTheDocument();
  });

  it('should open dropdown when clicking the button', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search playlists...')).toBeInTheDocument();
    });
  });

  it('should fetch and display playlists when opened', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    await waitFor(() => {
      expect(screen.getByText('My Playlist 1')).toBeInTheDocument();
      expect(screen.getByText('My Playlist 2')).toBeInTheDocument();
      expect(screen.getByText('Another Playlist')).toBeInTheDocument();
    });
    
    expect(apiFetch).toHaveBeenCalledWith('/api/me/playlists');
  });

  it('should call onSelectPlaylist with correct ID when clicking a playlist', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Wait for playlists to load
    await waitFor(() => {
      expect(screen.getByText('My Playlist 1')).toBeInTheDocument();
    });
    
    // Click on a playlist
    const playlistButton = screen.getByText('My Playlist 1').closest('button');
    expect(playlistButton).toBeInTheDocument();
    await user.click(playlistButton!);
    
    // Verify callback was called with correct ID
    expect(mockOnSelectPlaylist).toHaveBeenCalledTimes(1);
    expect(mockOnSelectPlaylist).toHaveBeenCalledWith('playlist1');
  });

  it('should close dropdown after selecting a playlist', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Wait for playlists to load
    await waitFor(() => {
      expect(screen.getByText('My Playlist 1')).toBeInTheDocument();
    });
    
    // Click on a playlist
    const playlistButton = screen.getByText('My Playlist 1').closest('button');
    await user.click(playlistButton!);
    
    // Dropdown should be closed (search input not visible)
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search playlists...')).not.toBeInTheDocument();
    });
  });

  it('should filter playlists based on search query', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Wait for playlists to load
    await waitFor(() => {
      expect(screen.getByText('My Playlist 1')).toBeInTheDocument();
    });
    
    // Type in search box
    const searchInput = screen.getByPlaceholderText('Search playlists...');
    await user.type(searchInput, 'Another');
    
    // Should only show matching playlist
    await waitFor(() => {
      expect(screen.getByText('Another Playlist')).toBeInTheDocument();
      expect(screen.queryByText('My Playlist 1')).not.toBeInTheDocument();
      expect(screen.queryByText('My Playlist 2')).not.toBeInTheDocument();
    });
  });

  it('should show check mark next to selected playlist', async () => {
    const user = userEvent.setup();
    renderComponent({
      selectedPlaylistId: 'playlist2',
    });
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Wait for playlists to load
    await waitFor(() => {
      expect(screen.getAllByText('My Playlist 2').length).toBeGreaterThan(1);
    });
    
    // Check that the selected playlist has a visible check mark (dropdown item)
    const playlist2Entries = screen.getAllByText('My Playlist 2');
    const playlist2Button = playlist2Entries[playlist2Entries.length - 1]?.closest('button');
    const checkIcon = playlist2Button?.querySelector('svg');
    expect(checkIcon).toHaveClass('opacity-100');
  });

  it('should handle keyboard navigation (ArrowDown)', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Wait for playlists to load
    const searchInput = await screen.findByPlaceholderText('Search playlists...');
    
    // Press ArrowDown - moves from index 0 (Liked Songs) to index 1 (Another Playlist)
    await user.keyboard('{ArrowDown}');
    
    // "Another Playlist" should be highlighted (first regular playlist after Liked Songs)
    await waitFor(() => {
      const playlistButton = screen.getByText('Another Playlist').closest('button');
      expect(playlistButton).toHaveClass('bg-accent');
    });
  });

  it('should select playlist with Enter key', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Wait for search input
    await screen.findByPlaceholderText('Search playlists...');
    
    // Press Enter (should select first item - "Liked Songs" at index 0)
    await user.keyboard('{Enter}');
    
    // Verify callback was called with 'liked' (the virtual Liked Songs playlist ID)
    await waitFor(() => {
      expect(mockOnSelectPlaylist).toHaveBeenCalledTimes(1);
      expect(mockOnSelectPlaylist).toHaveBeenCalledWith('liked');
    });
  });

  it('should close dropdown with Escape key', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Wait for search input
    await screen.findByPlaceholderText('Search playlists...');
    
    // Press Escape
    await user.keyboard('{Escape}');
    
    // Dropdown should be closed
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search playlists...')).not.toBeInTheDocument();
    });
  });

  it('should show loading state', async () => {
    // Mock slow API response
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    
    const user = userEvent.setup();
    renderComponent();
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Should show loading text
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('should show "No playlists found" when search has no results', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    // Open dropdown
    const button = screen.getByRole('combobox', { name: /select playlist/i });
    await user.click(button);
    
    // Wait for playlists to load
    await waitFor(() => {
      expect(screen.getByText('My Playlist 1')).toBeInTheDocument();
    });
    
    // Type search query that matches nothing
    const searchInput = screen.getByPlaceholderText('Search playlists...');
    await user.type(searchInput, 'NonexistentPlaylist');
    
    // Should show "no results" message
    await waitFor(() => {
      expect(screen.getByText('No playlists found.')).toBeInTheDocument();
    });
  });
});
