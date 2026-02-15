'use client';

import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Loader2, CheckCircle, AlertTriangle, Mail } from 'lucide-react';

interface AccessRequestDialogProps {
  trigger?: React.ReactNode | null;
  defaultOpen?: boolean;
}

/**
 * Dialog for users to request access to the app while in Spotify development mode.
 * Collects name and email, sends request to backend which emails the admin.
 */
export function AccessRequestDialog({ trigger, defaultOpen = false }: AccessRequestDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [spotifyUsername, setSpotifyUsername] = useState('');
  const [motivation, setMotivation] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [step, setStep] = useState<'form' | 'verify' | 'success'>('form');
  const [error, setError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Send verification code
      const verifyResponse = await fetch('/api/access-request/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        // If verification is not enabled on server, submit directly
        if (verifyResponse.status === 404) {
          await submitRequest(null);
          return;
        }
        throw new Error(verifyData.error || 'Failed to send verification code');
      }

      // Move to verification step
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRequest = async (verificationToken: string | null) => {
    try {
      const response = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          email, 
          spotifyUsername, 
          motivation,
          verificationToken,
        }),
      });

      if (!response.ok) {
        const responseData = await response.json();
        throw new Error(responseData.error || 'Failed to send request');
      }

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      throw err;
    }
  };

  // Auto-verify when code is complete
  const handleCodeChange = async (code: string) => {
    setVerificationCode(code);
    setVerificationError(null);

    if (code.length === 6) {
      setIsVerifyingCode(true);
      
      try {
        const response = await fetch('/api/access-request/verify-email', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Invalid verification code');
        }

        // Code verified, submit the request
        await submitRequest(data.verificationToken);
      } catch (err) {
        setVerificationError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setIsVerifyingCode(false);
      }
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when closing
      setTimeout(() => {
        setName('');
        setEmail('');
        setSpotifyUsername('');
        setMotivation('');
        setVerificationCode('');
        setStep('form');
        setError(null);
        setVerificationError(null);
      }, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger || (
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <UserPlus className="h-3.5 w-3.5" />
              Request Access
            </button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        {step === 'success' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Request Sent
              </DialogTitle>
              <DialogDescription>
                Thank you for your interest! You will be notified by email once your access has been approved.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : step === 'verify' ? (
          <>
            <DialogHeader>
              <DialogTitle>Verify Your Email</DialogTitle>
              <DialogDescription>
                We've sent a 6-digit code to <strong>{email}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <Mail className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-amber-900 dark:text-amber-100">
                  Check your spam folder if you don't see the email. The code expires in 15 minutes.
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verificationCode">Verification Code</Label>
                <Input
                  id="verificationCode"
                  type="text"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => handleCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  disabled={isVerifyingCode}
                  className="font-mono text-2xl tracking-[0.5em] text-center"
                  autoFocus
                />
                {isVerifyingCode && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Verifying...
                  </p>
                )}
                {verificationError && (
                  <p className="text-sm text-destructive">{verificationError}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('form')}>
                Back
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request Access</DialogTitle>
              <DialogDescription>
                This app is currently in{' '}
                <a
                  href="https://developer.spotify.com/documentation/web-api/concepts/quota-modes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  development mode
                </a>{' '}
                with limited user slots. 
                Enter your details below to request access. Filling out the motivation field increases your chances of approval.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="Your real full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
                <div className="flex items-start gap-2 text-xs bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-medium text-foreground">Important:</span>{' '}
                    Use your <strong>real full name</strong> when requesting access. This is required by Spotify&apos;s terms of service.
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Spotify Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  Use the email address associated with your Spotify account.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="spotifyUsername">Spotify Username</Label>
                <Input
                  id="spotifyUsername"
                  type="text"
                  placeholder="your-spotify-username"
                  value={spotifyUsername}
                  onChange={(e) => setSpotifyUsername(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  Your Spotify username (optional, but helpful for verification).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="motivation">Motivation (Optional)</Label>
                <Textarea
                  id="motivation"
                  placeholder="Why would you like to use Listmagify? What features interest you? Filled requests are more likely to be approved."
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  disabled={isSubmitting}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Tell us why you&apos;d like to use the app. This helps us prioritize requests.
                </p>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !name || !email}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Request'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
