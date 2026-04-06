/**
 * Shared supertest helper — imports the Express app without triggering startup.
 * Call closeApp() in afterAll to drain any open handles.
 */

import { mock } from 'bun:test';
import supertest from 'supertest';

mock.module('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const cacheTag = new URL(import.meta.url).search.replace(/^\?/, '') || 'shared';
const { app, _streams } = await import(`../../src/app.ts?${cacheTag}`);

export { app, _streams };

/** Returns a supertest agent bound to the app. */
export function request() {
  return supertest(app);
}

/** Clears the in-memory stream map between tests. */
export function resetStreams() {
  _streams.clear();
}
