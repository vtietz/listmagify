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

// Base URL for metadata - read at runtime from env (server-side only)
const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: {
    default: "Listmagify - Playlist Magic for Spotify",
    template: "%s | Listmagify",
  },
  description: "Professional playlist management tool for Spotify. Edit multiple playlists side-by-side with drag-and-drop.",
  keywords: ["Spotify", "Playlist", "Editor", "Manager", "Sort", "Organize", "Drag and Drop"],
  authors: [{ name: "Listmagify" }],
  creator: "Listmagify",
  metadataBase: new URL(appUrl),
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: appUrl,
    title: "Listmagify - Playlist Magic for Spotify",
    description: "Professional playlist management for Spotify. Edit multiple playlists side-by-side with drag-and-drop.",
    siteName: "Listmagify",
    images: [
      {
        url: "/Listmagify-Logo.png",
        width: 1200,
        height: 630,
        alt: "Listmagify Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Listmagify - Playlist Magic for Spotify",
    description: "Professional playlist management for Spotify. Edit multiple playlists side-by-side with drag-and-drop.",
    images: ["/Listmagify-Logo.png"],
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
            {/* @ts-expect-error - sonner's type definitions don't match runtime props */}
            <Toaster richColors position="top-right" duration={5000} />
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
