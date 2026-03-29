/**
 * Tests for getAllActiveTokens() in the encrypted token store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./tokenDb', () => ({
  getAuthDb: vi.fn(),
}));

vi.mock('./tokenEncryption', () => ({
  isTokenEncryptionAvailable: vi.fn(),
  encryptToken: vi.fn((val: string) => `encrypted:${val}`),
  decryptToken: vi.fn((val: string) => val.replace('encrypted:', '')),
}));

import { getAllActiveTokens } from './tokenStore';
import { getAuthDb } from './tokenDb';
import { isTokenEncryptionAvailable, decryptToken } from './tokenEncryption';

const mockGetAuthDb = vi.mocked(getAuthDb);
const mockIsTokenEncryptionAvailable = vi.mocked(isTokenEncryptionAvailable);
const mockDecryptToken = vi.mocked(decryptToken);

/** Shape matching the internal TokenRow interface (not exported). */
interface TokenRow {
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  access_token_expires: number | null;
  status: string;
  is_byok: number;
  byok_client_id: string | null;
  byok_client_secret: string | null;
  updated_at: string;
}

function createTokenRow(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    user_id: 'user-1',
    provider: 'spotify',
    access_token: 'encrypted:access-123',
    refresh_token: 'encrypted:refresh-123',
    access_token_expires: Date.now() + 3600000,
    status: 'active',
    is_byok: 0,
    byok_client_id: null,
    byok_client_secret: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockDb() {
  const mockStatement = {
    all: vi.fn(),
    get: vi.fn(),
    run: vi.fn(),
  };
  return {
    prepare: vi.fn(() => mockStatement),
    _statement: mockStatement,
  };
}

describe('getAllActiveTokens', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    mockGetAuthDb.mockReturnValue(mockDb as any);
    mockIsTokenEncryptionAvailable.mockReturnValue(true);
  });

  it('returns empty array when encryption is not available', () => {
    mockIsTokenEncryptionAvailable.mockReturnValue(false);

    const result = getAllActiveTokens();

    expect(result).toEqual([]);
    expect(mockGetAuthDb).not.toHaveBeenCalled();
  });

  it('returns all active tokens across multiple users', () => {
    const now = Date.now();
    const rows: TokenRow[] = [
      createTokenRow({
        user_id: 'user-1',
        provider: 'spotify',
        access_token: 'encrypted:sp-access-1',
        refresh_token: 'encrypted:sp-refresh-1',
        access_token_expires: now + 3600000,
      }),
      createTokenRow({
        user_id: 'user-2',
        provider: 'tidal',
        access_token: 'encrypted:td-access-2',
        refresh_token: 'encrypted:td-refresh-2',
        access_token_expires: now + 7200000,
      }),
      createTokenRow({
        user_id: 'user-1',
        provider: 'tidal',
        access_token: 'encrypted:td-access-1',
        refresh_token: 'encrypted:td-refresh-1',
        access_token_expires: null,
      }),
    ];

    mockDb._statement.all.mockReturnValue(rows);

    const result = getAllActiveTokens();

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      userId: 'user-1',
      provider: 'spotify',
      accessToken: 'sp-access-1',
      refreshToken: 'sp-refresh-1',
    });
    expect(result[1]).toMatchObject({
      userId: 'user-2',
      provider: 'tidal',
      accessToken: 'td-access-2',
      refreshToken: 'td-refresh-2',
    });
    expect(result[2]).toMatchObject({
      userId: 'user-1',
      provider: 'tidal',
      accessToken: 'td-access-1',
      refreshToken: 'td-refresh-1',
      accessTokenExpires: null,
    });
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining("status = 'active'")
    );
  });

  it('returns empty array when no active tokens exist', () => {
    mockDb._statement.all.mockReturnValue([]);

    const result = getAllActiveTokens();

    expect(result).toEqual([]);
  });

  it('filters out tokens that fail decryption', () => {
    const goodRow = createTokenRow({
      user_id: 'user-good',
      access_token: 'encrypted:good-access',
      refresh_token: 'encrypted:good-refresh',
    });
    const badRow = createTokenRow({
      user_id: 'user-bad',
      access_token: 'corrupted-data',
      refresh_token: 'encrypted:bad-refresh',
    });

    mockDb._statement.all.mockReturnValue([goodRow, badRow]);

    // The default mock strips "encrypted:" prefix. Make it throw for the corrupted token.
    mockDecryptToken.mockImplementation((val: string) => {
      if (val === 'corrupted-data') {
        throw new Error('Invalid encrypted token format');
      }
      return val.replace('encrypted:', '');
    });

    const result = getAllActiveTokens();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userId: 'user-good',
      accessToken: 'good-access',
    });
  });

  it('handles database errors gracefully and returns empty array', () => {
    mockGetAuthDb.mockImplementation(() => {
      throw new Error('SQLITE_CANTOPEN: unable to open database file');
    });

    const result = getAllActiveTokens();

    expect(result).toEqual([]);
  });

  it('correctly maps isByok flag from integer to boolean', () => {
    const byokRow = createTokenRow({
      is_byok: 1,
      byok_client_id: 'custom-client-id',
      byok_client_secret: 'encrypted:custom-secret',
    });

    mockDb._statement.all.mockReturnValue([byokRow]);

    const result = getAllActiveTokens();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      isByok: true,
      byokClientId: 'custom-client-id',
      byokClientSecret: 'custom-secret',
    });
  });

  it('decrypts byokClientSecret when present', () => {
    const row = createTokenRow({
      byok_client_secret: 'encrypted:my-secret',
    });

    mockDb._statement.all.mockReturnValue([row]);

    const result = getAllActiveTokens();

    expect(result[0]?.byokClientSecret).toBe('my-secret');
  });

  it('leaves byokClientSecret null when not present', () => {
    const row = createTokenRow({
      byok_client_secret: null,
    });

    mockDb._statement.all.mockReturnValue([row]);

    const result = getAllActiveTokens();

    expect(result[0]?.byokClientSecret).toBeNull();
  });
});
