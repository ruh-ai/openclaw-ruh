import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/coverage',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironmentOptions: {
    // Allow MSW to intercept requests from jsdom
    customExportConditions: [''],
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 60,
      functions: 60,
      branches: 50,
      statements: 60,
    },
  },
};

// next/jest appends its own transformIgnorePatterns that would still block MSW's
// ESM-only dependencies (until-async, @mswjs/*). We override the merged config
// after createJestConfig processes it so our exclusions actually take effect.
const ESM_PKGS = 'msw|@mswjs|until-async|@bundled-es-modules';

const jestConfigFn = createJestConfig(config);
export default async () => {
  const base = await jestConfigFn();
  base.transformIgnorePatterns = [
    `/node_modules/(?!.pnpm)(?!(${ESM_PKGS}|geist)/)`,
    `/node_modules/.pnpm/(?!(${ESM_PKGS}|geist)@)`,
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  return base;
};
