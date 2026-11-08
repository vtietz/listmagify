"use client";

import { useSession } from "next-auth/react";
import { KeyRound, Lightbulb } from "lucide-react";
import type { AppError } from "@/lib/errors/types";
import { isMusicProviderId } from "@/lib/music-provider/providerId";
import { getProviderDisplayName } from "@/lib/music-provider/providerLabels";
import type { MusicProviderId } from "@/lib/music-provider/types";
import { useByokEnabled } from "@features/auth/hooks/useByokEnabled";

type SessionWithProviderTokens = {
  musicProviderTokens?: Record<string, { isByok?: boolean } | undefined>;
};

function resolveErrorProvider(error: AppError): MusicProviderId | null {
  const provider = error.context?.provider;
  return typeof provider === "string" && isMusicProviderId(provider) ? provider : null;
}

/**
 * Explains a known error condition and, for rate limits, suggests using an
 * own API key when the server allows it and the user isn't using one yet.
 */
export function ErrorHintSection({ error }: { error: AppError }) {
  const hint = error.hint;
  const providerId = resolveErrorProvider(error);

  if (!hint && !error.suggestByok) {
    return null;
  }

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/50 text-sm">
      {hint ? (
        <div className="flex gap-2">
          <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <p>{hint}</p>
        </div>
      ) : null}
      {error.suggestByok && providerId ? <ByokSuggestion providerId={providerId} /> : null}
    </div>
  );
}

function ByokSuggestion({ providerId }: { providerId: MusicProviderId }) {
  const { data } = useSession();
  const tokens = (data as SessionWithProviderTokens | null)?.musicProviderTokens;
  const alreadyByok = tokens?.[providerId]?.isByok === true;
  const byokEnabled = useByokEnabled(providerId, !alreadyByok);

  if (alreadyByok || byokEnabled !== true) {
    return null;
  }

  const providerName = getProviderDisplayName(providerId);
  return (
    <div className="flex gap-2">
      <KeyRound className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
      <p>
        Hitting this often? Sign in with your own {providerName} API key (BYOK) to get a
        separate quota. You can set it up on the sign-in page under &quot;Use Your Own API Key&quot;.
      </p>
    </div>
  );
}
