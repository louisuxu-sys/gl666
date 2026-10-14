"use strict";
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server");

const DAY = 24 * 3600 * 1000;
let tmpDir;
let htmlFile;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "farm-test-"));
  htmlFile = path.join(tmpDir, "page.html");
  fs.writeFileSync(htmlFile, "<!doctype html><title>測試頁</title>");
});
after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

async function startServer(opts = {}) {
  const clock = { t: 1_800_000_000_000, now() { return this.t; } };
  const inst = createApp({
    dbPath: ":memory:", clock, htmlFile,
    limits: { registerPerHour: 100000, actionsPer10s: 100000, loginFailures: 10 },
    ...opts,
  });
  const server = await new Promise((resolve) => { const s = inst.app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = () => new Promise((resolve) => server.close(() => { inst.close(); resolve(); }));
  return { ...inst, clock, base, stop };
}

class Client {
  constructor(base) { this.base = base; this.cookie = ""; }
  async req(method, url, body, extraHeaders = {}) {
    const headers = { "X-Requested-With": "farm", ...extraHeaders };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(this.base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.getSetCookie();
    if (setCookie.length) {
      const first = setCookie[0].split(";")[0];
      this.cookie = first.endsWith("=") ? "" : first;
    }
    let json = null;
    try { json = await res.json(); } catch (_) { /* 非 JSON 回應 */ }
    return { status: res.status, json, setCookie };
  }
  get(url) { return this.req("GET", url); }
  post(url, body = {}) { return this.req("POST", url, body); }
}

let counter = 0;
async function newPlayer(s, withPet = true) {
  const c = new Client(s.base);
  const username = `player_${++counter}`;
  const r = await c.post("/api/register", { username, password: "password123", nickname: `玩家${counter}` });
  assert.equal(r.status, 201);
  if (withPet) {
    const p = await c.post("/api/pet", { species: "cat", color: "#f4c27a", hair: "short", outfit: "tee", hat: "none", accessory: "none" });
    assert.equal(p.status, 200);
  }
  return { c, username };
}

const coinsOf = async (c) => (await c.get("/api/me")).json.user.coins;

describe("帳號與登入", () => {
  test("註冊、登入、登出、工作階段", async () => {
    const s = await startServer();
    try {
      const c = new Client(s.base);
      assert.equal((await c.get("/api/me")).status, 401);
      const reg = await c.post("/api/register", { username: "Alice_1", password: "password123", nickname: "愛麗絲" });
      assert.equal(reg.status, 201);
      assert.match(reg.setCookie[0], /HttpOnly/);
      assert.match(reg.setCookie[0], /SameSite=Strict/);
      const me = await c.get("/api/me");
      assert.equal(me.status, 200);
      assert.equal(me.json.user.nickname, "愛麗絲");
      assert.equal(me.json.user.coins, 100);
      assert.equal(me.json.inventory.seed.carrot, 2);
      assert.equal(me.json.pet, null);

      await c.post("/api/logout");
      assert.equal((await c.get("/api/me")).status, 401);

      const c2 = new Client(s.base);
      assert.equal((await c2.post("/api/login", { username: "alice_1", password: "password123" })).status, 200);
      assert.equal((await c2.get("/api/me")).status, 200);
    } finally { await s.stop(); }
  });

  test("拒絕重複帳號（不分大小寫）、弱密碼、不合法帳號", async () => {
    const s = await startServer();
    try {
      const a = new Client(s.base);
      assert.equal((await a.post("/api/register", { username: "Bob", password: "password123" })).status, 201);
      const dup = await new Client(s.base).post("/api/register", { username: "bob", password: "password123" });
      assert.equal(dup.status, 409);
      assert.equal((await new Client(s.base).post("/api/register", { username: "carol", password: "short" })).status, 400);
      assert.equal((await new Client(s.base).post("/api/register", { username: "carol_carol", password: "carol_carol" })).status, 400);
      assert.equal((await new Client(s.base).post("/api/register", { username: "a b", password: "password123" })).status, 400);
      assert.equal((await new Client(s.base).post("/api/register", { username: "ab", password: "password123" })).status, 400);
      assert.equal((await new Client(s.base).post("/api/register", { username: "xx_ok", password: "password123", nickname: "<b>" })).status, 400);
    } finally { await s.stop(); }
  });

  test("錯誤密碼與不存在帳號回應相同，連續失敗會被鎖定", async () => {
    const s = await startServer();
    try {
      const { username } = await newPlayer(s, false);
      const c = new Client(s.base);
      const wrong = await c.post("/api/login", { username, password: "wrong-password" });
      const ghost = await c.post("/api/login", { username: "nobody_here", password: "wrong-password" });
      assert.equal(wrong.status, 401);
      assert.equal(ghost.status, 401);
      assert.deepEqual(wrong.json, ghost.json);
      for (let i = 0; i < 9; i++) await c.post("/api/login", { username, password: "nope-nope" });
      const locked = await c.post("/api/login", { username, password: "password123" });
      assert.equal(locked.status, 429);
    } finally { await s.stop(); }
  });

  test("工作階段 7 天後過期", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s, false);
      assert.equal((await c.get("/api/me")).status, 200);
      s.clock.t += 8 * DAY;
      assert.equal((await c.get("/api/me")).status, 401);
    } finally { await s.stop(); }
  });

  test("密碼不以明文保存", async () => {
    const s = await startServer();
    try {
      await new Client(s.base).post("/api/register", { username: "hashcheck", password: "SuperSecret123" });
      const row = s.db.prepare("SELECT pw_hash, pw_salt FROM users WHERE username_lc = 'hashcheck'").get();
      assert.ok(row.pw_hash.length >= 64 && row.pw_salt.length >= 16);
      assert.ok(!row.pw_hash.includes("SuperSecret123"));
    } finally { await s.stop(); }
  });
});

