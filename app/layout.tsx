import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { AppShell } from "@/components/shell/AppShell";
import { SessionErrorHandler } from "@/components/auth/SessionErrorHandler";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Spotlisted - Spotify Playlist Editor",
    template: "%s | Spotlisted",
  },
  description: "Professional playlist management tool for Spotify. Edit multiple playlists side-by-side with drag-and-drop.",
  keywords: ["Spotify", "Playlist", "Editor", "Manager", "Sort", "Organize", "Drag and Drop"],
  authors: [{ name: "Spotlisted Team" }],
  creator: "Spotlisted",
  metadataBase: new URL("https://spotlisted.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://spotlisted.com",
    title: "Spotlisted - The Ultimate Spotify Playlist Editor",
    description: "Manage your Spotify playlists like a pro. Split-view editing, bulk actions, and smart search.",
    siteName: "Spotlisted",
    images: [
      {
        url: "/screenshot-split-editor.png",
        width: 1200,
        height: 630,
        alt: "Spotlisted Interface",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spotlisted - Spotify Playlist Editor",
    description: "Manage your Spotify playlists like a pro. Split-view editing, bulk actions, and smart search.",
    images: ["/screenshot-split-editor.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              } catch (e) {}
            `,
          }}
        />
        <Providers>
          <SessionErrorHandler />
          <AppShell>
            {children}
            <Toaster richColors position="top-right" />
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
