import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

const dbPath = process.env.DB_PATH || "./data/postcoin.sqlite";
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

export function nowMs() {
  return Date.now();
}

export function getUserByTelegramId(telegramId) {
  return db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(String(telegramId));
}

export function createUser({ telegramId, username, referrerTelegramId }) {
  const stmt = db.prepare(
    `INSERT INTO users (telegram_id, username, referrer_telegram_id) VALUES (?, ?, ?)`
  );
  const info = stmt.run(String(telegramId), username || null, referrerTelegramId || null);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
}

export function updateUserFields(userId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  db.prepare(`UPDATE users SET ${sets}, updated_at = ? WHERE id = ?`).run(...values, nowMs(), userId);
}
