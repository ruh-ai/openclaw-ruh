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

import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

const BUN = process.execPath; // same bun binary that invoked this script

const GROUPS = [
  'tests/unit/stores',
  'tests/unit/clients',
  'tests/unit/auth',
  'tests/unit/db',
  'tests/unit/utils',
  'tests/unit/z_routes',
];

const coverageDir = 'coverage';
mkdirSync(coverageDir, { recursive: true });

const snapshots: string[] = [];

for (let i = 0; i < GROUPS.length; i++) {
  const group = GROUPS[i];
  console.log(`\n[coverage-runner] Running ${group} ...`);

  const result = spawnSync(
    BUN,
    ['test', group, '--coverage', '--coverage-reporter=lcov', `--coverage-dir=${coverageDir}`],
    { stdio: 'inherit', encoding: 'utf8' },
  );

  if (result.status !== 0) {
    console.error(`[coverage-runner] Tests failed for group: ${group}`);
    process.exit(result.status ?? 1);
  }

  const lcovPath = join(coverageDir, 'lcov.info');
  if (existsSync(lcovPath)) {
    const snapshot = join(coverageDir, `lcov.${i}.info`);
    copyFileSync(lcovPath, snapshot);
    snapshots.push(snapshot);
    console.log(`[coverage-runner] Saved snapshot: ${snapshot}`);
  } else {
    console.warn(`[coverage-runner] No lcov.info produced for group: ${group}`);
  }
}

// Concatenate all snapshots into a single lcov.info for check-coverage.ts
const merged = snapshots.map((p) => readFileSync(p, 'utf8')).join('\n');
writeFileSync(join(coverageDir, 'lcov.info'), merged);
console.log(`\n[coverage-runner] Merged ${snapshots.length} lcov snapshots into coverage/lcov.info`);

// Run the threshold check
const check = spawnSync(BUN, ['run', 'scripts/check-coverage.ts'], { stdio: 'inherit' });
process.exit(check.status ?? 0);
