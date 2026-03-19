/**
 * Shared supertest helper — imports the Express app without triggering startup.
 * Call closeApp() in afterAll to drain any open handles.
 */

import { app, _streams } from '../../src/app';
import supertest from 'supertest';

export { app, _streams };

/** Returns a supertest agent bound to the app. */
export function request() {
  return supertest(app);
}

/** Clears the in-memory stream map between tests. */
export function resetStreams() {
  _streams.clear();
}
