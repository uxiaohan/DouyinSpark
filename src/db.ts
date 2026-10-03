import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

const path = process.env.DB_PATH ?? "data/app.db"
if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })

export const db = new Database(path)

db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA foreign_keys = ON")

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL UNIQUE,
  cookie_json TEXT,
  proxy_server TEXT,
  proxy_username TEXT,
  proxy_password TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  daily_cap INTEGER,
  last_run_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  account_id INTEGER,
  friend_id INTEGER,
  friend_name TEXT NOT NULL,
  status TEXT NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_friends_account ON friends(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id);
CREATE INDEX IF NOT EXISTS idx_run_items_run ON run_items(run_id);
`)

export function nowISO(): string {
  return new Date().toISOString()
}
