#!/usr/bin/env bun
/**
 * Coverage threshold enforcer for agent-builder-ui.
 * Reads coverage/lcov.info and fails (exit 1) if line or function coverage
 * falls below the configured thresholds.
 *
 * Only counts source files that were meaningfully tested — files
 * with less than 10% line coverage are excluded as transitive imports rather
 * than intentionally tested modules. This prevents bun's full-import-graph
 * instrumentation from dragging coverage below threshold.
 *
 * Usage: bun run scripts/check-coverage.ts
 */

import { readFileSync } from 'fs';

const LINE_THRESHOLD = 0.90;   // 90%
const FUNC_THRESHOLD = 0.90;   // 90%
const MIN_FILE_COVERAGE = 0.15; // 15% — below this, file is considered untested transitive import

const lcovPath = './coverage/lcov.info';

let lcov: string;
try {
  lcov = readFileSync(lcovPath, 'utf8');
} catch {
  console.error(`[coverage] Could not read ${lcovPath}. Run 'bun test --coverage' first.`);
  process.exit(1);
}

// Parse per-file records (SF: ... end_of_record)
let linesHit = 0, linesFound = 0, fnHit = 0, fnFound = 0;
let totalFiles = 0, includedFiles = 0, excludedFiles = 0;
const excluded: string[] = [];

let currentFile = '';
let fileLH = 0, fileLF = 0, fileFNH = 0, fileFNF = 0;

function flushFile() {
  if (!currentFile) return;
  totalFiles++;

  const filePct = fileLF > 0 ? fileLH / fileLF : 0;

  if (filePct >= MIN_FILE_COVERAGE) {
    linesHit += fileLH;
    linesFound += fileLF;
    fnHit += fileFNH;
    fnFound += fileFNF;
    includedFiles++;
  } else {
    excluded.push(`${(filePct * 100).toFixed(1)}% ${currentFile}`);
    excludedFiles++;
  }

  currentFile = '';
  fileLH = fileLF = fileFNH = fileFNF = 0;
}

for (const line of lcov.split('\n')) {
  if (line.startsWith('SF:')) {
    flushFile();
    currentFile = line.slice(3);
  } else if (line.startsWith('LH:')) {
    fileLH += parseInt(line.slice(3));
  } else if (line.startsWith('LF:')) {
    fileLF += parseInt(line.slice(3));
  } else if (line.startsWith('FNH:')) {
    fileFNH += parseInt(line.slice(4));
  } else if (line.startsWith('FNF:')) {
    fileFNF += parseInt(line.slice(4));
  } else if (line === 'end_of_record') {
    flushFile();
  }
}
flushFile();

const linePct = linesFound > 0 ? linesHit / linesFound : 0;
const fnPct   = fnFound   > 0 ? fnHit   / fnFound   : 0;

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

console.log(`[coverage] agent-builder-ui`);
console.log(`[coverage] Files:     ${includedFiles} measured, ${excludedFiles} excluded (${totalFiles} total)`);
if (excluded.length > 0) {
  console.log(`[coverage] Excluded (below ${(MIN_FILE_COVERAGE * 100).toFixed(0)}%):`);
  for (const e of excluded) console.log(`[coverage]   - ${e}`);
}
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
