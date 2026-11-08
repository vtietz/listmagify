/**
 * Maps HTTP error responses to user-facing explanations.
 *
 * Known, transient conditions (rate limits, provider outages, gateway
 * timeouts) are surfaced as hints instead of hard error reports, because
 * there is nothing for us to fix and the user can usually just retry.
 */

export type HttpErrorKind =
  | 'rate_limited'
  | 'provider_unavailable'
  | 'gateway_timeout'
  | 'server_error'
  | 'client_error';

export type ResponseSource = 'app' | 'proxy' | 'non-json';

export interface HttpErrorDescription {
  kind: HttpErrorKind;
  /** Short, user-facing title. */
  title: string;
  /** What it means and what the user can do. Absent for unexplained errors. */
  hint?: string;
  /** Transient errors are shown as a hint toast instead of opening the report dialog. */
  transient: boolean;
  /** Using an own API key (BYOK) gives the user a separate quota. */
  suggestByok: boolean;
}

export interface HttpErrorInput {
  status: number;
  /** Display name of the provider the request targeted, e.g. "Spotify". */
  providerName: string;
  responseSource: ResponseSource;
  /** Provider auth error code from the response payload, if any. */
  code?: string | undefined;
}

function isRateLimited({ status, code }: HttpErrorInput): boolean {
  return status === 429 || code === 'rate_limited';
}

function isProviderUnavailable({ status, code, responseSource }: HttpErrorInput): boolean {
  return code === 'provider_unavailable' || (status === 503 && responseSource === 'app');
}

function isGatewayTimeout({ status, responseSource }: HttpErrorInput): boolean {
  return responseSource === 'proxy' || status === 504;
}

export function describeHttpError(input: HttpErrorInput): HttpErrorDescription {
  const { status, providerName } = input;

  if (isRateLimited(input)) {
    return {
      kind: 'rate_limited',
      title: `${providerName} rate limit reached`,
      hint: `${providerName} is limiting how many requests Listmagify can make right now. Wait a moment and try again.`,
      transient: true,
      suggestByok: true,
    };
  }

  if (isProviderUnavailable(input)) {
    return {
      kind: 'provider_unavailable',
      title: `${providerName} is temporarily unavailable`,
      hint: `${providerName} did not respond correctly after several retries. This is usually a short outage on their side. Please try again in a minute.`,
      transient: true,
      suggestByok: false,
    };
  }

  if (isGatewayTimeout(input)) {
    return {
      kind: 'gateway_timeout',
      title: 'The request took too long',
      hint: `The server did not answer in time, often because ${providerName} was slow to respond. Please try again. If it keeps happening, send a report.`,
      transient: true,
      suggestByok: false,
    };
  }

  if (status >= 500) {
    return { kind: 'server_error', title: `Request failed: ${status}`, transient: false, suggestByok: false };
  }

  return { kind: 'client_error', title: `Request failed: ${status}`, transient: false, suggestByok: false };
}
