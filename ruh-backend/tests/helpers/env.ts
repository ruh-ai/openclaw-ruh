// Preloaded before every test file — sets minimal env vars.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost/openclaw_test';
process.env.DAYTONA_API_KEY = process.env.DAYTONA_API_KEY ?? 'test-key-placeholder';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000';
