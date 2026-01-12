'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, Eye, EyeOff, CheckCircle, ExternalLink, AlertTriangle, Trash2 } from 'lucide-react';
import { useByokCredentials } from '@/hooks/useByokCredentials';

interface ByokDialogProps {
  trigger?: React.ReactNode;
  onCredentialsSaved?: () => void;
}

/**
 * Dialog for users to enter their own Spotify API credentials.
 * Stores credentials in localStorage for use with authentication.
 */
export function ByokDialog({ trigger, onCredentialsSaved }: ByokDialogProps) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const { credentials, hasCredentials, saveCredentials, clearCredentials } = useByokCredentials();

  // Calculate redirect URI based on current origin
  const redirectUri = useMemo(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api/auth/byok/callback`;
    }
    return '';
  }, []);

  // Load existing credentials when dialog opens
  useEffect(() => {
    if (open && credentials) {
      setClientId(credentials.clientId);
      setClientSecret(credentials.clientSecret);
    }
  }, [open, credentials]);

  const handleSave = () => {
    setError(null);

    // Basic validation
    if (!clientId.trim()) {
      setError('Client ID is required');
      return;
    }
    if (!clientSecret.trim()) {
      setError('Client Secret is required');
      return;
    }
    if (clientId.trim().length < 20) {
      setError('Client ID appears to be too short');
      return;
    }
    if (clientSecret.trim().length < 20) {
      setError('Client Secret appears to be too short');
      return;
    }

    const success = saveCredentials({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });

    if (success) {
      setIsSuccess(true);
      onCredentialsSaved?.();
    } else {
      setError('Failed to save credentials');
    }
  };

  const handleClear = () => {
    clearCredentials();
    setClientId('');
    setClientSecret('');
    setIsSuccess(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing (but keep credentials)
      setTimeout(() => {
        setError(null);
        setIsSuccess(false);
        setShowClientId(false);
        setShowClientSecret(false);
      }, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Key className="h-3.5 w-3.5" />
            {hasCredentials ? 'API Keys Configured' : 'Use Your Own API Key'}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {isSuccess ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Credentials Saved
              </DialogTitle>
              <DialogDescription>
                Your Spotify API credentials have been saved to this browser. 
                You can now sign in using your own API keys.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                {hasCredentials ? 'Edit API Credentials' : 'Use Your Own Spotify API Key'}
              </DialogTitle>
              <DialogDescription>
                Use your own Spotify Developer credentials for direct control over your API access.
              </DialogDescription>
            </DialogHeader>

            {/* Tutorial Section */}
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-muted/50 p-3 sm:p-4 space-y-2 sm:space-y-3 text-sm">
                <p className="font-medium">How to get your Spotify API credentials:</p>
                <ol className="list-decimal list-inside space-y-1.5 sm:space-y-2 text-muted-foreground text-xs sm:text-sm">
                  <li>
                    Go to the{' '}
                    <a
                      href="https://developer.spotify.com/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Spotify Developer Dashboard
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Log in with your Spotify account</li>
                  <li>Click &quot;Create App&quot;</li>
                  <li>
                    Fill in app details:
                    <ul className="list-disc list-inside ml-3 sm:ml-4 mt-1 space-y-1 text-xs sm:text-sm">
                      <li>App name: anything (e.g., &quot;My Listmagify&quot;)</li>
                      <li>App description: anything</li>
                      <li className="break-all">
                        Redirect URI: <code className="text-xs bg-background px-1 py-0.5 rounded break-all">{redirectUri || 'Loading...'}</code>
                      </li>
                      <li className="font-medium text-foreground">
                        APIs: Check <strong>Web API</strong> and <strong>Web Playback SDK</strong>
                      </li>
                    </ul>
                  </li>
                  <li>Go to your app&apos;s Settings and copy the Client ID and Client Secret</li>
                </ol>
              </div>

              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 sm:p-3">
                <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-medium text-foreground">Privacy Note:</span>{' '}
                  Your credentials are stored only in this browser&apos;s localStorage on this machine. 
                  They are never sent to our servers and are only used to authenticate directly with Spotify.
                </div>
              </div>
            </div>

            {/* Credentials Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <div className="relative">
                  <Input
                    id="clientId"
                    type={showClientId ? 'text' : 'password'}
                    placeholder="Enter your Spotify Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientId(!showClientId)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showClientId ? 'Hide Client ID' : 'Show Client ID'}
                  >
                    {showClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <div className="relative">
                  <Input
                    id="clientSecret"
                    type={showClientSecret ? 'text' : 'password'}
                    placeholder="Enter your Spotify Client Secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientSecret(!showClientSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showClientSecret ? 'Hide Client Secret' : 'Show Client Secret'}
                  >
                    {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {hasCredentials && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClear}
                    className="text-destructive hover:text-destructive sm:mr-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Credentials
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!clientId || !clientSecret}>
                  Save Credentials
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
