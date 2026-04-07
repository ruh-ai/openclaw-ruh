/**
 * Sandbox provider factory — returns the appropriate provider based on config.
 */

import { getConfig } from '../config';
import { DockerProvider } from './dockerProvider';
import { DaytonaProvider } from './daytonaProvider';
import type { SandboxProvider, SandboxProviderType } from './types';

export type { SandboxProvider, SandboxProviderType, InfrastructureResult, ManagedSandboxInfo } from './types';

let cachedProvider: SandboxProvider | null = null;

/**
 * Returns the configured sandbox provider (singleton).
 * Reads `SANDBOX_PROVIDER` from env to decide between Docker and Daytona.
 */
export function getProvider(): SandboxProvider {
  if (cachedProvider) return cachedProvider;

  const config = getConfig();
  const providerType: SandboxProviderType = config.sandboxProvider;

  switch (providerType) {
    case 'daytona': {
      if (!config.daytonaApiKey) {
        throw new Error('DAYTONA_API_KEY is required when SANDBOX_PROVIDER=daytona');
      }
      cachedProvider = new DaytonaProvider({
        apiUrl: config.daytonaApiUrl ?? 'https://app.daytona.io/api',
        apiKey: config.daytonaApiKey,
      });
      break;
    }
    case 'docker':
    default:
      cachedProvider = new DockerProvider();
      break;
  }

  return cachedProvider;
}

/** Reset the cached provider (for testing). */
export function resetProvider(): void {
  cachedProvider = null;
}
