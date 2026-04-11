#!/usr/bin/env bun
/**
 * KB Annotation Validator
 *
 * Scans source files for `@kb:` annotations and verifies:
 * 1. Every referenced KB note actually exists in docs/knowledge-base/
 * 2. Critical source files have at least one @kb: annotation
 *
 * Usage:
 *   bun scripts/check-kb-annotations.ts          # full check
 *   bun scripts/check-kb-annotations.ts --json    # machine-readable output
 *   bun scripts/check-kb-annotations.ts --fix     # suggest missing annotations
 *
 * Annotation syntax (in source files):
 *   // @kb: 003-sandbox-lifecycle
 *   // @kb: 005-data-models 008-agent-builder-ui
 *   # @kb: 010-deployment                         (for shell/yaml/config)
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";

const ROOT = join(import.meta.dir, "..");
const KB_DIR = join(ROOT, "docs", "knowledge-base");
const SPECS_DIR = join(KB_DIR, "specs");

// File extensions to scan for annotations
const SCAN_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs",
  ".sh", ".yaml", ".yml", ".toml",
]);

// Directories to scan
const SCAN_DIRS = [
  "ruh-backend/src",
  "agent-builder-ui/app",
  "agent-builder-ui/lib",
  "agent-builder-ui/hooks",
  "ruh-frontend/app",
  "ruh-frontend/components",
  "ruh-frontend/lib",
  "admin-ui/app",
  "admin-ui/lib",
];

// Critical files that MUST have @kb: annotations.
// Map of relative path → expected KB note(s).
const CRITICAL_FILES: Record<string, string[]> = {
  "ruh-backend/src/sandboxManager.ts": ["003-sandbox-lifecycle"],
  "ruh-backend/src/app.ts": ["004-api-reference"],
  "ruh-backend/src/store.ts": ["005-data-models"],
  "ruh-backend/src/conversationStore.ts": ["007-conversation-store"],
  "ruh-backend/src/channelManager.ts": ["006-channel-manager"],
  "ruh-backend/src/db.ts": ["005-data-models"],
  "ruh-backend/src/docker.ts": ["003-sandbox-lifecycle"],
  "ruh-backend/src/authRoutes.ts": ["014-auth-system"],
  "ruh-backend/src/agentStore.ts": ["005-data-models"],
  "ruh-backend/src/agentSetup.ts": ["008-agent-builder-ui"],
  "ruh-backend/src/agentBuild.ts": ["008-agent-builder-ui"],
  "ruh-backend/src/marketplaceStore.ts": ["016-marketplace"],
  "ruh-backend/src/marketplaceRoutes.ts": ["016-marketplace"],
  "ruh-backend/src/sandboxRuntime.ts": ["003-sandbox-lifecycle"],
  "ruh-backend/src/config.ts": ["002-backend-overview"],
  "ruh-backend/src/index.ts": ["002-backend-overview"],
  "ruh-backend/src/startup.ts": ["002-backend-overview"],
  "ruh-backend/src/utils.ts": ["002-backend-overview"],
  "ruh-backend/src/gatewayProxy.ts": ["004-api-reference"],
  "ruh-backend/src/streamRegistry.ts": ["003-sandbox-lifecycle"],
  "ruh-backend/src/userStore.ts": ["014-auth-system"],
  "ruh-backend/src/sessionStore.ts": ["014-auth-system"],
  "ruh-backend/src/billingStore.ts": ["016-marketplace"],
  "agent-builder-ui/app/api/openclaw/route.ts": ["008-agent-builder-ui"],
};

// ── Helpers ──────────────────────────────────────────────────────────

// Matches: // @kb: ..., # @kb: ..., and * @kb: ... (inside JSDoc blocks)
const KB_ANNOTATION_RE = /(?:\/\/|#|\*)\s*@kb:\s*(.+)/g;

function extractAnnotations(content: string): string[] {
  const notes: string[] = [];
  for (const match of content.matchAll(KB_ANNOTATION_RE)) {
    // A single @kb: line can reference multiple notes separated by spaces
    for (const ref of match[1].trim().split(/\s+/)) {
      notes.push(ref);
    }
  }
  return notes;
}

async function getKbNotes(): Promise<Set<string>> {
  const notes = new Set<string>();

  for (const dir of [KB_DIR, SPECS_DIR]) {
    try {
      const files = await readdir(dir);
      for (const f of files) {
        if (f.endsWith(".md")) {
          notes.add(f.replace(/\.md$/, ""));
        }
      }
    } catch {
      // specs dir might not exist
    }
  }

  // Also check learnings subdirectory
  const learningsDir = join(KB_DIR, "learnings");
  try {
    const files = await readdir(learningsDir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        notes.add(f.replace(/\.md$/, ""));
      }
    }
  } catch {
    // learnings dir might not exist
  }

  return notes;
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  const absDir = join(ROOT, dir);
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(absDir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .next, dist, etc.
      if (["node_modules", ".next", "dist", "build", ".turbo"].includes(entry.name)) continue;
      yield* walkDir(join(dir, entry.name));
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      yield join(dir, entry.name);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

interface AnnotationEntry {
  file: string;
  refs: string[];
  lineNumbers: number[];
}

interface BrokenRef {
  file: string;
  ref: string;
  line: number;
}

interface MissingAnnotation {
  file: string;
  expected: string[];
}

interface Report {
  totalFilesScanned: number;
  annotatedFiles: number;
  totalAnnotations: number;
  brokenRefs: BrokenRef[];
  missingAnnotations: MissingAnnotation[];
  annotations: AnnotationEntry[];
}

async function run(): Promise<Report> {
  const kbNotes = await getKbNotes();
  const annotations: AnnotationEntry[] = [];
  const brokenRefs: BrokenRef[] = [];
  const annotatedFileSet = new Set<string>();
  let totalFiles = 0;
  let totalAnnotations = 0;

  // Scan all source directories
  for (const dir of SCAN_DIRS) {
    for await (const filePath of walkDir(dir)) {
      totalFiles++;
      const absPath = join(ROOT, filePath);
      const content = await readFile(absPath, "utf-8");
      const lines = content.split("\n");

      const refs: string[] = [];
      const lineNumbers: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        const lineRefs = extractAnnotations(lines[i]);
        if (lineRefs.length > 0) {
          for (const ref of lineRefs) {
            refs.push(ref);
            lineNumbers.push(i + 1);

            // Check if the referenced KB note exists
            if (!kbNotes.has(ref)) {
              brokenRefs.push({ file: filePath, ref, line: i + 1 });
            }
          }
        }
      }

      if (refs.length > 0) {
        annotations.push({ file: filePath, refs, lineNumbers });
        annotatedFileSet.add(filePath);
        totalAnnotations += refs.length;
      }
    }
  }

  // Check critical files for missing annotations
  const missingAnnotations: MissingAnnotation[] = [];
  for (const [file, expected] of Object.entries(CRITICAL_FILES)) {
    if (!annotatedFileSet.has(file)) {
      missingAnnotations.push({ file, expected });
    }
  }

  return {
    totalFilesScanned: totalFiles,
    annotatedFiles: annotatedFileSet.size,
    totalAnnotations,
    brokenRefs,
    missingAnnotations,
    annotations,
  };
}

// ── CLI Output ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const fixMode = args.includes("--fix");

const report = await run();

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.brokenRefs.length > 0 ? 1 : 0);
}

// Human-readable output
console.log("=== KB Annotation Report ===\n");

console.log(`Files scanned:    ${report.totalFilesScanned}`);
console.log(`Annotated files:  ${report.annotatedFiles}`);
console.log(`Total @kb: refs:  ${report.totalAnnotations}`);
console.log();

// Broken references
if (report.brokenRefs.length > 0) {
  console.log(`Broken references: ${report.brokenRefs.length}`);
  for (const br of report.brokenRefs) {
    console.log(`  ${br.file}:${br.line} → @kb: ${br.ref} (note not found)`);
  }
  console.log();
} else {
  console.log("Broken references: 0");
  console.log();
}

// Missing annotations on critical files
if (report.missingAnnotations.length > 0) {
  console.log(`Critical files missing @kb: ${report.missingAnnotations.length}`);
  for (const ma of report.missingAnnotations) {
    console.log(`  ${ma.file}`);
    if (fixMode) {
      console.log(`    → Add: // @kb: ${ma.expected.join(" ")}`);
    }
  }
  console.log();
} else {
  console.log("Critical files missing @kb: 0");
  console.log();
}

// Coverage summary
if (report.annotations.length > 0) {
  console.log("Annotated files:");
  for (const a of report.annotations) {
    console.log(`  ${a.file} → ${a.refs.join(", ")}`);
  }
  console.log();
}

// Overall status
const hasIssues = report.brokenRefs.length > 0 || report.missingAnnotations.length > 0;
console.log(`Status: ${hasIssues ? "NEEDS_ATTENTION" : "HEALTHY"}`);

process.exit(report.brokenRefs.length > 0 ? 1 : 0);
