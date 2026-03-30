/**
 * Initialize the agent's local SQLite database.
 * Run once on first boot: node src/db-init.mjs
 * Idempotent — safe to run multiple times.
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = process.env.AGENT_DATA_DIR || join(process.env.HOME || "/root", ".agent-runtime");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, "agent.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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

  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type, created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_calendar_starts ON calendar_events(starts_at);
`);

console.log("Agent runtime database initialized:", DB_PATH);
db.close();
