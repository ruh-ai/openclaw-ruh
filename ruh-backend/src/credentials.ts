/**
 * Agent credential encryption — AES-256-GCM.
 *
 * Master key is read from AGENT_CREDENTIALS_KEY env var (64 hex chars = 32 bytes).
 * If not set, credentials are stored as base64-encoded plaintext (dev mode only).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getConfig } from './config';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;

function getMasterKey(): Buffer | null {
  const hex = getConfig().agentCredentialsKey;
  if (!hex) return null;
  return Buffer.from(hex, 'hex');
}

export interface EncryptedBlob {
  /** Base64-encoded ciphertext + auth tag */
  encrypted: string;
  /** Base64-encoded IV */
  iv: string;
}

/**
 * Encrypt a credentials object (key-value pairs) into an opaque blob.
 * Returns { encrypted, iv } for storage.
 */
export function encryptCredentials(plain: Record<string, string>): EncryptedBlob {
  const key = getMasterKey();
  const json = JSON.stringify(plain);

  if (!key) {
    // Dev mode: base64-encode without encryption
    console.warn('[credentials] AGENT_CREDENTIALS_KEY not set — storing credentials in plaintext (dev mode)');
    return {
      encrypted: Buffer.from(json, 'utf-8').toString('base64'),
      iv: '',
    };
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);

  const encryptedBuf = Buffer.concat([
    cipher.update(json, 'utf-8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return {
    encrypted: encryptedBuf.toString('base64'),
    iv: iv.toString('base64'),
  };
}

/**
 * Decrypt a previously encrypted credentials blob.
 * Returns the original key-value object.
 */
export function decryptCredentials(encrypted: string, iv: string): Record<string, string> {
  const key = getMasterKey();

  if (!key) {
    // Dev mode: base64-decode
    return JSON.parse(Buffer.from(encrypted, 'base64').toString('utf-8'));
  }

  const encBuf = Buffer.from(encrypted, 'base64');
  const ivBuf = Buffer.from(iv, 'base64');

  // Last 16 bytes are the GCM auth tag
  const ciphertext = encBuf.subarray(0, encBuf.length - TAG_BYTES);
  const authTag = encBuf.subarray(encBuf.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGO, key, ivBuf);
  decipher.setAuthTag(authTag);

  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf-8');

  return JSON.parse(plain);
}