describe("免登入（匿名玩家）", () => {
  test("開啟即可建立玩家並直接遊玩，每位玩家的進度互相獨立", async () => {
    const s = await startServer();
    try {
      const a = new Client(s.base);
      const b = new Client(s.base);
      const ra = await a.post("/api/guest");
      assert.equal(ra.status, 201);
      assert.match(ra.setCookie[0], /HttpOnly/);
      assert.match(ra.setCookie[0], /SameSite=Strict/);
      await b.post("/api/guest");
      const meA = (await a.get("/api/me")).json;
      const meB = (await b.get("/api/me")).json;
      assert.match(meA.user.username, /^guest_[0-9a-f]{10}$/);
      assert.notEqual(meA.user.id, meB.user.id);
      assert.equal(meA.user.coins, 100);
      assert.equal(meA.inventory.seed.carrot, 2);
      assert.equal(meA.plots.length, 12);

      await a.post("/api/pet", { species: "dog", color: "#f4c27a", hair: "short", outfit: "tee", hat: "none", accessory: "none" });
      await a.post("/api/farm/plant", { plot: 0, crop: "carrot" });
      assert.equal((await a.get("/api/me")).json.plots[0].crop, "carrot");
      const meB2 = (await b.get("/api/me")).json;
      assert.equal(meB2.plots[0].crop, null);
      assert.equal(meB2.pet, null);
    } finally { await s.stop(); }
  });

  test("已經有工作階段時不會重複建立玩家", async () => {
    const s = await startServer();
    try {
      const c = new Client(s.base);
      await c.post("/api/guest");
      const again = await c.post("/api/guest");
      assert.equal(again.status, 200);
      assert.equal(again.json.existing, true);
      assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
    } finally { await s.stop(); }
  });

  test("匿名玩家無法用密碼登入（密碼是隨機且不公開的），也猜不到", async () => {
    const s = await startServer();
    try {
      const c = new Client(s.base);
      await c.post("/api/guest");
      const { username } = (await c.get("/api/me")).json.user;
      for (const pw of ["password123", "12345678", username, "guest_password"]) {
        assert.equal((await new Client(s.base).post("/api/login", { username, password: pw })).status, 401);
      }
    } finally { await s.stop(); }
  });

  test("匿名玩家的工作階段有效期為 180 天，不是 7 天", async () => {
    const s = await startServer();
    try {
      const c = new Client(s.base);
      const r = await c.post("/api/guest");
      assert.match(r.setCookie[0], new RegExp(`Max-Age=${180 * 24 * 3600}`));
      s.clock.t += 30 * DAY;
      assert.equal((await c.get("/api/me")).status, 200);
      s.clock.t += 151 * DAY;
      assert.equal((await c.get("/api/me")).status, 401);
    } finally { await s.stop(); }
  });

  test("每個來源有建立頻率限制", async () => {
    const s = await startServer({ limits: { guestPerHour: 2 } });
    try {
      assert.equal((await new Client(s.base).post("/api/guest")).status, 201);
      assert.equal((await new Client(s.base).post("/api/guest")).status, 201);
      assert.equal((await new Client(s.base).post("/api/guest")).status, 429);
      assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 2);
    } finally { await s.stop(); }
  });

  test("關閉免登入模式後會拒絕，且 catalog 會告知前端", async () => {
    const off = await startServer({ guestMode: false });
    const on = await startServer({ guestMode: true });
    try {
      const rejected = await new Client(off.base).post("/api/guest");
      assert.equal(rejected.status, 403);
      assert.equal(rejected.json.error.code, "GUEST_DISABLED");
      assert.equal(off.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
      assert.equal((await new Client(off.base).get("/api/catalog")).json.guestMode, false);
      assert.equal((await new Client(on.base).get("/api/catalog")).json.guestMode, true);
    } finally { await off.stop(); await on.stop(); }
  });

  test("匿名玩家同樣受到遊戲規則限制（金幣不足、不能操作別人）", async () => {
    const s = await startServer();
    try {
      const c = new Client(s.base);
      await c.post("/api/guest");
      assert.equal((await c.post("/api/shop/buy", { kind: "seed", id: "strawberry", qty: 5 })).status, 400);
      const r = await c.post("/api/farm/plant", { plot: 0, crop: "carrot", userId: 1 });
      assert.equal(r.status, 200);
      assert.equal(r.json.user.coins, 100);
    } finally { await s.stop(); }
  });
});

