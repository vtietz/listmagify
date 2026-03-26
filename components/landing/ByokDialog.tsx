'use client';

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
import { Key, Eye, EyeOff, ExternalLink, AlertTriangle, Trash2, Copy, Check } from 'lucide-react';
import { useByokDialogController } from '@features/auth/hooks/useByokDialogController';
import type { ReactNode } from 'react';

interface ByokDialogProps {
  trigger?: ReactNode;
  onCredentialsSaved?: () => void;
}

/**
 * Dialog for users to enter their own Spotify API credentials.
 * Stores credentials in localStorage for use with authentication.
 */
export function ByokDialog({ trigger, onCredentialsSaved }: ByokDialogProps) {
  const {
    open,
    clientId,
    setClientId,
    clientSecret,
    setClientSecret,
    showClientId,
    setShowClientId,
    showClientSecret,
    setShowClientSecret,
    redirectUriCopied,
    error,
    hasCredentials,
    redirectUri,
    handleSave,
    handleClear,
    handleOpenChange,
    handleCopyRedirectUri,
  } = useByokDialogController({ onCredentialsSaved });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <ByokDialogTrigger trigger={trigger} hasCredentials={hasCredentials} />
      <ByokDialogBody
        hasCredentials={hasCredentials}
        redirectUri={redirectUri}
        redirectUriCopied={redirectUriCopied}
        onCopyRedirectUri={handleCopyRedirectUri}
        clientId={clientId}
        onClientIdChange={setClientId}
        clientSecret={clientSecret}
        onClientSecretChange={setClientSecret}
        showClientId={showClientId}
        setShowClientId={setShowClientId}
        showClientSecret={showClientSecret}
        setShowClientSecret={setShowClientSecret}
        error={error}
        onSave={handleSave}
        onClear={handleClear}
        onCancel={() => handleOpenChange(false)}
      />
    </Dialog>
  );
}

function ByokDialogTrigger({ trigger, hasCredentials }: { trigger?: ReactNode; hasCredentials: boolean }) {
  return (
    <DialogTrigger asChild>
      {trigger || (
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Key className="h-3.5 w-3.5" />
          {hasCredentials ? 'API Keys Configured' : 'Use Your Own API Key'}
        </button>
      )}
    </DialogTrigger>
  );
}

function ByokDialogBody({
  hasCredentials,
  redirectUri,
  redirectUriCopied,
  onCopyRedirectUri,
  clientId,
  onClientIdChange,
  clientSecret,
  onClientSecretChange,
  showClientId,
  setShowClientId,
  showClientSecret,
  setShowClientSecret,
  error,
  onSave,
  onClear,
  onCancel,
}: {
  hasCredentials: boolean;
  redirectUri: string;
  redirectUriCopied: boolean;
  onCopyRedirectUri: () => Promise<void>;
  clientId: string;
  onClientIdChange: (value: string) => void;
  clientSecret: string;
  onClientSecretChange: (value: string) => void;
  showClientId: boolean;
  setShowClientId: (value: boolean) => void;
  showClientSecret: boolean;
  setShowClientSecret: (value: boolean) => void;
  error: string | null;
  onSave: () => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          {hasCredentials ? 'Edit API Credentials' : 'Use Your Own Spotify API Key'}
        </DialogTitle>
        <DialogDescription>
          Use your own Spotify Developer app credentials to sign in. This lets you use the app without being added as an approved user.
        </DialogDescription>
      </DialogHeader>

      <ByokInstructions
        redirectUri={redirectUri}
        redirectUriCopied={redirectUriCopied}
        onCopyRedirectUri={onCopyRedirectUri}
      />

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 sm:p-3">
        <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-medium text-foreground">Privacy Note:</span>{' '}
          Your credentials are stored only in this browser&apos;s localStorage on this machine.
          They are never sent to our servers and are only used to authenticate directly with Spotify.
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="space-y-4"
      >
        <CredentialField
          id="clientId"
          label="Client ID"
          placeholder="Enter your Spotify Client ID"
          value={clientId}
          onChange={onClientIdChange}
          visible={showClientId}
          setVisible={setShowClientId}
          hideLabel="Hide Client ID"
          showLabel="Show Client ID"
        />

        <CredentialField
          id="clientSecret"
          label="Client Secret"
          placeholder="Enter your Spotify Client Secret"
          value={clientSecret}
          onChange={onClientSecretChange}
          visible={showClientSecret}
          setVisible={setShowClientSecret}
          hideLabel="Hide Client Secret"
          showLabel="Show Client Secret"
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {hasCredentials ? (
            <Button
              type="button"
              variant="outline"
              onClick={onClear}
              className="text-destructive hover:text-destructive sm:mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Credentials
            </Button>
          ) : null}
          <Button type="submit" disabled={!clientId || !clientSecret}>
            Save Credentials
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ByokInstructions({
  redirectUri,
  redirectUriCopied,
  onCopyRedirectUri,
}: {
  redirectUri: string;
  redirectUriCopied: boolean;
  onCopyRedirectUri: () => Promise<void>;
}) {
  return (
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
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                <span>Redirect URI:</span>
                <code className="text-xs bg-background px-1 py-0.5 rounded break-all">{redirectUri || 'Loading...'}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={onCopyRedirectUri}
                  disabled={!redirectUri}
                  aria-label="Copy Redirect URI"
                  title="Copy Redirect URI"
                >
                  {redirectUriCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </span>
            </li>
            <li className="font-medium text-foreground">
              APIs: Check <strong>Web API</strong> and <strong>Web Playback SDK</strong>
            </li>
          </ul>
        </li>
        <li>Go to your app&apos;s Settings and copy the Client ID and Client Secret</li>
      </ol>
    </div>
  );
}

function CredentialField({
  id,
  label,
  placeholder,
  value,
  onChange,
  visible,
  setVisible,
  hideLabel,
  showLabel,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  setVisible: (value: boolean) => void;
  hideLabel: string;
  showLabel: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={visible ? hideLabel : showLabel}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
