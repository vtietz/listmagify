import { AppLogo } from "@/components/ui/app-logo";
import { AppFooter } from "@/components/ui/app-footer";

type AuthPageLayoutProps = {
  children: React.ReactNode;
  showLogoutLink?: boolean;
};

/**
 * Shared layout wrapper for authentication-related pages (landing, login, etc.).
 * Provides consistent header with logo and optional logout link, plus footer.
 */
export function AuthPageLayout({ children, showLogoutLink = false }: AuthPageLayoutProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-background to-background/95">
      {/* Header */}
      <header className="sticky top-0 z-40 h-12 flex items-center justify-between px-4 border-b border-border bg-background">
        <AppLogo size="sm" />
        {showLogoutLink && (
          <nav className="flex items-center gap-1 text-sm">
            <a
              href="/logout"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Logout
            </a>
          </nav>
        )}
      </header>

      {/* Main Content */}
      {children}

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
