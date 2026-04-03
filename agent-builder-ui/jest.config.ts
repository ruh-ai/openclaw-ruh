import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironmentOptions: {
    customExportConditions: [''],
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
};

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
