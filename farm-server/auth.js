"use strict";
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { GameError } = require("./game");

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
// 免登入的匿名玩家沒有密碼可以重新登入，進度只靠這個 cookie，所以有效期設長一點。
const GUEST_SESSION_MS = 180 * 24 * 60 * 60 * 1000;

async function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT_OPTS);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

async function verifyPassword(password, saltHex, hashHex) {
  const { hash } = await hashPassword(password, saltHex);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(hashHex, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validatePassword(raw, username) {
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 128) {
    throw new GameError("BAD_PASSWORD", "密碼長度需為 8～128 個字元");
  }
  if (username && raw.toLowerCase() === String(username).toLowerCase()) {
    throw new GameError("BAD_PASSWORD", "密碼不可以和帳號相同");
  }
  return raw;
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function createSession(db, userId, now, ttlMs = SESSION_MS) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES(?,?,?,?)")
    .run(sha256(token), userId, now, now + ttlMs);
  return token;
}

function findSession(db, token, now) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const hash = sha256(token);
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(hash);
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
    return null;
  }
  return row.user_id;
}

function destroySession(db, token) {
  if (typeof token === "string") db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

function purgeExpiredSessions(db, now) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
}

function parseCookies(header) {
  const out = {};
  if (typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function cookieString(token, secure, maxAgeSec) {
  return `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
}

// 簡單的滑動視窗限流（單一伺服器實例使用）。
function createLimiter() {
  const hits = new Map();
  const fresh = (key, windowMs, now) => {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  };
  return {
    count: (key, windowMs, now) => fresh(key, windowMs, now).length,
    record(key, windowMs, now) {
      const list = fresh(key, windowMs, now);
      list.push(now);
      hits.set(key, list);
    },
    take(key, limit, windowMs, now) {
      const list = fresh(key, windowMs, now);
      if (list.length >= limit) return false;
      list.push(now);
      hits.set(key, list);
      return true;
    },
    clear: (key) => hits.delete(key),
    sweep(now, maxAgeMs) {
      for (const [key, list] of hits) {
        if (!list.some((t) => now - t < maxAgeMs)) hits.delete(key);
      }
    },
  };
}

module.exports = {
  SESSION_MS, GUEST_SESSION_MS, hashPassword, verifyPassword, validatePassword,
  createSession, findSession, destroySession, purgeExpiredSessions,
  parseCookies, cookieString, createLimiter,
};
