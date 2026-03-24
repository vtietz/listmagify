"use client";

import Image from "next/image";
import Link from "next/link";

type AppLogoProps = {
  /** Size variant */
  size?: "sm" | "lg";
  /** Whether to link to home */
  asLink?: boolean;
};

/**
 * Centralized app logo component with icon and gradient text.
 * Used in header and landing page for consistent branding.
 * Always links to landing page (/).
 */
export function AppLogo({ size = "sm", asLink = true }: AppLogoProps) {
  const isLarge = size === "lg";
  
  // Link with explicit landing flag so authenticated users can still open the marketing page.
  const href = "/?landing=1";
  
  const content = (
    <div className={`flex items-center ${isLarge ? "flex-col gap-4" : "gap-2"}`}>
      {/* SVG icon from public folder - unoptimized since SVG doesn't benefit from raster optimization */}
      <Image
        src="/icon.svg"
        alt="Listmagify"
        width={isLarge ? 80 : 20}
        height={isLarge ? 80 : 20}
        unoptimized
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
