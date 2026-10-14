/* 組裝 js/data/lang-zh.js（繁體中文，台灣用語）。
 * 資料來源：
 *   out/auto.json     官方名稱（PokeAPI 台灣譯名：招式、道具、屬性等）
 *   manual/b*.json    手動翻譯（以 out/todo.json 的編號為鍵）
 *   out/pokemon.json  寶可夢名稱（pokedex.js 的 name -> 台灣譯名）
 * 用法：node tools/zh/build-zh.js
 * 會驗證：每個 lang-en 詞條都有中文、{x} 數量一致、沒有空白譯文。 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
const MANUAL = path.join(__dirname, "manual");

let en = {};
new Function("G", fs.readFileSync(path.join(ROOT, "js/data/lang-en.js"), "utf8").replace(/^G\.I18n\.lang === 'en' && /m, ""))({
  I18n: { lang: "en", add: (d) => { en = { ...en, ...d }; } },
});

const auto = JSON.parse(fs.readFileSync(path.join(OUT, "auto.json"), "utf8"));
const todo = JSON.parse(fs.readFileSync(path.join(OUT, "todo.json"), "utf8"));
const pokemon = JSON.parse(fs.readFileSync(path.join(OUT, "pokemon.json"), "utf8"));

const todoKeys = Object.keys(todo);
const manual = {};
for (const f of fs.readdirSync(MANUAL).filter((n) => /^b\d+\.json$/.test(n)).sort()) {
  Object.assign(manual, JSON.parse(fs.readFileSync(path.join(MANUAL, f), "utf8")));
}

// 英文剛好和官方道具/招式同名、但在遊戲裡其實是介面用語的詞條，強制改用這裡的翻譯。
const OVERRIDES = {
  "Mejora": "強化",
};

const zh = {};
const problems = [];
const countX = (s) => (s.match(/\{x\}/g) || []).length;

for (const key of Object.keys(en)) {
  let v = OVERRIDES[key] ?? auto[key];
  if (v === undefined) {
    const idx = todoKeys.indexOf(key);
    v = idx >= 0 ? manual[String(idx)] : undefined;
  }
  if (typeof v !== "string" || !v.trim()) { problems.push(`缺少翻譯：${key}`); continue; }
  if (countX(key) !== countX(v)) problems.push(`{x} 數量不一致：${key} => ${v}`);
  zh[key] = v;
}

// 額外詞條：lang-en 沒有收錄、但畫面上會出現的字串（例如地區名稱、性格特質）。
// 鍵是遊戲內顯示的原文（西班牙文或英文專有名詞），優先於其他來源。
let extraCount = 0;
const extraFile = path.join(MANUAL, "extra.json");
if (fs.existsSync(extraFile)) {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(extraFile, "utf8")))) {
    if (typeof v !== "string" || !v.trim()) { problems.push(`extra.json 譯文為空：${k}`); continue; }
    if (countX(k) !== countX(v)) problems.push(`extra.json {x} 數量不一致：${k} => ${v}`);
    zh[k] = v; extraCount++;
  }
}

// 寶可夢名稱（鍵為 pokedex.js 的名稱）。與上面詞條同名時，以上面的為準。
let pokeAdded = 0;
for (const [name, tw] of Object.entries(pokemon)) {
  if (zh[name] === undefined) { zh[name] = tw; pokeAdded++; }
}

const extra = Object.keys(manual).filter((i) => Number(i) >= todoKeys.length);
if (extra.length) problems.push(`手動翻譯有多餘編號：${extra.join(",")}`);

if (problems.length) {
  console.log(`✗ 發現 ${problems.length} 個問題：`);
  problems.slice(0, 40).forEach((p) => console.log("  - " + p));
  process.exit(1);
}

const q = (s) => JSON.stringify(s);
const lines = Object.entries(zh).map(([k, v]) => `  ${q(k)}: ${q(v)}`);
const body = `/* ============ lang-zh.js — 繁體中文（台灣）翻譯 ============
 * 由 tools/zh/build-zh.js 產生，請不要直接手改；要改翻譯請改 tools/zh/manual/*.json 後重新產生。
 * 鍵是遊戲內的西班牙文原文（見 js/core/i18n.js），{x} 是數字或名稱的空位。
 * 招式、道具、屬性與寶可夢名稱使用台灣官方譯名（來源：PokeAPI）。
 */
if (G.I18n.lang === 'zh') G.I18n.add({
${lines.join(",\n")}
});
`;
fs.writeFileSync(path.join(ROOT, "js/data/lang-zh.js"), body);

console.log("✓ lang-zh.js 已產生");
console.log("  lang-en 詞條：", Object.keys(en).length);
console.log("  官方名稱自動對應：", Object.keys(auto).length);
console.log("  手動翻譯：", Object.keys(manual).length, "（待翻譯 " + todoKeys.length + "）");
console.log("  額外詞條：", extraCount);
console.log("  寶可夢名稱：", pokeAdded);
console.log("  輸出詞條總數：", Object.keys(zh).length, "；檔案大小：", Math.round(body.length / 1024) + " KB");