describe("PokéSurvivor 靜態檔案（白名單）", () => {
  let psDir;
  before(() => {
    psDir = path.join(tmpDir, "ps");
    fs.mkdirSync(path.join(psDir, "js"), { recursive: true });
    fs.mkdirSync(path.join(psDir, "assets"), { recursive: true });
    fs.mkdirSync(path.join(psDir, "tools"), { recursive: true });
    fs.mkdirSync(path.join(psDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(psDir, "dev.html"), "<!doctype html><title>遊戲首頁</title>");
    fs.writeFileSync(path.join(psDir, "sw.js"), "// sw");
    fs.writeFileSync(path.join(psDir, "js", "app.js"), "window.ok=1;");
    fs.writeFileSync(path.join(psDir, "assets", "a.png"), "PNG");
    fs.writeFileSync(path.join(psDir, "secret.txt"), "不該被下載");
    fs.writeFileSync(path.join(psDir, "CLAUDE.md"), "內部規則");
    fs.writeFileSync(path.join(psDir, "tools", "t.js"), "// 工具");
    fs.writeFileSync(path.join(psDir, ".git", "config"), "[core]");
    fs.writeFileSync(path.join(psDir, "js", ".env"), "KEY=1");
  });

  test("遊戲需要的檔案可以取得，/pokesurvivor/ 預設是 dev.html", async () => {
    const s = await startServer({ psDir });
    try {
      const home = await fetch(`${s.base}/pokesurvivor/`);
      assert.equal(home.status, 200);
      assert.match(await home.text(), /遊戲首頁/);
      assert.equal((await fetch(`${s.base}/pokesurvivor/dev.html`)).status, 200);
      assert.equal((await fetch(`${s.base}/pokesurvivor/js/app.js`)).status, 200);
      assert.equal((await fetch(`${s.base}/pokesurvivor/assets/a.png`)).status, 200);
      assert.equal((await fetch(`${s.base}/pokesurvivor/sw.js`)).status, 200);
      const noSlash = await fetch(`${s.base}/pokesurvivor`, { redirect: "manual" });
      assert.ok([301, 302].includes(noSlash.status), "沒有結尾斜線應導向 /pokesurvivor/");
    } finally { await s.stop(); }
  });

  test("白名單以外的檔案都不公開，包含各種繞過寫法", async () => {
    const s = await startServer({ psDir });
    try {
      const blocked = [
        "/pokesurvivor/secret.txt", "/pokesurvivor/CLAUDE.md", "/pokesurvivor/tools/t.js", "/pokesurvivor/.git/config",
        "/pokesurvivor/js/.env", "/pokesurvivor/js/../secret.txt", "/pokesurvivor/js/../tools/t.js", "/pokesurvivor/assets/../CLAUDE.md",
        "/pokesurvivor/js/%2e%2e/secret.txt", "/pokesurvivor/js/%2E%2E/tools/t.js", "/pokesurvivor/js%2f..%2fsecret.txt",
        "/pokesurvivor/js%5c..%5csecret.txt", "/pokesurvivor/%2e%2e/server.js", "/pokesurvivor//secret.txt",
        "/pokesurvivor/JS/app.js/../../secret.txt", "/pokesurvivor/%00", "/pokesurvivor/dev.html/../secret.txt",
        "/pokesurvivor/%2e%2e%2f%2e%2e%2fserver.js",
      ];
      for (const p of blocked) {
        const r = await fetch(`${s.base}${p}`);
        const body = await r.text();
        assert.ok(r.status >= 400, `${p} 應被拒絕，實際 ${r.status}`);
        assert.ok(!body.includes("不該被下載") && !body.includes("內部規則") && !body.includes("// 工具") && !body.includes("[core]") && !body.includes("KEY=1"), `${p} 洩漏了內容`);
      }
    } finally { await s.stop(); }
  });

  test("遊戲資料夾不存在時回 404，不會當掉", async () => {
    const s = await startServer({ psDir: path.join(tmpDir, "不存在的資料夾") });
    try {
      assert.equal((await fetch(`${s.base}/pokesurvivor/`)).status, 404);
      assert.equal((await fetch(`${s.base}/pokesurvivor/js/app.js`)).status, 404);
      assert.equal((await fetch(`${s.base}/`)).status, 200);
    } finally { await s.stop(); }
  });

  test("沒有指定位置時，優先使用倉庫內的 pokesurvivor-zh 資料夾", () => {
    const saved = process.env.PS_DIR;
    delete process.env.PS_DIR;
    const inst = createApp({ dbPath: path.join(tmpDir, "psdir.db") });
    try {
      assert.equal(inst.psDir, path.resolve(__dirname, "..", "..", "pokesurvivor-zh"));
      assert.ok(fs.existsSync(path.join(inst.psDir, "dev.html")), "倉庫內的遊戲資料夾缺少 dev.html");
    } finally { inst.close(); if (saved !== undefined) process.env.PS_DIR = saved; }
  });

  test("允許同網站內嵌（SAMEORIGIN），仍拒絕其他網站內嵌", async () => {
    const s = await startServer({ psDir });
    try {
      for (const p of ["/", "/pokesurvivor/", "/api/health"]) {
        const r = await fetch(`${s.base}${p}`);
        assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN", p);
        // 必須允許自己開的彈窗保持與原頁面的聯繫，否則 Firebase 的 Google 彈窗登入會停在空白頁
        assert.equal(r.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups", p);
      }
    } finally { await s.stop(); }
  });
});

describe("請求安全", () => {
  test("缺少標頭或來源網站不符的寫入請求會被拒絕", async () => {
    const s = await startServer();
    try {
      const noHeader = await fetch(`${s.base}/api/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "evil_1", password: "password123" }) });
      assert.equal(noHeader.status, 403);
      const badOrigin = await fetch(`${s.base}/api/register`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "farm", Origin: "https://evil.example" }, body: JSON.stringify({ username: "evil_2", password: "password123" }) });
      assert.equal(badOrigin.status, 403);
      const bad = await fetch(`${s.base}/api/register`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "farm" }, body: "{not json" });
      assert.equal(bad.status, 400);
    } finally { await s.stop(); }
  });

  test("只公開遊戲頁面與 /farm 檔案，不會洩漏程式碼或資料庫", async () => {
    const s = await startServer();
    try {
      assert.equal((await fetch(`${s.base}/`)).status, 200);
      for (const p of ["/server.js", "/db.js", "/game.js", "/package.json", "/data/farm.db", "/farm.db", "/test/farm.test.js", "/node_modules/express/package.json", "/farm/../server.js", "/farm/%2e%2e/server.js"]) {
        const r = await fetch(`${s.base}${p}`);
        assert.equal(r.status, 404, `${p} 不應被公開`);
      }
    } finally { await s.stop(); }
  });

  test("操作頻率限制", async () => {
    const s = await startServer({ limits: { actionsPer10s: 5 } });
    try {
      const { c } = await newPlayer(s, false);
      let limited = 0;
      for (let i = 0; i < 10; i++) if ((await c.get("/api/me")).status === 200) { /* me 不計入限流 */ }
      for (let i = 0; i < 10; i++) {
        const r = await c.post("/api/nickname", { nickname: `n${i}` });
        if (r.status === 429) limited++;
      }
      assert.ok(limited >= 5, "超過上限的操作應回傳 429");
    } finally { await s.stop(); }
  });
});

describe("寵物與外觀", () => {
  test("建立寵物只能用免費外觀，且只能建立一次", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s, false);
      const base = { species: "fox", color: "#9b7653", hair: "short", outfit: "tee", hat: "none", accessory: "none" };
      assert.equal((await c.post("/api/pet", { ...base, hat: "crown" })).status, 400);
      assert.equal((await c.post("/api/pet", { ...base, species: "dragon" })).status, 400);
      assert.equal((await c.post("/api/pet", { ...base, color: "#000000" })).status, 400);
      assert.equal((await c.post("/api/pet", { ...base, hair: "__proto__" })).status, 400);
      const ok = await c.post("/api/pet", base);
      assert.equal(ok.status, 200);
      assert.equal(ok.json.pet.species, "fox");
      assert.equal((await c.post("/api/pet", base)).status, 400);
    } finally { await s.stop(); }
  });

  test("購買服裝、穿上；未擁有不能穿；不能重複購買；金幣不足不能買", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      assert.equal((await c.post("/api/pet/equip", { slot: "hat", id: "straw" })).status, 400);
      assert.equal((await c.post("/api/shop/buy", { kind: "cosmetic", slot: "hat", id: "crown" })).status, 400);
      assert.equal(await coinsOf(c), 100);
      const buy = await c.post("/api/shop/buy", { kind: "cosmetic", slot: "hat", id: "straw" });
      assert.equal(buy.status, 200);
      assert.equal(buy.json.user.coins, 40);
      assert.equal(buy.json.inventory.cosmetic["hat:straw"], 1);
      assert.equal((await c.post("/api/shop/buy", { kind: "cosmetic", slot: "hat", id: "straw" })).status, 400);
      const eq = await c.post("/api/pet/equip", { slot: "hat", id: "straw" });
      assert.equal(eq.status, 200);
      assert.equal(eq.json.pet.hat, "straw");
      assert.equal((await c.post("/api/pet/equip", { slot: "hair", id: "ponytail" })).status, 400);
      assert.equal((await c.post("/api/pet/equip", { slot: "hat", id: "none" })).json.pet.hat, "none");
    } finally { await s.stop(); }
  });
});

describe("商店與金幣", () => {
  test("購買種子正確扣款；金幣不足時金幣與庫存都不變", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      const buy = await c.post("/api/shop/buy", { kind: "seed", id: "tomato", qty: 3 });
      assert.equal(buy.status, 200);
      assert.equal(buy.json.user.coins, 100 - 30 * 3);
      assert.equal(buy.json.inventory.seed.tomato, 3);
      const fail = await c.post("/api/shop/buy", { kind: "seed", id: "strawberry", qty: 1 });
      assert.equal(fail.status, 400);
      const me = (await c.get("/api/me")).json;
      assert.equal(me.user.coins, 10);
      assert.equal(me.inventory.seed.strawberry, undefined);
    } finally { await s.stop(); }
  });

  test("不接受不合理的數量或型別", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      for (const qty of [-1, 0, 1.5, 100, "5", null, Number.MAX_SAFE_INTEGER]) {
        const r = await c.post("/api/shop/buy", { kind: "seed", id: "carrot", qty });
        assert.equal(r.status, 400, `qty=${String(qty)} 應被拒絕`);
      }
      assert.equal(await coinsOf(c), 100);
      assert.equal((await c.post("/api/shop/buy", { kind: "seed", id: "constructor", qty: 1 })).status, 400);
    } finally { await s.stop(); }
  });

  test("客戶端無法自行指定金幣或其他玩家編號", async () => {
    const s = await startServer();
    try {
      const a = await newPlayer(s);
      const b = await newPlayer(s);
      const r = await b.c.post("/api/farm/plant", { plot: 0, crop: "carrot", userId: 1, coins: 999999, user_id: 1 });
      assert.equal(r.status, 200);
      assert.equal(r.json.user.coins, 100);
      assert.equal(r.json.plots[0].crop, "carrot");
      const aMe = (await a.c.get("/api/me")).json;
      assert.equal(aMe.plots[0].crop, null);
      assert.equal(aMe.inventory.seed.carrot, 2);
      await b.c.post("/api/shop/buy", { kind: "seed", id: "carrot", qty: 1, coins: 999999 });
      assert.equal(await coinsOf(b.c), 90);
    } finally { await s.stop(); }
  });
});

describe("農場", () => {
  test("播種、澆水、收成、賣出的完整流程與時間判斷", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      const t0 = s.clock.t;
      const planted = await c.post("/api/farm/plant", { plot: 0, crop: "carrot" });
      assert.equal(planted.status, 200);
      assert.equal(planted.json.inventory.seed.carrot, 1);
      assert.equal(planted.json.plots[0].readyAt, t0 + 60_000);

      assert.equal((await c.post("/api/farm/plant", { plot: 0, crop: "carrot" })).status, 400);
      assert.equal((await c.post("/api/farm/harvest", { plot: 0 })).status, 400);

      s.clock.t = t0 + 59_999;
      assert.equal((await c.post("/api/farm/harvest", { plot: 0 })).status, 400);
      s.clock.t = t0 + 60_000;
      const harvest = await c.post("/api/farm/harvest", { plot: 0 });
      assert.equal(harvest.status, 200);
      assert.equal(harvest.json.plots[0].crop, null);
      assert.equal(harvest.json.inventory.produce.carrot, 1);
      assert.equal((await c.post("/api/farm/harvest", { plot: 0 })).status, 400);

      assert.equal((await c.post("/api/inventory/sell", { crop: "carrot", qty: 2 })).status, 400);
      const sold = await c.post("/api/inventory/sell", { crop: "carrot", qty: 1 });
      assert.equal(sold.status, 200);
      assert.equal(sold.json.user.coins, 118);
      assert.equal(sold.json.inventory.produce.carrot, undefined);
    } finally { await s.stop(); }
  });

  test("澆水縮短 20% 成長時間，每株最多兩次，成熟後不能澆水", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      const t0 = s.clock.t;
      await c.post("/api/farm/plant", { plot: 0, crop: "carrot" });
      const w1 = await c.post("/api/farm/water", { plot: 0 });
      assert.equal(w1.json.plots[0].readyAt, t0 + 48_000);
      s.clock.t = t0 + 47_999;
      assert.equal((await c.post("/api/farm/harvest", { plot: 0 })).status, 400);
      const w2 = await c.post("/api/farm/water", { plot: 0 });
      assert.equal(w2.json.plots[0].readyAt, t0 + 36_000);
      s.clock.t = t0 + 10_000;
      const w3 = await c.post("/api/farm/water", { plot: 0 });
      assert.equal(w3.status, 400);
      assert.equal(w3.json.error.code, "WATER_LIMIT");
      s.clock.t = t0 + 36_000;
      const w4 = await c.post("/api/farm/water", { plot: 0 });
      assert.equal(w4.status, 400);
      assert.equal(w4.json.error.code, "ALREADY_READY");

      await c.post("/api/farm/harvest", { plot: 0 });
      await c.post("/api/shop/buy", { kind: "seed", id: "carrot", qty: 1 });
      s.clock.t = t0 + 100_000;
      await c.post("/api/farm/plant", { plot: 1, crop: "carrot" });
      await c.post("/api/farm/water", { plot: 1 });
      await c.post("/api/farm/water", { plot: 1 });
      const third = await c.post("/api/farm/water", { plot: 1 });
      assert.equal(third.json.error.code, "WATER_LIMIT");
    } finally { await s.stop(); }
  });

  test("沒有種子不能播種；未開墾的土地不能使用；田地編號不合法被拒絕", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      assert.equal((await c.post("/api/farm/plant", { plot: 0, crop: "corn" })).status, 400);
      assert.equal((await c.post("/api/farm/plant", { plot: 4, crop: "carrot" })).json.error.code, "PLOT_LOCKED");
      for (const plot of [-1, 12, 1.5, "0", null]) {
        assert.equal((await c.post("/api/farm/plant", { plot, crop: "carrot" })).status, 400, `plot=${String(plot)}`);
      }
    } finally { await s.stop(); }
  });

  test("開墾土地：費用遞增、金幣不足會被拒絕、全部開墾後不能再開", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      const me = (await c.get("/api/me")).json;
      assert.equal(me.nextPlotCost, 100);
      const first = await c.post("/api/farm/unlock");
      assert.equal(first.status, 200);
      assert.equal(first.json.user.coins, 0);
      assert.equal(first.json.user.unlockedPlots, 5);
      assert.equal(first.json.nextPlotCost, 200);
      assert.equal((await c.post("/api/farm/unlock")).status, 400);
      s.db.prepare("UPDATE users SET coins = 100000, unlocked_plots = 11 WHERE id = ?").run(me.user.id);
      assert.equal((await c.post("/api/farm/unlock")).status, 200);
      assert.equal((await c.post("/api/farm/unlock")).json.error.code, "MAX_PLOTS");
    } finally { await s.stop(); }
  });
});

describe("多人與並發", () => {
  test("玩家之間的農場、金幣與庫存完全獨立", async () => {
    const s = await startServer();
    try {
      const a = await newPlayer(s);
      const b = await newPlayer(s);
      await a.c.post("/api/shop/buy", { kind: "seed", id: "pumpkin", qty: 1 });
      await a.c.post("/api/farm/plant", { plot: 0, crop: "carrot" });
      const bMe = (await b.c.get("/api/me")).json;
      assert.equal(bMe.user.coins, 100);
      assert.equal(bMe.inventory.seed.pumpkin, undefined);
      assert.equal(bMe.plots[0].crop, null);
    } finally { await s.stop(); }
  });

  test("同時 20 次收成同一塊田，只會成功 1 次", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      await c.post("/api/farm/plant", { plot: 0, crop: "carrot" });
      s.clock.t += 60_000;
      const results = await Promise.all(Array.from({ length: 20 }, () => c.post("/api/farm/harvest", { plot: 0 })));
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.equal((await c.get("/api/me")).json.inventory.produce.carrot, 1);
    } finally { await s.stop(); }
  });

  test("同時大量購買不會讓金幣變成負數，也不會超賣", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      const results = await Promise.all(Array.from({ length: 30 }, () => c.post("/api/shop/buy", { kind: "seed", id: "tomato", qty: 1 })));
      const ok = results.filter((r) => r.status === 200).length;
      assert.equal(ok, 3);
      const me = (await c.get("/api/me")).json;
      assert.equal(me.user.coins, 10);
      assert.equal(me.inventory.seed.tomato, 3);
    } finally { await s.stop(); }
  });

  test("同時重複賣出同一批作物，只會結算一次", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      await c.post("/api/farm/plant", { plot: 0, crop: "carrot" });
      s.clock.t += 60_000;
      await c.post("/api/farm/harvest", { plot: 0 });
      const results = await Promise.all(Array.from({ length: 10 }, () => c.post("/api/inventory/sell", { crop: "carrot", qty: 1 })));
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.equal(await coinsOf(c), 118);
    } finally { await s.stop(); }
  });

  test("交易紀錄加總永遠等於目前金幣", async () => {
    const s = await startServer();
    try {
      const { c } = await newPlayer(s);
      await c.post("/api/shop/buy", { kind: "seed", id: "corn", qty: 1 });
      await c.post("/api/farm/plant", { plot: 0, crop: "corn" });
      s.clock.t += 300_000;
      await c.post("/api/farm/harvest", { plot: 0 });
      await c.post("/api/inventory/sell", { crop: "corn", qty: 1 });
      assert.equal((await c.post("/api/shop/buy", { kind: "cosmetic", slot: "accessory", id: "flower" })).status, 400);
      assert.equal((await c.post("/api/shop/buy", { kind: "cosmetic", slot: "accessory", id: "glasses" })).status, 200);
      const me = (await c.get("/api/me")).json;
      const sum = s.db.prepare("SELECT SUM(delta) AS s FROM ledger WHERE user_id = ?").get(me.user.id).s;
      assert.equal(sum, me.user.coins);
      const last = s.db.prepare("SELECT balance_after FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(me.user.id);
      assert.equal(last.balance_after, me.user.coins);
    } finally { await s.stop(); }
  });
});

describe("資料持久化", () => {
  test("重啟伺服器、重新登入後進度完整保留", async () => {
    const dbPath = path.join(tmpDir, "persist.db");
    const clock = { t: 1_800_000_000_000, now() { return this.t; } };
    const open = async () => {
      const inst = createApp({ dbPath, clock, htmlFile, limits: { registerPerHour: 1000, actionsPer10s: 100000 } });
      const server = await new Promise((resolve) => { const sv = inst.app.listen(0, "127.0.0.1", () => resolve(sv)); });
      return { inst, server, base: `http://127.0.0.1:${server.address().port}` };
    };
    const close = ({ inst, server }) => new Promise((resolve) => server.close(() => { inst.close(); resolve(); }));

    let run = await open();
    const c1 = new Client(run.base);
    await c1.post("/api/register", { username: "saver_1", password: "password123", nickname: "存檔君" });
    await c1.post("/api/pet", { species: "panda", color: "#555a66", hair: "none", outfit: "tee", hat: "none", accessory: "none" });
    await c1.post("/api/shop/buy", { kind: "seed", id: "lettuce", qty: 2 });
    await c1.post("/api/farm/plant", { plot: 2, crop: "lettuce" });
    const before = (await c1.get("/api/me")).json;
    await close(run);

    run = await open();
    const c2 = new Client(run.base);
    assert.equal((await c2.post("/api/login", { username: "saver_1", password: "password123" })).status, 200);
    const after = (await c2.get("/api/me")).json;
    await close(run);

    assert.equal(after.user.nickname, "存檔君");
    assert.equal(after.user.coins, before.user.coins);
    assert.deepEqual(after.inventory, before.inventory);
    assert.equal(after.pet.species, "panda");
    assert.equal(after.plots[2].crop, "lettuce");
    assert.equal(after.plots[2].plantedAt, before.plots[2].plantedAt);
  });
});
