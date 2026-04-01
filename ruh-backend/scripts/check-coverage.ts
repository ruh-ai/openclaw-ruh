#!/usr/bin/env bun
/**
 * Coverage threshold enforcer.
 * Reads coverage/lcov.info and fails (exit 1) if line or function coverage
 * falls below the configured thresholds.
 *
 * Usage: bun run scripts/check-coverage.ts
 */

import { readFileSync } from 'fs';

const LINE_THRESHOLD = 0.75;   // 75%
const FUNC_THRESHOLD = 0.75;   // 75%

const lcovPath = './coverage/lcov.info';

let lcov: string;
try {
  lcov = readFileSync(lcovPath, 'utf8');
} catch {
  console.error(`[coverage] Could not read ${lcovPath}. Run 'bun run test:coverage' first.`);
  process.exit(1);
}

// Parse LH (lines hit), LF (lines found), FNH (functions hit), FNF (functions found)
let linesHit = 0, linesFound = 0, fnHit = 0, fnFound = 0;

for (const line of lcov.split('\n')) {
  if (line.startsWith('LH:')) linesHit  += parseInt(line.slice(3));
  if (line.startsWith('LF:')) linesFound += parseInt(line.slice(3));
  if (line.startsWith('FNH:')) fnHit   += parseInt(line.slice(4));
  if (line.startsWith('FNF:')) fnFound += parseInt(line.slice(4));
}

const linePct = linesFound > 0 ? linesHit / linesFound : 0;
const fnPct   = fnFound   > 0 ? fnHit   / fnFound   : 0;

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

console.log(`[coverage] Lines:     ${pct(linePct)} (${linesHit}/${linesFound})`);
console.log(`[coverage] Functions: ${pct(fnPct)}  (${fnHit}/${fnFound})`);

let failed = false;

if (linePct < LINE_THRESHOLD) {
  console.error(`[coverage] ✗ Lines below threshold: ${pct(linePct)} < ${pct(LINE_THRESHOLD)}`);
  failed = true;
} else {
  console.log(`[coverage] ✓ Lines above threshold: ${pct(linePct)} >= ${pct(LINE_THRESHOLD)}`);
}

if (fnPct < FUNC_THRESHOLD) {
  console.error(`[coverage] ✗ Functions below threshold: ${pct(fnPct)} < ${pct(FUNC_THRESHOLD)}`);
  failed = true;
} else {
  console.log(`[coverage] ✓ Functions above threshold: ${pct(fnPct)} >= ${pct(FUNC_THRESHOLD)}`);
}

if (failed) process.exit(1);
