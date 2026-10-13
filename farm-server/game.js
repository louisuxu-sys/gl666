"use strict";
const { tx } = require("./db");

class GameError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const PLOT_COUNT = 12;
const START_PLOTS = 4;
const START_COINS = 100;
const START_SEEDS = { carrot: 2 };
const MAX_WATER = 2;
const WATER_RATIO = 0.2;
const PLOT_UNLOCK_BASE = 100;

const CROPS = {
  carrot:     { name: "胡蘿蔔", emoji: "🥕", seedPrice: 10,  growMs: 60_000,  sellPrice: 18 },
  lettuce:    { name: "高麗菜", emoji: "🥬", seedPrice: 15,  growMs: 90_000,  sellPrice: 28 },
  tomato:     { name: "番茄",   emoji: "🍅", seedPrice: 30,  growMs: 180_000, sellPrice: 60 },
  corn:       { name: "玉米",   emoji: "🌽", seedPrice: 50,  growMs: 300_000, sellPrice: 105 },
  pumpkin:    { name: "南瓜",   emoji: "🎃", seedPrice: 90,  growMs: 600_000, sellPrice: 200 },
  strawberry: { name: "草莓",   emoji: "🍓", seedPrice: 150, growMs: 900_000, sellPrice: 340 },
};

const SPECIES = {
  cat:    { name: "貓咪" },
  dog:    { name: "小狗" },
  rabbit: { name: "兔兔" },
  fox:    { name: "狐狸" },
  panda:  { name: "熊貓" },
};

const COLORS = ["#f4c27a", "#e8e0d0", "#9b7653", "#f2a2b5", "#8fb8de", "#b9a2e0", "#7ec8a4", "#555a66"];

const COSMETICS = {
  hair: {
    none:     { name: "光頭", price: 0 },
    short:    { name: "短髮", price: 0 },
    long:     { name: "長髮", price: 0 },
    curly:    { name: "捲髮", price: 60 },
    ponytail: { name: "馬尾", price: 80 },
  },
  outfit: {
    tee:      { name: "白T恤",  price: 0,   color: "#f4f1ea" },
    apron:    { name: "農夫圍裙", price: 0, color: "#8fb98b" },
    overalls: { name: "吊帶褲", price: 80,  color: "#5c86c4" },
    hoodie:   { name: "連帽衫", price: 150, color: "#e07a5f" },
    yukata:   { name: "浴衣",   price: 250, color: "#6a4c93" },
    suit:     { name: "西裝",   price: 300, color: "#2f3542" },
  },
  hat: {
    none:   { name: "無",     price: 0 },
    ribbon: { name: "蝴蝶結", price: 50,  emoji: "🎀" },
    cap:    { name: "棒球帽", price: 80,  emoji: "🧢" },
    straw:  { name: "草帽",   price: 60,  emoji: "👒" },
    tophat: { name: "紳士帽", price: 120, emoji: "🎩" },
    crown:  { name: "皇冠",   price: 500, emoji: "👑" },
  },
  accessory: {
    none:     { name: "無",   price: 0 },
    flower:   { name: "小花", price: 0,   emoji: "🌸" },
    glasses:  { name: "墨鏡", price: 100, emoji: "🕶️" },
    scarf:    { name: "圍巾", price: 120, emoji: "🧣" },
    backpack: { name: "背包", price: 150, emoji: "🎒" },
  },
};

const CATALOG = {
  crops: Object.fromEntries(Object.entries(CROPS).map(([id, c]) => [id, { id, ...c }])),
  cosmetics: COSMETICS,
  species: SPECIES,
  colors: COLORS,
  constants: { plotCount: PLOT_COUNT, startPlots: START_PLOTS, maxWater: MAX_WATER, waterRatio: WATER_RATIO, plotUnlockBase: PLOT_UNLOCK_BASE },
};

const has = (obj, key) => typeof key === "string" && Object.hasOwn(obj, key);

function toInt(value, min, max, label) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new GameError("BAD_INPUT", `${label}不正確`);
  }
  return value;
}

function validateNickname(raw) {
  const nick = typeof raw === "string" ? raw.trim() : "";
  if (nick.length < 1 || [...nick].length > 12) throw new GameError("BAD_NICKNAME", "暱稱需為 1～12 個字");
  if (/[\u0000-\u001f\u007f<>]/.test(nick)) throw new GameError("BAD_NICKNAME", "暱稱含有不允許的字元");
  return nick;
}

function validateUsername(raw) {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_]{3,20}$/.test(raw)) {
    throw new GameError("BAD_USERNAME", "帳號需為 3～20 個英數字或底線");
  }
  return raw;
}

const readyAtOf = (crop, plantedAt, waterCount) =>
  plantedAt + Math.round(CROPS[crop].growMs * (1 - WATER_RATIO * waterCount));

