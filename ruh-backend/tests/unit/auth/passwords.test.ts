import { describe, expect, mock, test } from 'bun:test';

const mockHash = async (value: string) => `hashed:${value}`;
const mockCompare = async (value: string, hashedValue: string) => hashedValue === `hashed:${value}`;

mock.module('bcryptjs', () => ({
  default: {
    hash: mockHash,
    compare: mockCompare,
  },
  hash: mockHash,
  compare: mockCompare,
}));

const { hashPassword, verifyPassword } = await import('../../../src/auth/passwords.ts?authPasswordsUnit');

describe('passwords', () => {
  test('hashPassword delegates to bcrypt.hash', async () => {
    const hash = await hashPassword('test123');
    expect(hash).toBe('hashed:test123');
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
