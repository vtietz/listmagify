import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlaylistCard } from "@/components/playlist/PlaylistCard";
import { mapPlaylist, pageFromSpotify, type Playlist } from "@/lib/spotify/types";

// Mock next/link to a plain anchor for JSDOM
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === "string" ? href : "/"} {...props}>{children}</a>
  ),
}));

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// Wrapper component for tests that need QueryClientProvider
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe("PlaylistCard", () => {
  const basePlaylist: Playlist = {
    id: "abc123",
    name: "Road Trip Mix",
    description: "A cool playlist",
    ownerName: "DJ Test",
    image: { url: "https://example.com/cover.jpg", width: 300, height: 300 },
    tracksTotal: 12,
    isPublic: true,
  };

  it("renders playlist with cover, owner and track count", () => {
    render(<PlaylistCard playlist={basePlaylist} />, { wrapper: TestWrapper });

    // Title
    expect(screen.getByText("Road Trip Mix")).toBeInTheDocument();
    // Owner + count
    expect(
      screen.getByText(/by DJ Test • 12 tracks/i)
    ).toBeInTheDocument();
    // Cover image alt text
    expect(screen.getByAltText("Road Trip Mix")).toBeInTheDocument();
    // Link href
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/playlists/abc123");
  });

  it("renders fallback when no cover image", () => {
    const withoutCover: Playlist = { ...basePlaylist, image: null };
    render(<PlaylistCard playlist={withoutCover} />, { wrapper: TestWrapper });

    expect(screen.getByText(/No cover/i)).toBeInTheDocument();
  });
});

describe("spotify types mappers", () => {
  it("mapPlaylist maps basic fields", () => {
    const raw = {
      id: "pl_1",
      name: "Mapped",
      description: "Desc",
      owner: { display_name: "OwnerX" },
      images: [{ url: "https://img/1.jpg", width: 64, height: 64 }],
      tracks: { total: 42 },
      public: false,
    };

    const dto = mapPlaylist(raw);
    expect(dto.id).toBe("pl_1");
    expect(dto.name).toBe("Mapped");
    expect(dto.ownerName).toBe("OwnerX");
    expect(dto.image?.url).toBe("https://img/1.jpg");
    expect(dto.tracksTotal).toBe(42);
    expect(dto.isPublic).toBe(false);
  });

  it("pageFromSpotify returns items, next cursor and total", () => {
    const raw = {
      items: [{ id: "x", name: "X" }, { id: "y", name: "Y" }],
      next: "https://api.spotify.com/v1/me/playlists?offset=2",
      total: 10,
    };

    const page = pageFromSpotify(raw, (r) => r.name as string);
    expect(page.items).toEqual(["X", "Y"]);
    expect(page.nextCursor).toBe("https://api.spotify.com/v1/me/playlists?offset=2");
    expect(page.total).toBe(10);
  });
});