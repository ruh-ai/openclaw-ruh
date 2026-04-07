// Preloaded before every test file — sets minimal env vars.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://openclaw:changeme@localhost:5432/openclaw';
process.env.DAYTONA_API_KEY = process.env.DAYTONA_API_KEY ?? 'test-key-placeholder';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-for-unit-tests';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-for-unit-tests';
// Default to Docker provider in tests — Daytona tests set this explicitly
process.env.SANDBOX_PROVIDER = process.env.SANDBOX_PROVIDER ?? 'docker';
