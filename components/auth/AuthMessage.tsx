import { AlertCircle } from "lucide-react";

type AuthMessageProps = {
  children: React.ReactNode;
};

/**
 * Generic authentication message display with consistent styling.
 * Used for messages like "Sign in to access this page", etc.
 */
export function AuthMessage({ children }: AuthMessageProps) {
  return (
    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0" />
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
