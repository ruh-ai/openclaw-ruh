import Database from "better-sqlite3";
import { join } from "path";

const DATA_DIR =
  process.env.AGENT_DATA_DIR ||
  join(process.env.HOME || "/root", ".agent-runtime");
const DB_PATH = join(DATA_DIR, "agent.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}
