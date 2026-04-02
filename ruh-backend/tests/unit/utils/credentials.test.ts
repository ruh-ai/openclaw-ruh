/**
 * Unit tests for src/credentials.ts — AES-256-GCM encryption/decryption.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

// ── Control agentCredentialsKey via process.env to avoid polluting config mock

import { encryptCredentials, decryptCredentials } from '../../../src/credentials';

// ─────────────────────────────────────────────────────────────────────────────

let savedCredentialsKey: string | undefined;

beforeEach(() => {
  savedCredentialsKey = process.env.AGENT_CREDENTIALS_KEY;
  delete process.env.AGENT_CREDENTIALS_KEY;
});

afterEach(() => {
  if (savedCredentialsKey === undefined) {
    delete process.env.AGENT_CREDENTIALS_KEY;
  } else {
    process.env.AGENT_CREDENTIALS_KEY = savedCredentialsKey;
  }
});

// ── Dev mode (no key) ────────────────────────────────────────────────────────

describe('credentials — dev mode (no AGENT_CREDENTIALS_KEY)', () => {
  test('encryptCredentials returns base64-encoded JSON', () => {
    const plain = { api_key: 'sk-123', secret: 'mysecret' };
    const blob = encryptCredentials(plain);
    expect(blob.iv).toBe('');
    const decoded = JSON.parse(Buffer.from(blob.encrypted, 'base64').toString('utf-8'));
    expect(decoded).toEqual(plain);
  });

  test('decryptCredentials round-trips in dev mode', () => {
    const plain = { token: 'abc', password: 'def' };
    const blob = encryptCredentials(plain);
    const result = decryptCredentials(blob.encrypted, blob.iv);
    expect(result).toEqual(plain);
  });
});

// ── With encryption key ──────────────────────────────────────────────────────

describe('credentials — with AGENT_CREDENTIALS_KEY', () => {
  // 64 hex chars = 32 bytes
  const TEST_KEY = 'a'.repeat(64);

  test('encrypt produces different output each time (random IV)', () => {
    process.env.AGENT_CREDENTIALS_KEY = TEST_KEY;
    const plain = { key: 'value' };
    const blob1 = encryptCredentials(plain);
    const blob2 = encryptCredentials(plain);
    expect(blob1.encrypted).not.toBe(blob2.encrypted);
    expect(blob1.iv).not.toBe(blob2.iv);
  });

  test('decrypt round-trips correctly', () => {
    process.env.AGENT_CREDENTIALS_KEY = TEST_KEY;
    const plain = { api_key: 'sk-prod-123', refresh_token: 'rt-456' };
    const blob = encryptCredentials(plain);
    const result = decryptCredentials(blob.encrypted, blob.iv);
    expect(result).toEqual(plain);
  });

  test('encrypted output is not plaintext', () => {
    process.env.AGENT_CREDENTIALS_KEY = TEST_KEY;
    const plain = { api_key: 'sk-visible' };
    const blob = encryptCredentials(plain);
    const raw = Buffer.from(blob.encrypted, 'base64').toString('utf-8');
    expect(raw).not.toContain('sk-visible');
  });

  test('tampered ciphertext throws', () => {
    process.env.AGENT_CREDENTIALS_KEY = TEST_KEY;
    const plain = { key: 'value' };
    const blob = encryptCredentials(plain);

    // Tamper with encrypted data
    const buf = Buffer.from(blob.encrypted, 'base64');
    buf[0] ^= 0xff;
    const tampered = buf.toString('base64');

    expect(() => decryptCredentials(tampered, blob.iv)).toThrow();
  });

  test('wrong key throws', () => {
    process.env.AGENT_CREDENTIALS_KEY = TEST_KEY;
    const plain = { key: 'value' };
    const blob = encryptCredentials(plain);

    // Switch to different key for decryption
    process.env.AGENT_CREDENTIALS_KEY = 'b'.repeat(64);
    expect(() => decryptCredentials(blob.encrypted, blob.iv)).toThrow();
  });

  test('handles empty credentials object', () => {
    process.env.AGENT_CREDENTIALS_KEY = TEST_KEY;
    const plain = {};
    const blob = encryptCredentials(plain);
    const result = decryptCredentials(blob.encrypted, blob.iv);
    expect(result).toEqual({});
  });
});