function addCoins(db, uid, delta, kind, detail, now) {
  const r = db.prepare("UPDATE users SET coins = coins + ? WHERE id = ? AND coins + ? >= 0").run(delta, uid, delta);
  if (r.changes !== 1) throw new GameError("INSUFFICIENT_COINS", "金幣不足");
  const balance = db.prepare("SELECT coins FROM users WHERE id = ?").get(uid).coins;
  db.prepare("INSERT INTO ledger(user_id, kind, delta, balance_after, detail, created_at) VALUES(?,?,?,?,?,?)")
    .run(uid, kind, delta, balance, detail ? JSON.stringify(detail) : null, now);
  return balance;
}

function addItem(db, uid, kind, item, qty) {
  db.prepare(`INSERT INTO inventory(user_id, kind, item, qty) VALUES(?,?,?,?)
              ON CONFLICT(user_id, kind, item) DO UPDATE SET qty = qty + excluded.qty`).run(uid, kind, item, qty);
}

function takeItem(db, uid, kind, item, qty) {
  const r = db.prepare("UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND kind = ? AND item = ? AND qty >= ?")
    .run(qty, uid, kind, item, qty);
  if (r.changes !== 1) throw new GameError("NOT_ENOUGH_ITEMS", "物品數量不足");
}

function owns(db, uid, slot, id) {
  if (COSMETICS[slot][id].price === 0) return true;
  const row = db.prepare("SELECT qty FROM inventory WHERE user_id = ? AND kind = 'cosmetic' AND item = ?").get(uid, `${slot}:${id}`);
  return !!row && row.qty > 0;
}

function initNewPlayer(db, uid, now) {
  const addPlot = db.prepare("INSERT INTO plots(user_id, idx) VALUES(?, ?)");
  for (let i = 0; i < PLOT_COUNT; i++) addPlot.run(uid, i);
  for (const [crop, qty] of Object.entries(START_SEEDS)) addItem(db, uid, "seed", crop, qty);
  addCoins(db, uid, START_COINS, "signup", null, now);
}

function createPet(db, uid, input) {
  return tx(db, () => {
    if (db.prepare("SELECT 1 FROM pets WHERE user_id = ?").get(uid)) throw new GameError("PET_EXISTS", "你已經建立過寵物了");
    const i = input && typeof input === "object" ? input : {};
    if (!has(SPECIES, i.species)) throw new GameError("BAD_INPUT", "寵物種類不正確");
    if (!COLORS.includes(i.color)) throw new GameError("BAD_INPUT", "毛色不正確");
    const pet = { species: i.species, color: i.color };
    for (const slot of ["hair", "outfit", "hat", "accessory"]) {
      if (!has(COSMETICS[slot], i[slot])) throw new GameError("BAD_INPUT", "外觀選項不正確");
      if (COSMETICS[slot][i[slot]].price !== 0) throw new GameError("NOT_OWNED", "建立時只能選擇免費外觀");
      pet[slot] = i[slot];
    }
    db.prepare("INSERT INTO pets(user_id, species, color, hair, outfit, hat, accessory) VALUES(?,?,?,?,?,?,?)")
      .run(uid, pet.species, pet.color, pet.hair, pet.outfit, pet.hat, pet.accessory);
    return pet;
  });
}

function equip(db, uid, { slot, id } = {}) {
  return tx(db, () => {
    if (!has(COSMETICS, slot) || !has(COSMETICS[slot], id)) throw new GameError("BAD_INPUT", "外觀選項不正確");
    if (!db.prepare("SELECT 1 FROM pets WHERE user_id = ?").get(uid)) throw new GameError("NO_PET", "請先建立寵物");
    if (!owns(db, uid, slot, id)) throw new GameError("NOT_OWNED", "你還沒有這件物品");
    db.prepare(`UPDATE pets SET ${slot} = ? WHERE user_id = ?`).run(id, uid);
  });
}

function buy(db, uid, now, { kind, id, slot, qty } = {}) {
  return tx(db, () => {
    if (kind === "seed") {
      if (!has(CROPS, id)) throw new GameError("BAD_INPUT", "找不到這種種子");
      const n = toInt(qty, 1, 99, "購買數量");
      addCoins(db, uid, -CROPS[id].seedPrice * n, "buy_seed", { crop: id, qty: n }, now);
      addItem(db, uid, "seed", id, n);
    } else if (kind === "cosmetic") {
      if (!has(COSMETICS, slot) || !has(COSMETICS[slot], id)) throw new GameError("BAD_INPUT", "找不到這件商品");
      const item = COSMETICS[slot][id];
      if (item.price === 0) throw new GameError("BAD_INPUT", "免費外觀不需要購買");
      if (owns(db, uid, slot, id)) throw new GameError("ALREADY_OWNED", "你已經擁有這件物品");
      addCoins(db, uid, -item.price, "buy_cosmetic", { slot, id }, now);
      addItem(db, uid, "cosmetic", `${slot}:${id}`, 1);
    } else {
      throw new GameError("BAD_INPUT", "購買類型不正確");
    }
  });
}

