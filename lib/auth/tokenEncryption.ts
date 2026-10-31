import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
let didWarnMissingKey = false;

function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY env var is required for token storage. Generate one with: openssl rand -hex 32'
    );
  }
  // Derive a 32-byte key from the env var using scrypt
  return scryptSync(key, 'listmagify-token-salt', 32);
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv:tag:encrypted (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex!, 'hex');
  const tag = Buffer.from(tagHex!, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted!, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Check if token encryption is available (TOKEN_ENCRYPTION_KEY is set).
 * Token persistence is disabled when the key is not configured.
 */
export function isTokenEncryptionAvailable(): boolean {
  return !!process.env.TOKEN_ENCRYPTION_KEY;
}

/**
 * Emit a one-time warning when token storage encryption is not configured.
 */
export function warnIfTokenEncryptionMissing(context: string): void {
  if (process.env.NODE_ENV === 'test') return;
  // `next build` loads auth modules without runtime secrets; only warn on real starts.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (isTokenEncryptionAvailable()) return;
  if (didWarnMissingKey) return;

  didWarnMissingKey = true;
  console.warn(
    `[auth-token-store] TOKEN_ENCRYPTION_KEY is not set (${context}); token persistence is disabled. Generate one with: openssl rand -hex 32`
  );
}
