import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/ui/toast';
import { useByokCredentials } from '@features/auth/hooks/useByokCredentials';

type UseByokDialogControllerInput = {
  onCredentialsSaved: (() => void) | undefined;
};

function validateCredentials(clientId: string, clientSecret: string): string | null {
  const normalizedClientId = clientId.trim();
  const normalizedClientSecret = clientSecret.trim();

  if (!normalizedClientId) {
    return 'Client ID is required';
  }

  if (!normalizedClientSecret) {
    return 'Client Secret is required';
  }

  if (normalizedClientId.length < 20) {
    return 'Client ID appears to be too short';
  }

  if (normalizedClientSecret.length < 20) {
    return 'Client Secret appears to be too short';
  }

  return null;
}

export function useByokDialogController({ onCredentialsSaved }: UseByokDialogControllerInput) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [redirectUriCopied, setRedirectUriCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { credentials, hasCredentials, saveCredentials, clearCredentials } = useByokCredentials();

  const redirectUri = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return `${window.location.origin}/api/auth/byok/callback`;
  }, []);

  useEffect(() => {
    if (!open || !credentials) {
      return;
    }

    setClientId(credentials.clientId);
    setClientSecret(credentials.clientSecret);
  }, [credentials, open]);

  const handleSave = useCallback(() => {
    setError(null);

    const validationError = validateCredentials(clientId, clientSecret);
    if (validationError) {
      setError(validationError);
      return;
    }

    const success = saveCredentials({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });

    if (!success) {
      setError('Failed to save credentials');
      return;
    }

    onCredentialsSaved?.();
    setOpen(false);
  }, [clientId, clientSecret, onCredentialsSaved, saveCredentials]);

  const handleClear = useCallback(() => {
    clearCredentials();
    setClientId('');
    setClientSecret('');
    setOpen(false);
  }, [clearCredentials]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);

    if (newOpen) {
      return;
    }

    setTimeout(() => {
      setError(null);
      setShowClientId(false);
      setShowClientSecret(false);
    }, 200);
  }, []);

  const handleCopyRedirectUri = useCallback(async () => {
    if (!redirectUri) {
      return;
    }

    try {
      await navigator.clipboard.writeText(redirectUri);
      setRedirectUriCopied(true);
      toast.success('Redirect URI copied');
      setTimeout(() => setRedirectUriCopied(false), 2000);
    } catch {
      toast.error('Failed to copy Redirect URI');
    }
  }, [redirectUri]);

  return {
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
  };
}