function unlockPlot(db, uid, now) {
  return tx(db, () => {
    const { unlocked_plots: unlocked } = db.prepare("SELECT unlocked_plots FROM users WHERE id = ?").get(uid);
    if (unlocked >= PLOT_COUNT) throw new GameError("MAX_PLOTS", "土地已全部開墾");
    const cost = PLOT_UNLOCK_BASE * (unlocked - START_PLOTS + 1);
    addCoins(db, uid, -cost, "unlock_plot", { plot: unlocked }, now);
    db.prepare("UPDATE users SET unlocked_plots = unlocked_plots + 1 WHERE id = ?").run(uid);
  });
}

function loadPlot(db, uid, plot) {
  const idx = toInt(plot, 0, PLOT_COUNT - 1, "田地編號");
  const unlocked = db.prepare("SELECT unlocked_plots FROM users WHERE id = ?").get(uid).unlocked_plots;
  if (idx >= unlocked) throw new GameError("PLOT_LOCKED", "這塊土地尚未開墾");
  return db.prepare("SELECT idx, crop, planted_at, water_count FROM plots WHERE user_id = ? AND idx = ?").get(uid, idx);
}

function plant(db, uid, now, { plot, crop } = {}) {
  return tx(db, () => {
    if (!has(CROPS, crop)) throw new GameError("BAD_INPUT", "找不到這種作物");
    const row = loadPlot(db, uid, plot);
    if (row.crop) throw new GameError("PLOT_BUSY", "這塊田已經有作物了");
    takeItem(db, uid, "seed", crop, 1);
    db.prepare("UPDATE plots SET crop = ?, planted_at = ?, water_count = 0 WHERE user_id = ? AND idx = ?").run(crop, now, uid, row.idx);
  });
}

function water(db, uid, now, { plot } = {}) {
  return tx(db, () => {
    const row = loadPlot(db, uid, plot);
    if (!row.crop) throw new GameError("PLOT_EMPTY", "這塊田沒有作物");
    if (now >= readyAtOf(row.crop, row.planted_at, row.water_count)) throw new GameError("ALREADY_READY", "作物已經成熟，不需要澆水");
    if (row.water_count >= MAX_WATER) throw new GameError("WATER_LIMIT", `每株作物最多澆水 ${MAX_WATER} 次`);
    db.prepare("UPDATE plots SET water_count = water_count + 1 WHERE user_id = ? AND idx = ?").run(uid, row.idx);
  });
}

function harvest(db, uid, now, { plot } = {}) {
  return tx(db, () => {
    const row = loadPlot(db, uid, plot);
    if (!row.crop) throw new GameError("PLOT_EMPTY", "這塊田沒有作物");
    if (now < readyAtOf(row.crop, row.planted_at, row.water_count)) throw new GameError("NOT_READY", "作物還沒有成熟");
    db.prepare("UPDATE plots SET crop = NULL, planted_at = NULL, water_count = 0 WHERE user_id = ? AND idx = ?").run(uid, row.idx);
    addItem(db, uid, "produce", row.crop, 1);
    return { crop: row.crop };
  });
}

function sell(db, uid, now, { crop, qty } = {}) {
  return tx(db, () => {
    if (!has(CROPS, crop)) throw new GameError("BAD_INPUT", "找不到這種作物");
    const n = toInt(qty, 1, 9999, "出售數量");
    takeItem(db, uid, "produce", crop, n);
    addCoins(db, uid, CROPS[crop].sellPrice * n, "sell", { crop, qty: n }, now);
  });
}

function setNickname(db, uid, raw) {
  const nick = validateNickname(raw);
  db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(nick, uid);
}

function getState(db, uid, now) {
  const user = db.prepare("SELECT id, username, nickname, coins, unlocked_plots FROM users WHERE id = ?").get(uid);
  const pet = db.prepare("SELECT species, color, hair, outfit, hat, accessory FROM pets WHERE user_id = ?").get(uid) || null;
  const plots = db.prepare("SELECT idx, crop, planted_at, water_count FROM plots WHERE user_id = ? ORDER BY idx").all(uid).map((p) => {
    const unlocked = p.idx < user.unlocked_plots;
    const readyAt = p.crop ? readyAtOf(p.crop, p.planted_at, p.water_count) : null;
    return { idx: p.idx, unlocked, crop: p.crop, plantedAt: p.planted_at, waterCount: p.water_count, readyAt, ready: !!p.crop && now >= readyAt };
  });
  const inventory = { seed: {}, produce: {}, cosmetic: {} };
  for (const r of db.prepare("SELECT kind, item, qty FROM inventory WHERE user_id = ? AND qty > 0").all(uid)) inventory[r.kind][r.item] = r.qty;
  const nextPlotCost = user.unlocked_plots >= PLOT_COUNT ? null : PLOT_UNLOCK_BASE * (user.unlocked_plots - START_PLOTS + 1);
  return {
    serverNow: now,
    user: { id: user.id, username: user.username, nickname: user.nickname, coins: user.coins, unlockedPlots: user.unlocked_plots },
    pet, plots, inventory, nextPlotCost,
  };
}

module.exports = {
  GameError, CATALOG, CROPS, COSMETICS, COLORS, SPECIES, START_COINS,
  validateNickname, validateUsername, initNewPlayer,
  createPet, equip, buy, unlockPlot, plant, water, harvest, sell, setNickname, getState,
};
