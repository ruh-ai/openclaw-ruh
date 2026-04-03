#!/usr/bin/env bun
/**
 * Unit test runner for agent-builder-ui.
 *
 * Bun 1.3.x shares a module registry within a single `bun test` invocation.
 * Files that call mock.module() for the same module will contaminate each
 * other when run in the same process.  This script:
 *
 *   1. Collects every test file (excluding e2e/).
 *   2. Splits files into two buckets: those that use mock.module() (must be
 *      isolated) and those that don't (safe to batch).
 *   3. Runs each mock.module file in its own `bun test` process.
 *   4. Runs all remaining files together in a single process.
 *
 * Usage: bun run scripts/run-unit-tests.ts
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { spawnSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BUN = process.execPath;

// Excluded directories
const EXCLUDED_DIRS = new Set(['node_modules', 'e2e', '.next', 'test-results', 'playwright-report']);

// Excluded files (integration/e2e tests that require real infrastructure)
const EXCLUDED_FILES = new Set([
  'lib/openclaw/__tests__/eval-pipeline.integration.test.ts',
]);

function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectTestFiles(full));
      } else if (entry.isFile() && /\.test\.(ts|tsx)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch {
    // ignore inaccessible dirs
  }
  return results;
}

function usesMockModule(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.includes('mock.module(');
  } catch {
    return false;
  }
}

const allFiles = collectTestFiles(ROOT);
const isolated: string[] = [];
const batched: string[] = [];

for (const f of allFiles) {
  const rel = relative(ROOT, f);
  if (EXCLUDED_FILES.has(rel)) continue;
  if (usesMockModule(f)) {
    isolated.push(f);
  } else {
    batched.push(f);
  }
}

console.log(`[test-runner] ${isolated.length} isolated files, ${batched.length} batched files`);

let failed = false;

// Run each isolated file in its own process
for (const file of isolated) {
  const rel = relative(ROOT, file);
  process.stdout.write(`[test-runner] ${rel} ... `);
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
    // Print the error details
    process.stdout.write(combined);
  } else {
    console.log(`ok (${passes} pass)`);
  }
}

// Run all batched files together
if (batched.length > 0) {
  console.log(`\n[test-runner] Running ${batched.length} batched files...`);
  const result = spawnSync(BUN, ['test', ...batched], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (result.status !== 0) {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
