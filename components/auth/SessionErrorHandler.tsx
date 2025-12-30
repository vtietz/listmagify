"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogIn, AlertCircle } from "lucide-react";

/** Public routes where session errors should be silently ignored */
const PUBLIC_ROUTES = ["/", "/login", "/logout", "/privacy", "/imprint"];

/**
 * Client component that monitors session for token refresh errors.
 * If a RefreshAccessTokenError occurs (e.g., revoked refresh token),
 * shows a dialog prompting the user to log in again.
 * 
 * Provides a clean UX instead of silently failing or redirecting.
 * Mount this once in the root layout to apply globally.
 * 
 * On public routes the dialog is suppressed so unauthenticated visitors
 * can browse the landing/legal pages without interruption.
 */
export function SessionErrorHandler() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [showDialog, setShowDialog] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // On public routes, silently clear the bad session instead of showing dialog
    const isPublic = PUBLIC_ROUTES.includes(pathname);

    if (status === "authenticated" && session && (session as any).error === "RefreshAccessTokenError") {
      if (isPublic) {
        // Quietly sign out without dialog on public pages
        signOut({ redirect: false });
      } else {
        // Show dialog on protected pages
        setShowDialog(true);
      }
    }
  }, [session, status, pathname]);

  const handleLogin = useCallback(async () => {
    setIsRedirecting(true);
    
    // Sign out first to clear invalid session
    await signOut({ redirect: false });
    
    // Redirect to login with current path for return
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/login?reason=expired&next=${encodeURIComponent(currentPath)}`;
  }, []);

  return (
    <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </div>
            <AlertDialogTitle>Session Expired</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2" asChild>
            <div className="text-sm text-muted-foreground">
              Your Spotify session has expired or been revoked. This can happen if:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>You haven&apos;t used the app in a while</li>
                <li>You changed your Spotify password</li>
                <li>You revoked access in Spotify settings</li>
              </ul>
              <p className="mt-3">Please log in again to continue using Listmagify.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction 
            onClick={handleLogin}
            disabled={isRedirecting}
            className="gap-2"
          >
            <LogIn className="h-4 w-4" />
            {isRedirecting ? "Redirecting..." : "Log in with Spotify"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
