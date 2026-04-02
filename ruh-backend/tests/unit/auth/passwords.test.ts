import { describe, expect, test } from 'bun:test';
import { hashPassword, verifyPassword } from '../../../src/auth/passwords';

// bcrypt with 12 rounds is intentionally slow (~2-3s per hash in CI).
// Each test that calls hashPassword needs a generous timeout.
const BCRYPT_TIMEOUT_MS = 30_000;

describe('passwords', () => {
  test('hashPassword returns a bcrypt hash', async () => {
    const hash = await hashPassword('test123');
    expect(hash).toMatch(/^\$2[aby]?\$/);
    expect(hash.length).toBeGreaterThan(50);
  }, BCRYPT_TIMEOUT_MS);

  test('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('mypassword');
    expect(await verifyPassword('mypassword', hash)).toBe(true);
  }, BCRYPT_TIMEOUT_MS);

  test('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('mypassword');
    expect(await verifyPassword('wrongpassword', hash)).toBe(false);
  }, BCRYPT_TIMEOUT_MS);

  test('different passwords produce different hashes', async () => {
    const hash1 = await hashPassword('password1');
    const hash2 = await hashPassword('password2');
    expect(hash1).not.toBe(hash2);
  }, BCRYPT_TIMEOUT_MS);
});
