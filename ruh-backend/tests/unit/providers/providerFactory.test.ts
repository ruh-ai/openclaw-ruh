/**
 * Unit tests for providers/index.ts — provider factory.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { getProvider, resetProvider } from '../../../src/providers';
import { DockerProvider } from '../../../src/providers/dockerProvider';
import { DaytonaProvider } from '../../../src/providers/daytonaProvider';

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  resetProvider();
  savedEnv.SANDBOX_PROVIDER = process.env.SANDBOX_PROVIDER;
  savedEnv.DAYTONA_API_KEY = process.env.DAYTONA_API_KEY;
  savedEnv.DAYTONA_API_URL = process.env.DAYTONA_API_URL;
});

afterEach(() => {
  resetProvider();
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
});

describe('getProvider', () => {
  test('returns DockerProvider by default', () => {
    process.env.SANDBOX_PROVIDER = 'docker';
    const provider = getProvider();
    expect(provider).toBeInstanceOf(DockerProvider);
  });

  test('returns DockerProvider when SANDBOX_PROVIDER is unset', () => {
    delete process.env.SANDBOX_PROVIDER;
    const provider = getProvider();
    expect(provider).toBeInstanceOf(DockerProvider);
  });

  test('returns DaytonaProvider when configured', () => {
    process.env.SANDBOX_PROVIDER = 'daytona';
    process.env.DAYTONA_API_KEY = 'test-key';
    process.env.DAYTONA_API_URL = 'https://api.daytona.test';
    const provider = getProvider();
    expect(provider).toBeInstanceOf(DaytonaProvider);
  });

  test('returns cached singleton on repeated calls', () => {
    process.env.SANDBOX_PROVIDER = 'docker';
    const first = getProvider();
    const second = getProvider();
    expect(first).toBe(second);
  });

  test('resetProvider clears the cache', () => {
    process.env.SANDBOX_PROVIDER = 'docker';
    const first = getProvider();
    resetProvider();
    const second = getProvider();
    expect(first).not.toBe(second);
  });

  test('throws when daytona is configured without API key', () => {
    process.env.SANDBOX_PROVIDER = 'daytona';
    delete process.env.DAYTONA_API_KEY;
    expect(() => getProvider()).toThrow(/DAYTONA_API_KEY/);
  });
});
