#!/usr/bin/env bun
/**
 * Isolated unit test runner for ruh-backend.
 *
 * Bun 1.3.x shares a module registry within a single `bun test` invocation.
 * Tests using mock.module() contaminate each other when run together.
 * This script runs each test group in its own process for clean isolation.
 *
 * Usage: bun run scripts/run-unit-tests.ts
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BUN = process.execPath;

// Groups that can run as whole directories (within-group isolation is fine)
const DIR_GROUPS = [
  'tests/unit/stores',
  'tests/unit/clients',
  'tests/unit/auth',
  'tests/unit/db',
  'tests/unit/utils',
];

// z_routes: each file in its own process (heavy mock.module contamination)
const Z_ROUTES_DIR = 'tests/unit/z_routes';

// Root-level tests (not in subdirectories)
const ROOT_TESTS = 'tests/unit/*.test.ts';

let totalPass = 0;
let totalFail = 0;
let groupsFailed = 0;

function runGroup(args: string[], label: string): void {
  process.stdout.write(`  ${label} ... `);
  const result = spawnSync(BUN, ['test', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
    encoding: 'utf8',
  });
  const combined = (result.stdout ?? '') + (result.stderr ?? '');
  const passMatch = combined.match(/(\d+) pass/);
  const failMatch = combined.match(/(\d+) fail/);
  const passes = passMatch ? parseInt(passMatch[1]) : 0;
  const failures = failMatch ? parseInt(failMatch[1]) : 0;

  totalPass += passes;
  totalFail += failures;

  if (result.status !== 0) {
    groupsFailed++;
    console.log(`FAIL (${passes} pass, ${failures} fail)`);
    process.stdout.write(combined);
  } else {
    console.log(`ok (${passes} pass)`);
  }
}

console.log('[unit-test-runner] Running backend unit tests in isolation...\n');

// 1. Directory groups
for (const dir of DIR_GROUPS) {
  runGroup([join(ROOT, dir)], dir);
}

// 2. z_routes (file-by-file)
const zRouteFiles = readdirSync(join(ROOT, Z_ROUTES_DIR))
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => join(Z_ROUTES_DIR, f));

for (const file of zRouteFiles) {
  runGroup([join(ROOT, file)], file);
}

// 3. Root-level tests
const rootFiles = readdirSync(join(ROOT, 'tests/unit'))
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

if (rootFiles.length > 0) {
  runGroup(rootFiles.map((f) => join(ROOT, 'tests/unit', f)), 'tests/unit/*.test.ts');
}

console.log(`\n[unit-test-runner] Done — ${totalPass} pass, ${totalFail} fail`);
if (groupsFailed > 0) {
  console.log(`[unit-test-runner] ${groupsFailed} group(s) failed.`);
}
process.exit(groupsFailed > 0 ? 1 : 0);
