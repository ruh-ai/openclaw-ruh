#!/usr/bin/env bun
/**
 * Isolated runner for tests/unit/z_routes/.
 *
 * Bun 1.3.x shares a module registry within a single `bun test` invocation.
 * All z_routes test files call mock.module('../../src/auth/tokens') and/or
 * mock.module('../../src/auth/middleware') with different user IDs — running
 * them together means the last-registered mock wins, causing cross-file
 * contamination.
 *
 * This script runs every file in tests/unit/z_routes/ in its own
 * `bun test` process so each gets a fresh module registry.
 *
 * Usage: bun run scripts/run-z-routes-tests.ts
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BUN = process.execPath;
const Z_ROUTES_DIR = join(ROOT, 'tests/unit/z_routes');

const files = readdirSync(Z_ROUTES_DIR)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => join(Z_ROUTES_DIR, f));

console.log(`[z-routes-runner] Running ${files.length} files in isolation...`);

let failed = false;

for (const file of files) {
  const rel = file.replace(ROOT + '/', '');
  process.stdout.write(`[z-routes-runner] ${rel} ... `);
  const result = spawnSync(BUN, ['test', file], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
    encoding: 'utf8',
  });
  const combined = (result.stdout ?? '') + (result.stderr ?? '');
  const passMatch = combined.match(/(\d+) pass/);
  const failMatch = combined.match(/(\d+) fail/);
  const passes = passMatch ? parseInt(passMatch[1]) : 0;
  const failures = failMatch ? parseInt(failMatch[1]) : 0;

  if (result.status !== 0) {
    failed = true;
    console.log(`FAIL (${passes} pass, ${failures} fail)`);
    process.stdout.write(combined);
  } else {
    console.log(`ok (${passes} pass)`);
  }
}

console.log(
  `\n[z-routes-runner] Done — ${files.length} files processed, ${failed ? 'SOME FAILED' : 'all passed'}.`,
);
process.exit(failed ? 1 : 0);
