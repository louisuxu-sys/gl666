"use strict";
const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const { openDb, tx } = require("./db");
const game = require("./game");
const auth = require("./auth");

const { GameError } = game;
const HOUR = 3600 * 1000;

function createApp(opts = {}) {
  const db = openDb(opts.dbPath || process.env.FARM_DB || path.join(__dirname, "data", "farm.db"));
  const clock = opts.clock || { now: () => Date.now() };
  const limits = { loginFailures: 10, registerPerHour: 10, guestPerHour: 30, actionsPer10s: 60, ...opts.limits };
  // 免登入模式：開啟頁面就自動建立匿名玩家。設 GUEST_MODE=0 可關閉，改回要註冊登入。
  const guestMode = opts.guestMode ?? process.env.GUEST_MODE !== "0";
  const secureCookie = opts.cookieSecure ?? process.env.COOKIE_SECURE === "1";
  const htmlFile = opts.htmlFile || process.env.HTML_FILE || path.resolve(__dirname, "..", "歸歸.html");
  const limiter = auth.createLimiter();

  auth.purgeExpiredSessions(db, clock.now());
  const timers = [
    setInterval(() => {
      auth.purgeExpiredSessions(db, clock.now());
      limiter.sweep(clock.now(), HOUR);
    }, HOUR),
  ];
  timers.forEach((t) => t.unref());

  let dummy;
  const getDummy = async () => (dummy ||= await auth.hashPassword("not-a-real-password"));

  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });

  // 只對外提供遊戲頁面與 /farm 前端檔案，不公開整個資料夾（資料庫與程式碼不會被下載）。
  app.get(["/", "/index.html"], (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(htmlFile);
  });
  app.use("/farm", express.static(path.join(__dirname, "public"), { index: false, dotfiles: "ignore" }));

  app.use("/api", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    if (req.get("x-requested-with") !== "farm") return next(new GameError("CSRF", "請求來源不正確", 403));
    const origin = req.get("origin");
    if (origin) {
      let ok = false;
      try { ok = new URL(origin).host === req.get("host"); } catch (_) { /* 無效 Origin */ }
      if (!ok) return next(new GameError("CSRF", "請求來源不正確", 403));
    }
    next();
  });
  app.use("/api", express.json({ limit: "10kb" }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const body = (req) => (req.body && typeof req.body === "object" ? req.body : {});

  const userFromReq = (req) => auth.findSession(db, auth.parseCookies(req.headers.cookie).sid, clock.now());
  const sendCookie = (req, res, token, maxAgeSec) => res.append("Set-Cookie", auth.cookieString(token, secureCookie || req.secure, maxAgeSec));

  // 需要登入的動作：每位玩家限流，並一律回傳最新的完整狀態（金幣、庫存、田地都由伺服器算出）。
  const authed = (fn) => wrap(async (req, res) => {
    const uid = userFromReq(req);
    if (!uid) throw new GameError("UNAUTHENTICATED", "請先登入", 401);
    if (!limiter.take(`act:${uid}`, limits.actionsPer10s, 10_000, clock.now())) {
      throw new GameError("RATE_LIMIT", "操作太頻繁，請稍後再試", 429);
    }
    await fn(req, res, uid);
  });
  const action = (fn) => authed(async (req, res, uid) => {
    fn(db, uid, clock.now(), body(req));
    res.json(game.getState(db, uid, clock.now()));
  });

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/catalog", (req, res) => res.json({ ...game.CATALOG, guestMode }));

  // 建立玩家 + 初始資源 + 登入工作階段（註冊與匿名玩家共用）
  async function createPlayer(username, password, nickname, ttlMs) {
    const { salt, hash } = await auth.hashPassword(password);
    const now = clock.now();
    return tx(db, () => {
      if (db.prepare("SELECT 1 FROM users WHERE username_lc = ?").get(username.toLowerCase())) {
        throw new GameError("USERNAME_TAKEN", "這個帳號已被使用", 409);
      }
      const uid = db.prepare("INSERT INTO users(username, username_lc, nickname, pw_salt, pw_hash, created_at, last_login) VALUES(?,?,?,?,?,?,?)")
        .run(username, username.toLowerCase(), nickname, salt, hash, now, now).lastInsertRowid;
      game.initNewPlayer(db, Number(uid), now);
      return auth.createSession(db, Number(uid), now, ttlMs);
    });
  }

  app.post("/api/register", wrap(async (req, res) => {
    if (!limiter.take(`reg:${req.ip}`, limits.registerPerHour, HOUR, clock.now())) {
      throw new GameError("RATE_LIMIT", "註冊太頻繁，請稍後再試", 429);
    }
    const b = body(req);
    const username = game.validateUsername(b.username);
    const password = auth.validatePassword(b.password, username);
    const nickname = game.validateNickname(b.nickname === undefined ? username : b.nickname);
    const token = await createPlayer(username, password, nickname, auth.SESSION_MS);
    sendCookie(req, res, token, auth.SESSION_MS / 1000);
    res.status(201).json({ ok: true });
  }));

  // 免登入：自動建立匿名玩家。密碼是隨機產生且不會告訴任何人，所以這種帳號無法用密碼登入，只能靠 cookie。
  app.post("/api/guest", wrap(async (req, res) => {
    if (!guestMode) throw new GameError("GUEST_DISABLED", "目前不開放免登入遊玩", 403);
    if (userFromReq(req)) return res.json({ ok: true, existing: true });
    if (!limiter.take(`guest:${req.ip}`, limits.guestPerHour, HOUR, clock.now())) {
      throw new GameError("RATE_LIMIT", "建立玩家太頻繁，請稍後再試", 429);
    }
    const username = `guest_${crypto.randomBytes(5).toString("hex")}`;
    const password = crypto.randomBytes(24).toString("hex");
    const nickname = `農夫${crypto.randomInt(1000, 10000)}`;
    const token = await createPlayer(username, password, nickname, auth.GUEST_SESSION_MS);
    sendCookie(req, res, token, auth.GUEST_SESSION_MS / 1000);
    res.status(201).json({ ok: true });
  }));

  app.post("/api/login", wrap(async (req, res) => {
    const b = body(req);
    const username = typeof b.username === "string" ? b.username.slice(0, 40) : "";
    const password = typeof b.password === "string" ? b.password.slice(0, 128) : "";
    const key = `login:${req.ip}:${username.toLowerCase()}`;
    if (limiter.count(key, 15 * 60_000, clock.now()) >= limits.loginFailures) {
      throw new GameError("RATE_LIMIT", "登入失敗次數過多，請 15 分鐘後再試", 429);
    }
    const user = db.prepare("SELECT id, pw_salt, pw_hash FROM users WHERE username_lc = ?").get(username.toLowerCase());
    let ok = false;
    if (user) {
      ok = await auth.verifyPassword(password, user.pw_salt, user.pw_hash);
    } else {
      const d = await getDummy();
      await auth.verifyPassword(password, d.salt, d.hash);
    }
    if (!ok) {
      limiter.record(key, 15 * 60_000, clock.now());
      throw new GameError("BAD_LOGIN", "帳號或密碼錯誤", 401);
    }
    limiter.clear(key);
    const now = clock.now();
    db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(now, user.id);
    sendCookie(req, res, auth.createSession(db, user.id, now), auth.SESSION_MS / 1000);
    res.json({ ok: true });
  }));

  app.post("/api/logout", wrap(async (req, res) => {
    auth.destroySession(db, auth.parseCookies(req.headers.cookie).sid);
    sendCookie(req, res, "", 0);
    res.json({ ok: true });
  }));

  app.get("/api/me", wrap(async (req, res) => {
    const uid = userFromReq(req);
    if (!uid) throw new GameError("UNAUTHENTICATED", "請先登入", 401);
    res.json(game.getState(db, uid, clock.now()));
  }));

  app.post("/api/pet", action((d, uid, now, b) => game.createPet(d, uid, b)));
  app.post("/api/pet/equip", action((d, uid, now, b) => game.equip(d, uid, b)));
  app.post("/api/nickname", action((d, uid, now, b) => game.setNickname(d, uid, b.nickname)));
  app.post("/api/shop/buy", action(game.buy));
  app.post("/api/farm/unlock", action(game.unlockPlot));
  app.post("/api/farm/plant", action(game.plant));
  app.post("/api/farm/water", action(game.water));
  app.post("/api/farm/harvest", action(game.harvest));
  app.post("/api/inventory/sell", action(game.sell));

  app.use("/api", (req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "找不到這個功能" } }));
  app.use((req, res) => res.status(404).type("text").send("找不到頁面"));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    if (err && (err.type === "entity.parse.failed" || err.type === "entity.too.large")) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "請求內容格式不正確" } });
    }
    console.error(err);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "伺服器發生錯誤" } });
  });

  return { app, db, close: () => { timers.forEach(clearInterval); db.close(); } };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";
  const { app } = createApp();
  app.listen(port, host, () => {
    console.log(`摸魚農場伺服器已啟動：http://localhost:${port}`);
    console.log("同事請用你電腦的區網 IP 連線，例如 http://192.168.x.x:" + port);
  });
}

module.exports = { createApp };
