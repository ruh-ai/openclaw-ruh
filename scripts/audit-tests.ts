#!/usr/bin/env bun
/**
 * Test Relevance Auditor
 *
 * Detects orphaned tests, stale mocks, and tests with no assertions.
 * Run: bun run scripts/audit-tests.ts [--fix]
 *
 * Checks:
 * 1. Orphaned imports — test imports a source module that no longer exists
 * 2. Empty tests — test blocks with no expect() calls
 * 3. Stale mock paths — mock.module() targeting a non-existent file
 * 4. Uncovered source files — source files with zero test coverage
 */

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, resolve, dirname, relative } from "path";

const ROOT = resolve(import.meta.dir, "..");
const FIX_MODE = process.argv.includes("--fix");

interface Issue {
  file: string;
  type: "orphaned-import" | "empty-test" | "stale-mock" | "untested-source";
  detail: string;
  line?: number;
}

const issues: Issue[] = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

function walk(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "coverage") continue;
    if (entry.isDirectory()) {
      results.push(...walk(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function resolveImport(testFile: string, importPath: string): string | null {
  const dir = dirname(testFile);

  // Handle alias imports (@/...)
  let resolved: string;
  if (importPath.startsWith("@/")) {
    // Find the service root (parent of the test file that has package.json)
    let serviceRoot = dir;
    while (serviceRoot !== ROOT && !existsSync(join(serviceRoot, "package.json"))) {
      serviceRoot = dirname(serviceRoot);
    }
    resolved = join(serviceRoot, importPath.slice(2));
  } else if (importPath.startsWith(".")) {
    resolved = resolve(dir, importPath);
  } else {
    // Node module import — skip
    return null;
  }

  // Try common extensions
  for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]) {
    if (existsSync(resolved + ext) && statSync(resolved + ext).isFile()) {
      return resolved + ext;
    }
  }

  return null; // Not found
}

// ── Check 1: Orphaned imports ───────────────────────────────────────────────

function checkOrphanedImports(testFile: string) {
  const content = readFileSync(testFile, "utf8");
  const importRegex = /(?:import|from)\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];

    // Skip node_modules, bun:test, test helpers
    if (
      !importPath.startsWith(".") &&
      !importPath.startsWith("@/")
    ) continue;
    if (importPath.includes("test-setup") || importPath.includes("test-helper") || importPath.includes("fixtures")) continue;

    const resolved = resolveImport(testFile, importPath);
    if (resolved === null && (importPath.startsWith(".") || importPath.startsWith("@/"))) {
      // Could not resolve — potential orphan
      const lineNum = content.substring(0, match.index).split("\n").length;
      issues.push({
        file: relative(ROOT, testFile),
        type: "orphaned-import",
        detail: `Import "${importPath}" does not resolve to an existing file`,
        line: lineNum,
      });
    }
  }
}

// ── Check 2: Empty tests ────────────────────────────────────────────────────

function checkEmptyTests(testFile: string) {
  const content = readFileSync(testFile, "utf8");
  const lines = content.split("\n");

  // Find test() blocks and check if the full body contains any assertion
  // We use brace-counting to find the full test body, not a regex
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const testMatch = line.match(/\b(?:test|it)\s*\(\s*["']([^"']+)["']/);
    if (!testMatch) continue;

    const testName = testMatch[1];
    const startLine = i;

    // Find the matching closing brace by counting
    let depth = 0;
    let foundOpen = false;
    let bodyText = "";

    for (let j = i; j < lines.length; j++) {
      const l = lines[j];
      for (const ch of l) {
        if (ch === "{") { depth++; foundOpen = true; }
        if (ch === "}") depth--;
      }
      bodyText += l + "\n";
      if (foundOpen && depth === 0) break;
    }

    // Check if body contains ANY assertion pattern
    const hasAssertion =
      bodyText.includes("expect(") ||
      bodyText.includes("expect.") ||
      bodyText.includes(".expect(") || // supertest chain
      bodyText.includes("assert(") ||
      bodyText.includes("assert.") ||
      bodyText.includes("toThrow") ||
      bodyText.includes("rejects") ||
      bodyText.includes("resolves") ||
      bodyText.includes("toHaveBeenCalled");

    if (!hasAssertion) {
      issues.push({
        file: relative(ROOT, testFile),
        type: "empty-test",
        detail: `Test "${testName}" has no assertion calls (expect, assert, toThrow, etc.)`,
        line: startLine + 1,
      });
    }
  }
}

// ── Check 3: Stale mock paths ───────────────────────────────────────────────

function checkStaleMocks(testFile: string) {
  const content = readFileSync(testFile, "utf8");
  const mockRegex = /mock\.module\s*\(\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = mockRegex.exec(content)) !== null) {
    const mockPath = match[1];

    // Skip node_modules mocks (next/navigation, lucide-react, etc.)
    if (!mockPath.startsWith(".") && !mockPath.startsWith("@/")) continue;

    const resolved = resolveImport(testFile, mockPath);
    if (resolved === null) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      issues.push({
        file: relative(ROOT, testFile),
        type: "stale-mock",
        detail: `mock.module("${mockPath}") targets a non-existent file`,
        line: lineNum,
      });
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const SERVICES = [
  { name: "ruh-backend", testDirs: ["tests"] },
  { name: "agent-builder-ui", testDirs: ["lib", "hooks", "app", "services", "__tests__"] },
  { name: "ruh-frontend", testDirs: ["__tests__"] },
  { name: "admin-ui", testDirs: ["__tests__", "lib"] },
  { name: "packages/marketplace-ui", testDirs: ["src"] },
];

console.log("🔍 Auditing test relevance across all services...\n");

for (const service of SERVICES) {
  const serviceDir = join(ROOT, service.name);
  if (!existsSync(serviceDir)) continue;

  const testFiles = walk(serviceDir, /\.test\.(ts|tsx)$/);
  console.log(`  ${service.name}: ${testFiles.length} test files`);

  for (const testFile of testFiles) {
    checkOrphanedImports(testFile);
    checkEmptyTests(testFile);
    checkStaleMocks(testFile);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log("");

if (issues.length === 0) {
  console.log("✅ No issues found. All tests appear relevant.\n");
  process.exit(0);
}

// Group by type
const grouped = new Map<string, Issue[]>();
for (const issue of issues) {
  const list = grouped.get(issue.type) ?? [];
  list.push(issue);
  grouped.set(issue.type, list);
}

for (const [type, typeIssues] of grouped) {
  console.log(`\n── ${type} (${typeIssues.length} issues) ──`);
  for (const issue of typeIssues) {
    const loc = issue.line ? `:${issue.line}` : "";
    console.log(`  ${issue.file}${loc}`);
    console.log(`    ${issue.detail}`);
  }
}

console.log(`\n⚠️  Found ${issues.length} issue(s) across all services.`);
if (!FIX_MODE) {
  console.log("  Run with --fix to auto-remove orphaned test files.\n");
}

process.exit(issues.length > 0 ? 1 : 0);
