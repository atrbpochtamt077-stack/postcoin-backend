import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

const dbPath = process.env.DB_PATH || "./data/postcoin.sqlite";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,

  energy INTEGER NOT NULL DEFAULT 100,
  energy_max INTEGER NOT NULL DEFAULT 100,
  energy_regen_interval_ms INTEGER NOT NULL DEFAULT 3000,
  energy_updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),

  tap_power INTEGER NOT NULL DEFAULT 1,

  passive_income_per_hour INTEGER NOT NULL DEFAULT 50,
  last_passive_claim_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),

  referrer_telegram_id TEXT,

  last_tap_request_at INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE IF NOT EXISTS upgrades (
  user_id INTEGER NOT NULL,
  upgrade_key TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, upgrade_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS buildings (
  user_id INTEGER NOT NULL,
  building_level INTEGER NOT NULL,
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, building_level),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quests (
  user_id INTEGER NOT NULL,
  quest_key TEXT NOT NULL,
  quest_type TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL,
  reward INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  PRIMARY KEY (user_id, quest_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

console.log("DB initialized at", dbPath);
