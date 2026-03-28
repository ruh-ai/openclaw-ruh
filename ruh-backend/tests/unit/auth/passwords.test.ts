import { describe, expect, test } from 'bun:test';
import { hashPassword, verifyPassword } from '../../../src/auth/passwords';

describe('passwords', () => {
  test('hashPassword returns a bcrypt hash', async () => {
    const hash = await hashPassword('test123');
    expect(hash).toMatch(/^\$2[aby]?\$/);
    expect(hash.length).toBeGreaterThan(50);
  });

  test('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('mypassword');
    expect(await verifyPassword('mypassword', hash)).toBe(true);
  });

  test('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('mypassword');
    expect(await verifyPassword('wrongpassword', hash)).toBe(false);
  });

  test('different passwords produce different hashes', async () => {
    const hash1 = await hashPassword('password1');
    const hash2 = await hashPassword('password2');
    expect(hash1).not.toBe(hash2);
  });
});
