#!/usr/bin/env bun
/**
 * Coverage runner.
 *
 * Runs each unit-test group in its own bun process (required for mock.module
 * isolation) with --coverage, copies each resulting lcov.info to a numbered
 * snapshot, then concatenates all snapshots into coverage/lcov.info before
 * calling check-coverage.ts.
 *
 * Usage: bun run scripts/run-coverage.ts
 */

import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

const BUN = process.execPath; // same bun binary that invoked this script

// Groups run as directories (one bun process per group)
const PURE_GROUPS = [
  'tests/unit/stores',
  'tests/unit/clients',
  'tests/unit/auth',
  'tests/unit/db',
  'tests/unit/utils',
];

// z_routes: each file gets its own process to prevent mock.module contamination
const Z_ROUTES_DIR = 'tests/unit/z_routes';
const Z_ROUTES_FILES = readdirSync(Z_ROUTES_DIR)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => join(Z_ROUTES_DIR, f));

const coverageDir = 'coverage';
mkdirSync(coverageDir, { recursive: true });

const snapshots: string[] = [];
let snapshotIdx = 0;

function runWithCoverage(args: string[], label: string): void {
  console.log(`\n[coverage-runner] Running ${label} ...`);
  const result = spawnSync(
    BUN,
    ['test', ...args, '--coverage', '--coverage-reporter=lcov', `--coverage-dir=${coverageDir}`],
    { stdio: 'inherit', encoding: 'utf8' },
  );
  if (result.status !== 0) {
    console.error(`[coverage-runner] Tests failed for: ${label}`);
    process.exit(result.status ?? 1);
  }
  const lcovPath = join(coverageDir, 'lcov.info');
  if (existsSync(lcovPath)) {
    const snapshot = join(coverageDir, `lcov.${snapshotIdx}.info`);
    copyFileSync(lcovPath, snapshot);
    snapshots.push(snapshot);
    console.log(`[coverage-runner] Saved snapshot: ${snapshot}`);
    snapshotIdx++;
  } else {
    console.warn(`[coverage-runner] No lcov.info produced for: ${label}`);
  }
}

// Run pure groups
for (const group of PURE_GROUPS) {
  runWithCoverage([group], group);
}

// Run each z_routes file in isolation
for (const file of Z_ROUTES_FILES) {
  runWithCoverage([file], file);
}

// Concatenate all snapshots into a single lcov.info for check-coverage.ts
const merged = snapshots.map((p) => readFileSync(p, 'utf8')).join('\n');
writeFileSync(join(coverageDir, 'lcov.info'), merged);
console.log(`\n[coverage-runner] Merged ${snapshots.length} lcov snapshots into coverage/lcov.info`);

// Run the threshold check
const check = spawnSync(BUN, ['run', 'scripts/check-coverage.ts'], { stdio: 'inherit' });
process.exit(check.status ?? 0);
