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
import { UserPlus, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, spotifyUsername, motivation }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send request');
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
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
        setIsSuccess(false);
        setError(null);
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
        {isSuccess ? (
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
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request Access</DialogTitle>
              <DialogDescription>
                This app is currently in development mode with limited user slots. 
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
