"use strict";
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  username_lc TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0 CHECK(coins >= 0),
  unlocked_plots INTEGER NOT NULL DEFAULT 4,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pets(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  color TEXT NOT NULL,
  hair TEXT NOT NULL,
  outfit TEXT NOT NULL,
  hat TEXT NOT NULL,
  accessory TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plots(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  crop TEXT,
  planted_at INTEGER,
  water_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, idx)
);
CREATE TABLE IF NOT EXISTS inventory(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty >= 0),
  PRIMARY KEY(user_id, kind, item)
);
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
`;

function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// node:sqlite 沒有內建 transaction()，這裡包一層。
// 伺服器是單執行緒且 DatabaseSync 為同步呼叫，交易內不會被其他請求插入，因此不會發生重複扣款。
function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (_) { /* 交易已結束 */ }
    throw err;
  }
}

module.exports = { openDb, tx };
