"use client";

import Link from "next/link";
import { useSessionUser } from "@/hooks/useSessionUser";

type AppLogoProps = {
  /** Size variant */
  size?: "sm" | "lg";
  /** Whether to link to home */
  asLink?: boolean;
};

/**
 * Centralized app logo component with icon and gradient text.
 * Used in header and landing page for consistent branding.
 * Links to /playlists when authenticated, otherwise to landing page.
 */
export function AppLogo({ size = "sm", asLink = true }: AppLogoProps) {
  const isLarge = size === "lg";
  const { authenticated } = useSessionUser();
  
  // Link to playlists when authenticated, landing page otherwise
  const href = authenticated ? "/playlists" : "/";
  
  const content = (
    <div className={`flex items-center ${isLarge ? "flex-col gap-4" : "gap-2"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img 
        src="/icon.svg" 
        alt="Listmagify" 
        className={isLarge ? "h-20 w-20" : "h-5 w-5"} 
      />
      <span 
        className={`font-bold bg-gradient-to-r from-[#08B7A8] to-[#9759F5] bg-clip-text text-transparent ${
          isLarge ? "text-4xl md:text-5xl tracking-tight pb-2" : "text-base"
        }`}
      >
        Listmagify
      </span>
    </div>
  );

  if (asLink) {
    return (
      <Link href={href} className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
