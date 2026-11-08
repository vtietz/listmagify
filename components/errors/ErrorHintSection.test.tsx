import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createAppError } from '@/lib/errors/types';

const sessionState: { data: unknown } = { data: null };

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: sessionState.data, status: 'authenticated' }),
}));

import { ErrorHintSection } from '@/components/errors/ErrorHintSection';

function mockByokConfig(byokEnabled: boolean) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ byokEnabled }))));
}

const rateLimitError = createAppError({
  message: 'Spotify rate limit reached',
  category: 'rate_limit',
  hint: 'Wait a moment.',
  suggestByok: true,
  context: { provider: 'spotify' },
});

describe('ErrorHintSection', () => {
  beforeEach(() => {
    sessionState.data = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing for errors without hint', () => {
    const { container } = render(
      <ErrorHintSection error={createAppError({ message: 'boom', category: 'api' })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('suggests BYOK when the server allows it and the user is not using it', async () => {
    mockByokConfig(true);
    render(<ErrorHintSection error={rateLimitError} />);

    expect(screen.getByText('Wait a moment.')).toBeInTheDocument();
    expect(await screen.findByText(/own Spotify API key/)).toBeInTheDocument();
  });

  it('does not suggest BYOK when the user already uses their own key', () => {
    mockByokConfig(true);
    sessionState.data = { musicProviderTokens: { spotify: { isByok: true } } };
    render(<ErrorHintSection error={rateLimitError} />);

    expect(screen.queryByText(/own Spotify API key/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not suggest BYOK when the server has it disabled', async () => {
    mockByokConfig(false);
    render(<ErrorHintSection error={rateLimitError} />);

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/own Spotify API key/)).not.toBeInTheDocument();
  });
});
