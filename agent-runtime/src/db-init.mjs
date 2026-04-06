/**
 * Initialize the agent's local SQLite database.
 * Run once on first boot: node src/db-init.mjs
 * Idempotent — safe to run multiple times.
 *
 * 1. Creates core tables (tasks, reports, activity_log, calendar_events, vectors)
 * 2. Auto-discovers and applies agent-specific schema from workspace/runtime/schema.sql
 * 3. Tracks applied migrations by content hash so re-running is safe
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const DATA_DIR = process.env.AGENT_DATA_DIR || join(process.env.HOME || "/root", ".agent-runtime");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, "agent.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Core tables (always present in every agent) ────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog','in_progress','review','done','cancelled')),
    priority    INTEGER DEFAULT 0,
    skill_used  TEXT,
    outcome     TEXT,
    error       TEXT,
    started_at  TEXT,
    completed_at TEXT,
    due_at      TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),
    metadata    TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS reports (
    id          TEXT PRIMARY KEY,
    task_id     TEXT REFERENCES tasks(id),
    type        TEXT NOT NULL CHECK (type IN ('daily_summary','task_report','error_report','custom')),
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    data        TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    summary     TEXT NOT NULL,
    details     TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id          TEXT PRIMARY KEY,
    task_id     TEXT REFERENCES tasks(id),
    title       TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('trigger','run','scheduled','manual')),
    starts_at   TEXT NOT NULL,
    ends_at     TEXT,
    recurrence  TEXT,
    status      TEXT DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','running','completed','failed','cancelled')),
    metadata    TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vectors (
    id          TEXT PRIMARY KEY,
    collection  TEXT NOT NULL,
    content     TEXT NOT NULL,
    embedding   BLOB NOT NULL,
    metadata    TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS _migrations (
    hash        TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    applied_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type, created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_calendar_starts ON calendar_events(starts_at);
  CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection);
`);

// ── Auto-discover agent-specific schema ────────────────────────────────────

const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE || join(process.env.HOME || "/root", ".openclaw/workspace");
const RUNTIME_DIR = join(WORKSPACE_DIR, "runtime");
const SCHEMA_PATH = join(RUNTIME_DIR, "schema.sql");

if (existsSync(SCHEMA_PATH)) {
  const sql = readFileSync(SCHEMA_PATH, "utf8").trim();
  if (sql) {
    const hash = createHash("sha256").update(sql).digest("hex").slice(0, 16);
    const existing = db.prepare("SELECT hash FROM _migrations WHERE hash = ?").get(hash);

    if (!existing) {
      try {
        db.exec(sql);
        db.prepare("INSERT INTO _migrations (hash, filename) VALUES (?, ?)").run(hash, "schema.sql");
        console.log(`Applied agent schema (${hash}):`, SCHEMA_PATH);
      } catch (err) {
        console.error("Failed to apply agent schema:", err.message);
        // Don't crash — the core tables are still usable
      }
    } else {
      console.log("Agent schema already applied:", hash);
    }
  }
}

// ── Auto-discover seed data ────────────────────────────────────────────────

const SEED_PATH = join(RUNTIME_DIR, "seed.sql");

if (existsSync(SEED_PATH)) {
  const sql = readFileSync(SEED_PATH, "utf8").trim();
  if (sql) {
    const hash = createHash("sha256").update(sql).digest("hex").slice(0, 16);
    const existing = db.prepare("SELECT hash FROM _migrations WHERE hash = ?").get(hash);

    if (!existing) {
      try {
        db.exec(sql);
        db.prepare("INSERT INTO _migrations (hash, filename) VALUES (?, ?)").run(hash, "seed.sql");
        console.log("Applied seed data:", SEED_PATH);
      } catch (err) {
        console.error("Failed to apply seed data:", err.message);
      }
    }
  }
}

console.log("Agent runtime database initialized:", DB_PATH);
db.close();
