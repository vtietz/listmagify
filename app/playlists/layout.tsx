"use client";

export default function PlaylistsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Simple pass-through layout - AppShell handles the main structure
  return <>{children}</>;
}
