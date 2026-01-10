'use client';

import { useState } from 'react';
import { MessageSquarePlus, Send, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface FeedbackDialogProps {
  /** Custom trigger element (optional - default floating button) */
  trigger?: React.ReactNode | null;
  /** Controlled open state (optional) */
  open?: boolean;
  /** Callback when dialog open state changes */
  onOpenChange?: (open: boolean) => void;
}

/**
 * NPS Score button component.
 */
function NpsButton({
  score,
  selected,
  onClick,
}: {
  score: number;
  selected: boolean;
  onClick: () => void;
}) {
  const getColor = (s: number, isSelected: boolean) => {
    if (!isSelected) return 'bg-muted hover:bg-muted/80';
    if (s <= 6) return 'bg-red-500 text-white';
    if (s <= 8) return 'bg-yellow-500 text-white';
    return 'bg-green-500 text-white';
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-7 h-7 rounded-md text-xs sm:text-sm font-medium transition-all',
        'focus:outline-none focus:ring-1 sm:focus:ring-2 focus:ring-ring',
        getColor(score, selected)
      )}
    >
      {score}
    </button>
  );
}

/**
 * FeedbackDialog - Modal for collecting NPS score and comments.
 * 
 * NPS (Net Promoter Score) scale:
 * - 0-6: Detractors
 * - 7-8: Passives
 * - 9-10: Promoters
 */
export function FeedbackDialog({ trigger, open: controlledOpen, onOpenChange }: FeedbackDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use controlled mode if open prop is provided
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
    
    // Reset state when closing
    if (!newOpen) {
      setTimeout(() => {
        setNpsScore(null);
        setName('');
        setEmail('');
        setComment('');
        setSubmitted(false);
        setError(null);
      }, 300);
    }
  };

  const normalizedName = name.trim();
  const normalizedEmail = email.trim();
  const normalizedComment = comment.trim();

  const hasAnyInput =
    npsScore !== null ||
    normalizedComment.length > 0 ||
    normalizedName.length > 0 ||
    normalizedEmail.length > 0;

  const isValidEmail = (value: string) => {
    if (value.length === 0) return true;
    // Simple validation: enough to prevent obvious typos without being overly strict.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const handleSubmit = async () => {
    if (!hasAnyInput) return;
    if (!isValidEmail(normalizedEmail)) {
      setError('Please enter a valid email address (or leave it blank).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npsScore,
          comment: normalizedComment || undefined,
          name: normalizedName || undefined,
          email: normalizedEmail || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setSubmitted(true);
      
      // Auto-close after success
      setTimeout(() => {
        handleOpenChange(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getNpsLabel = () => {
    if (npsScore === null) return null;
    if (npsScore <= 6) return { text: 'We\'ll work to improve!', color: 'text-red-500' };
    if (npsScore <= 8) return { text: 'Thanks for the feedback!', color: 'text-yellow-500' };
    return { text: 'Awesome! 🎉', color: 'text-green-500' };
  };

  const label = getNpsLabel();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="secondary" size="sm" className="gap-1.5">
              <MessageSquarePlus className="h-4 w-4" />
              Feedback
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        {submitted ? (
          <div className="py-6 text-center">
            <div className="text-4xl mb-4">🙏</div>
            <DialogTitle className="mb-2">Thank you!</DialogTitle>
            <DialogDescription>
              Your feedback helps us improve Listmagify.
            </DialogDescription>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share Your Feedback</DialogTitle>
              <DialogDescription>
                How likely are you to recommend Listmagify to a friend?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 sm:space-y-4 py-2 sm:py-4">
              {/* NPS Scale */}
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between gap-0.5">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                    <NpsButton
                      key={score}
                      score={score}
                      selected={npsScore === score}
                      onClick={() => setNpsScore((prev) => (prev === score ? null : score))}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground px-1">
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
                {label && (
                  <p className={cn('text-sm text-center font-medium', label.color)}>
                    {label.text}
                  </p>
                )}
              </div>

              {/* Contact fields */}
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="feedback-name" className="text-sm font-medium">
                      Name (optional)
                    </label>
                    <Input
                      id="feedback-name"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={200}
                      className="text-sm"
                      autoComplete="name"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="feedback-email" className="text-sm font-medium">
                      Email (optional)
                    </label>
                    <Input
                      id="feedback-email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={320}
                      className="text-sm"
                      autoComplete="email"
                      inputMode="email"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave your email if you want a reply.
                </p>
              </div>

              {/* Comment field */}
              <div className="space-y-2">
                <label htmlFor="feedback-comment" className="text-sm font-medium">
                  Any additional comments? (optional)
                </label>
                <Textarea
                  id="feedback-comment"
                  placeholder="Tell us what you think..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  className="text-sm"
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {comment.length}/1000
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                onClick={handleSubmit}
                disabled={!hasAnyInput || isSubmitting || !isValidEmail(normalizedEmail)}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Feedback
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
