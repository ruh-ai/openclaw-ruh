import { beforeEach, describe, expect, test } from 'bun:test';
import {
  getBackendReadiness,
  markBackendNotReady,
  markBackendReady,
} from '../../../src/backendReadiness';

describe('backend readiness state', () => {
  beforeEach(() => {
    markBackendNotReady();
  });

  test('starts in not-ready state with a machine-readable reason', () => {
    const readiness = getBackendReadiness();

    expect(readiness.status).toBe('not_ready');
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe('Waiting for database initialization');
  });

  test('clears the reason once startup completes', () => {
    markBackendReady();

    const readiness = getBackendReadiness();

    expect(readiness.status).toBe('ready');
    expect(readiness.ready).toBe(true);
    expect(readiness.reason).toBeNull();
  });

  test('preserves a custom reason when readiness drops again after startup', () => {
    markBackendReady();
    markBackendNotReady('Docker daemon unavailable');

    const readiness = getBackendReadiness();

    expect(readiness.status).toBe('not_ready');
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe('Docker daemon unavailable');
  });
});
