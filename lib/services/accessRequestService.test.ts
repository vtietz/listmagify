import { describe, expect, it } from 'vitest';
import {
  detectAccessRequestRedFlags,
  parseAccessRequestInput,
  parseVerifyCodeInput,
  parseVerifyEmailInput,
} from '@/lib/services/accessRequestService';

describe('accessRequestService', () => {
  it('parses valid access request payload', () => {
    const parsed = parseAccessRequestInput({
      name: 'Jane Doe',
      email: 'JANE@EXAMPLE.COM',
      spotifyUsername: 'janedoe',
      motivation: 'I want to use it daily',
    });

    expect(parsed.email).toBe('jane@example.com');
    expect(parsed.name).toBe('Jane Doe');
  });

  it('detects expected red flags', () => {
    const flags = detectAccessRequestRedFlags({
      name: 'abc',
      spotifyUsername: 'bad user',
      motivation: 'test',
    });

    expect(flags).toContain('Name looks like username (no spaces, lowercase)');
    expect(flags).toContain('Spotify username contains spaces (invalid)');
    expect(flags).toContain('Generic or very short motivation');
  });

  it('normalizes verify-email payloads', () => {
    expect(parseVerifyEmailInput({ email: 'USER@EXAMPLE.COM' }).email).toBe('user@example.com');
    expect(parseVerifyCodeInput({ email: 'USER@EXAMPLE.COM', code: '123456' }).email).toBe('user@example.com');
  });
});
