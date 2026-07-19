import crypto from 'crypto';

/**
 * AES-256-GCM encryption for user-supplied provider API keys (C4).
 *
 * The encryption key is derived from the `ENCRYPTION_KEY` env var (scrypt to a
 * 32-byte key), so plaintext keys never touch disk. Each secret is encrypted
 * with a random 12-byte IV and stored alongside its IV + GCM auth tag.
 *
 * Ciphertext is useless without ENCRYPTION_KEY — treat that env var like any
 * other top-level secret (never commit it; rotate carefully, since rotating
 * invalidates all previously stored keys).
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT = 'igniteai-apikey-v1'; // fixed salt: keeps derivation deterministic across restarts

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY is missing or too short (min 16 chars). Set it in your environment ' +
        'to enable per-user API key storage. Generate one with `openssl rand -base64 32`.'
    );
  }
  return crypto.scryptSync(secret, SALT, 32);
}

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * A short, safe-to-display preview of a secret (first 3 + last 4 chars) so the
 * UI can show which key is set without ever revealing it. Never returns more
 * than the edges of the key.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return '••••';
  return `${plaintext.slice(0, 3)}…${plaintext.slice(-4)}`;
}

export function isEncryptionConfigured(): boolean {
  const secret = process.env.ENCRYPTION_KEY;
  return !!secret && secret.length >= 16;
}
